# Roadmap: DockGate

## Overview

DockGate ships in three phases. Phase 1 builds everything the API needs to exist: config validation, MinIO client, auth middleware, input sanitization, data schema, and a working Docker container. Phase 2 adds the actual endpoints that clients and CI/CD pipelines call. Phase 3 documents the CI/CD integration so the pipeline can be set up and maintained without tribal knowledge.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Project scaffold, MinIO client, auth middleware, fail-fast config, and Docker container
- [ ] **Phase 2: Core API** - All read and write endpoints fully functional end-to-end
- [ ] **Phase 3: CI/CD Docs** - GitHub Actions integration guide with ready-to-copy workflow YAML

## Phase Details

### Phase 1: Foundation
**Goal**: A running DockGate container connects to MinIO on startup, refuses to start with missing config, and reports its health
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  1. `GET /health` returns `{ ok: true, minio: "connected" }` when MinIO is reachable and 503 when it is not
  2. Container exits immediately with a clear error message if any required env var (`DOWNLOAD_TOKEN`, `UPLOAD_TOKEN`, `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) is absent
  3. A request with a token in the query string is logged without the token value appearing in any log output
  4. A request using a path like `../../etc` or a name with `..` is rejected with 400 before reaching MinIO
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffold (package.json, tsconfig.json, bun.lock)
- [x] 01-02-PLAN.md — Foundation contracts (src/config.ts, src/lib/schemas.ts)
- [x] 01-03-PLAN.md — Core modules (MinIO client, auth, sanitize, log middlewares)
- [x] 01-04-PLAN.md — Wiring and Docker (health route, index.ts, Dockerfile)

### Phase 2: Core API
**Goal**: Clients can discover and download app versions; CI/CD pipelines can upload new versions and publish them atomically
**Depends on**: Phase 1
**Requirements**: READ-01, READ-02, READ-03, WRITE-01, WRITE-02, WRITE-03
**Success Criteria** (what must be TRUE):
  1. `GET /apps/:name/latest` returns `{ schema: 1, version, sha256, size, publishedAt }` with no auth required
  2. `GET /apps/:name/download?version=X` with a valid `DOWNLOAD_TOKEN` returns a presigned MinIO URL; the same request without a valid token returns 401
  3. `POST /apps/:name/upload?version=X` with a valid `UPLOAD_TOKEN` returns a presigned PUT URL for direct MinIO upload
  4. `PUT /apps/:name/latest` with a valid `UPLOAD_TOKEN` updates `latest.json` only when the corresponding `.tar` exists in MinIO; if the `.tar` is absent the request returns 422
**Plans**: TBD

### Phase 3: CI/CD Docs
**Goal**: A developer can set up the full DockGate pipeline from the repository alone, without asking anyone
**Depends on**: Phase 2
**Requirements**: DOCS-01
**Success Criteria** (what must be TRUE):
  1. Repository contains a GitHub Actions workflow YAML that a developer can copy, set the required secrets, and run without modification
  2. The guide covers every step of the pipeline: build image, export `.tar`, request upload URL, PUT to MinIO, call `PUT /latest`
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — CI/CD docs (docs/examples/github-actions.yml, docs/ci-cd.md, README.md)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/? | Not started | - |
| 2. Core API | 0/? | Not started | - |
| 3. CI/CD Docs | 0/? | Not started | - |

### Phase 4: Add ESLint configuration (.eslintrc)

**Goal:** ESLint v9 flat config with typescript-eslint/strict enforces code quality in CI and at commit time
**Requirements**: LINT-01, LINT-02, LINT-03
**Depends on:** Phase 3
**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md — ESLint config and lint script (eslint.config.js, package.json)
- [x] 04-02-PLAN.md — GitHub Actions lint workflow (.github/workflows/lint.yml)
- [x] 04-03-PLAN.md — Pre-commit hook (husky + lint-staged, .husky/pre-commit)

### Phase 5: subir docker image para o Docker Hub via CI/CD e atualizar stack no Portainer

**Goal:** CI/CD faz build da imagem Docker, publica no Docker Hub e atualiza automaticamente a stack rodando no Portainer
**Requirements**: TBD
**Depends on:** Phase 4
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 5 to break down)

### Phase 6: Proteger repositório público

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 5
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 6 to break down)
