---
phase: 03-ci-cd-docs
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - docs/examples/github-actions.yml
  - docs/ci-cd.md
  - README.md
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three documentation files were reviewed: the GitHub Actions example workflow, the CI/CD integration guide, and the project README. The files are well-structured and cover the integration accurately. No critical security vulnerabilities were found. Three warnings were identified: two shell scripting issues in the Actions YAML (unquoted variable and missing null guard on the presigned URL) and one misleading statement in the troubleshooting section. Three informational items cover a doc/code mismatch in a code snippet, a minor phrasing ambiguity, and an unauthenticated endpoint worth acknowledging explicitly.

## Warnings

### WR-01: Unquoted variable in shell command risks word-splitting

**File:** `docs/examples/github-actions.yml:64`
**Issue:** `echo $RESPONSE` is unquoted. Bash performs word-splitting and glob expansion on unquoted variables. If the `curl` response (or any error message injected into `RESPONSE`) contains spaces, newlines, or glob characters (`*`, `?`, `[`), the `echo` will not pass the value faithfully to `jq`. The correct form always quotes the variable.
**Fix:**
```yaml
echo "URL=$(echo "$RESPONSE" | jq -r .url)" >> $GITHUB_OUTPUT
```

---

### WR-02: No null/empty guard on the presigned URL before upload

**File:** `docs/examples/github-actions.yml:64-74`
**Issue:** If `jq -r .url` returns `null` (e.g., the DockGate API returned an error body instead of `{ "url": "..." }`) the `URL` output is the literal string `"null"`. Step 7 will then run `curl -sf -X PUT ... "null"`, which curl interprets as a relative path rather than a URL, causing an obscure failure instead of a clear error. The `curl -sf` flags make it fail non-zero on HTTP errors, but a malformed URL never even reaches HTTP — the failure message will not hint at the root cause.
**Fix:**
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
    URL=$(echo "$RESPONSE" | jq -r .url)
    if [ -z "$URL" ] || [ "$URL" = "null" ]; then
      echo "ERROR: DockGate did not return a presigned URL. Response: $RESPONSE" >&2
      exit 1
    fi
    echo "URL=$URL" >> $GITHUB_OUTPUT
```

---

### WR-03: Troubleshooting section describes presigned URL expiry incorrectly

**File:** `docs/ci-cd.md:82`
**Issue:** The text reads: "If the build takes longer than 15 minutes before reaching step 6, the presigned URL may expire before the upload completes." This is logically incorrect — the presigned URL is *requested* in step 6, so it cannot expire before step 6 runs. The actual risk is that the upload in step 7 must complete within 900 seconds *after* step 6 issues the URL. A user reading this could be misled into thinking the timer starts earlier.
**Fix:** Replace the sentence with:
> "The presigned URL is valid for 900 seconds from the moment step 6 requests it. If step 7 (the MinIO upload) takes longer than 15 minutes to complete after the URL is issued — for example, because the image is very large or network bandwidth is low — MinIO will reject the upload with 403 AccessDenied."

The troubleshooting header at line 132 ("403 on MinIO upload (step 7): Presigned URL expired") is accurate and should remain unchanged.

---

## Info

### IN-01: Step 8 code snippet in docs uses placeholder values instead of real interpolation

**File:** `docs/ci-cd.md:109-111`
**Issue:** The code block for step 8 shows `-d "{\"version\":\"...\",\"sha256\":\"...\",\"size\":...}"` with ellipsis placeholders. The complete YAML (which is the canonical copy) uses `${{ steps.integrity.outputs.SHA256 }}` etc. A reader studying only this snippet will not know what to substitute. The guide does link to the full YAML, but the snippet is incomplete for copy-paste use.
**Fix:** Either show the real interpolation syntax matching the YAML example, or add a note below the snippet explicitly stating that ellipsis values are placeholders for the step outputs defined earlier in the workflow.

---

### IN-02: `GET /apps/:name/latest` unauthenticated access not explicitly noted in README

**File:** `README.md:19`
**Issue:** The endpoints table lists `GET /apps/:name/latest` with auth "None". Any caller who knows an app name can enumerate the latest version and its sha256/size without credentials. This is consistent with the project's design (version metadata is not sensitive), but the README does not include a note explaining that this is intentional. Without such a note, a future maintainer could inadvertently add auth thinking it was an oversight.
**Fix:** Add a brief note to the endpoint table row or a "Security model" section explaining that version metadata is intentionally public — only the actual file download requires a `DOWNLOAD_TOKEN`.

---

### IN-03: Magic constant `900` mentioned in docs but not cross-referenced to source

**File:** `docs/ci-cd.md:82`
**Issue:** The 900-second presigned URL expiry is stated as a fact but the source of that value (defined in the DockGate API code, presumably a constant) is not documented or linked. If the value is ever changed in the API, the documentation silently becomes stale.
**Fix:** Add a parenthetical or note pointing to where the expiry is configured, e.g.: "The presigned upload URL is valid for 900 seconds (15 minutes) — this value is set via `PRESIGNED_UPLOAD_EXPIRY` in the DockGate source." Alternatively, document it as a constant in the API configuration reference.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
