# CI/CD Integration Guide

## Overview

DockGate is a private Docker image distribution API. In a CI/CD context, DockGate receives `.tar` files produced by `docker save`, stores them in MinIO, and serves presigned download URLs to authorized clients. This guide covers the complete publish pipeline: build a Docker image, export it as a `.tar`, upload it through DockGate, and update the latest version pointer. At the end of this guide, any developer with a running DockGate instance can configure the pipeline by setting two GitHub secrets.

## Prerequisites

- A running DockGate instance accessible at the URL you will use as `DOCKGATE_URL`
- The value of `UPLOAD_TOKEN` configured in your DockGate deployment (set via the container's `UPLOAD_TOKEN` environment variable)
- MinIO must be reachable from GitHub's network or your self-hosted runner — the presigned upload URL returned by DockGate is used directly by the runner, bypassing DockGate entirely

## Required Secrets

| Secret | Description | Example value |
|--------|-------------|---------------|
| `DOCKGATE_URL` | Base URL of your DockGate API, no trailing slash | `https://dockgate.meudominio.com` |
| `DOCKGATE_UPLOAD_TOKEN` | Value of `UPLOAD_TOKEN` set in your DockGate container env | (match the value in your DockGate deployment) |

**Important:** `DOCKGATE_URL` must not have a trailing slash. The workflow appends `/apps/...` paths directly, so a trailing slash produces a double slash in the URL (e.g., `https://dockgate.example.com//apps/...`) which will result in a 404.

## Pipeline Steps

### 1. Checkout

Standard Git checkout. Provides the Dockerfile and source code to the runner.

### 2. Extract version from tag

```yaml
- name: Extract version from tag
  id: version
  run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT
```

Strips the `v` prefix from the tag name: tag `v1.2.3` → version `1.2.3`. DockGate uses this version string as the MinIO object key (`{appName}/{version}.tar`), so the version must be consistent across all subsequent steps.

### 3. Build Docker image

Standard `docker build`. The image is tagged with the extracted version to match the `.tar` file.

### 4. Export image to tar

```yaml
- name: Export image to tar
  run: docker save $IMAGE_NAME:${{ steps.version.outputs.VERSION }} -o image.tar
```

Use `docker save`, not `docker export`. `docker save` preserves all image layers and metadata — the output is a proper image archive that can be restored with `docker load`. The resulting `image.tar` is the file uploaded to MinIO.

### 5. Calculate sha256 and size

```yaml
- name: Calculate sha256 and size
  id: integrity
  run: |
    echo "SHA256=$(sha256sum image.tar | awk '{ print $1 }')" >> $GITHUB_OUTPUT
    echo "SIZE=$(stat -c%s image.tar)" >> $GITHUB_OUTPUT
```

DockGate's `PUT /latest` endpoint requires both values for integrity verification:
- `sha256`: exactly 64 lowercase hex characters. `sha256sum` on Linux always outputs lowercase hex — `awk '{ print $1 }'` extracts just the hash, discarding the filename.
- `size`: byte count as a plain integer. `stat -c%s` returns the file size in bytes with no units.

These are calculated before any API call so the upload URL request does not block on checksum computation.

### 6. Request upload URL

```yaml
- name: Request upload URL from DockGate
  id: upload_url
  env:
    DOCKGATE_URL: ${{ secrets.DOCKGATE_URL }}
    DOCKGATE_UPLOAD_TOKEN: ${{ secrets.DOCKGATE_UPLOAD_TOKEN }}
  run: |
    RESPONSE=$(curl -sf -X POST \
      -H "Authorization: Bearer $DOCKGATE_UPLOAD_TOKEN" \
      "$DOCKGATE_URL/apps/$APP_NAME/upload?version=${{ steps.version.outputs.VERSION }}")
    echo "URL=$(echo $RESPONSE | jq -r .url)" >> $GITHUB_OUTPUT
```

`POST /apps/:name/upload?version=X` returns `{ "url": "..." }` — a presigned MinIO PUT URL valid for **900 seconds**. The upload (step 7) must complete within this window. If the build takes longer than 15 minutes before reaching step 6, the presigned URL may expire before the upload completes — see Troubleshooting.

The URL already carries MinIO credentials. No `Authorization` header is needed for the upload itself.

### 7. Upload image to MinIO

```yaml
- name: Upload image to MinIO
  run: |
    curl -sf -X PUT \
      -H "Content-Type: application/octet-stream" \
      --upload-file image.tar \
      "${{ steps.upload_url.outputs.URL }}"
```

The PUT goes directly to MinIO using the presigned URL. DockGate never sees the file bytes — there is no proxy. `Content-Type: application/octet-stream` is required. `--upload-file` streams the file without loading it into memory, which matters for large images.

### 8. Publish latest version

```yaml
- name: Publish latest version via DockGate
  env:
    DOCKGATE_URL: ${{ secrets.DOCKGATE_URL }}
    DOCKGATE_UPLOAD_TOKEN: ${{ secrets.DOCKGATE_UPLOAD_TOKEN }}
  run: |
    curl -sf -X PUT \
      -H "Authorization: Bearer $DOCKGATE_UPLOAD_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"version\":\"...\",\"sha256\":\"...\",\"size\":...}" \
      "$DOCKGATE_URL/apps/$APP_NAME/latest"
```

`PUT /apps/:name/latest` with `{ version, sha256, size }` atomically updates the latest pointer in MinIO. Before writing, the API verifies the `.tar` file exists (anti-phantom protection) — if the upload in step 7 failed, this step returns 422.

Two constraints on the request body:
- `size` must be a JSON integer, not a string. The JSON body must use `"size":12345`, not `"size":"12345"`. The API validates `typeof size === 'number'` and rejects strings with 400.
- `sha256` must be exactly 64 lowercase hex characters.

## Complete Workflow

See [`docs/examples/github-actions.yml`](examples/github-actions.yml) for the complete ready-to-copy workflow.

To use it:
1. Copy `docs/examples/github-actions.yml` to `.github/workflows/` in your own repository
2. Set `APP_NAME` and `IMAGE_NAME` at the top of the file
3. Add `DOCKGATE_URL` and `DOCKGATE_UPLOAD_TOKEN` as GitHub repository secrets
4. Push a tag matching `v*.*.*` to trigger the workflow

## Troubleshooting

**403 on MinIO upload (step 7): Presigned URL expired**

The presigned upload URL is valid for 900 seconds (15 minutes). If your build takes more than 15 minutes, the PUT to MinIO will be rejected with 403 AccessDenied. Ensure steps 5 through 7 run in the same job immediately after the Docker build. If your build is consistently long, consider splitting build and export into a separate job and caching the `.tar` artifact.

**400 Invalid size**

The `size` field in the `PUT /latest` body is a string instead of an integer. Check that `SIZE` from `stat -c%s` is interpolated without surrounding quotes in the JSON body — use `"size":$SIZE`, not `"size":"$SIZE"`.

**400 Invalid sha256**

The sha256 format is wrong. `sha256sum` on Linux outputs lowercase hex — this should work as-is. Verify that `awk '{ print $1 }'` is present and extracts only the hash (first field), not the filename. The API validates against `/^[a-f0-9]{64}$/`.

**422 Tar file not found**

`PUT /latest` was called, but the `.tar` upload to MinIO (step 7) did not complete successfully. Check the exit code of the step 7 curl command. The `-f` flag on curl causes it to exit non-zero on HTTP 4xx/5xx, which should have already failed the workflow at that step.

**Double slash in URL**

`DOCKGATE_URL` has a trailing slash. The workflow appends `/apps/...` directly, producing `https://dockgate.example.com//apps/...`. Remove the trailing slash from the secret value.
