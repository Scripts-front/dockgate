# Phase 2: Core API - Research

**Researched:** 2026-06-17
**Domain:** Express 5 route handlers + MinIO SDK presigned URLs + object read/write
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `GET /apps/:name/download` and `POST /apps/:name/upload` return only `{ url: string }`. No additional metadata (expiresIn, expiresAt, method). Client scripts use the URL immediately after receiving it.
- **D-02:** Presigned URL expiry (already defined in CLAUDE.md): download = 3600s, upload = 900s. Value is NOT included in the response (D-01 above).
- **D-03:** `GET /apps/:name/latest` returns the `latest.json` content directly: `{ schema: 1, version, sha256, size, publishedAt }`. No additional envelope.
- **D-04:** When `latest.json` does not exist in MinIO (app with no published versions): 404 with `{ error: "No versions published" }`.
- **D-05:** CI/CD sends `{ version: string, sha256: string, size: number }` in the body of `PUT /apps/:name/latest`. The API is responsible for adding `schema: 1` and `publishedAt` before writing `latest.json`.
- **D-06:** API validates that `sha256` is a hex string of exactly 64 characters (`/^[a-f0-9]{64}$/i`). Request with invalid sha256 returns 400 before the anti-phantom check.
- **D-07:** API validates that `size` is a positive integer. Request with invalid size returns 400.
- **D-08:** API sets `publishedAt` with server time (`new Date().toISOString()`) when `PUT /apps/:name/latest` is processed. CI/CD does not send this field.
- **D-09:** `GET /apps/:name/download?version=X` when the `.tar` does not exist in MinIO: 404 with `{ error: "Version X not found" }` (substituting X for the literal version from the request).
- **D-10:** `PUT /apps/:name/latest` when the corresponding `.tar` does not exist in MinIO (anti-phantom check, WRITE-03): 422 with `{ error: "Tar file not found for version X" }`.
- **D-11:** Consistent error format across all endpoints: `{ error: string }` (same pattern as auth.ts and sanitize.ts from Phase 1).

### Claude's Discretion

- Route file organization: single `apps.ts` or separate files per concern — implementer decides.
- Middleware application order in routes (sanitize before auth, or auth before sanitize).
- Unexpected MinIO SDK error handling (log + generic 500, already covered by the global error handler in index.ts).
- Log message format per endpoint.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| READ-01 | Client can query `GET /apps/:name/latest` without auth and receive latest version with sha256, size, publishedAt | `minioClient.getObject` + JSON parse; `LatestManifest` interface already defined in schemas.ts |
| READ-02 | Client can request `GET /apps/:name/download?version=X` with DOWNLOAD_TOKEN and receive MinIO presigned URL for direct `.tar` download | `minioClient.statObject` (existence check) + `presignedGetObject(bucket, key, 3600)` + URL host rewrite |
| READ-03 | API returns 404 with clear message when requested version does not exist in MinIO | Catch S3Error where `err.code === 'NoSuchKey'` (XML body) or `err.code === 'NotFound'` (fallback) from `statObject` |
| WRITE-01 | CI/CD can request `POST /apps/:name/upload?version=X` with UPLOAD_TOKEN and receive presigned PUT URL for direct MinIO upload | `presignedPutObject(bucket, key, 900)` + URL host rewrite |
| WRITE-02 | CI/CD can call `PUT /apps/:name/latest` with UPLOAD_TOKEN to update `latest.json` — API verifies `.tar` exists in MinIO before writing | `statObject` (anti-phantom check) + `putObject(bucket, latestKey, JSON.stringify(manifest))` |
| WRITE-03 | API rejects `PUT /latest` with 422 when the corresponding `.tar` does not exist in MinIO | Catch S3Error with code `'NoSuchKey'`/`'NotFound'` in anti-phantom check; return 422 |
</phase_requirements>

---

## Summary

Phase 2 wires the four business endpoints that Phase 1's scaffold was built to support. All underlying infrastructure is already in place: auth middlewares (`requireDownloadToken`, `requireUploadToken`), input validators (`validateAppName`, `validateVersion`), MinIO client singleton, key builders (`tarKey`, `latestKey`), and the `LatestManifest` interface.

The only non-trivial technical decision is the presigned URL host rewrite. The MinIO SDK generates URLs using the internal Docker hostname (e.g., `http://minio:9000/...`). Clients outside the Docker network cannot reach that host. The URL must be rewritten so the origin is replaced by `MINIO_PUBLIC_ENDPOINT`. This is a simple string replacement on the returned URL — no special SDK option exists for this. The `config.minioPublicEndpoint` value is already validated at startup.

The second non-obvious item is error detection for missing objects. When `statObject` is called on a non-existent object, MinIO server returns an HTTP 404 with an XML body containing `<Code>NoSuchKey</Code>`. The SDK parses this XML and throws an `S3Error` with `err.code === 'NoSuchKey'`. In rare cases where no XML body is present, the SDK falls back to `err.code === 'NotFound'`. Both codes must be handled to correctly distinguish "object missing" from other SDK failures.

**Primary recommendation:** Create a single `src/routes/apps.ts` router that registers all four endpoints. Apply `validateAppName` first on every route, then auth middleware, then `validateVersion` where needed. This matches the health.ts pattern and keeps the route file self-contained before registration in `index.ts`.

---

## Standard Stack

### Core (Phase 1 — already installed)

| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| `express` | 5.2.1 | HTTP framework, routing | Already in package.json [VERIFIED: package.json] |
| `minio` | 8.0.7 | MinIO object storage client | Already in package.json [VERIFIED: package.json] |

No new npm dependencies are needed for Phase 2.

### Key Methods Used from MinIO SDK 8.0.7 (verified against installed node_modules)

| Method | Signature | Returns | Purpose |
|--------|-----------|---------|---------|
| `presignedGetObject` | `(bucket, key, expires?, respHeaders?, date?) => Promise<string>` | URL string | Generate download URL |
| `presignedPutObject` | `(bucket, key, expires?) => Promise<string>` | URL string | Generate upload URL |
| `statObject` | `(bucket, key, opts?) => Promise<BucketItemStat>` | `{ size, etag, lastModified, metaData }` | Existence check / anti-phantom |
| `getObject` | `(bucket, key, opts?) => Promise<stream.Readable>` | Readable stream | Read `latest.json` |
| `putObject` | `(bucket, key, stream/Buffer/string, size?, meta?) => Promise<UploadedObjectInfo>` | upload result | Write `latest.json` |

[VERIFIED: /root/dockgate/node_modules/minio/dist/main/internal/client.d.ts]

---

## Architecture Patterns

### Recommended Project Structure after Phase 2

```
src/
├── config.ts                  # (Phase 1 — unchanged)
├── lib/
│   └── minio.ts               # (Phase 1 — unchanged)
├── middleware/
│   ├── auth.ts                # (Phase 1 — unchanged)
│   ├── log.ts                 # (Phase 1 — unchanged)
│   └── sanitize.ts            # (Phase 1 — unchanged)
├── routes/
│   ├── health.ts              # (Phase 1 — unchanged)
│   └── apps.ts                # NEW — all four business endpoints
└── index.ts                   # (Phase 1 — updated: register appsRouter)
```

### Pattern 1: Presigned URL Host Rewrite

**What:** Replace the internal Docker hostname in SDK-generated presigned URLs with the public endpoint before returning to the caller.

**Why:** `presignedGetObject` / `presignedPutObject` build the URL using `this.host` (the MinIO client's `endPoint` — the internal Docker hostname like `minio:9000`). Clients outside Docker cannot resolve that hostname.

**How it works (verified from SDK source):**
- `presignSignatureV4` in `signing.js` line 266: `return request.protocol + '//' + request.headers.host + path + '&X-Amz-Signature=...'`
- `request.headers.host` = internal endpoint, e.g., `minio:9000`
- `MINIO_PUBLIC_ENDPOINT` = full origin, e.g., `http://192.168.1.10:9000`

**Implementation:**

```typescript
// Source: CONTEXT.md specifics + verified from minio/dist/main/signing.js line 266
function rewritePresignedUrl(sdkUrl: string): string {
  const publicOrigin = config.minioPublicEndpoint  // e.g., "http://192.168.1.10:9000"
  const parsed = new URL(sdkUrl)
  const internalOrigin = parsed.origin  // e.g., "http://minio:9000"
  return sdkUrl.replace(internalOrigin, publicOrigin)
}
```

[VERIFIED: /root/dockgate/node_modules/minio/dist/main/signing.js line 266]

### Pattern 2: S3Error Detection for Missing Objects

**What:** Catch `statObject` and `getObject` errors and test `err.code` to distinguish "object not found" from real errors.

**How it works (verified from SDK source):**
- MinIO server returns HTTP 404 with XML body `<Error><Code>NoSuchKey</Code>...</Error>` for missing objects
- SDK XML parser (`xml-parser.js` line 60-61): iterates XML error fields, sets them lowercased on `S3Error` — `Code` → `err.code = 'NoSuchKey'`
- Fallback (no XML body): `err.code = 'NotFound'` (`xml-parser.js` line 84)
- Both cases indicate "object does not exist"

```typescript
// Source: /root/dockgate/node_modules/minio/dist/main/internal/xml-parser.js lines 56-66, 83-85
import { S3Error } from 'minio'

function isObjectNotFound(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as S3Error).code
    return code === 'NoSuchKey' || code === 'NotFound'
  }
  return false
}
```

[VERIFIED: /root/dockgate/node_modules/minio/dist/main/internal/xml-parser.js]

### Pattern 3: Reading latest.json from MinIO

**What:** Stream the object, collect it to a string, JSON.parse into `LatestManifest`.

```typescript
// Source: MinIO SDK getObject returns node:stream.Readable
import { minioClient } from '../lib/minio.ts'
import { config } from '../config.ts'
import type { LatestManifest } from '../lib/schemas.ts'
import { latestKey } from '../lib/schemas.ts'

async function readLatestManifest(appName: string): Promise<LatestManifest> {
  const stream = await minioClient.getObject(config.minioBucket, latestKey(appName))
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
    stream.on('error', reject)
  })
}
```

[ASSUMED — stream collection pattern is standard Node.js; getObject return type verified from type.d.ts]

### Pattern 4: Writing latest.json to MinIO

**What:** Serialize `LatestManifest` to JSON string and write directly via `putObject`. The SDK accepts a `string` as the third argument (converts to Buffer internally).

```typescript
// Source: /root/dockgate/node_modules/minio/dist/main/internal/client.js line 1372-1375
const manifest: LatestManifest = {
  schema: 1,
  version: body.version,
  sha256: body.sha256,
  size: body.size,
  publishedAt: new Date().toISOString(),   // D-08: server time
}
const json = JSON.stringify(manifest)
await minioClient.putObject(
  config.minioBucket,
  latestKey(name),
  json,
  Buffer.byteLength(json),
  { 'Content-Type': 'application/json' },
)
```

[VERIFIED: client.js line 1372 — `typeof stream === 'string'` branch accepts strings directly]

### Pattern 5: Anti-Phantom Check (WRITE-03)

**What:** Before writing `latest.json`, verify the corresponding `.tar` exists in MinIO using `statObject`. If missing, return 422.

```typescript
// Source: D-10 from CONTEXT.md + S3Error detection pattern above
try {
  await minioClient.statObject(config.minioBucket, tarKey(name, body.version))
} catch (err) {
  if (isObjectNotFound(err)) {
    res.status(422).json({ error: `Tar file not found for version ${body.version}` })
    return
  }
  throw err  // unexpected error — Express 5 global handler catches it
}
```

[VERIFIED: statObject signature from client.d.ts; error code logic from xml-parser.js]

### Pattern 6: Middleware Chain for Routes

**What:** Apply validators before auth on GET routes (fail fast on bad input, avoid unnecessary token work). Apply auth before validators on write routes where auth failure is more likely than invalid input.

**Recommended order (Claude's discretion per CONTEXT.md):**

```typescript
// READ endpoints: sanitize → auth (bad name/version fails early)
router.get('/:name/latest', validateAppName, getLatest)
router.get('/:name/download', validateAppName, requireDownloadToken, validateVersion, getDownload)

// WRITE endpoints: sanitize → auth (consistent with read)
router.post('/:name/upload', validateAppName, requireUploadToken, validateVersion, postUpload)
router.put('/:name/latest', validateAppName, requireUploadToken, putLatest)
```

**Note:** `validateVersion` reads from `req.query.version` for GET/POST routes and would need to be adapted for `PUT /latest` which reads version from the body (not query params). The PUT handler validates its own body — do not apply `validateVersion` middleware there.

### Pattern 7: Registering the Apps Router in index.ts

```typescript
// src/index.ts — add after health router
import { appsRouter } from './routes/apps.ts'

app.use('/apps', appsRouter)
```

[ASSUMED — standard Express router mounting pattern; consistent with existing healthRouter registration]

### Anti-Patterns to Avoid

- **Using `req.params.version` for download/upload routes:** Version comes from `req.query.version`, not the path. The existing `validateVersion` middleware handles both (`req.params.version ?? req.query.version`) — use it.
- **Returning the raw MinIO presigned URL without host rewrite:** The internal hostname (`minio:9000`) is not reachable by clients outside Docker. Always call `rewritePresignedUrl()` before responding.
- **Calling `statObject` before generating a download presigned URL without checking the error code:** An S3Error with `code === 'AccessDenied'` is a real error, not a "not found." Always re-throw on non-404 codes.
- **Hardcoding expiry values:** Use the constants defined in CLAUDE.md (`3600` for download, `900` for upload). Do not inline magic numbers.
- **Passing `version` as a URL path parameter in `PUT /apps/:name/latest`:** The `version` for the PUT endpoint comes from the request body (D-05), not the URL. The URL is only `PUT /apps/:name/latest`.
- **Using `multer` or any body streaming:** Files go directly from CI/CD to MinIO via presigned URLs. The API only handles small JSON bodies.
- **Calling `getObject` to check existence before download:** Use `statObject` for existence checks — it is a HEAD request with no body transfer.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Presigned URL generation | Custom AWS SigV4 signing | `minioClient.presignedGetObject` / `presignedPutObject` | Signature calculation is complex; SDK handles region, credential refresh, encoding |
| Stream-to-string | Custom event emitter wrapper | Standard `stream.on('data'/'end'/'error')` pattern | Already the Node.js idiom; no library needed |
| JSON validation of body fields | A validation library (zod, joi) | Inline `typeof` + regex checks (as per D-06/D-07) | Two fields to validate; full library is overkill here |
| Object existence check | Manual HTTP HEAD request | `minioClient.statObject` | SDK manages auth headers, error parsing, retries |
| Content-Type for latest.json | None | Pass `{ 'Content-Type': 'application/json' }` in putObject metadata | Helps MinIO serve correct MIME type if object is ever accessed directly |

---

## Common Pitfalls

### Pitfall 1: Presigned URL Uses Internal Hostname

**What goes wrong:** The SDK generates URLs with the internal Docker network hostname (e.g., `http://minio:9000/bucket/app/1.0.0.tar?X-Amz-...`). The client receives this URL and cannot connect because `minio` is not DNS-resolvable outside Docker.

**Why it happens:** `presignedGetObject` builds the URL from `this.host` (set during MinIO client construction to `config.minioEndpoint`). There is no SDK option to override the URL origin at sign time.

**How to avoid:** Always call `rewritePresignedUrl(url)` on every presigned URL before including it in a response.

**Warning signs:** Presigned URL in response starts with `http://minio:` or `http://localhost:`.

[VERIFIED: /root/dockgate/node_modules/minio/dist/main/signing.js line 266]

### Pitfall 2: S3Error Code Has Two Possible Values for "Not Found"

**What goes wrong:** Code checks only `err.code === 'NoSuchKey'` — then fails to catch the 404 when MinIO returns a minimal response with no XML body (e.g., under load or version differences).

**Why it happens:** The SDK has two code paths: if XML body is present it parses `<Code>NoSuchKey</Code>` into `err.code`; if no XML body it falls back to `err.code = 'NotFound'`.

**How to avoid:** Always check both: `err.code === 'NoSuchKey' || err.code === 'NotFound'`.

**Warning signs:** 500 errors on valid requests to non-existent objects.

[VERIFIED: /root/dockgate/node_modules/minio/dist/main/internal/xml-parser.js lines 59-85]

### Pitfall 3: Forgetting `throw err` After the Not-Found Check

**What goes wrong:** After catching `S3Error` for existence check, swallowing non-404 errors (credential issues, network errors, bucket permissions) and returning a 404/422 incorrectly.

**Why it happens:** Broad `catch (err)` blocks that only check for "not found" and otherwise return an error response.

**How to avoid:** If `isObjectNotFound(err)` is false, always `throw err` to let Express 5's global error handler return 500.

### Pitfall 4: validateVersion Not Applied to Query Params on GET /download

**What goes wrong:** The `:name` sanitizer runs, but version from `?version=` is not validated — path traversal attempt like `?version=../../etc` reaches MinIO key construction.

**Why it happens:** Forgetting to add `validateVersion` middleware to the download route. `validateVersion` in sanitize.ts checks `req.params.version ?? req.query.version`, so it covers both query and path.

**How to avoid:** Always include `validateVersion` in the middleware chain for any route that uses a version parameter.

[VERIFIED: /root/dockgate/src/middleware/sanitize.ts lines 16-24]

### Pitfall 5: PUT /latest Body Validation Order (D-06 specifies 400 before anti-phantom)

**What goes wrong:** Anti-phantom `statObject` call runs before validating `sha256` format — wasted MinIO round-trip for malformed requests, and incorrect error precedence.

**Why it happens:** Putting the MinIO check at the top of the handler before input validation.

**How to avoid:** Validate `version`, `sha256` (D-06), and `size` (D-07) first. Only proceed to `statObject` after all validations pass.

### Pitfall 6: S3Error Import — Use Type-Only or Instance Check

**What goes wrong:** `err instanceof S3Error` may fail if `minio` is imported differently in different modules (CJS vs ESM boundary issue).

**How to avoid:** The safest pattern is duck-typing: `(err as any).code !== undefined && err instanceof Error`. Alternatively, import `{ S3Error }` from `'minio'` explicitly and use `instanceof` — this works because the package has a single CJS entry point in Bun's module resolution.

[ASSUMED — ESM/CJS boundary with instanceof is a known Bun pattern; no specific issue found in minio-js issues]

---

## Code Examples

### GET /apps/:name/latest — Full Handler

```typescript
// Source: D-03, D-04 from CONTEXT.md + pattern 3 above
appsRouter.get('/:name/latest', validateAppName, async (req, res) => {
  const { name } = req.params
  try {
    const stream = await minioClient.getObject(config.minioBucket, latestKey(name))
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    const manifest: LatestManifest = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    res.json(manifest)  // D-03: return content directly, no envelope
  } catch (err) {
    if (isObjectNotFound(err)) {
      res.status(404).json({ error: 'No versions published' })  // D-04
      return
    }
    throw err
  }
})
```

### GET /apps/:name/download — Full Handler

```typescript
// Source: D-01, D-02, D-09 from CONTEXT.md + presigned URL pattern above
appsRouter.get('/:name/download', validateAppName, requireDownloadToken, validateVersion, async (req, res) => {
  const { name } = req.params
  const version = req.query.version as string
  const key = tarKey(name, version)

  // READ-03: verify object exists before generating presigned URL
  try {
    await minioClient.statObject(config.minioBucket, key)
  } catch (err) {
    if (isObjectNotFound(err)) {
      res.status(404).json({ error: `Version ${version} not found` })  // D-09
      return
    }
    throw err
  }

  const rawUrl = await minioClient.presignedGetObject(config.minioBucket, key, 3600)  // D-02
  const url = rewritePresignedUrl(rawUrl)
  res.json({ url })  // D-01
})
```

### POST /apps/:name/upload — Full Handler

```typescript
// Source: D-01, D-02 from CONTEXT.md
appsRouter.post('/:name/upload', validateAppName, requireUploadToken, validateVersion, async (req, res) => {
  const { name } = req.params
  const version = req.query.version as string

  const rawUrl = await minioClient.presignedPutObject(config.minioBucket, tarKey(name, version), 900)  // D-02
  const url = rewritePresignedUrl(rawUrl)
  res.json({ url })  // D-01
})
```

### PUT /apps/:name/latest — Full Handler

```typescript
// Source: D-05 through D-11 from CONTEXT.md + patterns 4 and 5 above
const SHA256_REGEX = /^[a-f0-9]{64}$/i  // D-06

appsRouter.put('/:name/latest', validateAppName, requireUploadToken, async (req, res) => {
  const { name } = req.params
  const { version, sha256, size } = req.body

  // Input validation — D-06, D-07 (before anti-phantom check per D-06)
  if (typeof version !== 'string' || !version || !SAFE_PARAM.test(version) || version.includes('..')) {
    res.status(400).json({ error: 'Invalid version' })
    return
  }
  if (typeof sha256 !== 'string' || !SHA256_REGEX.test(sha256)) {
    res.status(400).json({ error: 'Invalid sha256' })
    return
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    res.status(400).json({ error: 'Invalid size' })
    return
  }

  // Anti-phantom check — WRITE-03, D-10
  try {
    await minioClient.statObject(config.minioBucket, tarKey(name, version))
  } catch (err) {
    if (isObjectNotFound(err)) {
      res.status(422).json({ error: `Tar file not found for version ${version}` })  // D-10
      return
    }
    throw err
  }

  // Build and write latest.json — D-05, D-08
  const manifest: LatestManifest = {
    schema: 1,
    version,
    sha256,
    size,
    publishedAt: new Date().toISOString(),
  }
  const json = JSON.stringify(manifest)
  await minioClient.putObject(
    config.minioBucket,
    latestKey(name),
    json,
    Buffer.byteLength(json),
    { 'Content-Type': 'application/json' },
  )

  res.status(200).json({ ok: true })
})
```

---

## State of the Art

No state-of-the-art changes relevant to this phase. All patterns (presigned URLs, Express router pattern, S3 error handling) are stable and unchanged from Phase 1 research.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Stream collection pattern (`stream.on('data'/'end'/'error')`) for getObject | Pattern 3 / Code Examples | Low — this is the canonical Node.js readable stream API; verified that getObject returns `stream.Readable` |
| A2 | `instanceof S3Error` works across CJS/ESM in Bun for minio package | Pitfall 6 | Low — minio has a single CJS dist; Bun resolves via `main` field; no cross-module boundary issue expected |
| A3 | Mounting the apps router as `app.use('/apps', appsRouter)` requires `:name` to remain in `req.params` within the router | Pattern 7 | Low — standard Express router behavior; router inherits parent params by default when using `mergeParams: true` OR the route registers the full path. Note: if using `app.use('/apps', appsRouter)` without `mergeParams`, `:name` in the sub-router is correctly scoped because it's declared in the sub-router's own route path. |

**Clarification on A3:** When using `app.use('/apps', router)` and the router declares `router.get('/:name/latest', ...)`, the `:name` param is available in `req.params` because it is declared in the router's own route — not inherited from the parent mount point. This is standard Express behavior. [ASSUMED — consistent with Express 5 API docs and Phase 1 pattern with `healthRouter`]

---

## Open Questions

1. **`mergeParams` on the apps router?**
   - What we know: Not needed — the parent mount path `/apps` has no params. `:name` is declared in the sub-router's own routes.
   - What's unclear: Nothing — no params in the parent path means `mergeParams` is irrelevant here.
   - Recommendation: Do not set `mergeParams`.

2. **What HTTP status code does `PUT /latest` return on success?**
   - What we know: CONTEXT.md and REQUIREMENTS.md do not specify. Standard practice is 200 with a small body or 204 with no body.
   - What's unclear: Whether the CI/CD pipeline checks the response body on success.
   - Recommendation: Return `200` with `{ ok: true }` (consistent with the health endpoint's success shape).

---

## Environment Availability

Step 2.6: SKIPPED — Phase 2 is code-only changes with no new external dependencies. All required runtime dependencies (Bun, MinIO, Express) were verified in Phase 1 and are already installed.

---

## Project Constraints (from CLAUDE.md)

| Constraint | Impact on Phase 2 |
|------------|-------------------|
| Bun + Express 5 + TypeScript — no alternatives | All route handlers are Express 5 async handlers |
| MinIO SDK (`minio` package) only — no `@aws-sdk/client-s3` | All object operations via `minioClient` singleton |
| Fixed tokens via env vars — no JWT, OAuth | `requireDownloadToken` / `requireUploadToken` from Phase 1 |
| Stateless API — no local state | `latest.json` read/written on every request to MinIO |
| No `multer` / file proxy | Endpoints return presigned URLs; files go direct to MinIO |
| No `dotenv` | `config.ts` already handles env vars via `process.env` |
| No `ts-node` / `tsx` | Bun runs `.ts` directly; imports use `.ts` extension |
| Bun imports require `.ts` extension | All internal imports: `import { x } from '../lib/schemas.ts'` |
| No `morgan` / logging libraries | `console.log` in handlers; requestLogger middleware already applied globally |
| Express 5 async error propagation | No `try/catch` needed for top-level async; only catch to return specific HTTP codes |
| `strict: true` in tsconfig | All types must be explicit; no implicit `any` |

---

## Sources

### Primary (HIGH confidence)

- `/root/dockgate/node_modules/minio/dist/main/signing.js` line 266 — presigned URL string construction (proves internal host is embedded)
- `/root/dockgate/node_modules/minio/dist/main/internal/xml-parser.js` lines 56-85 — S3Error code assignment (`NoSuchKey` vs `NotFound`)
- `/root/dockgate/node_modules/minio/dist/main/internal/client.d.ts` — method signatures for `presignedGetObject`, `presignedPutObject`, `statObject`, `getObject`, `putObject`
- `/root/dockgate/node_modules/minio/dist/main/internal/client.js` lines 1372-1375 — `putObject` accepts string argument
- `/root/dockgate/src/` — all Phase 1 code files (verified existing patterns)
- `.planning/phases/02-core-api/02-CONTEXT.md` — all locked decisions D-01 through D-11

### Secondary (MEDIUM confidence)

- `.planning/phases/01-foundation/01-RESEARCH.md` — Phase 1 findings for presigned URL host rewrite strategy
- `CLAUDE.md` — tech stack constraints, presigned URL expiry values (3600/900)

### Tertiary (LOW confidence — assumptions)

- None beyond what is listed in Assumptions Log above.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all methods verified in installed node_modules
- Architecture: HIGH — patterns derived directly from SDK source code and existing Phase 1 code
- Pitfalls: HIGH — error code values verified in SDK source; host rewrite verified in signing.js
- Code examples: HIGH — signatures verified; stream pattern is standard Node.js

**Research date:** 2026-06-17
**Valid until:** 2026-09-17 (stable stack; minio 8.x and Express 5.x are not fast-moving)
