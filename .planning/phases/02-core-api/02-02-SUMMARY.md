---
phase: 02-core-api
plan: "02"
subsystem: routes
tags: [express, minio, presigned-url, auth, sanitize, write-endpoints, anti-phantom]
dependency_graph:
  requires:
    - src/routes/apps.ts (appsRouter with GET routes from plan 01)
    - src/lib/schemas.ts (LatestManifest, latestKey, tarKey)
    - src/lib/minio.ts (minioClient — presignedPutObject, statObject, putObject)
    - src/config.ts (minioBucket, minioPublicEndpoint, uploadToken)
    - src/middleware/auth.ts (requireUploadToken)
    - src/middleware/sanitize.ts (validateAppName, validateVersion)
  provides:
    - src/routes/apps.ts (appsRouter with all four handlers: GET /latest, GET /download, POST /upload, PUT /latest)
    - src/index.ts (appsRouter mounted at /apps — all four endpoints reachable)
  affects:
    - Phase 3+ (full API surface now available for Docker/CI/CD integration)
tech_stack:
  added: []
  patterns:
    - POST handler with presignedPutObject(900s) — no prior existence check (CI/CD uploads new files)
    - PUT handler with inline body validation before any MinIO call (D-06/D-07 order guarantee)
    - Anti-phantom pattern: statObject on tarKey before putObject on latestKey (WRITE-03)
    - 422 on phantom version (tar absent when publishing latest.json)
    - SHA256_REGEX module-level constant for 64-char hex validation
    - LatestManifest written as JSON with server-side publishedAt (D-08)
key_files:
  created: []
  modified:
    - src/routes/apps.ts
    - src/index.ts
decisions:
  - "No statObject before presignedPutObject in POST /upload — CI/CD uploads new files; checking existence first would break the workflow. Anti-phantom only applies to PUT /latest (after upload already happened)."
  - "SHA256_REGEX declared at module level (not inside handler) — avoids re-creating RegExp on each request"
  - "Body validation order: version → sha256 → size; all 400 checks before statObject call (D-06 requirement)"
metrics:
  duration: "~8 min"
  completed: "2026-06-17T12:33:09Z"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 02 Plan 02: Write Endpoints Summary

**One-liner:** POST /upload (presignedPutObject 900s) and PUT /latest (anti-phantom statObject + putObject with LatestManifest) added to appsRouter; appsRouter mounted at /apps in index.ts completing the full four-endpoint API surface.

## What Was Built

Extended `src/routes/apps.ts` with two write endpoints and updated `src/index.ts` to mount the router.

**POST /:name/upload (WRITE-01)**
- Middleware chain: `validateAppName → requireUploadToken → validateVersion`
- Calls `presignedPutObject(bucket, tarKey(name, version), 900)` — 900s expiry (D-02)
- Rewrites internal MinIO hostname to `MINIO_PUBLIC_ENDPOINT` via `rewritePresignedUrl`
- Returns `{ url }` only (D-01)
- No prior existence check — CI/CD is uploading a new file

**PUT /:name/latest (WRITE-02, WRITE-03)**
- Middleware chain: `validateAppName → requireUploadToken`
- Inline body validation (all before MinIO calls, per D-06):
  - `version`: string, non-empty, matches `/^[a-zA-Z0-9._-]+$/`, no `..` (path traversal prevention, T-02-09)
  - `sha256`: string, matches `SHA256_REGEX = /^[a-f0-9]{64}$/i` (T-02-10)
  - `size`: number, `Number.isInteger`, positive (D-07)
- Anti-phantom check (WRITE-03, T-02-11): `statObject(bucket, tarKey(name, version))` → 422 if absent
- Builds `LatestManifest` with `publishedAt: new Date().toISOString()` (D-08: server time)
- Writes JSON to `latestKey(name)` via `putObject` with `Content-Type: application/json`
- Returns `200 { ok: true }`

**src/index.ts**
- Added `import { appsRouter } from './routes/apps.ts'`
- Added `app.use('/apps', appsRouter)` after `app.use(healthRouter)`
- All existing middleware, routes, error handler, and startup logic unchanged

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | POST /upload and PUT /latest handlers | c766d39 | src/routes/apps.ts |
| 2 | Register appsRouter in index.ts | 00952bf | src/index.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Import] requireUploadToken not imported**
- **Found during:** Task 1 implementation
- **Issue:** The existing import on line 12 only imported `requireDownloadToken` from `../middleware/auth.ts`. The new write handlers reference `requireUploadToken` which was missing.
- **Fix:** Extended the import to `import { requireDownloadToken, requireUploadToken } from '../middleware/auth.ts'`
- **Files modified:** src/routes/apps.ts
- **Commit:** c766d39

**2. [Rule 3 - Blocking] Worktree working tree missing files after git reset --soft**
- **Found during:** Pre-execution branch check
- **Issue:** Worktree HEAD was at `e0b7c7b` (older base) instead of target `bdd932f`. After `git reset --soft bdd932f`, the index was updated but working tree files were deleted (D status in git status). Files `src/routes/apps.ts` and planning files were absent.
- **Fix:** Ran `git checkout HEAD -- src/routes/apps.ts .planning/phases/02-core-api/...` to restore deleted files.
- **Files modified:** Working tree restored (no new committed changes)
- **Commit:** N/A (working tree fix only)

## Known Stubs

None — all handlers are fully implemented with real MinIO SDK calls. No hardcoded values or placeholder responses.

## Threat Flags

No new threat surface beyond the plan's threat model. All STRIDE mitigations T-02-08 through T-02-15 are implemented as designed:
- T-02-08: `requireUploadToken` uses `timingSafeEqual` (inherited from auth middleware)
- T-02-09: Version path traversal prevented by regex + `..` check
- T-02-10: SHA256_REGEX enforces 64-char hex before MinIO call
- T-02-11: Anti-phantom statObject check before putObject

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/routes/apps.ts exists | FOUND |
| src/index.ts contains appsRouter | FOUND |
| Commit c766d39 exists | FOUND |
| Commit 00952bf exists | FOUND |
| TypeScript compilation clean (bun tsc --noEmit) | PASS |
| All 4 routes in appsRouter | PASS (GET x2, POST x1, PUT x1) |
| Anti-phantom: statObject + 422 in PUT handler | PASS |
| Upload expiry 900s | PASS |
| Download expiry 3600s | PASS |
| manifest has all 5 fields (schema, version, sha256, size, publishedAt) | PASS |
