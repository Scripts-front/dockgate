// src/config.ts
// Runs validation at import time — process.exit(1) if any required var is absent
// Import as: import './config.ts' or import { config } from './config.ts'

const required = [
  'DOWNLOAD_TOKEN',
  'UPLOAD_TOKEN',
  'MINIO_ENDPOINT',
  'MINIO_PUBLIC_ENDPOINT',
  'MINIO_BUCKET',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
] as const

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

// Parse MINIO_ENDPOINT: supports both 'minio' and 'minio:9000'
const rawEndpoint = process.env.MINIO_ENDPOINT!
const colonIndex = rawEndpoint.lastIndexOf(':')
const minioEndpoint = colonIndex === -1 ? rawEndpoint : rawEndpoint.slice(0, colonIndex)
const minioPort = colonIndex === -1 ? 9000 : parseInt(rawEndpoint.slice(colonIndex + 1), 10)

export const config = {
  downloadToken: process.env.DOWNLOAD_TOKEN!,
  uploadToken: process.env.UPLOAD_TOKEN!,
  minioEndpoint,
  minioPort,
  minioUseSSL: process.env.MINIO_USE_SSL === 'true' || minioPort === 443,
  minioPublicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT!,
  minioBucket: process.env.MINIO_BUCKET!,
  minioAccessKey: process.env.MINIO_ACCESS_KEY!,
  minioSecretKey: process.env.MINIO_SECRET_KEY!,
  port: parseInt(process.env.PORT ?? '3000', 10),
} as const
