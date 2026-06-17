---
phase: 06-protect-public-repo
reviewed: 2026-06-17T20:03:38Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - SECURITY.md
  - .github/workflows/lint.yml
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-06-17T20:03:38Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Two files were reviewed: the repository security disclosure policy (`SECURITY.md`) and the CI lint/typecheck workflow (`lint.yml`). `SECURITY.md` is structurally correct and functional. The CI workflow (`lint.yml`) has two warning-level issues relevant to public-repo hardening: missing explicit permission scoping on the `GITHUB_TOKEN`, and action references pinned to mutable tags rather than immutable commit SHAs. Both are meaningful for a public repository where supply-chain and token-scope risks are real. Two info-level items are also noted.

## Warnings

### WR-01: GITHUB_TOKEN permissions not explicitly scoped

**File:** `.github/workflows/lint.yml:1` (applies to whole workflow)
**Issue:** No `permissions:` block is declared at the workflow or job level. For `push` events on non-fork branches, the default `GITHUB_TOKEN` grants **read and write** to repository contents, packages, and other scopes. This violates the principle of least privilege. A lint/typecheck workflow requires only read access (`contents: read`). If any third-party action or injected step were malicious or compromised, it would have write access to the repository.
**Fix:** Add a top-level `permissions` block immediately after the `on:` section to restrict the token to the minimum required:
```yaml
permissions:
  contents: read
```
Full example (top of file, after the `on:` block):
```yaml
permissions:
  contents: read

jobs:
  lint:
    ...
  typecheck:
    ...
```

---

### WR-02: Actions pinned to mutable tags, not immutable commit SHAs

**File:** `.github/workflows/lint.yml:18` and `.github/workflows/lint.yml:20` (also lines 37, 39)
**Issue:** `actions/checkout@v4` and `oven-sh/setup-bun@v2` are pinned to version tags. Tags are mutable — a tag can be force-pushed to point to a different commit, including malicious code. For a public repository, this is a supply-chain risk: if either action's repository were compromised, the tag could be silently redirected. GitHub's own security hardening guide recommends pinning to full commit SHAs.
**Fix:** Replace tag references with full commit SHAs. Fetch the current SHA for each action and pin it:
```yaml
# Before
- uses: actions/checkout@v4
- uses: oven-sh/setup-bun@v2

# After (example — verify the actual current SHAs from GitHub)
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
- uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5  # v2.0.1
```
Use `gh api repos/actions/checkout/git/refs/tags/v4` to resolve the current SHA for the tag before pinning.

## Info

### IN-01: bun-version: latest may cause non-deterministic CI failures

**File:** `.github/workflows/lint.yml:22` (and line 41)
**Issue:** `bun-version: latest` installs whatever Bun version is current at workflow execution time. If Bun releases a version with breaking changes to ESLint integration or TypeScript compatibility, CI can start failing on an unrelated PR without any code change. For a stable CI signal, a pinned version is preferred.
**Fix:** Pin to a specific Bun version. Check the current stable release at `https://bun.sh` and pin it:
```yaml
with:
  bun-version: "1.2.15"   # replace with the actual current stable version
```
Update the pin intentionally when upgrading Bun, rather than receiving surprise upgrades.

---

### IN-02: SECURITY.md contact is a personal Gmail address

**File:** `SECURITY.md:11`
**Issue:** The vulnerability disclosure contact is `biel1313biel@gmail.com`, a personal Gmail account. This is not a security vulnerability, but for a public project it creates a single point of failure (vacation, account suspension, etc.) and may reduce reporter confidence. It is also a common target for phishing if the address becomes publicly indexed.
**Fix:** Consider using a dedicated security alias (e.g., `security@yourdomain.com`) or GitHub's private vulnerability reporting feature (`Settings > Security > Private vulnerability reporting`) to reduce reliance on a personal email inbox.

---

_Reviewed: 2026-06-17T20:03:38Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
