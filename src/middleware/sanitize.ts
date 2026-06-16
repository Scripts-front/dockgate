// src/middleware/sanitize.ts
import type { Request, Response, NextFunction } from 'express'

const SAFE_PARAM = /^[a-zA-Z0-9._-]+$/

export function validateAppName(req: Request, res: Response, next: NextFunction): void {
  const { name } = req.params
  if (!name || !SAFE_PARAM.test(name) || name.includes('..')) {
    res.status(400).json({ error: 'Invalid app name' })
    return
  }
  next()
}

export function validateVersion(req: Request, res: Response, next: NextFunction): void {
  const version = (req.params.version ?? req.query.version) as string | undefined
  if (!version || !SAFE_PARAM.test(version) || version.includes('..')) {
    res.status(400).json({ error: 'Invalid version' })
    return
  }
  next()
}
