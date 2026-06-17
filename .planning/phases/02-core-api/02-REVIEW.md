---
phase: 02-core-api
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/index.ts
  - src/routes/apps.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed `src/index.ts` and `src/routes/apps.ts`, with cross-reference to `src/config.ts`, `src/lib/minio.ts`, `src/middleware/auth.ts`, and `src/middleware/sanitize.ts` for context.

The core architecture is sound: auth middleware runs before route handlers, input validation is consistently applied before MinIO calls, the anti-phantom check prevents orphaned `latest.json` manifests, and the timing-safe token comparison in `auth.ts` is correct. Express 5 async error propagation means unhandled throws safely reach the global error handler.

Two warnings and two info items were found. No critical issues. The most actionable finding is a missing startup-time validation for `MINIO_PUBLIC_ENDPOINT` that can silently produce invalid double-slash URLs in production.

---

## Warnings

### WR-01: MINIO_PUBLIC_ENDPOINT trailing slash produces double-slash URLs silently

**File:** `src/routes/apps.ts:27-30`

**Issue:** `rewritePresignedUrl` replaces the internal MinIO origin with `config.minioPublicEndpoint` using `String.prototype.replace`. The SDK-generated URL path always starts with `/`, so if an operator sets `MINIO_PUBLIC_ENDPOINT=https://cdn.example.com/` (trailing slash), the output becomes `https://cdn.example.com//bucket/app/1.0.tar?...`. Most HTTP clients and CDNs treat a double-slash path as a different resource or reject the URL outright. The error is completely silent — the API returns a 200 with a broken URL. `config.ts` validates that the variable is non-empty but does not strip the trailing slash.

**Fix:** Strip any trailing slash from `MINIO_PUBLIC_ENDPOINT` at config parse time:

```typescript
// src/config.ts — after reading MINIO_PUBLIC_ENDPOINT
minioPublicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT!.replace(/\/+$/, ''),
```

This is a one-line defensive change. Alternatively, validate with a startup check that rejects values ending in `/`:

```typescript
if (process.env.MINIO_PUBLIC_ENDPOINT!.endsWith('/')) {
  console.error('[startup] MINIO_PUBLIC_ENDPOINT must not end with a trailing slash')
  process.exit(1)
}
```

---

### WR-02: SHA256_REGEX /i flag stores mixed-case hashes without normalization

**File:** `src/routes/apps.ts:115`

**Issue:** `SHA256_REGEX = /^[a-f0-9]{64}$/i` accepts uppercase hex characters (e.g., `A3F0...`). The accepted value is stored verbatim in `latest.json`. If a CI/CD tool generates an uppercase hash and a client compares it against a lowercase hash from `sha256sum`, the comparison fails even though the values represent the same digest. The API never performs the comparison itself, but it controls the stored canonical form that downstream clients rely on.

**Fix:** After validating format, normalize to lowercase before storing:

```typescript
// src/routes/apps.ts — in PUT /apps/:name/latest, after validation passes
const manifest: LatestManifest = {
  schema: 1,
  version,
  sha256: sha256.toLowerCase(),  // normalize to lowercase hex
  size,
  publishedAt: new Date().toISOString(),
}
```

And optionally tighten the regex to enforce lowercase-only input at validation time, making the accepted contract explicit:

```typescript
const SHA256_REGEX = /^[a-f0-9]{64}$/  // no /i — lowercase-only
```

---

## Info

### IN-01: Redundant double import of config module in index.ts

**File:** `src/index.ts:2,8`

**Issue:** `config.ts` is imported twice — once as a side-effect import (`import './config.ts'`) and once as a named import (`import { config } from './config.ts'`). ES modules are evaluated only once, so this is not a bug, but the side-effect import on line 2 is entirely redundant: the named import on line 8 already triggers module evaluation (including the fail-fast env validation). The comment on line 2 implies it is necessary for ordering purposes, but module evaluation order in ES imports follows the import declaration order, so removing the explicit side-effect import does not change behavior.

**Fix:** Remove the redundant side-effect import:

```typescript
// Remove line 2:
// import './config.ts'

// Keep only:
import { config } from './config.ts'
```

---

### IN-02: `as string` cast on validated query params is unnecessary after middleware

**File:** `src/routes/apps.ts:66,99`

**Issue:** On both the `GET /download` (line 66) and `POST /upload` (line 99) handlers, `req.query.version` is cast with `as string` after `validateVersion` middleware has already confirmed it is a non-empty string. The cast is technically safe (middleware guarantees it), but it suppresses TypeScript's type narrowing rather than using it, and it signals to readers that the author was unsure of the type rather than relying on the validation guarantee.

**Fix:** Keep the cast if preferred for readability, or use a non-null assertion that better documents intent:

```typescript
// Option A: keep 'as string' but add an explanatory comment
const version = req.query.version as string  // validateVersion middleware guarantees this is a string

// Option B: use non-null assertion (signals "guaranteed by middleware, not just hoped")
const version = req.query.version as string  // already validated
```

This is a style preference — no behavior change required.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
