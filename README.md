# DockGate

Private Docker image distribution API for authorized clients. Stores Docker images exported as `.tar` files in MinIO and serves presigned download URLs — no Docker Registry, no registry login, no complexity.

## What it does

- CI/CD pipelines push new Docker image versions via the DockGate API
- Authorized clients receive a presigned MinIO URL and download the `.tar` directly
- Supports multiple apps, semantic versioning, and integrity verification (sha256 + size)

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check (API + MinIO connectivity) |
| GET | `/apps/:name/latest` | None | Latest version metadata |
| GET | `/apps/:name/download?version=X` | DOWNLOAD_TOKEN | Presigned download URL |
| POST | `/apps/:name/upload?version=X` | UPLOAD_TOKEN | Presigned upload URL for CI/CD |
| PUT | `/apps/:name/latest` | UPLOAD_TOKEN | Publish new latest version |

## Configuration

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DOWNLOAD_TOKEN` | Bearer token for client download requests |
| `UPLOAD_TOKEN` | Bearer token for CI/CD upload requests |
| `MINIO_ENDPOINT` | MinIO hostname (internal, no protocol, e.g., `minio`) |
| `MINIO_PUBLIC_ENDPOINT` | MinIO base URL for presigned URLs (externally resolvable, e.g., `http://192.168.1.10:9000`) |
| `MINIO_BUCKET` | MinIO bucket name |
| `MINIO_ACCESS_KEY` | MinIO access key |
| `MINIO_SECRET_KEY` | MinIO secret key |
| `PORT` | (optional) HTTP port, defaults to `3000` |

## CI/CD Integration

See [docs/ci-cd.md](docs/ci-cd.md) for the complete GitHub Actions integration guide with a ready-to-copy workflow YAML.
