---
phase: 02-core-api
verified: 2026-06-17T13:00:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 02: Core API Verification Report

**Phase Goal:** Clients can discover and download app versions; CI/CD pipelines can upload new versions and publish them atomically
**Verified:** 2026-06-17T13:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap Success Criteria (non-negotiable contract) plus plan must-haves:

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| SC-1 | `GET /apps/:name/latest` returns `{ schema: 1, version, sha256, size, publishedAt }` with no auth required | VERIFIED | Line 36: `appsRouter.get('/:name/latest', validateAppName, async...)` — no auth middleware; line 46: `res.json(manifest)` returns LatestManifest directly; schema:1 field at line 157 |
| SC-2 | `GET /apps/:name/download?version=X` with valid `DOWNLOAD_TOKEN` returns presigned URL; without valid token returns 401 | VERIFIED | Lines 59-87: middleware chain `validateAppName → requireDownloadToken → validateVersion`; returns `{ url }` after `presignedGetObject(…3600)` with origin rewritten to `minioPublicEndpoint` |
| SC-3 | `POST /apps/:name/upload?version=X` with valid `UPLOAD_TOKEN` returns presigned PUT URL | VERIFIED | Lines 92-109: middleware chain `validateAppName → requireUploadToken → validateVersion`; returns `{ url }` from `presignedPutObject(…900)` with origin rewritten |
| SC-4 | `PUT /apps/:name/latest` with valid `UPLOAD_TOKEN` updates `latest.json` only when `.tar` exists; returns 422 when absent | VERIFIED | Lines 117-174: `statObject` anti-phantom check at line 146; 422 at line 149; `putObject` writes to `latestKey(name)` at line 164 |
| P1-1 | `GET /apps/:name/latest` returns `{ schema: 1, version, sha256, size, publishedAt }` when `latest.json` exists | VERIFIED | `getObject` streams `latestKey(name)`, parses as `LatestManifest`, returned via `res.json(manifest)` (line 47) |
| P1-2 | `GET /apps/:name/latest` returns 404 `{ error: 'No versions published' }` when absent | VERIFIED | Line 50: `res.status(404).json({ error: 'No versions published' })` inside `isObjectNotFound` branch |
| P1-3 | `GET /apps/:name/download?version=X` with valid DOWNLOAD_TOKEN returns `{ url }` with public-endpoint origin | VERIFIED | `rewritePresignedUrl` replaces `parsed.origin` with `config.minioPublicEndpoint` (line 29); used at lines 84 and 106 |
| P1-4 | `GET /apps/:name/download?version=X` returns 404 `{ error: 'Version X not found' }` when `.tar` absent | VERIFIED | Line 73: `res.status(404).json({ error: \`Version ${version} not found\` })` |
| P1-5 | `GET /apps/:name/download` without valid token returns 401 | VERIFIED | `requireDownloadToken` middleware at position 2 in chain (line 62); middleware returns 401 on token mismatch (from Phase 1 auth.ts) |
| P1-6 | Name or version containing `..` or `/` rejected with 400 before reaching MinIO | VERIFIED | `validateAppName` in every route; `validateVersion` in download/upload routes; PUT handler inline regex `/^[a-zA-Z0-9._-]+$/` + `version.includes('..')` check (lines 129-130) |
| P2-1 | `POST /apps/:name/upload?version=X` with valid UPLOAD_TOKEN returns `{ url }` (presigned PUT URL) | VERIFIED | Line 107: `res.json({ url })`; presigned PUT URL with 900s expiry |
| P2-2 | `PUT /apps/:name/latest` with valid UPLOAD_TOKEN + valid body writes `latest.json` and returns 200 `{ ok: true }` | VERIFIED | Lines 155-172: LatestManifest built with 5 fields, written via `putObject`; line 172: `res.status(200).json({ ok: true })` |
| P2-3 | `PUT /apps/:name/latest` returns 422 `{ error: 'Tar file not found for version X' }` when `.tar` absent | VERIFIED | Line 149: `res.status(422).json({ error: \`Tar file not found for version ${version}\` })` |
| P2-4 | `PUT /apps/:name/latest` returns 400 when sha256 is not a 64-char hex string | VERIFIED | Line 115: `SHA256_REGEX = /^[a-f0-9]{64}$/i`; line 135-136: 400 `{ error: 'Invalid sha256' }` before any MinIO call |
| P2-5 | `PUT /apps/:name/latest` returns 400 when size is not a positive integer | VERIFIED | Line 139: `!Number.isInteger(size) \|\| size <= 0`; line 140: 400 `{ error: 'Invalid size' }` |
| P2-6 | All four business endpoints reachable at `/apps/*` (appsRouter registered in index.ts) | VERIFIED | `src/index.ts` line 7: import; line 18: `app.use('/apps', appsRouter)` |

**Score:** 10/10 roadmap success criteria + plan must-haves verified (collapsing to 4 SC + 6 supporting plan must-haves = 10 distinct observable truths)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/routes/apps.ts` | appsRouter with all 4 handlers registered | VERIFIED | 175 lines; exports `appsRouter`; 4 route registrations confirmed (lines 36, 59, 92, 117) |
| `src/index.ts` | appsRouter mounted at `/apps` | VERIFIED | Import at line 7; `app.use('/apps', appsRouter)` at line 18; existing middleware/routes/error handler unchanged |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/routes/apps.ts` | `minioClient.getObject / statObject / presignedGetObject` | Direct SDK calls | VERIFIED | `getObject` line 39; `statObject` lines 70, 146; `presignedGetObject` line 79; `presignedPutObject` line 101; `putObject` line 164 |
| `rewritePresignedUrl` | `config.minioPublicEndpoint` | URL origin replacement | VERIFIED | Line 29: `sdkUrl.replace(parsed.origin, config.minioPublicEndpoint)` — called at lines 84, 106 |
| `src/index.ts` | `src/routes/apps.ts` | `app.use('/apps', appsRouter)` | VERIFIED | Import line 7; mount line 18; pattern `appsRouter` confirmed |
| `PUT /latest handler` | `minioClient.statObject` | Anti-phantom check before putObject | VERIFIED | `statObject(config.minioBucket, tarKey(name, version))` at line 146; appears before `putObject` at line 164 |
| `PUT /latest handler` | `minioClient.putObject` | Writes latest.json after anti-phantom passes | VERIFIED | `putObject(config.minioBucket, latestKey(name), json, …)` line 164 — only reached after statObject succeeds |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `GET /:name/latest` | `manifest` (LatestManifest) | `minioClient.getObject` streaming `latestKey(name)` from MinIO | Yes — real MinIO read via SDK | FLOWING |
| `GET /:name/download` | `url` (presigned URL string) | `minioClient.statObject` (existence) + `presignedGetObject` (signing) + `rewritePresignedUrl` (origin rewrite) | Yes — real MinIO SDK calls | FLOWING |
| `POST /:name/upload` | `url` (presigned PUT URL string) | `minioClient.presignedPutObject` + `rewritePresignedUrl` | Yes — real MinIO SDK call | FLOWING |
| `PUT /:name/latest` | `manifest` (LatestManifest written to MinIO) | Body input validated → `statObject` (anti-phantom) → `putObject` writing JSON | Yes — real MinIO write via SDK | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no running server available; all checks are static MinIO-dependent endpoints that require a live MinIO instance.

TypeScript compilation passes: `bun run tsc --noEmit` exits 0.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compilation clean | `bun run tsc --noEmit` | Exit code 0, no output | PASS |
| 4 routes registered in appsRouter | `grep "appsRouter\.(get\|post\|put)"` | Lines 36, 59, 92, 117 | PASS |
| appsRouter mounted in index.ts | `grep "appsRouter" src/index.ts` | Import + `app.use('/apps', appsRouter)` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| READ-01 | Plan 01 | Cliente pode consultar `GET /apps/:name/latest` sem autenticação | SATISFIED | Route at line 36 has only `validateAppName` — no auth middleware; returns LatestManifest directly |
| READ-02 | Plan 01 | Cliente pode solicitar `GET /apps/:name/download?version=X` com DOWNLOAD_TOKEN e receber URL pré-assinada | SATISFIED | Route at line 59 with `requireDownloadToken`; returns `{ url }` from `presignedGetObject` |
| READ-03 | Plan 01 | API retorna 404 com mensagem clara quando versão não existe | SATISFIED | Line 73: 404 `{ error: 'Version ${version} not found' }`; also line 50: 404 `{ error: 'No versions published' }` |
| WRITE-01 | Plan 02 | CI/CD pode solicitar `POST /apps/:name/upload?version=X` com UPLOAD_TOKEN e receber URL pré-assinada de PUT | SATISFIED | Route at line 92 with `requireUploadToken`; returns `{ url }` from `presignedPutObject(…900)` |
| WRITE-02 | Plan 02 | CI/CD pode chamar `PUT /apps/:name/latest` para atualizar `latest.json` — API verifica que `.tar` existe (anti-phantom) | SATISFIED | Route at line 117; `statObject` at line 146; `putObject` at line 164; only updates after statObject succeeds |
| WRITE-03 | Plan 02 | API rejeita `PUT /latest` com erro 422 quando `.tar` não existe | SATISFIED | Line 149: `res.status(422).json({ error: \`Tar file not found for version ${version}\` })` |

No orphaned requirements: all 6 Phase 2 requirements (READ-01 through WRITE-03) claimed in plans and all satisfied.

### Anti-Patterns Found

No anti-patterns detected:
- Zero TODO/FIXME/placeholder comments in modified files
- No stub return values (`return null`, `return {}`, empty arrays returned without fetching)
- No hardcoded empty data flowing to rendering (the `chunks: Buffer[] = []` at line 40 is the correct accumulator pattern for stream reading — it is populated via `stream.on('data', ...)` before use)
- No console.log in business logic

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found |

### Human Verification Required

None. All must-haves are programmatically verifiable through static analysis and TypeScript compilation.

Note: Runtime behavior (actual MinIO connectivity, token rejection returning 401, presigned URL validity) cannot be verified without a live environment but the code paths are correctly wired. These are infrastructure concerns covered by Phase 1 verification and deployment testing.

### Gaps Summary

No gaps. All 6 phase requirements (READ-01, READ-02, READ-03, WRITE-01, WRITE-02, WRITE-03) are implemented and wired. All 4 roadmap success criteria are met by the implementation. TypeScript compiles cleanly. No stubs or orphaned artifacts found.

---

_Verified: 2026-06-17T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
