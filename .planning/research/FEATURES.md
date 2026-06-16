# Features Research — DockGate

**Domain:** Private binary/artifact distribution API (Docker .tar files)
**Researched:** 2026-06-16
**Confidence:** HIGH (domain well-established; drawing on Docker Distribution spec, Nexus/Artifactory conventions, and standard HTTP artifact patterns)

---

## Table Stakes

Must-have features. Missing any of these = the service is broken for its core use case.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `GET /apps/:name/latest` — returns current version identifier | Clients need to know what to compare against their local version without downloading anything | Low | Returns `{ version: "1.2.3" }` JSON. Must be cheap — this is polled frequently by update scripts. |
| `GET /apps/:name/download?version=X&token=Y` — returns presigned download URL | The core delivery mechanism. Must validate auth before revealing storage URL. | Low | Returns `{ url: "...", expiresAt: "..." }`. Redirect (302) is an acceptable alternative but adds a hop. |
| `POST /apps/:name/upload` — returns presigned upload URL for CI/CD | CI/CD pipelines must be able to push new artifacts without manual intervention | Low | Requires `UPLOAD_TOKEN`. Returns `{ url: "...", method: "PUT" }` so CI/CD can PUT directly to MinIO. |
| `PUT /apps/:name/latest` — updates the version pointer | Without this, "latest" never changes. CI/CD calls this after confirming upload succeeded. | Low | Requires `UPLOAD_TOKEN`. Updates `latest.json` in MinIO. Must be idempotent. |
| Token-based auth on every non-public endpoint | Without auth, any client can download proprietary images | Low | Header or query param. Query param (`?token=`) is easier for shell scripts. |
| Correct HTTP status codes | `401` vs `403` vs `404` vs `200` — clients and CI/CD scripts branch on these | Low | `401` = missing/invalid token, `403` = token valid but wrong scope (e.g. DOWNLOAD_TOKEN on upload), `404` = app or version not found |
| Checksum / integrity field in download response | Client must verify file integrity after download to catch corruption or truncated transfers | Low | Return `sha256` in the JSON alongside the presigned URL. MinIO stores ETag (MD5 by default); SHA-256 should be computed at upload time and stored in `latest.json`. |
| Version existence check before issuing presigned URL | If client requests `version=99.0.0` that doesn't exist, API must 404 cleanly — not return a presigned URL that MinIO will 404 on | Low | HEAD the object in MinIO before generating URL. |
| `GET /health` — liveness probe | Container orchestrators (Portainer/Docker) need a health check endpoint | Low | Returns `200 OK` with `{ status: "ok" }`. Must not require auth. |

---

## Differentiators

Features that add real value for this specific use case but are not required for basic operation. Implement when table stakes are solid.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `GET /apps/:name/versions` — list available versions | Client update scripts can offer rollback ("install version 1.1.0 instead of latest") | Low | Lists object keys under `myapp/` prefix in MinIO. Filter to `*.tar` keys, return sorted list. No database needed. |
| Version metadata in `latest.json` — `{ version, sha256, size, publishedAt }` | Clients can show users file size before downloading, log publish timestamps, and skip checksum computation | Low | CI/CD writes these fields; API reads and returns them. Zero cost addition. |
| `GET /apps` — list registered apps | Operator tooling; CI/CD can verify app was registered before pushing | Low | Lists top-level "directories" (common prefixes) in the MinIO bucket. Requires `UPLOAD_TOKEN` to prevent enumeration by download clients. |
| Download URL TTL that is configurable via env var | Very large `.tar` files may need longer presigned URL windows for slow connections | Low | Default 15 minutes; `PRESIGN_TTL_SECONDS` env var. |
| `X-Request-ID` header in all responses | Debugging distributed systems: correlate client-side errors with API logs without scraping timestamps | Low | Generate UUID per request, echo in response header, include in all log lines. |
| Structured JSON logging | Portainer log aggregation and any future log shipper (Loki, etc.) work without parsing | Low | `{ timestamp, level, requestId, method, path, status, durationMs }` per request. |
| `GET /apps/:name/latest` returning full metadata (not just version string) | Clients can compare sha256 of current local image without downloading — skip download if already up to date | Low | Return `{ version, sha256, size, publishedAt }`. Client hashes local `.tar`, compares, skips download if match. |
| Explicit `Content-Disposition: attachment; filename="appname-1.2.3.tar"` hint | When presigned URL is used in a browser or wget, filename is correct automatically | Low | Can be injected as a MinIO presigned URL parameter. |

---

## Anti-Features

Deliberately excluded. Each exclusion is a scope boundary, not an oversight.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Docker Registry V2 protocol (`/v2/` endpoints, manifests, layer blobs) | Adds massive complexity: content-addressable storage, layer diffing, manifest schemas. The project's whole point is to avoid this. | Serve `.tar` via HTTP. Clients run `docker load < image.tar`. |
| User accounts, OAuth, JWT, refresh tokens | Single-operator tool. Managing credentials adds operational burden that exceeds any security benefit at this scale. | Two static tokens via env vars. Rotate by redeploying the container. |
| Database (Postgres, Redis, SQLite) | Adds a stateful dependency that complicates deployment, backup, and failure modes. | MinIO IS the database. `latest.json` is the metadata store. |
| Proxied upload (API buffers the `.tar`) | `.tar` files for Docker images are routinely 500MB–2GB. Proxying through the API requires equivalent memory/disk on the API container and doubles transfer time. | Presigned URL: CI/CD uploads directly to MinIO. API only issues the URL. |
| Webhook / event notifications on upload | Adds outbound HTTP, retry logic, failure handling. No identified consumer. | CI/CD pipeline already knows when upload succeeds — it called the API. |
| Admin web UI | No identified need. API surface is small enough to operate via curl or a simple shell wrapper. | Document curl examples in README. |
| Artifact signing (Cosign, Notary) | Correct threat model for public distribution. Overkill for a single-operator private service with a shared secret token. | SHA-256 checksum in metadata is sufficient integrity verification for this threat model. |
| Multi-region replication / CDN | Not identified as a requirement. MinIO handles this at storage layer if ever needed. | MinIO bucket policies if multi-region is ever needed. |
| Garbage collection / retention policies | Deleting old versions could break rollback. No storage cost driver identified. | Manual deletion via MinIO console or mc CLI when needed. |
| Rate limiting | Single operator, fixed set of clients. Adds complexity for no identified benefit. | Revisit if API becomes multi-tenant. |
| Streaming / chunked upload | Chunked upload is needed for resumable large-file uploads. Presigned PUT to MinIO already handles this at the storage layer. | MinIO multipart upload (triggered by the S3 SDK in CI/CD if needed). |

---

## Client Flow Patterns

What a well-behaved update script looks like. This defines what the API must support from the client side.

### Minimal Update Check Flow

```
1. GET /apps/:name/latest?token=DOWNLOAD_TOKEN
   → { version: "1.2.3", sha256: "abc...", size: 524288000 }

2. Compare response.version against locally recorded version
   → If equal: exit (already up to date)

3. (Optional) Compare response.sha256 against sha256 of local .tar on disk
   → If equal: update local version record, exit (already have the file)

4. GET /apps/:name/download?version=1.2.3&token=DOWNLOAD_TOKEN
   → { url: "https://minio.host/bucket/myapp/1.2.3.tar?X-Amz-...", expiresAt: "..." }

5. wget/curl the presigned URL → myapp-1.2.3.tar

6. Verify sha256 of downloaded file against response.sha256 from step 1
   → If mismatch: abort, alert, do NOT load

7. docker load < myapp-1.2.3.tar

8. docker compose up -d  (or equivalent restart)

9. Record new version to local state file (/var/lib/myapp/version or similar)
```

### Key Client Behaviors the API Must Support

- The `/latest` endpoint must be safe to poll frequently (low latency, no side effects, no auth side-channel).
- The presigned URL must work from a `curl -L` or `wget` command with no additional headers (MinIO presigned URLs are self-authenticating).
- The presigned URL TTL must be long enough to survive slow connections on the client. 15 minutes is a safe default for up to ~500MB on a 5 Mbps link.
- The API must return a clean `404` (not a MinIO redirect error) when a version does not exist.
- The `sha256` field must be present in `/latest` so clients can perform integrity checks without a separate metadata call.

### Version Comparison Logic

Clients should treat versions as semver strings and compare numerically, not lexicographically. The API does not need to enforce semver — it treats version as an opaque string used as a path segment. The convention is the operator's responsibility to document.

---

## CI/CD Integration Patterns

What a CI/CD pipeline (GitHub Actions, GitLab CI, etc.) expects from the upload flow.

### Standard Upload Flow

```
Step 1 — Build
  docker build -t myapp:1.2.3 .

Step 2 — Export
  docker save myapp:1.2.3 | gzip > myapp-1.2.3.tar
  # Or without gzip: docker save myapp:1.2.3 -o myapp-1.2.3.tar
  # Note: .tar.gz reduces size; API and clients must agree on extension convention.

Step 3 — Request upload URL
  POST /apps/myapp/upload?version=1.2.3
  Authorization: Bearer UPLOAD_TOKEN (or ?token=UPLOAD_TOKEN)
  → { url: "https://minio.host/...", method: "PUT", expiresAt: "..." }

Step 4 — Upload directly to MinIO
  curl -X PUT -T myapp-1.2.3.tar "$UPLOAD_URL"
  # MinIO returns 200 with ETag on success

Step 5 — Compute and record checksum
  sha256sum myapp-1.2.3.tar → "abc123..."

Step 6 — Update latest pointer
  PUT /apps/myapp/latest
  Authorization: Bearer UPLOAD_TOKEN
  Body: { "version": "1.2.3", "sha256": "abc123...", "size": 524288000, "publishedAt": "2026-06-16T10:00:00Z" }
  → 200 OK

Step 7 — Verify (optional but recommended)
  GET /apps/myapp/latest?token=DOWNLOAD_TOKEN
  → Assert response.version == "1.2.3"
```

### What CI/CD Pipelines Expect

- **Upload URL must be a standard S3 PUT** — works with curl, boto3, the AWS CLI, and MinIO client without custom code.
- **Version string comes from the pipeline** (e.g. git tag, `$CI_COMMIT_TAG`) — the API must accept it as an opaque parameter, not generate it.
- **Upload and latest-update are separate steps** — this is intentional. If upload fails, latest is not updated. CI/CD has control over atomicity.
- **Upload URL must have sufficient TTL** — large images may take minutes to upload. 30–60 minute TTL for upload URLs (vs 15 min for download) is appropriate.
- **Idempotent latest update** — re-running the pipeline with the same version must not fail. Overwriting `latest.json` with the same content is safe.
- **No multipart coordination through the API** — if the `.tar` is very large (>5GB), MinIO multipart upload is handled transparently by the S3 SDK in CI/CD. The API only issues a standard presigned PUT URL; MinIO handles multipart internally.

### Extension / `.tar` vs `.tar.gz`

The project currently specifies `.tar`. Gzip compression is worth noting:
- `docker save | gzip` produces `.tar.gz`, typically 40–60% smaller than uncompressed `.tar`.
- `docker load` accepts both `.tar` and `.tar.gz` transparently.
- If compression is used, the API path should use the actual extension, or use a content-type header to signal format.
- Decision: use `.tar.gz` or `.tar` consistently — document this in operator runbook. The API treats the file as an opaque blob; extension is a naming convention only.

---

## Monitoring and Health Check Patterns

Standard observability surface for a containerized API.

| Endpoint | Purpose | Auth Required | Response |
|----------|---------|---------------|---------|
| `GET /health` | Liveness probe — is the process alive? | No | `200 { status: "ok" }` |
| `GET /ready` | Readiness probe — can it serve traffic? Checks MinIO connectivity. | No | `200 { status: "ready" }` or `503 { status: "degraded", reason: "minio unreachable" }` |

### Why Two Probes

- **Liveness** (`/health`): Container orchestrator restarts the container if this fails. Must never check external dependencies — only whether the process is alive.
- **Readiness** (`/ready`): Load balancer / Portainer removes container from rotation if this fails. Should check MinIO reachability with a lightweight operation (e.g. `mc stat` or a HEAD on a known object). If MinIO is down, return 503 so traffic isn't routed here.

For a single-instance Portainer deployment, `/health` alone is sufficient for most operators. `/ready` is a differentiator worth adding but not blocking.

---

## API Design Conventions (Standard Patterns Worth Following)

These are not features — they are API design decisions that borrow from established conventions in artifact repositories (Nexus, Artifactory, GitHub Releases, Sonatype OSSRH).

| Convention | Standard | Rationale |
|------------|----------|-----------|
| All responses are JSON | Universal across artifact APIs | Consistent parsing in shell scripts with `jq` |
| Error responses always have `{ "error": "message" }` shape | Standard for Express/REST | Scripts can reliably extract error reason |
| Version is in query param, not path, for download | Separates resource identity (`/apps/:name`) from parameterization | Simpler routing; `/apps/myapp/download?version=1.2.3` |
| Auth via `?token=` query param (not only header) | Shell scripts and wget use query params; headers require `-H` flags | Easier to use from update scripts |
| Accept `Authorization: Bearer TOKEN` header as well | Standard HTTP auth convention; required by many CI/CD tools | Dual support: query param OR header |
| Presigned URL returned in body, not as redirect | Client scripts need to log, verify, or delay the download | A `302` redirect is opaque to the script; body gives control |
| `publishedAt` in ISO 8601 format | Universal datetime format | No ambiguity across timezones in logs |

---

## Sources

- Docker Distribution Specification (OCI Distribution Spec, formerly Docker Registry API v2) — architecture of image pull/push flows
- Amazon S3 / MinIO presigned URL documentation — upload/download URL patterns
- Nexus Repository OSS / Sonatype — artifact versioning and metadata conventions
- GitHub Releases API — version pointer and asset download patterns
- Standard 12-factor app conventions — health check and configuration patterns
- Confidence: HIGH for all sections above (well-established patterns; not speculative)
