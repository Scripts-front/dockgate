---
phase: 01-foundation
reviewed: 2026-06-16T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - .dockerignore
  - .env.example
  - .gitignore
  - Dockerfile
  - bun.lock
  - package.json
  - src/config.ts
  - src/index.ts
  - src/lib/minio.ts
  - src/lib/schemas.ts
  - src/middleware/auth.ts
  - src/middleware/log.ts
  - src/middleware/sanitize.ts
  - src/routes/health.ts
  - tsconfig.json
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-06-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Foundation scaffold for DockGate — a Bun + Express + TypeScript API backed by MinIO. The overall architecture is sound: fail-fast env validation at startup, timing-safe token comparison, query-param redaction in logs, and path-traversal defenses in the sanitize middleware. The tsconfig and Dockerfile follow project conventions correctly.

Three issues require attention before adding routes that depend on authenticated endpoints: one critical type-safety bypass in the auth middleware that can cause 500s instead of 401s, two startup reliability issues (unhandled MinIO connection errors and unparsed `NaN` port/endpoint values), and one missing error log in the health check catch block.

---

## Critical Issues

### CR-01: Auth middleware crashes on array query parameter instead of returning 401

**File:** `src/middleware/auth.ts:16`

**Issue:** `req.query.token` in Express is typed as `string | ParsedQs | string[] | ParsedQs[]`. The code casts it directly to `string | undefined` with `as`, bypassing type safety. If a caller sends `?token[]=foo&token[]=bar` (or any other array/object form), `token` becomes an array. The subsequent call `sha256(token)` passes an array into `crypto.createHash().update()`, which throws a `TypeError` at runtime. The request reaches the global error handler and returns 500 instead of 401. This is an authentication bypass in the sense that the auth check is skipped — the caller gets an internal error response rather than an unauthorized rejection, which leaks that the endpoint exists and is reachable.

**Fix:**
```typescript
// Replace lines 14-16 in src/middleware/auth.ts
const authHeader = req.headers.authorization
const rawToken = authHeader?.startsWith('Bearer ')
  ? authHeader.slice(7)
  : req.query.token

// Guard: reject non-string query param forms (arrays, objects)
const token = typeof rawToken === 'string' ? rawToken : undefined
if (!token || !timingSafeEqual(sha256(token), expectedHash)) {
  res.status(401).json({ error: 'Unauthorized' })
  return
}
```

---

## Warnings

### WR-01: MinIO connection error at startup produces unhandled rejection instead of clean exit

**File:** `src/lib/minio.ts:13-20` / `src/index.ts:25`

**Issue:** `verifyMinioConnection` does not catch exceptions from `minioClient.bucketExists(...)`. If MinIO is unreachable (TCP timeout, DNS failure), the promise rejects. In `index.ts`, the top-level `await verifyMinioConnection()` has no try/catch, so the rejection becomes an unhandled promise rejection. Bun terminates the process, but the error message is an unformatted stack trace rather than the informative `[startup]`-prefixed message used elsewhere. This makes diagnosis harder in Portainer logs.

**Fix:**
```typescript
// src/lib/minio.ts
export async function verifyMinioConnection(): Promise<void> {
  let exists: boolean
  try {
    exists = await minioClient.bucketExists(config.minioBucket)
  } catch (err) {
    console.error(`[startup] MinIO connection failed:`, err)
    process.exit(1)
  }
  if (!exists) {
    console.error(`[startup] MinIO bucket '${config.minioBucket}' does not exist`)
    process.exit(1)
  }
  console.log(`[startup] MinIO connection verified — bucket '${config.minioBucket}' exists`)
}
```

### WR-02: Invalid port values in env vars produce NaN silently

**File:** `src/config.ts:26` and `src/config.ts:38`

**Issue:** Two `parseInt` calls can produce `NaN` with no validation:

1. `parseInt(rawEndpoint.slice(colonIndex + 1), 10)` — if `MINIO_ENDPOINT=minio:abc`, `minioPort` becomes `NaN`. The MinIO SDK receives `NaN` as the port, which causes an obscure runtime failure rather than a clear startup error.
2. `parseInt(process.env.PORT ?? '3000', 10)` — if `PORT=abc`, `config.port` is `NaN`, and `app.listen(NaN)` fails without a meaningful message.

Both are caught by the `required` check only for absence, not for format.

**Fix:**
```typescript
// After parsing minioPort (line 26):
const minioPort = colonIndex === -1 ? 9000 : parseInt(rawEndpoint.slice(colonIndex + 1), 10)
if (colonIndex !== -1 && isNaN(minioPort)) {
  console.error(`[startup] Invalid port in MINIO_ENDPOINT: '${rawEndpoint}'`)
  process.exit(1)
}

// After parsing config.port (line 38):
const port = parseInt(process.env.PORT ?? '3000', 10)
if (isNaN(port)) {
  console.error(`[startup] Invalid PORT value: '${process.env.PORT}'`)
  process.exit(1)
}
// Then use `port` in the config object instead of inline parseInt
```

### WR-03: Health check catch block silently swallows MinIO errors

**File:** `src/routes/health.ts:16-17`

**Issue:** The catch block returns a 503 response but does not log the error. When MinIO becomes unreachable mid-operation, the root cause (connection refused, TLS error, etc.) is discarded. This makes diagnosing transient MinIO failures in production impossible from logs alone.

**Fix:**
```typescript
  } catch (err) {
    console.error('[health] MinIO check failed:', err)
    res.status(503).json({ ok: false, minio: 'unreachable' })
  }
```

---

## Info

### IN-01: SAFE_PARAM regex allows `..` — path traversal blocked only by explicit include check

**File:** `src/middleware/sanitize.ts:4-12`

**Issue:** The regex `SAFE_PARAM = /^[a-zA-Z0-9._-]+$/` allows dots, meaning the string `..` passes the regex. The subsequent `name.includes('..')` check is the actual path traversal guard. The ordering is correct (regex first, then `..` check), but the dual-layer defense is easy to misread as fully covered by the regex alone. Future maintainers may remove the `includes('..')` check believing it redundant.

**Fix:** Add a comment making the intent explicit:
```typescript
const SAFE_PARAM = /^[a-zA-Z0-9._-]+$/
// Note: regex allows dots individually; the explicit '..' check below is required
// to block path traversal — do not remove it.
```

Alternatively, strengthen the regex to disallow consecutive dots: `/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/`

### IN-02: tsconfig.json missing `"target"` field

**File:** `tsconfig.json`

**Issue:** No `"target"` is specified. Bun infers a default, but omitting it means the TypeScript language server and `tsc --noEmit` may use different defaults depending on the TS version. TypeScript 6 defaults to `"ES3"` for `target` when unset, which can produce unexpected down-level emit warnings even with `noEmit: true`.

**Fix:** Add an explicit target matching Bun's supported ES level:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    ...
  }
}
```

---

_Reviewed: 2026-06-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
