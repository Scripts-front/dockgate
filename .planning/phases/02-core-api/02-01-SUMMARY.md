---
phase: 02-core-api
plan: "01"
subsystem: routes
tags: [express, minio, presigned-url, auth, sanitize]
dependency_graph:
  requires:
    - src/lib/schemas.ts (LatestManifest, latestKey, tarKey)
    - src/lib/minio.ts (minioClient)
    - src/config.ts (minioBucket, minioPublicEndpoint)
    - src/middleware/auth.ts (requireDownloadToken)
    - src/middleware/sanitize.ts (validateAppName, validateVersion)
  provides:
    - src/routes/apps.ts (appsRouter with GET /:name/latest and GET /:name/download)
  affects:
    - src/index.ts (must mount appsRouter at /apps)
tech_stack:
  added: []
  patterns:
    - Express Router with middleware chain (validateAppName, requireDownloadToken, validateVersion)
    - MinIO statObject before presignedGetObject (existence check pattern)
    - Origin rewrite pattern for presigned URLs (internal → public endpoint)
    - isObjectNotFound helper normalizing NoSuchKey and NotFound S3 error codes
key_files:
  created:
    - src/routes/apps.ts
  modified: []
decisions:
  - "Use req.params['name'] as string (explicit cast) to satisfy strict TS — ParamsDictionary types values as string | string[] in @types/express-serve-static-core"
  - "Single commit covering both tasks since both handlers live in the same file"
metrics:
  duration: "~10 min"
  completed: "2026-06-17T12:28:03Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 02 Plan 01: Read Endpoints Summary

**One-liner:** appsRouter with GET /latest (public MinIO manifest read) and GET /download (token-gated statObject + presigned URL with public origin rewrite).

## What Was Built

Created `src/routes/apps.ts` exporting `appsRouter` — an Express Router with two client-facing GET endpoints:

**GET /:name/latest** (public)
- Reads `{name}/latest.json` from MinIO via `getObject`
- Returns the `LatestManifest` directly (no envelope wrapping — D-03)
- Returns `404 { error: 'No versions published' }` when object absent (D-04)
- No auth required (READ-01)
- Unexpected MinIO errors re-thrown to Express 5 global error handler

**GET /:name/download?version=X** (requires DOWNLOAD_TOKEN)
- Middleware chain: `validateAppName → requireDownloadToken → validateVersion`
- Calls `statObject` to verify `.tar` exists before generating URL (READ-03)
- Returns `404 { error: 'Version X not found' }` when `.tar` absent (D-09)
- Calls `presignedGetObject` with 3600s expiry (D-02)
- Rewrites internal MinIO hostname to `MINIO_PUBLIC_ENDPOINT` via `rewritePresignedUrl`
- Returns `{ url }` only — no expiresIn or extra fields (D-01)

**Helpers:**
- `isObjectNotFound(err)` — normalizes S3 error codes `NoSuchKey` (XML-parsed) and `NotFound` (no-XML fallback)
- `rewritePresignedUrl(sdkUrl)` — replaces internal Docker network origin with `config.minioPublicEndpoint`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | GET /apps/:name/latest handler | 422df7b | src/routes/apps.ts |
| 2 | GET /apps/:name/download handler | 422df7b | src/routes/apps.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict mode rejects ParamsDictionary string|string[] union**
- **Found during:** Task 1 verification (`bun run tsc --noEmit`)
- **Issue:** `@types/express-serve-static-core` defines `ParamsDictionary` as `{ [key: string]: string | string[] }`, causing `req.params.name` to be typed as `string | string[]`. MinIO SDK methods accept only `string` for object names.
- **Fix:** Changed `const { name } = req.params` to `const name = req.params['name'] as string` in both handlers. The `validateAppName` middleware already guarantees this is a plain string before the handler runs.
- **Files modified:** src/routes/apps.ts
- **Commit:** 422df7b

**2. [Rule 3 - Blocking] Plan files missing from worktree working tree**
- **Found during:** Pre-execution branch check
- **Issue:** Worktree was created at `e0b7c7b` (older base) instead of target `2b7fd95`. The `git reset --soft` moved HEAD but plan files added in commits `f9bea2a` and `2b7fd95` were absent from the working tree.
- **Fix:** Ran `git checkout HEAD -- .planning/` to restore planning files from the target commit.
- **Files modified:** .planning directory restored (no new changes committed)
- **Commit:** N/A (working tree fix only)

## Known Stubs

None — all handlers are fully implemented with real MinIO SDK calls.

## Threat Flags

No new threat surface beyond what the plan's threat model already covers. Both endpoints follow STRIDE mitigations T-02-01 through T-02-07 as designed.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/routes/apps.ts exists | FOUND |
| Commit 422df7b exists | FOUND |
| SUMMARY.md exists | FOUND |
| TypeScript compilation clean | PASS |
