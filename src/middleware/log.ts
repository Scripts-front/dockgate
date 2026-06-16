// src/middleware/log.ts
import type { Request, Response, NextFunction } from 'express'

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const sanitizedUrl = req.url.replace(/([?&]token=)[^&]*/gi, '$1[REDACTED]')
  console.log(`${req.method} ${sanitizedUrl}`)
  next()
}
