---
status: testing
phase: 01-foundation
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md
started: 2026-06-16T00:00:00Z
updated: 2026-06-16T00:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server. Start fresh: run `bun run src/index.ts` with no env vars set.
  The process should exit immediately with a descriptive error like:
  `[startup] Missing required env var: DOWNLOAD_TOKEN`
  No stack trace, no crash dump — just a clean exit message listing the missing var.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start fresh: run `bun run src/index.ts` with no env vars set. The process should exit immediately with a descriptive error like `[startup] Missing required env var: DOWNLOAD_TOKEN` — no stack trace, no crash dump, just a clean exit message listing the missing var.
result: [pending]

### 2. TypeScript Type Check
expected: Running `bun run typecheck` (or `bun tsc --noEmit`) should complete with zero errors. All source files (config.ts, minio.ts, auth.ts, sanitize.ts, log.ts, health.ts, index.ts) pass strict TypeScript type checking.
result: [pending]

### 3. Health Endpoint — MinIO Connected
expected: With a valid `.env` and a running MinIO instance, `curl http://localhost:3000/health` returns HTTP 200 with JSON body `{"ok":true,"minio":"connected"}`.
result: [pending]

### 4. Health Endpoint — MinIO Unreachable
expected: With a valid `.env` but MinIO stopped or unreachable, `curl http://localhost:3000/health` returns HTTP 503 with JSON body `{"ok":false,"minio":"unreachable"}`. No crash, no 500 — clean 503.
result: [pending]

### 5. Auth Middleware — Rejects Missing Token
expected: `curl http://localhost:3000/health` without a token returns 200 (health is public). But an authenticated route hit without a token should return HTTP 401 `{"error":"Unauthorized"}`. (You can verify auth logic directly: run the server and hit a route that uses `requireDownloadToken` with no credentials.)
result: [pending]

### 6. Auth Middleware — Rejects Array Token (CR-01 fix)
expected: Send `curl "http://localhost:3000/<authed-route>?token[]=foo&token[]=bar"` — the server should return HTTP 401 `{"error":"Unauthorized"}`, NOT a 500 Internal Server Error. This confirms the CR-01 fix is in place.
result: [pending]

### 7. Input Sanitization — Blocks Path Traversal
expected: A request with `..` in a param (e.g., `?name=../etc`) should return HTTP 400 `{"error":"Invalid app name"}`. The `validateAppName` middleware blocks it before any route logic runs.
result: [pending]

### 8. Token Redaction in Logs
expected: Start the server and make a request with `?token=supersecret123` in the URL. The server console output should show the URL as `?token=[REDACTED]` — the actual token value must NOT appear in the log line.
result: [pending]

### 9. Docker Build
expected: `docker build -t dockgate:test .` completes without errors. The multi-stage build using `oven/bun:1` should produce an image. Running `docker images dockgate` should list the image with a recent timestamp.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps

[none yet]
