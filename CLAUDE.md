### Commit Message Format

```
<emoji> <type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types with Emojis

| Emoji | Type | When to use |
|-------|------|-------------|
| ✨ | **feat** | A new feature |
| 🐛 | **fix** | A bug fix |
| 📝 | **docs** | Documentation only changes |
| 💄 | **style** | Code style/formatting (whitespace, semicolons, etc) |
| ♻️ | **refactor** | Code change that neither fixes a bug nor adds a feature |
| ⚡️ | **perf** | Performance improvements |
| ✅ | **test** | Adding or updating tests |
| 🔧 | **chore** | Changes to build process or auxiliary tools |
| 🏗️ | **build** | Changes that affect the build system or dependencies |
| 🤖 | **ci** | Changes to CI configuration files and scripts |
| ⏪️ | **revert** | Reverts a previous commit |
| 🔒️ | **security** | Security improvements or fixes |

### Examples

```bash
✨ feat: add endpoint to search chats by botIdentifier

🐛 fix(mongodb): resolve connection timeout in service

📝 docs: update API endpoint examples in README

♻️ refactor(database): simplify database iteration logic

⚡️ perf: optimize message query improving time by 30%

✅ test: add unit tests for authentication service

🔧 chore: configure lint-staged and husky for pre-commit

🏗️ build: adjust GitHub Actions workflow for production

🔒️ security: validate JWT tokens before processing requests
```

### Important Rules

**NEVER** include these lines in commits:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
```

<!-- GSD:project-start source:PROJECT.md -->
## Project

**DockGate**

API de distribuição privada de imagens Docker para clientes autorizados. Armazena imagens exportadas como arquivos `.tar` no MinIO e permite que clientes façam download direto sem precisar de Docker Registry ou credenciais de registry. Suporta múltiplas apps e versionamento semântico.

**Core Value:** Clientes autorizados conseguem baixar a versão mais recente de qualquer app registrada com um único token — sem Docker Registry, sem login, sem complexidade.

### Constraints

- **Tech stack**: Bun + Express + TypeScript — decisão do dono do projeto
- **Armazenamento**: MinIO (SDK oficial `minio`) — bucket único, pastas por app
- **Auth**: tokens fixos via variáveis de ambiente (`DOWNLOAD_TOKEN`, `UPLOAD_TOKEN`) — sem JWT, OAuth ou complexidade adicional
- **Runtime**: Container Docker, deploy via CI/CD no Portainer
- **Sem estado local**: API é stateless — todo estado (versões, arquivos) fica no MinIO
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Runtime & Framework
### Bun as Runtime
- `node:http` and `node:https` are **fully implemented** — Express works out of the box
- `node:fs`, `node:stream`, `node:crypto`, `node:net` are fully implemented — MinIO SDK works
- `node:tls` is implemented (missing only `createSecurePair`, irrelevant for MinIO SDK usage)
- Express is explicitly called out as working on the Bun ecosystem page: *"popular frameworks like Next.js, Express, and millions of npm packages intended for Node work with Bun"*
### Express vs Bun.serve
- Express gives familiar middleware-based auth (`app.use(authMiddleware)`) that maps directly to the two-token model required
- Path parameter routing (`/apps/:name`) works identically to Node.js — no surprises
- `@types/express` gives full TypeScript IntelliSense on `req.params`, `req.query`, `req.headers`
### Express Version
## MinIO Integration
### Package
### Client Initialization
### Key API Methods
### Presigned URL Expiry Strategy
- Download URLs: 1 hour (`3600` seconds) — client scripts should use immediately
- Upload URLs: 15 minutes (`900` seconds) — CI/CD pipeline uploads right after requesting
### Bun Compatibility with MinIO SDK
## Authentication
### Pattern: Simple Bearer Token Middleware
## TypeScript Config
### Official Bun tsconfig.json (verified from bun.sh/docs/typescript)
- `"module": "Preserve"` — Bun handles module resolution; don't transform imports
- `"moduleResolution": "bundler"` — Required to resolve `@types/bun` and extension-less imports correctly
- `"verbatimModuleSyntax": true` — Enforces `import type` for type-only imports; catches runtime import mistakes
- `"types": ["bun"]` — Pulls in Bun globals without cluttering other type namespaces
- `"noEmit": true` — Bun runs TypeScript directly; no compilation step needed
- `"strict": true` — Non-negotiable for a security-critical token comparison path
## Docker
### Base Image
### Recommended Multi-Stage Dockerfile
# Stage 1: Install all dependencies (cached layer)
# Separate dev and prod install to cache both
# Stage 2: Final image — production only
# Copy production node_modules from install stage
# Copy source
# Run as non-root bun user (included in oven/bun image)
# Run TypeScript directly — no build step needed
### .dockerignore
### Why no compile/build stage
### Image size note
### Port Configuration
## What NOT to Use
| Library/Approach | Why Not |
|---|---|
| `@aws-sdk/client-s3` | Works with MinIO's S3 API but is 10x heavier than `minio` SDK, requires more config (region spoofing), and loses MinIO-specific conveniences. Use `minio` SDK instead. |
| JWT / `jsonwebtoken` | Project spec explicitly rules out JWT. Fixed tokens via env vars are simpler, sufficient, and have zero attack surface for token forgery. |
| `passport` | Massive overkill. Passport is for multi-strategy auth (OAuth, local, etc.). Two env-var tokens need four lines of middleware, not a 40-package auth framework. |
| `dotenv` | Bun loads `.env` files natively — no package needed. `process.env.MY_VAR` works out of the box in development. |
| `ts-node` or `tsx` | Both are Node.js TypeScript runners. Bun runs `.ts` natively — these add nothing and add startup overhead. |
| `nodemon` | Use `bun --hot src/index.ts` for hot reload in development. `nodemon` is a Node.js tool. |
| Express 4.x | Express 5 is current stable and handles async errors better. No reason to start a greenfield project on v4. |
| `multer` / body streaming for uploads | The entire point of presigned URLs is that `.tar` files bypass the API entirely and go direct to MinIO. Never add upload buffering middleware — it defeats the architecture. |
| `helmet` | Low priority for an internal API with no browser clients and no HTML. Add later if the API is ever exposed to the public internet. |
| `morgan` / logging libraries | `console.log` is sufficient for a Portainer-deployed container. Logs surface in Portainer's log viewer. Add structured logging only if log aggregation is added later. |
| Docker Compose in the API repo | Project spec says API deploys as single container in Portainer alongside a separately running MinIO. No `docker-compose.yml` needed in this repo. |
## Confidence Levels
| Area | Confidence | Reason |
|---|---|---|
| Bun + Express compatibility | HIGH | Verified: bun.sh official compatibility docs explicitly list Express as working; `node:http` fully implemented |
| Bun TypeScript setup | HIGH | Verified: exact tsconfig from bun.sh/docs/typescript official docs |
| Docker — oven/bun:1 image | HIGH | Verified: official Dockerfile pattern from bun.sh/guides/ecosystem/docker |
| MinIO SDK (minio package) | MEDIUM | Package identity and API pattern verified from training data + partial GitHub access; exact current version number not confirmed (run `bun add minio` to get latest) |
| MinIO presigned URL API | MEDIUM | Method names (`presignedGetObject`, `presignedPutObject`, `statObject`, `getObject`, `putObject`, `bucketExists`) are stable SDK surface consistent across versions; signatures from training data — verify with installed type definitions |
| Express 5 version | MEDIUM | Official Express site confirmed v5.x is current and requires Node 18+; exact patch version not extracted |
| Two-token auth middleware | HIGH | Pure Express pattern, no external dependencies, verified Express 5 routing behavior |
| Alpine vs Debian image | MEDIUM | Alpine risk from musl libc is a known ecosystem pattern; no specific Bun+Alpine issue reported |
## Sources
- Bun Node.js Compatibility: https://bun.sh/docs/runtime/nodejs-apis (verified June 2026)
- Bun TypeScript docs: https://bun.sh/docs/typescript (verified June 2026)
- Bun Docker guide: https://bun.sh/guides/ecosystem/docker (verified June 2026)
- Bun HTTP server docs: https://bun.sh/docs/api/http (verified June 2026)
- Bun Express guide: https://bun.sh/docs/ecosystem/express (verified June 2026)
- Bun lockfile docs: https://bun.sh/docs/install/lockfile (verified June 2026)
- Express 5 API: https://expressjs.com/en/5x/api.html (verified June 2026)
- MinIO JS SDK: https://github.com/minio/minio-js (MEDIUM — only partial access)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
