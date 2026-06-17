---
phase: 05-subir-docker-image-para-o-docker-hub-via-ci-cd
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - deploy/docker-compose.yml
  - .github/workflows/deploy.yml
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the Portainer deploy Compose template and the GitHub Actions CI/CD workflow. The overall structure is sound: the two-job pipeline (build+push then redeploy) is correct, JWT validation checks are present, and the stack file is properly JSON-encoded before embedding. Two correctness issues require attention before production use: a potential JSON injection from Portainer credentials containing special characters, and a silent wipe of Portainer stack environment variables on every redeploy. Two shell-pipeline reliability issues are also flagged.

---

## Critical Issues

### CR-01: Portainer credentials injected unsanitized into JSON string — JSON injection risk

**File:** `.github/workflows/deploy.yml:43-46`
**Issue:** `PORTAINER_USERNAME` and `PORTAINER_PASSWORD` are interpolated directly into a `-d` JSON string via shell variable expansion. If either secret contains a double-quote, backslash, or newline (e.g., a password like `p@ss"word`), the resulting JSON is malformed and the request will fail. Worse, a carefully crafted value could inject additional JSON fields (e.g., closing the string early and appending `,"admin":true`).

```yaml
# Current — unsafe direct interpolation:
-d "{\"Username\":\"${{ secrets.PORTAINER_USERNAME }}\",\"Password\":\"${{ secrets.PORTAINER_PASSWORD }}\"}"
```

**Fix:** Use `jq` to construct the JSON payload safely, letting it handle escaping:

```bash
PAYLOAD=$(jq -n \
  --arg user "${{ secrets.PORTAINER_USERNAME }}" \
  --arg pass "${{ secrets.PORTAINER_PASSWORD }}" \
  '{"Username": $user, "Password": $pass}')

JWT=$(curl -fsSL -X POST "${{ secrets.PORTAINER_URL }}/api/auth" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  | jq -r '.jwt')
```

---

## Warnings

### WR-01: `"Env": []` silently wipes all Portainer stack environment variables on every redeploy

**File:** `.github/workflows/deploy.yml:71`
**Issue:** The PUT body sends `"Env": []` unconditionally. Portainer interprets this as "set the stack's environment variables to an empty list." If any env vars are configured in the Portainer UI (e.g., `DOWNLOAD_TOKEN`, `MINIO_SECRET_KEY`), each CI deployment will silently delete them. After the first automated deploy, the running container will have no credentials and the service will fail.

```bash
# Current — Env cleared on every deploy:
-d "{\"StackFileContent\": ..., \"Env\": [], \"Prune\": false, \"RepullImageAndRedeploy\": true}"
```

**Fix:** Retrieve the current `Env` array from the existing stack and pass it back unchanged, similar to how `StackFileContent` is preserved:

```bash
# Fetch current stack config (env array included)
STACK_DATA=$(curl -fsSL \
  -H "Authorization: Bearer $JWT" \
  "${{ secrets.PORTAINER_URL }}/api/stacks/${{ secrets.PORTAINER_STACK_ID }}")

STACK_FILE=$(echo "$STACK_DATA" | jq -r '.StackFileContent // empty')
ENV_ARRAY=$(echo "$STACK_DATA" | jq '.Env // []')

# Redeploy preserving existing env vars
curl -fsSL -X PUT \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  "${{ secrets.PORTAINER_URL }}/api/stacks/${{ secrets.PORTAINER_STACK_ID }}?endpointId=${{ secrets.PORTAINER_ENDPOINT_ID }}" \
  -d "{\"StackFileContent\": $(echo "$STACK_FILE" | jq -Rs .), \"Env\": $ENV_ARRAY, \"Prune\": false, \"RepullImageAndRedeploy\": true}"
```

Note: the current workflow calls `/api/stacks/{id}/file` (Step 2) which returns only `StackFileContent`. Switching to `/api/stacks/{id}` (no `/file` suffix) returns the full stack object including `Env`.

### WR-02: `curl | jq` pipe masks curl failure — missing `pipefail`

**File:** `.github/workflows/deploy.yml:43-46` and `54-57`
**Issue:** GitHub Actions `run:` steps execute with `bash` but without `set -o pipefail`. When `curl -f` encounters an HTTP error, it exits non-zero, but in a pipeline (`curl ... | jq ...`) bash only checks the exit code of the last command (`jq`). If `curl` fails silently, `jq` receives empty input and outputs `null`, which is then caught by the null-check — but the error message says "Failed to obtain JWT" rather than revealing the actual curl failure, making debugging harder. More critically, if `-f` is not enough to surface the error (e.g., a 200 response with an error body), the pipeline swallows it.

**Fix:** Add `set -euo pipefail` at the top of the `run:` block:

```bash
run: |
  set -euo pipefail

  JWT=$(curl -fsSL -X POST "${{ secrets.PORTAINER_URL }}/api/auth" \
    ...
```

---

## Info

### IN-01: Only `latest` tag pushed — no immutable tag for rollback

**File:** `.github/workflows/deploy.yml:31`
**Issue:** Only `biellil/dockgate:latest` is pushed. If a bad release goes out, there is no tagged image to roll back to. The previous `latest` is overwritten.

**Fix:** Add a `sha`-based immutable tag alongside `latest`:

```yaml
tags: |
  biellil/dockgate:latest
  biellil/dockgate:${{ github.sha }}
```

### IN-02: No timeout on `portainer-deploy` job

**File:** `.github/workflows/deploy.yml:34-73`
**Issue:** If Portainer is unreachable, GitHub Actions will hang for the default 6-hour job timeout before failing. This blocks the runner and delays failure notification.

**Fix:** Add a `timeout-minutes` to the job and/or use `--max-time` on the curl calls:

```yaml
portainer-deploy:
  name: Update Portainer Stack
  runs-on: ubuntu-latest
  needs: build-push
  timeout-minutes: 5
```

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
