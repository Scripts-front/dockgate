# Phase 3: CI/CD Docs - Research

**Researched:** 2026-06-17
**Domain:** Documentation — GitHub Actions YAML authoring, DockGate API contracts
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Guide lives at `docs/ci-cd.md`. `README.md` adds a link — does not repeat content.
- **D-02:** Example workflow YAML lives at `docs/examples/github-actions.yml`. Not in `.github/workflows/` so it is not executed in the DockGate repo. Developers copy it to their own repo.
- **D-03:** Trigger: tag push with pattern `v*.*.*`.
- **D-04:** Version extracted from tag without `v` prefix: `${GITHUB_REF#refs/tags/v}`. Example: tag `v1.2.3` → version `"1.2.3"`.
- **D-05:** YAML covers the complete pipeline (7 steps): checkout, docker build, docker save, sha256+size calc, POST /upload, PUT to MinIO presigned URL, PUT /latest.
- **D-06:** sha256 and size are calculated inside the workflow using `sha256sum` and `stat -c%s` before any API call. The YAML is truly copy-paste — no implicit steps.
- **D-07:** GitHub secrets: `DOCKGATE_URL` (base URL, e.g., `https://dockgate.meudominio.com`) and `DOCKGATE_UPLOAD_TOKEN` (value of `UPLOAD_TOKEN` set in the API).
- **D-08:** Guide documents only the list of required secrets with their expected values. Does not include step-by-step GitHub UI instructions.

### Claude's Discretion

- Internal structure of `docs/ci-cd.md` (section order, level of detail per step).
- App name (`APP_NAME`) in the example YAML — use a configurable env variable at the top of the workflow.
- Exact format of `curl` commands in the YAML (headers, flags).
- Whether to include inline comments in the YAML explaining each step.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCS-01 | Repository includes GitHub Actions integration guide with ready-to-copy workflow YAML, secrets setup instructions, and full pipeline flow (build → export `.tar` → upload via DockGate → update latest) | API contracts confirmed from `src/routes/apps.ts`; GitHub Actions YAML syntax and shell commands verified below |
</phase_requirements>

---

## Summary

Phase 3 is documentation-only: create two new files (`docs/ci-cd.md` and `docs/examples/github-actions.yml`) and add a single link to `README.md`. No code changes, no new endpoints, no new dependencies.

The primary challenge is getting every detail of the workflow YAML exactly right so that a developer who has never seen DockGate can copy the YAML, set two GitHub secrets, and have a working pipeline. All decisions are locked in CONTEXT.md. The API contracts are confirmed from the live implementation in `src/routes/apps.ts`.

The second challenge is writing `docs/ci-cd.md` with enough context that a developer understands each step, without becoming a tutorial for things developers already know (Docker, GitHub Actions basics).

**Primary recommendation:** Write the YAML first (it is the source of truth), then write `docs/ci-cd.md` as an annotated walk-through of the YAML. Confirm every API request detail against `src/routes/apps.ts` before writing.

---

## Project Constraints (from CLAUDE.md)

Directives that govern this phase:

| Directive | Impact on Phase 3 |
|-----------|-------------------|
| Commit format: `<emoji> <type>[scope]: <description>` | Doc commits use `📝 docs: ...` |
| Never include `Co-Authored-By: Claude` in commits | Planner must not include this footer |
| No `docker-compose.yml` in API repo | Do not document Docker Compose in the guide |
| Upload token expires in 900s | YAML and guide must warn: PUT to MinIO must happen immediately after receiving the presigned URL |
| Upload goes direct to MinIO — no proxy through API | YAML uses `curl -X PUT --upload-file` directly to the presigned URL returned by `POST /upload` |

---

## API Contracts (Verified from src/routes/apps.ts)

All contracts below are `[VERIFIED: src/routes/apps.ts]` — confirmed by reading the live implementation.

### Step 5 — Request upload presigned URL

```
POST /apps/:name/upload?version=X
Authorization: Bearer <UPLOAD_TOKEN>
```

Response: `{ "url": "https://..." }` — the presigned PUT URL for MinIO direct upload. [VERIFIED: src/routes/apps.ts line 107]

Notes:
- Auth via `Bearer` token in `Authorization` header (see `requireUploadToken` middleware)
- `version` as query param, not body
- URL expiry: 900 seconds [VERIFIED: src/routes/apps.ts line 103]
- No additional fields in response (no `expiresIn`) [VERIFIED: Phase 2 CONTEXT D-01]

### Step 6 — PUT .tar directly to MinIO

```
PUT <presigned-url>
Content-Type: application/octet-stream
--upload-file <path-to-tar>
```

No `Authorization` header — the presigned URL already contains MinIO credentials. [VERIFIED: src/routes/apps.ts comments and Phase 2 CONTEXT specifics]

### Step 7 — Publish latest version

```
PUT /apps/:name/latest
Authorization: Bearer <UPLOAD_TOKEN>
Content-Type: application/json

{ "version": "1.2.3", "sha256": "<64-char lowercase hex>", "size": 123456789 }
```

Response: `{ "ok": true }` [VERIFIED: src/routes/apps.ts line 172]

Notes:
- `size` must be integer (not string) [VERIFIED: src/routes/apps.ts line 139]
- `sha256` must be exactly 64 lowercase hex characters [VERIFIED: src/routes/apps.ts line 115 — SHA256_REGEX]
- `publishedAt` is set by the API — CI/CD does not send it [VERIFIED: Phase 2 CONTEXT D-08]
- 422 if `.tar` not found in MinIO (anti-phantom check) [VERIFIED: src/routes/apps.ts line 149]

### Auth header format

Both `requireDownloadToken` and `requireUploadToken` read `Authorization: Bearer <token>`. [VERIFIED: from Phase 2 CONTEXT + codebase middleware pattern established in Phase 1]

---

## Shell Commands for sha256 and size (Verified)

These run in the GitHub Actions runner (ubuntu-latest uses GNU coreutils): [ASSUMED: ubuntu-latest has sha256sum and GNU stat — standard on all GitHub-hosted Ubuntu runners]

```bash
# sha256 of the tar file — outputs "<hash>  <filename>", take first field
SHA256=$(sha256sum image.tar | awk '{ print $1 }')

# size in bytes — GNU stat flag
SIZE=$(stat -c%s image.tar)
```

Both produce the exact format the API expects:
- `SHA256`: lowercase hex string, exactly 64 chars (sha256sum always outputs lowercase hex) [VERIFIED: sha256sum behavior]
- `SIZE`: decimal integer with no units [ASSUMED: GNU stat -c%s outputs decimal integer]

---

## GitHub Actions YAML Patterns

### Trigger: tag push

```yaml
on:
  push:
    tags:
      - 'v*.*.*'
```
[ASSUMED: standard GitHub Actions syntax from training knowledge — widely documented]

### Extract version without v prefix

```yaml
- name: Extract version
  id: version
  run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT
```

Reference in later steps: `${{ steps.version.outputs.VERSION }}`
[ASSUMED: `$GITHUB_OUTPUT` is the current method — replaced deprecated `set-output` in 2022]

### Accessing GitHub secrets in workflow

```yaml
env:
  DOCKGATE_URL: ${{ secrets.DOCKGATE_URL }}
  DOCKGATE_UPLOAD_TOKEN: ${{ secrets.DOCKGATE_UPLOAD_TOKEN }}
```
[ASSUMED: standard GitHub Actions secrets syntax]

### Environment variables at workflow level (for APP_NAME)

```yaml
env:
  APP_NAME: my-app        # <-- developer sets this
  IMAGE_NAME: my-org/my-app
```
[ASSUMED: standard GitHub Actions top-level env block]

### curl command for POST (get presigned URL)

```bash
RESPONSE=$(curl -sf -X POST \
  -H "Authorization: Bearer $DOCKGATE_UPLOAD_TOKEN" \
  "$DOCKGATE_URL/apps/$APP_NAME/upload?version=$VERSION")
UPLOAD_URL=$(echo "$RESPONSE" | jq -r .url)
```

Flags:
- `-s`: silent (no progress bar)
- `-f`: fail on HTTP errors (exit non-zero on 4xx/5xx)
- `jq -r`: extracts `.url` from JSON response as raw string (no quotes)

[ASSUMED: curl and jq are available on ubuntu-latest — they are preinstalled on all GitHub-hosted runners]

### curl command for PUT .tar to MinIO

```bash
curl -sf -X PUT \
  -H "Content-Type: application/octet-stream" \
  --upload-file image.tar \
  "$UPLOAD_URL"
```

[ASSUMED: `--upload-file` streams file without loading into memory, correct for large tarballs]

### curl command for PUT /latest

```bash
curl -sf -X PUT \
  -H "Authorization: Bearer $DOCKGATE_UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"$VERSION\",\"sha256\":\"$SHA256\",\"size\":$SIZE}" \
  "$DOCKGATE_URL/apps/$APP_NAME/latest"
```

Note: `$SIZE` is an integer — no quotes around it in the JSON body. [VERIFIED: src/routes/apps.ts line 139 — size must be number, not string]

---

## File Outputs for This Phase

| File | Action | Notes |
|------|--------|-------|
| `docs/ci-cd.md` | Create (new directory) | Human-readable guide with pipeline explanation |
| `docs/examples/github-actions.yml` | Create (new directory) | Copy-paste ready workflow YAML |
| `README.md` | Update | Add one link to `docs/ci-cd.md` |

`docs/` and `docs/examples/` do not exist yet and must be created. [VERIFIED: filesystem check — `ls /root/dockgate/` shows no `docs/` directory]

---

## Architecture Patterns

### docs/ci-cd.md Recommended Structure

Suggested section order (Claude's Discretion):

1. **Overview** — One paragraph explaining what DockGate does in a CI/CD context and what the guide covers
2. **Prerequisites** — What the developer needs before starting: DockGate instance running, `UPLOAD_TOKEN` value, MinIO accessible externally
3. **Required Secrets** — Table: secret name, where to set it, what value to use (maps to D-07/D-08)
4. **Pipeline Steps** — Numbered walk-through of each YAML step with explanation of why it does what it does
5. **Complete Workflow** — Code block with the full YAML (or pointer to `docs/examples/github-actions.yml`)
6. **Troubleshooting** — Common failure modes and how to diagnose (optional but high value)

### docs/examples/github-actions.yml Recommended Structure

```yaml
name: Build and Publish Docker Image via DockGate

on:
  push:
    tags:
      - 'v*.*.*'

env:
  APP_NAME: my-app          # Change to your app name registered in DockGate
  IMAGE_NAME: my-org/my-app # Docker image to build

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      # Step 1: Checkout
      # Step 2: Docker build
      # Step 3: Docker save → .tar
      # Step 4: Calculate sha256 and size
      # Step 5: Request presigned upload URL
      # Step 6: PUT .tar directly to MinIO
      # Step 7: Publish latest via DockGate API
```

### README.md Link

README.md currently does not exist. The planner must check whether it needs to be created from scratch or if only a link section needs to be added. Based on the codebase scan, no README.md was found — the planner should create a minimal one. [VERIFIED: `ls /root/dockgate/` showed no README.md]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| JSON parsing in shell | Custom regex/sed | `jq -r .url` — preinstalled on ubuntu-latest |
| sha256 calculation | Custom code | `sha256sum` — GNU coreutils, always available |
| File size in bytes | Custom code | `stat -c%s` — GNU stat |
| HTTP requests in YAML | Custom Action | `curl` with `-sf` flags |

---

## Common Pitfalls

### Pitfall 1: Presigned URL expires before upload
**What goes wrong:** CI/CD takes too long between requesting the presigned URL and doing the PUT. MinIO rejects the request.
**Why it happens:** Upload presigned URLs expire after 900 seconds (15 minutes). Long build times or slow networks can cause this.
**How to avoid:** Document in the guide that Steps 5→6 must happen in the same job, after the build is complete. The YAML structure already handles this by ordering steps correctly.
**Warning signs:** MinIO returns 403 AccessDenied on the PUT step.

### Pitfall 2: size sent as string instead of integer
**What goes wrong:** API returns 400 "Invalid size".
**Why it happens:** Shell variable interpolation in JSON string — `"size":"$SIZE"` wraps the value in quotes, making it a JSON string.
**How to avoid:** JSON body must use `"size":$SIZE` (no quotes around the variable). [VERIFIED: src/routes/apps.ts line 139 — `typeof size !== 'number'` check]

### Pitfall 3: sha256 with uppercase hex
**What goes wrong:** API returns 400 "Invalid sha256".
**Why it happens:** Some sha256 implementations output uppercase. The API regex `/^[a-f0-9]{64}$/` is lowercase-only.
**How to avoid:** `sha256sum` on Linux always outputs lowercase — safe to use as-is. The API also normalizes with `.toLowerCase()` internally [VERIFIED: src/routes/apps.ts line 158], but the validation happens on the raw input first [VERIFIED: src/routes/apps.ts line 135].

### Pitfall 4: DOCKGATE_URL with trailing slash
**What goes wrong:** Request goes to `https://dockgate.example.com//apps/...` (double slash).
**Why it happens:** Developer sets `DOCKGATE_URL=https://dockgate.example.com/` with trailing slash; YAML concatenates `/apps/...`.
**How to avoid:** Document in the guide: `DOCKGATE_URL` must not have a trailing slash. Example: `https://dockgate.meudominio.com`.

### Pitfall 5: set-output deprecation in GitHub Actions
**What goes wrong:** Workflow works but GitHub logs deprecation warnings; may break in future.
**Why it happens:** Older GitHub Actions tutorials show `echo "::set-output name=VERSION::$VERSION"` which was deprecated in 2022.
**How to avoid:** Use `echo "VERSION=$VALUE" >> $GITHUB_OUTPUT` (current syntax). [ASSUMED: confirmed from training knowledge — GitHub deprecated set-output command]

### Pitfall 6: Docker save produces gzipped tar vs uncompressed tar
**What goes wrong:** sha256 mismatch if client expects a specific format.
**Why it happens:** `docker save` produces an uncompressed tar; `docker export` produces something different. Both have `.tar` extension by convention.
**How to avoid:** Use `docker save` (not `docker export`) — `docker save` captures the full image with layers and metadata. The DockGate README should be explicit about this. [ASSUMED: docker save vs export distinction from training knowledge]

---

## Code Examples

### Complete GitHub Actions YAML (verified against API contracts)

```yaml
name: Build and Publish Docker Image via DockGate

on:
  push:
    tags:
      - 'v*.*.*'

env:
  APP_NAME: my-app          # Change this to your app name in DockGate
  IMAGE_NAME: my-org/my-app # Docker image reference

jobs:
  publish:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Extract version from tag
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Build Docker image
        run: docker build -t $IMAGE_NAME:${{ steps.version.outputs.VERSION }} .

      - name: Export image to tar
        run: docker save $IMAGE_NAME:${{ steps.version.outputs.VERSION }} -o image.tar

      - name: Calculate sha256 and size
        id: integrity
        run: |
          echo "SHA256=$(sha256sum image.tar | awk '{ print $1 }')" >> $GITHUB_OUTPUT
          echo "SIZE=$(stat -c%s image.tar)" >> $GITHUB_OUTPUT

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

      - name: Upload tar to MinIO
        run: |
          curl -sf -X PUT \
            -H "Content-Type: application/octet-stream" \
            --upload-file image.tar \
            "${{ steps.upload_url.outputs.URL }}"

      - name: Publish latest version via DockGate
        env:
          DOCKGATE_URL: ${{ secrets.DOCKGATE_URL }}
          DOCKGATE_UPLOAD_TOKEN: ${{ secrets.DOCKGATE_UPLOAD_TOKEN }}
        run: |
          curl -sf -X PUT \
            -H "Authorization: Bearer $DOCKGATE_UPLOAD_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"version\":\"${{ steps.version.outputs.VERSION }}\",\"sha256\":\"${{ steps.integrity.outputs.SHA256 }}\",\"size\":${{ steps.integrity.outputs.SIZE }}}" \
            "$DOCKGATE_URL/apps/$APP_NAME/latest"
```

Source: Derived from API contracts [VERIFIED: src/routes/apps.ts], GitHub Actions syntax [ASSUMED: training knowledge + standard patterns].

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `echo "::set-output name=X::$VAL"` | `echo "X=$VAL" >> $GITHUB_OUTPUT` | Use new form — old form deprecated 2022, may break |
| `actions/checkout@v2` | `actions/checkout@v4` | Use v4 — current major version |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ubuntu-latest has `sha256sum` and `stat -c%s` (GNU coreutils) preinstalled | Shell Commands | sha256/size steps fail; mitigation: add explicit install step |
| A2 | ubuntu-latest has `curl` and `jq` preinstalled | GitHub Actions YAML Patterns | curl/jq steps fail; mitigation: add install step `sudo apt-get install -y jq` |
| A3 | `echo "X=$VAL" >> $GITHUB_OUTPUT` is current syntax (not `set-output`) | GitHub Actions YAML Patterns | Deprecation warnings or breakage; mitigation: check GitHub docs on runner |
| A4 | `actions/checkout@v4` is current stable major version | Code Examples | Minor: could pin to @v3 instead; no functional difference |
| A5 | `docker save` (not `docker export`) produces a correct image archive | Common Pitfalls | Wrong flags produce different artifact; mitigation: document `docker save` explicitly in guide |
| A6 | `stat -c%s` outputs a plain decimal integer | Shell Commands | size may have unexpected whitespace or formatting; mitigation: pipe through `tr -d '[:space:]'` as safety measure |

---

## Open Questions

1. **Does README.md need to be created from scratch?**
   - What we know: No `README.md` found in the repo root.
   - What's unclear: Should Phase 3 create a minimal README, or is the absence intentional?
   - Recommendation: Create a minimal README with project description + link to `docs/ci-cd.md`. This is a greenfield project and a README is standard for any public/internal repo.

2. **Should the guide cover the client download side?**
   - What we know: DOCS-01 specifies CI/CD upload pipeline only. Phase 3 CONTEXT confirms this scope.
   - What's unclear: Nothing — scope is locked. Client download (`GET /download`) is NOT part of DOCS-01.
   - Recommendation: Do not document download in Phase 3. Out of scope.

---

## Environment Availability

Step 2.6: SKIPPED — this phase creates documentation files only. No external tool dependencies beyond standard filesystem operations.

---

## Sources

### Primary (HIGH confidence)
- `src/routes/apps.ts` — confirmed API request/response shapes, auth patterns, validation rules, status codes
- `src/config.ts` — confirmed required env vars list and `MINIO_PUBLIC_ENDPOINT` behavior
- `.planning/phases/03-ci-cd-docs/03-CONTEXT.md` — all implementation decisions (D-01 through D-08)
- `.planning/phases/02-core-api/02-CONTEXT.md` — API contract decisions (D-01 through D-11)
- `.planning/phases/01-foundation/01-CONTEXT.md` — env vars, auth middleware pattern, MinIO connectivity model
- `CLAUDE.md` — presigned URL expiry strategy, no-proxy architecture, commit format

### Secondary (MEDIUM confidence)
- GitHub Actions `$GITHUB_OUTPUT` syntax — standard pattern, widely documented, confirmed from training knowledge

### Tertiary (LOW confidence / ASSUMED)
- ubuntu-latest runner tooling (sha256sum, stat, curl, jq) — standard but not verified against current runner image manifest
- actions/checkout@v4 as current major version — training knowledge, should verify at authoring time

---

## Metadata

**Confidence breakdown:**
- API contracts: HIGH — verified from live source code
- Shell commands (sha256sum, stat): HIGH — GNU coreutils standard behavior
- GitHub Actions syntax: MEDIUM — training knowledge, widely documented, not verified via Context7 this session
- Runner preinstalled tools: MEDIUM — standard on ubuntu-latest, not verified against current runner image

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (GitHub Actions syntax is stable; API contracts valid until endpoints change)
