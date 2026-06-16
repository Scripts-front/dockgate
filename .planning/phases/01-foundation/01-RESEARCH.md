# Phase 1: Foundation - Research

**Researched:** 2026-06-16
**Domain:** Bun + Express 5 + MinIO SDK + Docker (greenfield scaffold)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** MinIO acessivel apenas via rede interna Docker (ex: `minio:9000`). `useSSL: false`.
- **D-02:** `MINIO_PUBLIC_ENDPOINT` e obrigatorio desde o inicio. Cliente MinIO usa `MINIO_ENDPOINT` (hostname interno); URLs pre-assinadas substituem o host por `MINIO_PUBLIC_ENDPOINT` como base.
- **D-03:** Env vars obrigatorias (fail-fast): `DOWNLOAD_TOKEN`, `UPLOAD_TOKEN`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`.
- **D-04:** `timingSafeEqual` requer SHA-256 hash de ambos os lados (`crypto.createHash('sha256')`), nao comparacao direta de string.
- **D-05:** Dois middlewares separados: `requireDownloadToken` e `requireUploadToken`.
- **D-06:** Regex `[a-zA-Z0-9._-]` para `:name` e `version`; rejeitar `/`, `\`, `..`, null bytes com 400.
- **D-07:** Porta configuravel via `PORT` com fallback para `3000`.
- **D-08:** Estrutura de projeto por camada (config.ts, lib/minio.ts, middleware/auth.ts, middleware/sanitize.ts, routes/health.ts, index.ts).

### Claude's Discretion

- Formato exato das mensagens de erro de startup (clareza > formato especifico)
- Log format (console.log simples)
- Estrategia de retry na conexao MinIO (INFRA-03 diz fail-fast, sem retry)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | `GET /health` retorna status da API e conectividade com MinIO | Express 5 route, MinIO `bucketExists()` |
| INFRA-02 | Container Docker com `oven/bun:1` Debian, usuario nao-root `bun`, ENTRYPOINT exec-form | Verified: oven/bun:1 = Debian 13 (trixie), bun 1.3.14 |
| INFRA-03 | API inicia conexao com MinIO no startup e falha rapido se bucket nao existir | `bucketExists()` em async IIFE antes de `app.listen()` |
| INFRA-04 | Dockerfile multi-stage com separacao dev/prod | Multi-stage pattern from CLAUDE.md |
| SEC-01 | `timingSafeEqual` em endpoints de leitura protegidos | Verified via Bun: `node:crypto` fully implemented |
| SEC-02 | `timingSafeEqual` em endpoints de escrita | Same middleware pattern |
| SEC-03 | Validacao de `:name` e `version` contra regex seguro | Regex `^[a-zA-Z0-9._-]+$` + null byte check |
| SEC-04 | Fail-fast no startup se env var ausente | `config.ts` validation before server start |
| SEC-05 | Tokens nao aparecem em logs | Middleware que redige query params antes de qualquer `console.log` |
| DATA-01 | Schema de `latest.json`: `{ schema: 1, version, sha256, size, publishedAt }` | TypeScript interface definition |
| DATA-02 | Estrutura MinIO: `{appName}/{version}.tar` e `{appName}/latest.json` | Path building helpers |
</phase_requirements>

---

## Summary

Phase 1 builds the complete project scaffold for DockGate: environment validation, MinIO connectivity check, authentication middlewares, input sanitization, and a single `GET /health` endpoint. The stack is Bun 1.3.14 + Express 5.2.1 + MinIO SDK 8.0.7 — all verified against npm registry and Docker Hub.

The most important non-obvious constraint is the two-hostname pattern for MinIO: the SDK client uses the internal Docker hostname (`MINIO_ENDPOINT`, hostname-only, no protocol) while presigned URLs must expose the public hostname (`MINIO_PUBLIC_ENDPOINT`, full URL with protocol). The SDK builds presigned URLs from its own endpoint config; there is no built-in override — the URL string must be rewritten after generation. This is not used in Phase 1 but the env var must be declared and validated here per D-02.

The `timingSafeEqual` approach requires SHA-256 hashing both sides first (verified working in Bun). The SIGTERM handling requires ENTRYPOINT exec-form (not shell-form) in the Dockerfile. Express 5 automatically propagates rejected promises from async handlers to error middleware — no `try/catch` wrappers needed in route handlers.

**Primary recommendation:** Build the scaffold layer by layer — config validation first (process.exit on missing vars), then MinIO client init + bucket check, then middlewares, then the health route, then Express bootstrap. Each layer is independently testable.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun` (runtime) | 1.3.14 | TypeScript runtime, no compile step | Project constraint; runs `.ts` directly |
| `express` | 5.2.1 | HTTP framework with middleware | Project constraint; Express 5 handles async errors natively |
| `minio` | 8.0.7 | MinIO/S3 object storage client | Project constraint; built-in TypeScript types since 7.1.0 |

[VERIFIED: npm registry — minio@8.0.7 published 2026-02-27, express@5.2.1 published 2026-05-19]

### Dev / Type Dependencies

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bun-types` | 1.3.14 | Bun global type definitions | Required for `Bun.*` APIs in TypeScript |
| `@types/express` | 5.0.6 | Express type definitions for v5 | Full IntelliSense on `req.params`, `req.query`, `req.headers` |
| `typescript` | 6.0.3 | Language server / type checking | `bun --check` or `tsc --noEmit` for type validation |

[VERIFIED: npm registry]

### Not Needed

| Library | Why Not (confirmed) |
|---------|-------------------|
| `dotenv` | Bun loads `.env` natively [VERIFIED: CLAUDE.md] |
| `@types/minio` | Bundled types since 7.1.0 [VERIFIED: minio-js README] |
| `ts-node` / `tsx` | Node.js runners; Bun runs `.ts` directly [VERIFIED: CLAUDE.md] |

### Installation

```bash
bun add express minio
bun add -d bun-types @types/express typescript
```

---

## Architecture Patterns

### Recommended Project Structure (from D-08)

```
src/
├── config.ts          # Env var validation — process.exit() if missing
├── lib/
│   └── minio.ts       # MinIO client singleton + bucket verification
├── middleware/
│   ├── auth.ts        # requireDownloadToken, requireUploadToken
│   └── sanitize.ts    # validateAppName, validateVersion
├── routes/
│   └── health.ts      # GET /health
└── index.ts           # Express app bootstrap
```

Supporting files:

```
Dockerfile             # Multi-stage Bun build
.dockerignore
bun.lock               # Bun lockfile (commit to git)
tsconfig.json
package.json
```

### Pattern 1: Config Validation (Fail-Fast)

**What:** Read all env vars at startup, fail immediately with `process.exit(1)` and a clear error if any are missing. Runs before any server initialization.

**When to use:** Always — this is INFRA-03 + SEC-04.

```typescript
// src/config.ts
// Source: project decisions D-03
const required = [
  'DOWNLOAD_TOKEN',
  'UPLOAD_TOKEN',
  'MINIO_ENDPOINT',
  'MINIO_PUBLIC_ENDPOINT',
  'MINIO_BUCKET',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
] as const

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

export const config = {
  downloadToken: process.env.DOWNLOAD_TOKEN!,
  uploadToken: process.env.UPLOAD_TOKEN!,
  minioEndpoint: process.env.MINIO_ENDPOINT!,
  minioPublicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT!,
  minioBucket: process.env.MINIO_BUCKET!,
  minioAccessKey: process.env.MINIO_ACCESS_KEY!,
  minioSecretKey: process.env.MINIO_SECRET_KEY!,
  port: parseInt(process.env.PORT ?? '3000', 10),
} as const
```

### Pattern 2: MinIO Client Initialization

**What:** Instantiate a singleton MinIO client. The `endPoint` must be hostname-only (no `http://` prefix). Port must be explicit.

**Critical:** The SDK validates `endPoint` with `isValidDomain(endpoint) || isValidIP(endpoint)` — passing a URL like `http://minio:9000` throws `InvalidEndpointError`.

```typescript
// src/lib/minio.ts
// Source: minio-js README + src/internal/client.ts constructor (verified via gh api)
import * as Minio from 'minio'
import { config } from '../config.ts'

export const minioClient = new Minio.Client({
  endPoint: config.minioEndpoint,  // hostname only: 'minio' or '192.168.1.10'
  port: 9000,                       // explicit port
  useSSL: false,                    // per D-01: internal Docker network, no TLS
  accessKey: config.minioAccessKey,
  secretKey: config.minioSecretKey,
})

export async function verifyMinioConnection(): Promise<void> {
  const exists = await minioClient.bucketExists(config.minioBucket)
  if (!exists) {
    console.error(`[startup] MinIO bucket '${config.minioBucket}' does not exist`)
    process.exit(1)
  }
}
```

**Note on port:** If `MINIO_ENDPOINT` might include a port (e.g., `minio:9000`), parse it:

```typescript
// Parse optional port from MINIO_ENDPOINT
const [endPointHost, endPointPortStr] = config.minioEndpoint.split(':')
const minioPort = endPointPortStr ? parseInt(endPointPortStr, 10) : 9000
```

### Pattern 3: Timing-Safe Token Comparison (D-04)

**What:** Both tokens are compared using SHA-256 hashes through `timingSafeEqual` to prevent timing attacks. Raw string comparison of different-length strings short-circuits, leaking length information.

**Verified:** `timingSafeEqual(sha256('a'), sha256('b'))` returns `false` correctly in Bun 1.3.2 (local) and 1.3.14 (in container).

```typescript
// src/middleware/auth.ts
// Source: D-04 decision + verified in Bun with node:crypto
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.ts'

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function makeTokenMiddleware(expectedToken: string) {
  const expectedHash = sha256(expectedToken)
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? req.query.token as string
    if (!token || !timingSafeEqual(sha256(token), expectedHash)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  }
}

export const requireDownloadToken = makeTokenMiddleware(config.downloadToken)
export const requireUploadToken = makeTokenMiddleware(config.uploadToken)
```

### Pattern 4: Input Sanitization (SEC-03 / D-06)

**What:** Validate `:name` and `version` parameters against an allowlist regex before any MinIO call. Path traversal in MinIO object keys could expose or overwrite arbitrary objects.

**The check:** Allowlist `[a-zA-Z0-9._-]` catches `/`, `\`, `..`, null bytes, and all other special characters in one step.

```typescript
// src/middleware/sanitize.ts
// Source: D-06 decision
import type { Request, Response, NextFunction } from 'express'

const SAFE_PARAM = /^[a-zA-Z0-9._-]+$/

export function validateAppName(req: Request, res: Response, next: NextFunction): void {
  const { name } = req.params
  if (!name || !SAFE_PARAM.test(name) || name.includes('..')) {
    res.status(400).json({ error: 'Invalid app name' })
    return
  }
  next()
}

export function validateVersion(req: Request, res: Response, next: NextFunction): void {
  const version = req.params.version ?? (req.query.version as string)
  if (!version || !SAFE_PARAM.test(version) || version.includes('..')) {
    res.status(400).json({ error: 'Invalid version' })
    return
  }
  next()
}
```

**Note:** The SAFE_PARAM regex `^[a-zA-Z0-9._-]+$` already excludes `/` and `\`. The `includes('..')` check is redundant given the regex (consecutive dots pass the character class but `..` only forms traversal with `/`), but D-06 requires explicit rejection so include it for defense-in-depth.

### Pattern 5: Token Redaction from Logs (SEC-05)

**What:** Log requests without exposing token values. Tokens may appear in query strings (`?token=xxx`).

```typescript
// src/middleware/log.ts (or in index.ts)
import type { Request, Response, NextFunction } from 'express'

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Redact token from query string before logging
  const sanitizedUrl = req.url.replace(/([?&]token=)[^&]*/gi, '$1[REDACTED]')
  console.log(`${req.method} ${sanitizedUrl}`)
  next()
}
```

### Pattern 6: Health Endpoint

**What:** Check MinIO reachability synchronously on each request via `bucketExists()`. Return 200 with `{ ok: true, minio: "connected" }` or 503 with `{ ok: false, minio: "unreachable" }`.

```typescript
// src/routes/health.ts
// Source: INFRA-01 requirement
import { Router } from 'express'
import { minioClient } from '../lib/minio.ts'
import { config } from '../config.ts'

export const healthRouter = Router()

healthRouter.get('/health', async (_req, res) => {
  try {
    const alive = await minioClient.bucketExists(config.minioBucket)
    if (alive) {
      res.json({ ok: true, minio: 'connected' })
    } else {
      res.status(503).json({ ok: false, minio: 'unreachable' })
    }
  } catch {
    res.status(503).json({ ok: false, minio: 'unreachable' })
  }
})
```

**Note:** Express 5 async error propagation means the outer `try/catch` is strictly required here only for the 503 response logic. Without it, an uncaught rejection would propagate to the global error handler. Keeping the try/catch is clearer and correct.

### Pattern 7: Express Bootstrap (index.ts)

**What:** Wire config validation, MinIO startup check, middleware, routes, and `app.listen()` in a controlled sequence.

```typescript
// src/index.ts
import './config.ts'  // Runs fail-fast validation at import time
import express from 'express'
import { verifyMinioConnection } from './lib/minio.ts'
import { requestLogger } from './middleware/log.ts'
import { healthRouter } from './routes/health.ts'

const app = express()
app.use(express.json())
app.use(requestLogger)
app.use(healthRouter)

// Error handler (Express 5 — 4 params required)
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err)
  res.status(500).json({ error: 'Internal server error' })
})

await verifyMinioConnection()

const port = parseInt(process.env.PORT ?? '3000', 10)
app.listen(port, () => {
  console.log(`[startup] DockGate listening on :${port}`)
})
```

**Note:** Importing `config.ts` at the top triggers `process.exit(1)` immediately if any env var is absent. `verifyMinioConnection()` is awaited before `app.listen()` — the server never accepts requests if MinIO is unreachable.

### Pattern 8: Presigned URL Hostname Replacement (Phase 2 prep)

**What:** The MinIO SDK builds presigned URLs using the client's `endPoint`/`port`/`protocol`. There is no built-in option to use a different hostname. [VERIFIED: minio-js src/signing.ts line 324: `return request.protocol + '//' + request.headers.host + path + ...`]

For Phase 2, the correct approach is to replace the origin of the returned URL:

```typescript
// Helper for Phase 2 — not used in Phase 1 but pattern validated here
function toPublicUrl(internalUrl: string, publicEndpoint: string): string {
  const url = new URL(internalUrl)
  const pub = new URL(publicEndpoint)
  url.protocol = pub.protocol
  url.hostname = pub.hostname
  url.port = pub.port
  return url.toString()
}
```

### Pattern 9: TypeScript / Data Schemas (DATA-01, DATA-02)

```typescript
// src/lib/schemas.ts — shared type definitions
export interface LatestManifest {
  schema: 1
  version: string
  sha256: string
  size: number
  publishedAt: string  // ISO 8601
}

// MinIO object key builders (DATA-02)
export function tarKey(appName: string, version: string): string {
  return `${appName}/${version}.tar`
}

export function latestKey(appName: string): string {
  return `${appName}/latest.json`
}
```

### Anti-Patterns to Avoid

- **`endPoint: 'http://minio:9000'`** — SDK validates endPoint with `isValidDomain()` which rejects URLs with protocol. Pass hostname only: `'minio'` or `'minio:9000'` (parsed separately). [VERIFIED: minio-js src/internal/helper.ts:83]
- **Raw string comparison for tokens** — `token === expected` is vulnerable to timing attacks. Always use SHA-256 + `timingSafeEqual`. [VERIFIED: D-04, Bun crypto verified]
- **`ENTRYPOINT ["sh", "-c", "bun run..."]`** — shell-form ENTRYPOINT means SIGTERM goes to the shell process, not Bun. Use exec-form: `ENTRYPOINT ["bun", "run", "src/index.ts"]`. [VERIFIED: CLAUDE.md]
- **`oven/bun:1-alpine`** — Alpine uses musl libc; Bun requires glibc and crashes on Alpine. [VERIFIED: STATE.md / CLAUDE.md]
- **Logging `req.query` directly** — query strings may contain `token=xxx`. Redact before logging.
- **`app.listen()` before `verifyMinioConnection()`** — server would accept requests before confirming MinIO is reachable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timing-safe comparison | Custom delay loop or constant-time string comparison | `crypto.timingSafeEqual` + SHA-256 | Edge cases: length leaks, branch prediction; `node:crypto` handles correctly |
| S3-compatible object storage client | Custom HTTP requests to MinIO | `minio` SDK 8.x | Handles presigned URL signing (SigV4), region discovery, connection pooling |
| TypeScript execution | `tsc` + `node` pipeline | `bun run src/index.ts` | Bun runs `.ts` directly; no build step needed |
| `.env` file loading | `dotenv` package | Native Bun `.env` support | Bun loads `.env` automatically in development |

**Key insight:** The MinIO SDK handles all AWS SigV4 signing complexity for presigned URLs. Implementing this manually would be hundreds of lines and nearly impossible to get right.

---

## Runtime State Inventory

> SKIPPED: This is a greenfield phase. No existing runtime state to audit.

---

## Common Pitfalls

### Pitfall 1: MinIO EndPoint with Protocol Prefix

**What goes wrong:** `new Minio.Client({ endPoint: 'http://minio:9000', ... })` throws `InvalidEndpointError` at runtime.

**Why it happens:** The SDK validates endPoint with `isValidDomain(endpoint) || isValidIP(endpoint)`. A URL string starting with `http://` fails both checks.

**How to avoid:** Pass hostname only: `endPoint: 'minio'` and `port: 9000` separately. If the env var contains the port (e.g., `minio:9000`), split on `:` to extract host and port.

**Warning signs:** `InvalidEndpointError: Invalid endPoint` in startup logs.

[VERIFIED: minio-js src/internal/helper.ts:83-84, src/internal/client.ts:270-272]

### Pitfall 2: timingSafeEqual with Different-Length Buffers

**What goes wrong:** `timingSafeEqual(Buffer.from(a), Buffer.from(b))` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` if `a.length !== b.length`.

**Why it happens:** The function requires same-length buffers to prevent timing attacks.

**How to avoid:** Hash both sides with SHA-256 first. SHA-256 always produces 32-byte digests. `timingSafeEqual(sha256(a), sha256(b))` is always comparing 32-byte buffers.

**Warning signs:** Runtime `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` error — most likely during testing with mismatched tokens.

[VERIFIED: D-04 decision, verified in Bun runtime locally]

### Pitfall 3: ENTRYPOINT Shell Form Breaks SIGTERM

**What goes wrong:** Portainer sends SIGTERM to stop the container; Bun never receives it; Docker waits for the `SIGKILL_TIMEOUT` (10s default), then hard-kills the container.

**Why it happens:** `ENTRYPOINT ["sh", "-c", "bun ..."]` makes PID 1 the shell. Shells don't forward signals to child processes by default.

**How to avoid:** Use exec-form: `ENTRYPOINT ["bun", "run", "src/index.ts"]`. Bun becomes PID 1 and handles SIGTERM directly.

**Warning signs:** Slow container shutdown (10+ seconds instead of instant) in Portainer.

[VERIFIED: CLAUDE.md Dockerfile pattern]

### Pitfall 4: Presigned URLs Use Internal Hostname

**What goes wrong:** Client receives presigned URL like `http://minio:9000/bucket/app/1.0.0.tar` — the hostname `minio` is a Docker-internal DNS name, unreachable from outside the Docker network.

**Why it happens:** The MinIO SDK builds presigned URLs using its configured `endPoint`/`port`/`protocol`. [VERIFIED: minio-js src/signing.ts:324]

**How to avoid:** After generating a presigned URL, replace the origin with `MINIO_PUBLIC_ENDPOINT`. See Pattern 8 above. This is why D-02 makes `MINIO_PUBLIC_ENDPOINT` a required env var from Phase 1.

**Warning signs:** Clients getting `curl: (6) Could not resolve host: minio` when trying to use presigned URLs.

[Phase 2 concern — declare the env var now, use it in Phase 2]

### Pitfall 5: Server Starts Before MinIO Check

**What goes wrong:** `app.listen()` is called, then `verifyMinioConnection()` fails, process exits — but Portainer health checks may already see the port open and consider the container healthy.

**Why it happens:** If `await verifyMinioConnection()` comes after `app.listen()`, there's a race window.

**How to avoid:** Always `await verifyMinioConnection()` BEFORE calling `app.listen()`.

### Pitfall 6: Express 5 Route Wildcard Syntax Change

**What goes wrong:** `app.get('/*', ...)` from Express 4 becomes `app.get('/*splat', ...)` in Express 5. The old syntax may still work but is deprecated.

**Why it happens:** Express 5 changed route syntax — unnamed wildcards `*` are now named `*splat`.

**How to avoid:** For Phase 1, only `/health` is used — no wildcards needed. Document for Phase 2 when `:name` routes are added.

[VERIFIED: Express 5 migration guide at expressjs.com/en/guide/migrating-5.html]

---

## Code Examples

Verified patterns from official sources:

### MinIO Client Init (correct)
```typescript
// Source: minio-js README (verified via gh api)
import * as Minio from 'minio'

const minioClient = new Minio.Client({
  endPoint: 'minio',      // hostname ONLY — no protocol, no port here
  port: 9000,
  useSSL: false,
  accessKey: 'accessKey',
  secretKey: 'secretKey',
})
```

### bucketExists Usage
```typescript
// Source: minio-js README + src/internal/client.ts:1029
const exists: boolean = await minioClient.bucketExists('my-bucket')
```

### presignedGetObject Signature
```typescript
// Source: minio-js src/internal/client.ts:2984 (verified via gh api)
// async presignedGetObject(
//   bucketName: string,
//   objectName: string,
//   expires?: number,         // seconds, default = max (7 days)
//   respHeaders?: PreSignRequestParams | Date,
//   requestDate?: Date,
// ): Promise<string>

const url = await minioClient.presignedGetObject(bucket, objectKey, 3600)
```

### presignedPutObject Signature
```typescript
// Source: minio-js src/internal/client.ts:3015 (verified via gh api)
// async presignedPutObject(
//   bucketName: string,
//   objectName: string,
//   expires?: number,
// ): Promise<string>

const uploadUrl = await minioClient.presignedPutObject(bucket, objectKey, 900)
```

### Recommended tsconfig.json
```json
{
  "compilerOptions": {
    "module": "Preserve",
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
    "types": ["bun"],
    "noEmit": true,
    "strict": true
  }
}
```
[VERIFIED: CLAUDE.md / bun.sh/docs/typescript]

### Dockerfile Multi-Stage Pattern
```dockerfile
# Stage 1: Install dependencies (cached layer)
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Stage 2: Final image — production only
FROM oven/bun:1
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json tsconfig.json ./
USER bun
EXPOSE 3000
ENTRYPOINT ["bun", "run", "src/index.ts"]
```
[VERIFIED: CLAUDE.md Dockerfile pattern]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|---------|
| Docker | INFRA-02, INFRA-04 | Yes | 29.4.1 | — |
| `oven/bun:1` image | INFRA-02 | Yes (pulled) | Bun 1.3.14 / Debian 13 | — |
| Bun runtime | Dev execution | Yes | 1.3.2 | — |
| MinIO server | INFRA-01, INFRA-03 | External (not in repo) | Existing VPS instance | Dev: use `docker run minio/minio` locally |
| npm registry | Package install | Yes | — | — |

**Missing dependencies with no fallback:** None that block implementation.

**Missing dependencies with fallback:**
- MinIO server not locally available — for dev/test, run `docker run -p 9000:9000 minio/minio server /data` locally.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| `@types/minio` separate package | Built-in types in `minio` >= 7.1.0 | minio@7.1.0 | Remove `@types/minio` from dev deps |
| Express 4 `.catch(next)` in async routes | Express 5 auto-propagates rejected promises | Express 5.0.0 | Cleaner async handlers |
| `app.del()` | `app.delete()` | Express 5 | Remove deprecated alias |
| `res.send(obj, 200)` | `res.status(200).send(obj)` | Express 5 | Breaking change |
| `oven/bun:1-alpine` | `oven/bun:1` (Debian) | Known musl issue | Alpine crashes Bun |
| `nodemon` for watch | `bun --hot src/index.ts` | Bun ecosystem | No extra package needed |

---

## Project Constraints (from CLAUDE.md)

| Directive | Type | Applies To |
|-----------|------|-----------|
| Bun + Express 5 + TypeScript — fixed | Required stack | All phases |
| `minio` SDK (not `@aws-sdk/client-s3`) | Required package | Storage layer |
| No JWT, no `passport`, no `dotenv` | Forbidden packages | All phases |
| No `oven/bun:1-alpine` (musl crash) | Forbidden image | Docker |
| `timingSafeEqual` for token comparison | Required pattern | Auth middleware |
| `"module": "Preserve"`, `"moduleResolution": "bundler"` | Required tsconfig | TypeScript config |
| `ENTRYPOINT` exec-form | Required pattern | Dockerfile |
| No file upload proxy (presigned only) | Architectural constraint | Upload routes |
| No multer / body streaming for uploads | Forbidden package | Upload routes |
| No `morgan` / logging libraries | Forbidden package | Logging |
| Commit messages: `<emoji> <type>: <description>` | Required format | Git commits |
| No `Co-Authored-By: Claude` in commits | Forbidden | Git commits |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|--------------|
| A1 | `MINIO_ENDPOINT` env var contains hostname-only (e.g., `minio`) not a full URL | Pattern 2 | If it contains port (`minio:9000`), splitting is needed; plan includes the split fallback |
| A2 | MinIO bucket already exists on the external VPS MinIO instance | INFRA-03 | If bucket doesn't exist, `verifyMinioConnection()` exits the process — that's the desired behavior per INFRA-03 |

**All other claims in this research were verified or cited.**

---

## Open Questions

1. **Does `MINIO_ENDPOINT` include the port?**
   - What we know: D-03 defines it as `MINIO_ENDPOINT`, description says "hostname interno"
   - What's unclear: Whether the user will set it as `minio` or `minio:9000`
   - Recommendation: Parse defensively — split on `:` and handle both forms in `config.ts`

2. **What MinIO port is the existing VPS instance running on?**
   - What we know: Default MinIO port is 9000 (API) and 9001 (console)
   - What's unclear: Whether it's running on 9000 or a custom port
   - Recommendation: Make port configurable via `MINIO_PORT` env var with default `9000`, or parse from `MINIO_ENDPOINT`

---

## Validation Architecture

> `nyquist_validation` is `false` in config.json — this section is SKIPPED per workflow config.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `timingSafeEqual` + SHA-256; Bearer token or query param |
| V3 Session Management | No | Stateless API — no sessions |
| V4 Access Control | Yes | Two middlewares: `requireDownloadToken`, `requireUploadToken` |
| V5 Input Validation | Yes | Allowlist regex `^[a-zA-Z0-9._-]+$` + `..` check |
| V6 Cryptography | Yes | `node:crypto` `timingSafeEqual` — never hand-rolled |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-------------------|
| Path traversal via `:name` or `version` | Tampering | Allowlist regex before any MinIO key construction |
| Timing attack on token comparison | Spoofing | SHA-256 hash + `timingSafeEqual` |
| Token exposure in logs | Information Disclosure | Query param redaction middleware (SEC-05) |
| Container runs as root | Elevation of Privilege | `USER bun` in Dockerfile (non-root, included in `oven/bun` image) |
| Missing env var reveals partial config | Information Disclosure | `process.exit(1)` before any listener — no partial state exposed |

---

## Sources

### Primary (HIGH confidence)

- `minio-js` source via GitHub API (`gh api repos/minio/minio-js/contents/...`) — constructor, `presignedGetObject`, `presignedPutObject`, `presignedUrl`, `getRequestOptions`, `presignSignatureV4`, `isValidEndpoint` signatures (verified 2026-06-16)
- npm registry (`npm view minio version`, `npm view express version`) — current versions (verified 2026-06-16)
- Docker Hub — `oven/bun:1` = Debian 13 (trixie), Bun 1.3.14 (verified by `docker run` 2026-06-16)
- Bun runtime local — `timingSafeEqual` + SHA-256 pattern verified working (Bun 1.3.2 local, 1.3.14 in container)
- CLAUDE.md — stack constraints, Dockerfile pattern, tsconfig directives

### Secondary (MEDIUM confidence)

- minio-js README (via GitHub API) — client init pattern, `bucketExists` usage, TypeScript types bundled since 7.1.0
- expressjs.com/en/guide/migrating-5.html — Express 5 breaking changes, async error handling, wildcard route syntax (verified via WebFetch 2026-06-16)

### Tertiary (LOW confidence)

- None — all critical claims verified via tooling in this session

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry and Docker Hub
- Architecture: HIGH — patterns derived from locked decisions (CONTEXT.md) and verified SDK behavior
- Pitfalls: HIGH — most verified against minio-js source code directly
- Security patterns: HIGH — crypto verified working in Bun runtime

**Research date:** 2026-06-16
**Valid until:** 2026-09-16 (stable stack — minio and express have slow release cadence)
