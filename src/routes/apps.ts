// src/routes/apps.ts
// READ-01: GET /apps/:name/latest — public endpoint returning LatestManifest
// READ-02, READ-03: GET /apps/:name/download — authenticated endpoint returning presigned URL

import { Router } from 'express'
import type { Request, Response } from 'express'
import { minioClient } from '../lib/minio.ts'
import { config } from '../config.ts'
import type { LatestManifest } from '../lib/schemas.ts'
import { latestKey, tarKey } from '../lib/schemas.ts'
import { validateAppName, validateVersion } from '../middleware/sanitize.ts'
import { requireDownloadToken, requireUploadToken } from '../middleware/auth.ts'

// isObjectNotFound: handles both XML-parsed (NoSuchKey) and no-XML fallback (NotFound) from MinIO SDK
// Verified from node_modules/minio/dist/main/internal/xml-parser.js lines 59-85
function isObjectNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    ((err as unknown as { code: string }).code === 'NoSuchKey' ||
      (err as unknown as { code: string }).code === 'NotFound')
  )
}

// rewritePresignedUrl: replaces internal MinIO origin with public endpoint
// Required because presignedGetObject embeds the internal Docker hostname in the URL
// (verified from signing.js line 266)
function rewritePresignedUrl(sdkUrl: string): string {
  const parsed = new URL(sdkUrl)
  return sdkUrl.replace(parsed.origin, config.minioPublicEndpoint)
}

export const appsRouter = Router()

// READ-01: GET /apps/:name/latest
// Public — no auth required; returns LatestManifest directly (D-03: no envelope)
appsRouter.get('/:name/latest', validateAppName, async (req: Request, res: Response) => {
  const name = req.params['name'] as string
  try {
    const stream = await minioClient.getObject(config.minioBucket, latestKey(name))
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    const manifest: LatestManifest = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    res.json(manifest) // D-03: return content directly, no envelope
  } catch (err) {
    if (isObjectNotFound(err)) {
      res.status(404).json({ error: 'No versions published' }) // D-04
      return
    }
    throw err // let Express 5 global error handler return 500
  }
})

// READ-02, READ-03: GET /apps/:name/download?version=X
// Requires DOWNLOAD_TOKEN; verifies .tar exists before generating presigned URL (D-02, D-09)
appsRouter.get(
  '/:name/download',
  validateAppName,
  requireDownloadToken,
  validateVersion,
  async (req: Request, res: Response) => {
    const name = req.params['name'] as string
    const version = req.query.version as string

    // READ-03: verify .tar exists before generating presigned URL
    try {
      await minioClient.statObject(config.minioBucket, tarKey(name, version))
    } catch (err) {
      if (isObjectNotFound(err)) {
        res.status(404).json({ error: `Version ${version} not found` }) // D-09: literal version in message
        return
      }
      throw err // non-404 S3 error or network failure — let global handler return 500
    }

    const rawUrl = await minioClient.presignedGetObject(
      config.minioBucket,
      tarKey(name, version),
      3600, // D-02: 3600s download URL expiry
    )
    const url = rewritePresignedUrl(rawUrl) // replace internal hostname with MINIO_PUBLIC_ENDPOINT
    res.json({ url }) // D-01: only { url: string }, no expiresIn or other fields
  },
)

// WRITE-01: POST /apps/:name/upload?version=X
// Requires UPLOAD_TOKEN; generates presigned PUT URL for direct MinIO upload by CI/CD
// No existence check — CI/CD is uploading a NEW file; checking first would break the workflow
appsRouter.post(
  '/:name/upload',
  validateAppName,
  requireUploadToken,
  validateVersion,
  async (req: Request, res: Response) => {
    const name = req.params['name'] as string
    const version = req.query.version as string

    const rawUrl = await minioClient.presignedPutObject(
      config.minioBucket,
      tarKey(name, version),
      900, // D-02: 900s upload URL expiry
    )
    const url = rewritePresignedUrl(rawUrl) // replace internal hostname with MINIO_PUBLIC_ENDPOINT
    res.json({ url }) // D-01: only { url: string }
  },
)

// WRITE-02, WRITE-03: PUT /apps/:name/latest
// Requires UPLOAD_TOKEN; validates body, anti-phantom check, writes latest.json
// D-06: 400 on invalid sha256/size BEFORE any MinIO call
// D-10: 422 when .tar not found (anti-phantom)
const SHA256_REGEX = /^[a-f0-9]{64}$/ // D-06: exactly 64 lowercase hex chars

appsRouter.put(
  '/:name/latest',
  validateAppName,
  requireUploadToken,
  async (req: Request, res: Response) => {
    const name = req.params['name'] as string
    const { version, sha256, size } = req.body as { version: unknown; sha256: unknown; size: unknown }

    // Input validation — ALL checks before anti-phantom (D-06 specifies 400 before MinIO call)
    if (
      typeof version !== 'string' ||
      !version ||
      !/^[a-zA-Z0-9._-]+$/.test(version) ||
      version.includes('..')
    ) {
      res.status(400).json({ error: 'Invalid version' })
      return
    }
    if (typeof sha256 !== 'string' || !SHA256_REGEX.test(sha256)) {
      res.status(400).json({ error: 'Invalid sha256' }) // D-06
      return
    }
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
      res.status(400).json({ error: 'Invalid size' }) // D-07
      return
    }

    // Anti-phantom check (WRITE-03, D-10) — verify .tar exists before writing latest.json
    try {
      await minioClient.statObject(config.minioBucket, tarKey(name, version))
    } catch (err) {
      if (isObjectNotFound(err)) {
        res.status(422).json({ error: `Tar file not found for version ${version}` }) // D-10
        return
      }
      throw err // unexpected error — global handler returns 500
    }

    // Build and write latest.json (D-05, D-08)
    const manifest: LatestManifest = {
      schema: 1,
      version,
      sha256: sha256.toLowerCase(), // normalize to lowercase hex
      size,
      publishedAt: new Date().toISOString(), // D-08: server time, not from CI/CD
    }
    const json = JSON.stringify(manifest)
    await minioClient.putObject(
      config.minioBucket,
      latestKey(name),
      json,
      Buffer.byteLength(json),
      { 'Content-Type': 'application/json' },
    )

    res.status(200).json({ ok: true })
  },
)
