---
phase: 01-foundation
fixed_at: 2026-06-16T00:00:00Z
review_path: .planning/phases/01-foundation/01-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-06-16T00:00:00Z
**Source review:** .planning/phases/01-foundation/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (1 Critical, 3 Warning)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Auth middleware crashes on array query parameter instead of returning 401

**Files modified:** `src/middleware/auth.ts`
**Commit:** 21cbf6a
**Applied fix:** Replaced the direct `as string | undefined` cast of `req.query.token` with a two-step approach: capture the raw value into `rawToken` (uncast), then derive `token` using `typeof rawToken === 'string' ? rawToken : undefined`. This ensures any non-string query param form (arrays, objects from `?token[]=foo`) produces `undefined`, causing the middleware to return 401 instead of passing an array into `sha256()` and crashing with a TypeError.

### WR-01: MinIO connection error at startup produces unhandled rejection instead of clean exit

**Files modified:** `src/lib/minio.ts`
**Commit:** f6618e8
**Applied fix:** Wrapped `minioClient.bucketExists()` in a try/catch block inside `verifyMinioConnection`. On catch, logs `[startup] MinIO connection failed:` with the error and calls `process.exit(1)`. The `exists` variable is now declared with `let` before the try block and assigned inside it, maintaining the same post-try `!exists` guard for the "bucket not found" case.

### WR-02: Invalid port values in env vars produce NaN silently

**Files modified:** `src/config.ts`
**Commit:** 6c4f8e1
**Applied fix:** Added two NaN guards after each `parseInt` call. For `minioPort`: `if (colonIndex !== -1 && isNaN(minioPort))` logs `[startup] Invalid port in MINIO_ENDPOINT: '...'` and exits. For `port`: extracted `parseInt(process.env.PORT ?? '3000', 10)` into a `const port` variable, added `if (isNaN(port))` guard with matching startup message, then used `port` in the config object instead of an inline `parseInt` call.

### WR-03: Health check catch block silently swallows MinIO errors

**Files modified:** `src/routes/health.ts`
**Commit:** 790d624
**Applied fix:** Changed `catch {` to `catch (err) {` and added `console.error('[health] MinIO check failed:', err)` before the existing 503 response. The error is now logged with the `[health]` prefix consistent with the project's logging conventions, making transient MinIO failures diagnosable from Portainer logs.

---

_Fixed: 2026-06-16T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
