// src/index.ts
import './config.ts'           // Step 1: fail-fast env validation runs at import time
import express from 'express'
import { verifyMinioConnection } from './lib/minio.ts'
import { requestLogger } from './middleware/log.ts'
import { healthRouter } from './routes/health.ts'
import { config } from './config.ts'

const app = express()

// Middleware (applied in order)
app.use(express.json())
app.use(requestLogger)          // SEC-05: token redaction before any logging

// Routes
app.use(healthRouter)

// Global error handler — Express 5 requires exactly 4 params
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err)
  res.status(500).json({ error: 'Internal server error' })
})

// INFRA-03: Verify MinIO BEFORE listening (Pitfall 5: never reverse this order)
await verifyMinioConnection()

app.listen(config.port, () => {
  console.log(`[startup] DockGate listening on :${config.port}`)
})
