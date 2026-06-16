// src/middleware/auth.ts
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.ts'

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function makeTokenMiddleware(expectedToken: string) {
  const expectedHash = sha256(expectedToken)
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.query.token as string | undefined)
    if (!token || !timingSafeEqual(sha256(token), expectedHash)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  }
}

export const requireDownloadToken = makeTokenMiddleware(config.downloadToken)
export const requireUploadToken = makeTokenMiddleware(config.uploadToken)
