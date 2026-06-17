---
phase: 02-core-api
fixed_at: 2026-06-17T00:00:00Z
fix_scope: critical_warning
findings_in_scope: 2
fixed: 2
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-06-17
**Source review:** .planning/phases/02-core-api/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: MINIO_PUBLIC_ENDPOINT trailing slash produces double-slash URLs silently

**Files modified:** `src/config.ts`
**Commit:** 07a9562
**Applied fix:** Changed `minioPublicEndpoint` in the `config` export to call `.replace(/\/+$/, '')` on the raw env var value, stripping any trailing slash(es) at config parse time so `rewritePresignedUrl` never produces double-slash paths.

### WR-02: SHA256_REGEX /i flag stores mixed-case hashes without normalization

**Files modified:** `src/routes/apps.ts`
**Commit:** 847cc9b
**Applied fix:** Removed the `/i` flag from `SHA256_REGEX` (now `/^[a-f0-9]{64}$/`) so only lowercase hex is accepted at validation time, and added `sha256.toLowerCase()` when building the `LatestManifest` to normalize the stored canonical form to lowercase regardless of input case.

## Skipped

None — all findings were fixed.

---

_Fixed: 2026-06-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
