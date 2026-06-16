// src/lib/minio.ts
import * as Minio from 'minio'
import { config } from '../config.ts'

export const minioClient = new Minio.Client({
  endPoint: config.minioEndpoint,   // hostname only: 'minio' or '192.168.1.10' — never 'http://minio'
  port: config.minioPort,           // explicit integer port, e.g. 9000
  useSSL: false,                    // D-01: internal Docker network, no TLS
  accessKey: config.minioAccessKey,
  secretKey: config.minioSecretKey,
})

export async function verifyMinioConnection(): Promise<void> {
  const exists = await minioClient.bucketExists(config.minioBucket)
  if (!exists) {
    console.error(`[startup] MinIO bucket '${config.minioBucket}' does not exist`)
    process.exit(1)
  }
  console.log(`[startup] MinIO connection verified — bucket '${config.minioBucket}' exists`)
}
