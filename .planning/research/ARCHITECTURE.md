# Architecture Research — DockGate

**Domain:** Stateless private artifact distribution API
**Researched:** 2026-06-16
**Overall confidence:** HIGH (stable, well-documented patterns; Bun env behavior confirmed from official docs)

---

## Recommended Folder Structure

```
dockgate/
├── src/
│   ├── index.ts              # Entry point: create app, attach middleware, start server
│   ├── app.ts                # Express app factory (exported for testability)
│   ├── config.ts             # Env var loading + validation (fail-fast on missing vars)
│   │
│   ├── minio/
│   │   └── client.ts         # MinIO Client singleton — initialized once, exported
│   │
│   ├── middleware/
│   │   ├── auth.ts           # requireDownloadToken / requireUploadToken factories
│   │   └── errorHandler.ts   # Global Express error handler (last middleware)
│   │
│   ├── routes/
│   │   └── apps.ts           # All /apps/:name/* routes registered on an Express Router
│   │
│   └── handlers/
│       ├── getLatest.ts      # GET /apps/:name/latest
│       ├── getDownload.ts    # GET /apps/:name/download
│       ├── postUpload.ts     # POST /apps/:name/upload
│       └── putLatest.ts      # PUT /apps/:name/latest
│
├── Dockerfile
├── .env                      # Local dev only — NOT committed
├── .env.example              # Committed template
├── package.json
├── tsconfig.json
└── bunfig.toml               # Optional: disable .env auto-load in production container
```

**Why this layout:**
- `handlers/` are thin — one file per endpoint, each does exactly one thing.
- `routes/apps.ts` is the only place middleware is wired to handlers — keeps routing declarative.
- `minio/client.ts` is a module, not a class. One file, one export. Impossible to accidentally create two clients.
- `config.ts` is the single gate for env vars. If a required var is missing, the process exits before the server binds. No silent failures at request time.

---

## Component Boundaries

| Module | Responsibility | Inputs | Outputs |
|--------|---------------|--------|---------|
| `config.ts` | Read + validate all env vars at startup | `process.env` | Typed config object, process.exit on missing required vars |
| `minio/client.ts` | Create and export the single MinIO Client instance | Config (endpoint, credentials) | `Client` instance |
| `middleware/auth.ts` | Validate token on incoming request | `req.query.token` or `Authorization` header | Calls `next()` or returns 401 |
| `middleware/errorHandler.ts` | Convert unhandled errors into JSON responses | Express error object | JSON `{error: string}` with appropriate status |
| `routes/apps.ts` | Declare route tree, wire auth middleware to handlers | Express Router | Mounted at `/apps` in `app.ts` |
| `handlers/getLatest.ts` | Fetch `latest.json` from MinIO, return version | App name from route param | `{version: string}` JSON |
| `handlers/getDownload.ts` | Validate token, check object exists, return presigned GET URL | App name + version query param | `{url: string}` JSON |
| `handlers/postUpload.ts` | Validate upload token, generate presigned PUT URL | App name + version query param | `{url: string, expiresIn: number}` JSON |
| `handlers/putLatest.ts` | Validate upload token, write `latest.json` to MinIO | App name + version body | `{ok: true}` JSON |

**Nothing outside `minio/client.ts` imports the `Client` constructor.** All handlers receive the singleton client by importing it. No dependency injection framework needed at this scale.

---

## Data Flow

### GET /apps/:name/latest (no auth required)

```
Client request
  → Express router matches /apps/:name/latest
  → No auth middleware on this route
  → getLatest handler
      → minioClient.getObject(BUCKET, "{name}/latest.json")
      → Parse JSON: { version: "1.2.3" }
  → 200 { version: "1.2.3" }
```

### GET /apps/:name/download?version=X&token=Y

```
Client request
  → Express router matches /apps/:name/download
  → requireDownloadToken middleware
      → reads req.query.token
      → compares to config.DOWNLOAD_TOKEN (constant-time comparison)
      → mismatch → 401 { error: "Unauthorized" } [STOP]
  → getDownload handler
      → minioClient.statObject(BUCKET, "{name}/{version}.tar")
          → throws S3-style error if not found → 404 { error: "Version not found" } [STOP]
      → minioClient.presignedGetObject(BUCKET, "{name}/{version}.tar", EXPIRY_SECONDS)
      → returns presigned URL string
  → 200 { url: "https://minio.host/bucket/..." }
```

### POST /apps/:name/upload?version=X (CI/CD)

```
CI/CD request
  → Express router matches /apps/:name/upload
  → requireUploadToken middleware
      → reads Authorization header: "Bearer <token>"  OR  req.query.token
      → compares to config.UPLOAD_TOKEN
      → mismatch → 401 [STOP]
  → postUpload handler
      → Validates version format (semver-like, non-empty)
      → minioClient.presignedPutObject(BUCKET, "{name}/{version}.tar", EXPIRY_SECONDS)
      → returns presigned PUT URL
  → 200 { url: "https://minio.host/...", expiresIn: 3600 }

CI/CD then PUTs the .tar directly to MinIO — API is never in the file transfer path.
```

### PUT /apps/:name/latest (CI/CD after upload)

```
CI/CD request
  → Express router matches /apps/:name/latest
  → requireUploadToken middleware → validates UPLOAD_TOKEN
  → putLatest handler
      → reads { version } from request body
      → Validates version is non-empty string
      → Serializes { version } as JSON Buffer
      → minioClient.putObject(BUCKET, "{name}/latest.json", buffer, size, { contentType: "application/json" })
  → 200 { ok: true, app: name, version }
```

### GET /health

```
Any request
  → No auth
  → healthHandler
      → minioClient.bucketExists(BUCKET)
          → false or error → 503 { ok: false, minio: "unreachable" }
      → true → 200 { ok: true, minio: "connected" }
```

**Key principle:** The API never buffers file bytes. Every file-related endpoint returns a URL. The MinIO client only transfers JSON payloads (latest.json) — which are tiny.

---

## MinIO Integration Pattern

### Client initialization (`src/minio/client.ts`)

The `minio` npm package's `Client` class manages an internal HTTP agent with connection reuse. There is no explicit connection pooling to configure — the client handles this internally via Node.js/Bun's HTTP keep-alive. One singleton per process is the correct pattern.

```typescript
// src/minio/client.ts
import { Client } from "minio";
import { config } from "../config.js";

export const minioClient = new Client({
  endPoint: config.MINIO_ENDPOINT,   // hostname only, e.g. "minio.internal"
  port: config.MINIO_PORT,           // number, e.g. 9000
  useSSL: config.MINIO_USE_SSL,      // boolean
  accessKey: config.MINIO_ACCESS_KEY,
  secretKey: config.MINIO_SECRET_KEY,
});
```

**Why singleton:** The `Client` instance is stateless in terms of request data — it holds only connection configuration and reuses HTTP connections internally. Creating one per request would recreate the HTTP agent on every call, defeating keep-alive and adding ~1ms of overhead per request.

**No need for:** connection pool libraries, `pg`-style pool management, or lifecycle hooks. The MinIO client self-manages.

### Key MinIO methods used

| Method | Purpose | Returns |
|--------|---------|---------|
| `client.presignedGetObject(bucket, objectName, expiry)` | Generate download URL | `Promise<string>` |
| `client.presignedPutObject(bucket, objectName, expiry)` | Generate upload URL for CI/CD | `Promise<string>` |
| `client.getObject(bucket, objectName)` | Read latest.json stream | `Promise<stream.Readable>` |
| `client.putObject(bucket, objectName, stream, size, meta)` | Write latest.json | `Promise<UploadedObjectInfo>` |
| `client.statObject(bucket, objectName)` | Check if .tar exists before generating download URL | `Promise<BucketItemStat>` — throws on not found |
| `client.bucketExists(bucket)` | Health check | `Promise<boolean>` |

**Object naming convention:** `{appName}/{version}.tar` and `{appName}/latest.json`

Example: app "invoicer" version "2.1.0" → `invoicer/2.1.0.tar` and `invoicer/latest.json`

**Presigned URL expiry:** Use a short expiry for download URLs (e.g. 3600 seconds / 1 hour) — enough for a client script to download after receiving the URL. Upload URLs can be shorter (1800 seconds) since CI/CD uploads immediately.

---

## Auth Middleware Design

### Dual-token scheme

The system has exactly two tokens:
- `DOWNLOAD_TOKEN` — read access. Used by client update scripts.
- `UPLOAD_TOKEN` — write access. Used by CI/CD pipelines.

These are fixed secrets loaded at startup. No JWT parsing, no signing, no expiry logic.

### Token delivery

For client scripts (download): token via query param `?token=X` — easier to embed in shell scripts and `curl` commands without header manipulation.

For CI/CD (upload): token via `Authorization: Bearer X` header — conventional for programmatic callers and avoids token in server access logs.

Both middlewares accept both delivery mechanisms (query param and header) for flexibility, but the API docs should prescribe one canonical method per use case.

### Middleware factories

```typescript
// src/middleware/auth.ts
import type { RequestHandler } from "express";
import { timingSafeEqual, createHash } from "crypto";
import { config } from "../config.js";

function safeCompare(a: string, b: string): boolean {
  // Prevent timing attacks — pad to equal length before comparing
  const bufA = createHash("sha256").update(a).digest();
  const bufB = createHash("sha256").update(b).digest();
  return timingSafeEqual(bufA, bufB);
}

function extractToken(req: Parameters<RequestHandler>[0]): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const query = req.query.token;
  if (typeof query === "string") return query;
  return undefined;
}

export const requireDownloadToken: RequestHandler = (req, res, next) => {
  const token = extractToken(req);
  if (!token || !safeCompare(token, config.DOWNLOAD_TOKEN)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

export const requireUploadToken: RequestHandler = (req, res, next) => {
  const token = extractToken(req);
  if (!token || !safeCompare(token, config.UPLOAD_TOKEN)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};
```

**Why `timingSafeEqual` via hashing:** Direct string comparison (`===`) is vulnerable to timing attacks that can enumerate token characters. Hashing both sides to fixed-length buffers before comparing eliminates this. The hash is not for security of the token itself — it is purely to equalize comparison time.

**Why not a single `requireAuth(role)` factory:** Two named exports are more readable at the route definition level (`router.get("/download", requireDownloadToken, handler)`) and make it immediately obvious in code review which token protects which endpoint.

### Route wiring

```typescript
// src/routes/apps.ts
import { Router } from "express";
import { requireDownloadToken, requireUploadToken } from "../middleware/auth.js";
import { getLatest }  from "../handlers/getLatest.js";
import { getDownload } from "../handlers/getDownload.js";
import { postUpload }  from "../handlers/postUpload.js";
import { putLatest }   from "../handlers/putLatest.js";

export const appsRouter = Router({ mergeParams: true });

// Public
appsRouter.get("/:name/latest",            getLatest);

// Read-protected
appsRouter.get("/:name/download",          requireDownloadToken, getDownload);

// Write-protected
appsRouter.post("/:name/upload",           requireUploadToken, postUpload);
appsRouter.put("/:name/latest",            requireUploadToken, putLatest);
```

---

## Environment Variable Management

**Verdict:** No `dotenv` package needed. Bun loads `.env` automatically.

Bun reads `.env` at startup before any application code runs. The file is loaded in order: `.env`, then `.env.{NODE_ENV}`, then `.env.local`. All vars are available on `process.env` and `Bun.env`.

In the Docker container, set env vars via Docker/Portainer environment configuration — do not ship a `.env` file inside the image. Use `--no-env-file` flag or set `env = false` in `bunfig.toml` to disable `.env` loading in production if desired (rely purely on system env).

### Config module pattern (fail-fast validation)

```typescript
// src/config.ts
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

export const config = {
  PORT:               parseInt(process.env.PORT ?? "3000", 10),
  MINIO_ENDPOINT:     requireEnv("MINIO_ENDPOINT"),
  MINIO_PORT:         parseInt(process.env.MINIO_PORT ?? "9000", 10),
  MINIO_USE_SSL:      process.env.MINIO_USE_SSL === "true",
  MINIO_ACCESS_KEY:   requireEnv("MINIO_ACCESS_KEY"),
  MINIO_SECRET_KEY:   requireEnv("MINIO_SECRET_KEY"),
  MINIO_BUCKET:       requireEnv("MINIO_BUCKET"),
  DOWNLOAD_TOKEN:     requireEnv("DOWNLOAD_TOKEN"),
  UPLOAD_TOKEN:       requireEnv("UPLOAD_TOKEN"),
  PRESIGN_EXPIRY_GET: parseInt(process.env.PRESIGN_EXPIRY_GET ?? "3600", 10),
  PRESIGN_EXPIRY_PUT: parseInt(process.env.PRESIGN_EXPIRY_PUT ?? "1800", 10),
} as const;
```

**Why fail-fast:** A container that starts with a missing `DOWNLOAD_TOKEN` would silently accept any request (or crash mid-request). Crashing at startup with a clear message is always preferable — Portainer/container orchestration will surface the exit and the log message.

---

## Health Check Endpoint

```
GET /health
→ 200 { ok: true, minio: "connected", uptime: 42.1 }
→ 503 { ok: false, minio: "unreachable", error: "..." }
```

The health check calls `minioClient.bucketExists(config.MINIO_BUCKET)`. This exercises the actual MinIO connection — not just process liveliness. Portainer's health check probe and any upstream load balancer can use this endpoint.

Register it outside the `/apps` router, at the root level in `app.ts`:

```typescript
app.get("/health", healthHandler);
app.use("/apps", appsRouter);
```

**Why not `/apps/health`:** Health checks should be at a stable path that does not match the app routing pattern. Avoids accidental conflict if someone names an app "health".

---

## Error Handling Pattern

A single global error handler as the last Express middleware catches all errors passed via `next(err)` or thrown in async handlers.

```typescript
// src/middleware/errorHandler.ts
import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const status = err.statusCode ?? err.status ?? 500;
  const message = status < 500 ? err.message : "Internal server error";

  if (status >= 500) {
    console.error("[error]", req.method, req.path, err);
  }

  res.status(status).json({ error: message });
};
```

**Async handler wrapping:** Express 4.x does not catch async handler errors automatically. Use a thin wrapper or upgrade to Express 5 (which does handle async errors natively). For Express 4, wrap each handler:

```typescript
// src/lib/asyncHandler.ts
import type { RequestHandler } from "express";

export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

**MinIO-specific errors:** When `statObject` throws because an object does not exist, MinIO SDK throws an error with `code === "NoSuchKey"` (S3-compatible). Handlers should catch this and convert to a 404 with a clear message before it reaches the global error handler.

---

## Build Order

Implement in this sequence. Each step is independently testable before the next begins.

### Step 1 — Foundation (no MinIO yet)

1. `src/config.ts` — env loading with fail-fast validation
2. `src/app.ts` — bare Express app with `express.json()` middleware
3. `src/index.ts` — start server, log bound port
4. `src/middleware/errorHandler.ts` — global error handler, wired into app
5. `GET /health` returning `{ ok: true }` (MinIO check stub returns true)

**Gate:** `bun run src/index.ts` starts without errors. `curl localhost:3000/health` returns 200.

### Step 2 — MinIO client

6. `src/minio/client.ts` — singleton Client with config values
7. Wire real MinIO check into `/health` handler
8. Smoke-test presigned URL generation in isolation (a small script, not a route)

**Gate:** `/health` returns 200 with `minio: "connected"` when pointed at real MinIO.

### Step 3 — Auth middleware

9. `src/middleware/auth.ts` — both middlewares with timing-safe comparison
10. `src/routes/apps.ts` — router with all four routes, handlers stubbed to `res.json({ stub: true })`

**Gate:** Stub routes return 401 without token, 200 with correct token.

### Step 4 — Read handlers

11. `src/handlers/getLatest.ts` — reads `{name}/latest.json`, returns version
12. `src/handlers/getDownload.ts` — statObject check + presignedGetObject

**Gate:** GET /apps/testapp/latest returns real version from MinIO. GET /apps/testapp/download returns a valid presigned URL.

### Step 5 — Write handlers

13. `src/handlers/postUpload.ts` — presignedPutObject
14. `src/handlers/putLatest.ts` — putObject for latest.json

**Gate:** CI/CD simulation: POST upload → PUT to presigned URL from curl → PUT /apps/testapp/latest → GET /apps/testapp/latest shows new version.

### Step 6 — Packaging

15. `Dockerfile` — multi-stage or single-stage Bun image
16. `.env.example` — document all required vars
17. Final integration smoke test with container running

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Folder structure | HIGH | Standard Express/TypeScript patterns, no framework magic |
| MinIO singleton pattern | HIGH | Stable SDK, documented behavior, widely used pattern |
| MinIO method signatures | HIGH | `minio` SDK API stable for years; presignedGetObject/putObject/statObject well-documented |
| Bun env loading | HIGH | Confirmed from official Bun docs (bun.sh/docs/runtime/env) — no dotenv needed |
| Express 4 async error handling | HIGH | Known limitation, established workaround |
| timingSafeEqual for tokens | HIGH | Node.js crypto built-in, correct approach for constant-time token comparison |
| Build order | MEDIUM | Logical dependency order, but team may reorder steps 3-4 based on preference |

## Sources

- Bun environment variables: https://bun.sh/docs/runtime/env (confirmed — Bun loads .env automatically, dotenv not needed)
- MinIO JavaScript SDK: https://github.com/minio/minio-js (stable; Client class, presignedGetObject, presignedPutObject, statObject, bucketExists)
- Express error handling: https://expressjs.com/en/guide/error-handling.html (async handler wrapping for Express 4)
- Node.js crypto timingSafeEqual: https://nodejs.org/api/crypto.html#cryptotimingsafeequalbuffer1-buffer2
