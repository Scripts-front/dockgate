# Pitfalls Research — DockGate

**Domain:** Private artifact distribution API (MinIO + Bun + Express + TypeScript)
**Researched:** 2026-06-16
**Confidence note:** Confidence levels are assigned per finding.

---

## Presigned URL Security

### Pitfall 1: HTTP vs HTTPS in presigned URL generation — URL scheme mismatch
**Confidence:** HIGH

**What goes wrong:** The MinIO JavaScript SDK generates presigned URLs using whatever `endPoint` and `useSSL` you pass to the client constructor. If the API container reaches MinIO over HTTP internally (e.g., `http://minio:9000` on a private Docker network) but the presigned URL is returned to an external client, the URL will contain `http://` — meaning the client downloads the `.tar` over plaintext.

**Warning signs:**
- Generated presigned URLs start with `http://` in response bodies
- MinIO is on a private Docker network with no TLS cert
- The MinIO `endPoint` in SDK config is a private hostname/IP

**Prevention:**
- Configure the SDK with the public HTTPS endpoint and `useSSL: true` if MinIO is behind a reverse proxy.
- Alternatively: generate the presigned URL internally and rewrite the URL scheme+host before returning to the client.
- Never expose the raw internal MinIO endpoint directly to clients.

**Phase:** Phase 1 — get the URL scheme right before any other work.

---

### Pitfall 2: Presigned URL expiry too long or too short
**Confidence:** HIGH

**What goes wrong:** Too long (e.g., 7 days) = leaked URL remains valid; too short (e.g., 30 seconds) = URL expires before large file download starts.

**Prevention:**
- 15–60 minutes for download URLs; 30 minutes for upload URLs.
- Document expiry as a named constant, not a magic number.
- S3/MinIO checks expiry at request initiation, not during transfer — so 15 min is sufficient for 10GB files.

**Phase:** Phase 1.

---

### Pitfall 3: Token leaked in query parameters
**Confidence:** HIGH

**What goes wrong:** The `token` in `GET /apps/:name/download?token=Y` appears in server access logs, browser history, and proxy logs.

**Prevention:**
- Prefer `Authorization: Bearer <token>` header over query param.
- If query param is kept, add log middleware that redacts `token=[^&]*` → `token=[REDACTED]`.

**Phase:** Phase 1 — decide on token placement before any client scripts are written.

---

### Pitfall 4: CORS not configured on MinIO bucket
**Confidence:** HIGH

**What goes wrong:** Any client hitting the presigned URL from a browser context will fail CORS preflight on the MinIO PUT. Also affects some HTTP clients that send OPTIONS before PUT.

**Prevention:**
- Configure MinIO bucket CORS policy to allow PUT and GET from expected origins.
- This is a MinIO configuration issue, not a code issue.

**Phase:** Phase 1 infrastructure setup.

---

### Pitfall 5: Presigned URL host mismatch (internal hostname in URL)
**Confidence:** MEDIUM

**What goes wrong:** If MinIO is on a private Docker network (`minio:9000`) and the SDK is configured with that hostname, generated presigned URLs contain `minio:9000` — which external clients cannot resolve.

**Prevention:**
- Set the MinIO SDK's `endPoint` to the externally-resolvable hostname.
- Or rewrite the scheme+host portion of the presigned URL before returning to client.

**Phase:** Phase 1.

---

## Token Authentication

### Pitfall 1: Timing attack on token comparison
**Confidence:** HIGH

**What goes wrong:** Using `===` for token comparison is vulnerable to timing attacks — an attacker can binary-search the correct token character by character by measuring response time.

**Prevention:**
```typescript
import { timingSafeEqual } from "crypto";
function verifyToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

**Phase:** Phase 1 — auth middleware must be correct from the first endpoint.

---

### Pitfall 2: Missing env var silently breaks auth (or worse — allows all requests)
**Confidence:** HIGH

**What goes wrong:**
- If `DOWNLOAD_TOKEN` is unset, comparison with `undefined` returns `false` for all tokens — silent 401 for everyone.
- If both sides are `undefined`: `undefined === undefined` is `true` — all requests pass with no token.

**Prevention:**
- Add startup validation that throws on missing required env vars:
```typescript
const required = ["DOWNLOAD_TOKEN", "UPLOAD_TOKEN", "MINIO_ENDPOINT", "MINIO_BUCKET"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Required env var ${key} is not set`);
}
```

**Phase:** Phase 1 — before any endpoint is wired.

---

### Pitfall 3: Token appearing in logs
**Confidence:** HIGH

**What goes wrong:** Express default logging logs the full request URL including query params. Error handlers that log `req.query` or `req.headers` expose tokens.

**Prevention:**
- Implement log sanitization middleware to strip `token` from logged URLs.
- Configure logger to exclude `Authorization` header.
- Audit all `console.log(req.query)` calls.

**Phase:** Phase 1 — set up logging with redaction from the start.

---

## MinIO Connection

### Pitfall 1: `endPoint` with protocol prefix causes connection failure
**Confidence:** HIGH

**What goes wrong:** The MinIO SDK expects hostname-only in `endPoint`. `endPoint: "http://minio:9000"` is wrong — the SDK treats the colon as part of the hostname.

**Prevention:**
```typescript
const client = new Client({
  endPoint: "minio",      // hostname only, no http:// prefix
  port: 9000,             // explicit port always
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});
```
- Always specify `port` explicitly.
- Never include `http://` or `https://` in `endPoint`.

**Phase:** Phase 1.

---

### Pitfall 2: No connection health check at startup
**Confidence:** HIGH

**What goes wrong:** The MinIO SDK doesn't connect until the first operation. Container reports healthy in Portainer but returns 500s on every request if MinIO is unreachable.

**Prevention:**
- On startup, call `client.bucketExists(BUCKET_NAME)` and fail fast if it throws.
- Makes connectivity issues visible immediately at container start.

**Phase:** Phase 1.

---

### Pitfall 3: Mixing `minio` SDK and AWS SDK documentation
**Confidence:** MEDIUM

**What goes wrong:** `presignedGetObject` is `minio` SDK; `getSignedUrl` with `GetObjectCommand` is AWS SDK. Also: old `minio` SDK examples use callbacks; current API is promise-based. Mixing them causes hangs (callback form awaited never resolves).

**Prevention:**
- Use `minio` npm package exclusively. Use async form: `await client.presignedGetObject(bucket, object, expiry)`.

**Phase:** Phase 1.

---

### Pitfall 4: Bun compatibility with `minio` npm package
**Confidence:** MEDIUM

**What goes wrong:** Bun's Node.js compatibility was actively improving through 2025. Edge cases in HMAC signing (used by presigned URLs) and stream handling have been reported.

**Prevention:**
- Test MinIO SDK operations in isolation BEFORE wiring to Express routes.
- Write a standalone script that generates a presigned URL and verifies it end-to-end.
- If issues arise, `@aws-sdk/client-s3` with MinIO's S3-compatible endpoint is a fallback.

**Phase:** Phase 1 — validate SDK compatibility first, before any Express routes.

---

## Large File Handling

### Pitfall 1: No validation that uploaded file actually exists before updating `latest.json`
**Confidence:** HIGH — this is the most critical correctness issue

**What goes wrong:** If CI/CD upload fails but `PUT /latest` is called anyway, `latest.json` points to a version that doesn't exist in MinIO. Every client gets a valid-looking presigned URL that returns 404 from MinIO — the "phantom version" problem.

**Prevention:**
- `PUT /apps/:name/latest` MUST call `client.statObject(bucket, key)` before writing `latest.json`.
- Return 409 or 422 if the object doesn't exist or has zero size.
- This is the single most important integrity check in the entire system.

**Phase:** Phase 2 — mandatory before the latest-update endpoint ships.

---

### Pitfall 2: Presigned PUT URL without size/type validation
**Confidence:** HIGH

**What goes wrong:** MinIO accepts any file without size limits on presigned PUT. A CI/CD pipeline mistake can upload a 20GB file or wrong content silently.

**Prevention:**
- Specify `Content-Type: application/octet-stream` when generating the upload presigned URL.
- After CI/CD reports upload complete, call `statObject` to verify non-zero size.

**Phase:** Phase 2.

---

### Pitfall 3: S3/MinIO single-part PUT limit of 5GB
**Confidence:** MEDIUM

**What goes wrong:** Standard presigned PUT URLs (single-part) have a 5GB limit. Files over 5GB require multipart upload — a completely different API flow.

**Prevention:**
- Document the 5GB limit. Most Docker images (even large ones) are under 5GB as `.tar`.
- Add multipart support only if actually needed.

**Phase:** Phase 2 — document the limit early.

---

## Versioning Consistency

### Pitfall 1: `latest.json` updated before `.tar` upload completes
**Confidence:** HIGH — see Large File Handling Pitfall 1 (same root cause)

**Phase:** Phase 2.

---

### Pitfall 2: `latest.json` schema not versioned — breaking changes later
**Confidence:** MEDIUM

**What goes wrong:** Adding `checksum`, `size`, or `buildDate` to `latest.json` later breaks all existing client scripts that parse the old format.

**Prevention:**
- Include schema version from day one:
```json
{"schema": 1, "version": "1.0.0", "sha256": "abc...", "size": 123456789}
```

**Phase:** Phase 1 — design the `latest.json` schema before anything writes it.

---

### Pitfall 3: Old `.tar` files never deleted — storage bloat
**Confidence:** MEDIUM

**What goes wrong:** Every version push adds another `.tar` to MinIO indefinitely. For large images, this becomes significant storage cost.

**Prevention:**
- Define a retention policy: keep last N versions. The `PUT /latest` endpoint can enforce this.
- Or expose `DELETE /apps/:name/version/:ver` for manual cleanup.

**Phase:** Phase 3 — operational/maintenance features.

---

## Docker Container

### Pitfall 1: Bun on Alpine — `musl` vs `glibc` crash
**Confidence:** HIGH

**What goes wrong:** Bun is statically linked against `glibc`. Alpine uses `musl`. Using an Alpine base image causes Bun to crash at startup.

**Prevention:**
- Use `FROM oven/bun:1` or `FROM oven/bun:1-slim` (Debian-based).
- Never use Alpine as the base for Bun containers.

**Phase:** Phase 1 (Dockerfile setup).

---

### Pitfall 2: PID 1 signal handling — container ignores SIGTERM
**Confidence:** HIGH

**What goes wrong:** Shell-form `CMD bun run server.ts` makes a shell PID 1 that swallows SIGTERM. Container waits for SIGKILL timeout (10s) on every `docker stop`.

**Prevention:**
- Use exec form: `CMD ["bun", "server.ts"]`
- Add `process.on("SIGTERM", () => server.close())` in the app.

**Phase:** Phase 1 (Dockerfile).

---

### Pitfall 3: Non-root user file permissions
**Confidence:** HIGH

**Prevention:**
```dockerfile
COPY --chown=bun:bun . /app
USER bun
```

**Phase:** Phase 1 (Dockerfile).

---

## CI/CD Integration

### Pitfall 1: No error handling between upload steps — phantom version
**Confidence:** HIGH

**What goes wrong:** CI/CD calls `PUT /latest` even when the upload failed, creating a phantom version.

**Prevention:**
- `set -euo pipefail` in all CI/CD shell scripts.
- `curl --fail -T image.tar "$PRESIGNED_URL"` — `--fail` exits non-zero on HTTP errors.
- Only call `PUT /latest` after verifying the upload returned HTTP 200.

**Phase:** Phase 2 — document the CI/CD script pattern with safe defaults.

---

### Pitfall 2: Token echoed in CI/CD logs
**Confidence:** HIGH

**What goes wrong:** `set -x` in CI/CD scripts or verbose `curl` flags expose `UPLOAD_TOKEN` in pipeline logs.

**Prevention:**
- Never use `set -x` in the upload step.
- Use CI/CD masked secrets (GitHub Actions secrets, GitLab masked variables).
- Never `echo $UPLOAD_TOKEN` for debugging.

**Phase:** Phase 2.

---

### Pitfall 3: Presigned upload URL generated before build completes
**Confidence:** MEDIUM

**What goes wrong:** If the upload URL is generated at pipeline start and the Docker build takes 30–60 minutes, the URL expires before the upload step.

**Prevention:**
- Generate the presigned upload URL AFTER the Docker build and `.tar` export are complete.
- Correct order: build → export `.tar` → request presigned URL → upload → update latest.

**Phase:** Phase 2 — document the correct CI/CD step order.

---

### Pitfall 4: Version string not sanitized — path traversal in MinIO key
**Confidence:** HIGH

**What goes wrong:** `version=../otherapp/1.0.0` results in key `myapp/../otherapp/1.0.0.tar` which MinIO may normalize to `otherapp/1.0.0.tar` — allowing a CI/CD pipeline for `myapp` to overwrite files for `otherapp`.

**Prevention:**
- Validate `version` against semver regex: `/^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$/`
- Validate `:name` against safe identifier regex: `/^[a-z0-9][a-z0-9-]{0,62}$/`
- Reject any version or name containing `/`, `..`, `\`, or null bytes.

**Phase:** Phase 1 — input validation must be in the first middleware layer.

---

## Phase Assignment Summary

| Pitfall | Severity | Phase |
|---------|----------|-------|
| URL scheme mismatch (HTTP vs HTTPS in presigned URL) | Critical | Phase 1 |
| Missing startup env var validation | Critical | Phase 1 |
| `timingSafeEqual` for token comparison | High | Phase 1 |
| MinIO SDK `endPoint` with protocol prefix | Critical | Phase 1 |
| Bun on Alpine (musl vs glibc) | Critical | Phase 1 |
| PID 1 / SIGTERM signal handling | High | Phase 1 |
| Input validation on version/app name | High | Phase 1 |
| `latest.json` schema versioning | High | Phase 1 |
| Token in logs (redaction middleware) | High | Phase 1 |
| Presigned URL expiry (15–60 min) | High | Phase 1 |
| MinIO startup health check | Medium | Phase 1 |
| CORS configuration on MinIO bucket | Medium | Phase 1 |
| `statObject` check before updating `latest.json` | Critical | Phase 2 |
| CI/CD script `set -euo pipefail` + `curl --fail` | High | Phase 2 |
| Presigned URL generated AFTER build, not before | Medium | Phase 2 |
| Token in CI/CD logs | High | Phase 2 |
| Version string path traversal | High | Phase 1 |
| S3 5GB single-part limit | Low | Phase 2 |
| Storage retention / old version cleanup | Low | Phase 3 |
