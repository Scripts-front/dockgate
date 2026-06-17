// src/routes/health.ts
import { Router } from 'express'
import { minioClient } from '../lib/minio.ts'
import { config } from '../config.ts'

export const healthRouter = Router()

healthRouter.get('/health', async (_req, res) => {
  try {
    const alive = await minioClient.bucketExists(config.minioBucket)
    if (alive) {
      res.json({ ok: true, minio: 'connected' })
    } else {
      res.status(503).json({ ok: false, minio: 'unreachable' })
    }
  } catch (err) {
    console.error('[health] MinIO check failed:', err)
    res.status(503).json({ ok: false, minio: 'unreachable' })
  }
})
