---
phase: 01-foundation
plan: "02"
subsystem: config
tags: [config, types, schemas, env-validation, minio]
dependency_graph:
  requires: []
  provides: [src/config.ts, src/lib/schemas.ts]
  affects: [src/lib/minio.ts, src/routes/*, src/index.ts]
tech_stack:
  added: []
  patterns: [fail-fast-env-validation, typed-config-object, pure-key-builder-functions]
key_files:
  created:
    - src/config.ts
    - src/lib/schemas.ts
  modified: []
decisions:
  - "MINIO_ENDPOINT parsed defensively: supports both 'minio' and 'minio:9000' formats via lastIndexOf(':') with default port 9000"
  - "config exported as const — prevents accidental mutation of token values at runtime"
  - "LatestManifest.schema uses literal type '1' (not number) — TypeScript enforces exact schema version in all producers"
metrics:
  duration_seconds: 70
  completed_date: "2026-06-16"
  tasks_completed: 2
  files_created: 2
requirements_implemented: [SEC-04, DATA-01, DATA-02]
---

# Phase 1 Plan 02: Config and Schemas Summary

**One-liner:** Fail-fast env validation exiting on missing vars plus typed LatestManifest interface and MinIO key-builder pure functions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/config.ts — fail-fast env validation | 7efb60c | src/config.ts |
| 2 | Create src/lib/schemas.ts — data types and key builders | 01e3b61 | src/lib/schemas.ts |

## Artifacts

### src/config.ts

Validates all 7 required env vars at import time. Process exits immediately with a descriptive error on any missing var. Exports a typed `config` object:

```typescript
export const config: {
  downloadToken: string
  uploadToken: string
  minioEndpoint: string       // hostname only, no protocol (parsed from MINIO_ENDPOINT)
  minioPort: number           // parsed from MINIO_ENDPOINT, defaults to 9000
  minioPublicEndpoint: string // full URL e.g. http://192.168.1.10:9000
  minioBucket: string
  minioAccessKey: string
  minioSecretKey: string
  port: number                // PORT env var, defaults to 3000
}
```

### src/lib/schemas.ts

Data contracts for downstream routes:

```typescript
export interface LatestManifest {
  schema: 1           // literal type — only version 1 is valid
  version: string     // semantic version string, e.g. '1.2.3'
  sha256: string      // hex SHA-256 hash of the .tar file
  size: number        // file size in bytes
  publishedAt: string // ISO 8601 timestamp
}

export function tarKey(appName: string, version: string): string  // → '{appName}/{version}.tar'
export function latestKey(appName: string): string               // → '{appName}/latest.json'
```

## Decisions Implemented

| Decision | Reference | Detail |
|----------|-----------|--------|
| Validate all 7 env vars | D-03, SEC-04 | Single import point for all config; `for...of` loop over `required` const array |
| MINIO_PUBLIC_ENDPOINT required | D-02 | Full URL validated and exported as `minioPublicEndpoint` |
| PORT optional with 3000 default | D-07 | `parseInt(process.env.PORT ?? '3000', 10)` |
| MINIO_ENDPOINT parsed defensively | Open Question 1 | `lastIndexOf(':')` handles both `minio` and `minio:9000` |
| LatestManifest schema literal type | DATA-01 | `schema: 1` not `schema: number` — TypeScript catches wrong versions |
| MinIO key builders as pure functions | DATA-02 | No state, no deps — safe to call in any context |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The `config` object holds tokens in memory but never logs them (T-02-01 mitigated by absence of logging in these files — log.ts in Plan 03 handles redaction). The `tarKey`/`latestKey` functions are pure with no user input (T-02-03 — input sanitization happens upstream in sanitize.ts Plan 03 before these are called).

## Self-Check: PASSED

- [x] src/config.ts exists: FOUND
- [x] src/lib/schemas.ts exists: FOUND
- [x] Commit 7efb60c exists: FOUND
- [x] Commit 01e3b61 exists: FOUND
