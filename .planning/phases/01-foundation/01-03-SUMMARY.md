---
phase: 01-foundation
plan: "03"
subsystem: infrastructure
tags: [minio, auth, middleware, security, sanitization]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [minioClient, verifyMinioConnection, requireDownloadToken, requireUploadToken, validateAppName, validateVersion, requestLogger]
  affects: [01-04]
tech_stack:
  added: []
  patterns:
    - SHA-256 hashing on both sides of timingSafeEqual for fixed-size buffer comparison
    - Allowlist regex for input sanitization with defense-in-depth double-dot check
    - Token redaction in logger via regex with [REDACTED] placeholder
key_files:
  created:
    - src/lib/minio.ts
    - src/middleware/auth.ts
    - src/middleware/sanitize.ts
    - src/middleware/log.ts
  modified: []
decisions:
  - "D-01 applied: useSSL false — internal Docker network, no TLS needed"
  - "D-04 applied: SHA-256 hash on both token and expected before timingSafeEqual — prevents timing attacks and ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH"
  - "D-05 applied: two separate middleware exports (requireDownloadToken, requireUploadToken) composable independently"
  - "D-06 applied: allowlist regex ^[a-zA-Z0-9._-]+$ plus explicit name.includes('..') check as defense-in-depth"
metrics:
  duration_minutes: 15
  completed_date: "2026-06-16"
  tasks_completed: 2
  files_created: 4
---

# Phase 1 Plan 03: Core Modules (MinIO Client + Middlewares) Summary

**One-liner:** MinIO client singleton with startup bucket verification, timing-safe token auth middlewares, allowlist input sanitization, and token-redacting request logger.

## What Was Built

Four module files implementing security and infrastructure requirements (INFRA-03, SEC-01 through SEC-05):

### src/lib/minio.ts

MinIO client singleton instantiated with hostname-only `endPoint` (no `http://` prefix), integer `port`, and `useSSL: false` for internal Docker network. The `verifyMinioConnection()` function calls `bucketExists()` at startup and exits with code 1 if the bucket is missing — preventing the API from starting in a broken state.

**Exports:** `minioClient` (Minio.Client), `verifyMinioConnection(): Promise<void>`

### src/middleware/auth.ts

Timing-attack-safe token comparison using SHA-256 hash of both the incoming token and the expected token before calling `timingSafeEqual`. Both sides are hashed to ensure 32-byte buffers (avoiding `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`). Tokens are accepted from `Authorization: Bearer <token>` header OR `?token=<value>` query param for client script compatibility.

**Exports:** `requireDownloadToken`, `requireUploadToken` (Express middleware functions)

### src/middleware/sanitize.ts

Allowlist regex `^[a-zA-Z0-9._-]+$` rejects all chars outside the safe set, including `/`, `\`, and null bytes. Explicit `name.includes('..')` and `version.includes('..')` check provides defense-in-depth per D-06. Returns `400 Bad Request` with `{ error: 'Invalid app name' }` or `{ error: 'Invalid version' }` on rejection.

**Exports:** `validateAppName`, `validateVersion` (Express middleware functions)

### src/middleware/log.ts

Request logger that redacts the `token` query parameter from URLs before logging. Regex `/([?&]token=)[^&]*/gi` replaces token values with `[REDACTED]` — both `?token=` and `&token=` patterns handled, case-insensitive.

**Exports:** `requestLogger` (Express middleware function)

## Task Commits

Note: git write operations (add/commit) were blocked by the parallel agent sandbox. Files are created as untracked changes in the worktree for the orchestrator to commit during merge.

| Task | Name | Status | Files |
|------|------|--------|-------|
| 1 | MinIO client and startup verification | Complete (untracked) | src/lib/minio.ts |
| 2 | Auth, sanitize, and log middlewares | Complete (untracked) | src/middleware/auth.ts, src/middleware/sanitize.ts, src/middleware/log.ts |

## Requirements Implemented

| Requirement | Description | Implementation |
|-------------|-------------|----------------|
| INFRA-03 | Startup MinIO connection check | verifyMinioConnection() with process.exit(1) |
| SEC-01 | Download token validation | requireDownloadToken middleware |
| SEC-02 | Upload token validation | requireUploadToken middleware |
| SEC-03 | Input sanitization for path params | validateAppName + validateVersion with allowlist regex |
| SEC-05 | Token redaction in logs | requestLogger with [REDACTED] replacement |

## Decisions Implemented

| Decision | Applied In | Detail |
|----------|-----------|--------|
| D-01: useSSL false | minio.ts | Internal Docker network, no TLS |
| D-04: SHA-256 both sides | auth.ts | sha256(token) and sha256(expectedToken) before timingSafeEqual |
| D-05: Two separate middlewares | auth.ts | requireDownloadToken and requireUploadToken exported independently |
| D-06: Allowlist + double-dot | sanitize.ts | SAFE_PARAM regex plus explicit includes('..') check |

## Exported Function Signatures (for Plan 04 wiring)

```typescript
// src/lib/minio.ts
export const minioClient: Minio.Client
export function verifyMinioConnection(): Promise<void>

// src/middleware/auth.ts
export const requireDownloadToken: (req: Request, res: Response, next: NextFunction) => void
export const requireUploadToken: (req: Request, res: Response, next: NextFunction) => void

// src/middleware/sanitize.ts
export function validateAppName(req: Request, res: Response, next: NextFunction): void
export function validateVersion(req: Request, res: Response, next: NextFunction): void

// src/middleware/log.ts
export function requestLogger(req: Request, res: Response, next: NextFunction): void
```

## Deviations from Plan

None - plan executed exactly as written. All four files match the implementation specified in the plan exactly.

## Threat Mitigations Applied

| Threat ID | Mitigation | Location |
|-----------|------------|----------|
| T-03-01 | SHA-256 hash + timingSafeEqual | auth.ts lines 4, 8-10, 14 |
| T-03-02 | Allowlist regex + explicit .. check | sanitize.ts lines 4, 8-9, 14-15 |
| T-03-03 | Token regex redaction before log | log.ts line 5 |
| T-03-04 | 401 response has no token echo | auth.ts line 12 |
| T-03-05 | useSSL:false intentional per D-01 | minio.ts line 8 |

## Known Stubs

None. All modules are fully implemented with no placeholder values or hardcoded empty data.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced beyond what the plan's threat model covers.

## Self-Check

- [x] src/lib/minio.ts exists with all required exports
- [x] src/middleware/auth.ts exists with timingSafeEqual + sha256 + both token paths
- [x] src/middleware/sanitize.ts exists with SAFE_PARAM regex + '..' check
- [x] src/middleware/log.ts exists with [REDACTED] token redaction
- [ ] Task commits: BLOCKED — git add/commit operations prevented by parallel agent sandbox

## Self-Check: PARTIAL

Files created successfully. Git commits blocked by sandbox — orchestrator will commit during worktree merge.
