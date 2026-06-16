# Stack Research — DockGate

**Researched:** 2026-06-16
**Overall confidence:** HIGH (all core claims verified against official Bun and Express documentation; MinIO SDK API from training data flagged as MEDIUM — versions move fast)

---

## Runtime & Framework

### Bun as Runtime

Use `oven/bun:1` as the runtime. Bun's official Node.js compatibility page (verified June 2026) confirms:

- `node:http` and `node:https` are **fully implemented** — Express works out of the box
- `node:fs`, `node:stream`, `node:crypto`, `node:net` are fully implemented — MinIO SDK works
- `node:tls` is implemented (missing only `createSecurePair`, irrelevant for MinIO SDK usage)
- Express is explicitly called out as working on the Bun ecosystem page: *"popular frameworks like Next.js, Express, and millions of npm packages intended for Node work with Bun"*

**Confidence: HIGH** — verified against bun.sh official docs.

### Express vs Bun.serve

**Use Express.** The project spec locks in Express, and this is the right call for this use case:

- Express gives familiar middleware-based auth (`app.use(authMiddleware)`) that maps directly to the two-token model required
- Path parameter routing (`/apps/:name`) works identically to Node.js — no surprises
- `@types/express` gives full TypeScript IntelliSense on `req.params`, `req.query`, `req.headers`

**Do not switch to `Bun.serve`** even though it is 2.5x faster in benchmarks. For a low-traffic internal API distributing Docker images, the throughput difference is irrelevant. Bun.serve's routing (requires v1.2.3+) does not have first-class middleware composition, which makes the two-token auth pattern more awkward to implement cleanly.

### Express Version

Use **Express 5.x** (requires Node.js 18+, which Bun satisfies). Express 5 is the current stable release. Key point: Express 5 requires `async` error handling to propagate automatically — if a route handler throws an async error, Express 5 catches it without needing `next(err)` wrappers. This simplifies route code. No breaking changes for basic `app.get/post/put` routing patterns.

Types: `@types/express` covers Express 5.

```bash
bun add express
bun add -d @types/express
```

---

## MinIO Integration

### Package

The official MinIO JavaScript SDK is the `minio` npm package, maintained by MinIO at `github.com/minio/minio-js`. Use it as the only MinIO client — do not use `@aws-sdk/client-s3` even though MinIO supports S3-compatible APIs. The `minio` SDK is typed natively, has a simpler API for presigned URLs, and is what MinIO officially documents for JavaScript/TypeScript.

**Confidence on version number: MEDIUM** — training data indicates the package is in the `7.x` range (the SDK underwent a major refactor around v7 to be fully async/Promise-based, dropping callbacks). Verify with `bun add minio` which will pull the latest stable.

```bash
bun add minio
```

No separate types package needed — `minio` ships its own TypeScript declarations.

### Client Initialization

```typescript
import { Client } from "minio";

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,   // hostname only, e.g. "minio.internal"
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});
```

### Key API Methods

**Presigned download URL (GET):**
```typescript
// Returns a presigned URL valid for `expiry` seconds
const url = await minioClient.presignedGetObject(
  bucketName,   // string — e.g. "dockgate"
  objectName,   // string — e.g. "myapp/1.0.0.tar"
  expiry,       // number — seconds, e.g. 3600
);
// Returns: string (the full presigned URL)
```

**Presigned upload URL (PUT):**
```typescript
// Returns a presigned URL the CI/CD pipeline uses to PUT the .tar directly
const url = await minioClient.presignedPutObject(
  bucketName,   // string
  objectName,   // string — e.g. "myapp/1.2.0.tar"
  expiry,       // number — seconds, e.g. 3600
);
// Returns: string
```

**Check object existence (for version validation):**
```typescript
// Throws if object does not exist — catch the error to detect missing versions
const stat = await minioClient.statObject(bucketName, objectName);
// Returns: BucketItemStat { size, etag, lastModified, metaData }
```

**Read a JSON object (for latest.json):**
```typescript
const stream = await minioClient.getObject(bucketName, objectName);
// stream is a Node.js Readable — consume with:
const chunks: Buffer[] = [];
for await (const chunk of stream) chunks.push(chunk);
const text = Buffer.concat(chunks).toString("utf-8");
const data = JSON.parse(text);
```

**Write a JSON object (for updating latest.json):**
```typescript
import { Readable } from "stream";
const content = JSON.stringify({ version: "1.2.0", updatedAt: new Date().toISOString() });
const buffer = Buffer.from(content, "utf-8");
await minioClient.putObject(bucketName, objectName, Readable.from(buffer), buffer.length, {
  "Content-Type": "application/json",
});
```

**Check bucket exists (startup validation):**
```typescript
const exists = await minioClient.bucketExists(bucketName);
if (!exists) throw new Error(`Bucket "${bucketName}" not found`);
```

### Presigned URL Expiry Strategy

- Download URLs: 1 hour (`3600` seconds) — client scripts should use immediately
- Upload URLs: 15 minutes (`900` seconds) — CI/CD pipeline uploads right after requesting

### Bun Compatibility with MinIO SDK

**Confidence: HIGH.** The MinIO SDK uses `node:http`, `node:https`, `node:stream`, `node:crypto`, and `node:events` — all fully implemented in Bun. The SDK makes standard outbound HTTP connections to MinIO; no native bindings, no `child_process`, no incompatible modules.

One known nuance: Bun's `node:http` outgoing client request body is currently buffered instead of streamed (per official docs). For DockGate this is irrelevant because the API never proxies `.tar` file bodies — presigned URLs send traffic directly to MinIO.

---

## Authentication

### Pattern: Simple Bearer Token Middleware

Use a plain Express middleware factory. No JWT library, no passport, no sessions — the project spec explicitly rules all of these out.

```typescript
// src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";

type TokenType = "download" | "upload";

const DOWNLOAD_TOKEN = process.env.DOWNLOAD_TOKEN;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN;

export function requireToken(type: TokenType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Accept token from Authorization header OR ?token= query param
    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.query.token as string | undefined;

    const expected = type === "download" ? DOWNLOAD_TOKEN : UPLOAD_TOKEN;

    if (!token || token !== expected) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}
```

**Usage in routes:**
```typescript
// Download endpoint — clients use DOWNLOAD_TOKEN
app.get("/apps/:name/download", requireToken("download"), downloadHandler);

// Upload endpoint — CI/CD uses UPLOAD_TOKEN
app.post("/apps/:name/upload", requireToken("upload"), uploadHandler);

// Latest update endpoint — CI/CD uses UPLOAD_TOKEN
app.put("/apps/:name/latest", requireToken("upload"), updateLatestHandler);

// Public endpoint — no token required
app.get("/apps/:name/latest", latestHandler);
```

**Why `?token=` query param in addition to Bearer header:** Client scripts calling the download endpoint may be simple `curl` or `wget` commands that embed the token in the URL. Support both for ergonomics.

**Startup guard:** Validate at startup that both tokens are set:
```typescript
if (!process.env.DOWNLOAD_TOKEN || !process.env.UPLOAD_TOKEN) {
  console.error("FATAL: DOWNLOAD_TOKEN and UPLOAD_TOKEN must be set");
  process.exit(1);
}
```

---

## TypeScript Config

### Official Bun tsconfig.json (verified from bun.sh/docs/typescript)

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "allowJs": true,
    "types": ["bun"],

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,

    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

**Key decisions for DockGate:**

- `"module": "Preserve"` — Bun handles module resolution; don't transform imports
- `"moduleResolution": "bundler"` — Required to resolve `@types/bun` and extension-less imports correctly
- `"verbatimModuleSyntax": true` — Enforces `import type` for type-only imports; catches runtime import mistakes
- `"types": ["bun"]` — Pulls in Bun globals without cluttering other type namespaces
- `"noEmit": true` — Bun runs TypeScript directly; no compilation step needed
- `"strict": true` — Non-negotiable for a security-critical token comparison path

**Required dev dependency:**
```bash
bun add -d @types/bun
```

Generated automatically by `bun init` — run `bun init` to scaffold the project and get this config.

**Note on TypeScript version:** If using TypeScript 6.0+, the `"types": ["bun"]` entry in `compilerOptions` is required (not just `@types/bun` as a dev dep). `bun init` handles this correctly.

---

## Docker

### Base Image

Use `oven/bun:1` — the official Bun Docker image maintained by the Bun team at Docker Hub. The `:1` tag tracks the latest Bun 1.x release, providing automatic minor/patch updates on rebuild without risking major version breaks.

**Confidence: HIGH** — verified against official bun.sh Docker guide.

### Recommended Multi-Stage Dockerfile

```dockerfile
# Stage 1: Install all dependencies (cached layer)
FROM oven/bun:1 AS install
WORKDIR /temp

# Separate dev and prod install to cache both
RUN mkdir dev prod

COPY package.json bun.lock ./dev/
RUN cd dev && bun install --frozen-lockfile

COPY package.json bun.lock ./prod/
RUN cd prod && bun install --frozen-lockfile --production

# Stage 2: Final image — production only
FROM oven/bun:1 AS release
WORKDIR /app

# Copy production node_modules from install stage
COPY --from=install /temp/prod/node_modules ./node_modules

# Copy source
COPY src/ ./src/
COPY package.json .

# Run as non-root bun user (included in oven/bun image)
USER bun

EXPOSE 3000/tcp

# Run TypeScript directly — no build step needed
ENTRYPOINT ["bun", "run", "src/index.ts"]
```

### .dockerignore

```
node_modules
.git
.gitignore
*.md
.env
.env.*
coverage
.planning
```

### Why no compile/build stage

Bun runs `.ts` files natively. No `tsc` compile step, no `dist/` directory, no build artifact needed. This simplifies the Dockerfile to two stages instead of three and eliminates the "forgot to rebuild before deploy" class of bugs.

### Image size note

`oven/bun:1` is Debian-based (~120MB compressed). For a VPS-deployed internal API, image size is not a constraint. The Alpine variant (`oven/bun:1-alpine`) is available and roughly 30% smaller if image size becomes a concern, but Alpine's musl libc occasionally causes issues with native Node addons — unnecessary risk for this project since `minio` and `express` have no native addons.

**Recommendation: stay on `oven/bun:1` (Debian), not Alpine.**

### Port Configuration

Bun reads `$PORT` automatically. Set it in the container environment:

```
PORT=3000
```

Or pass `--port` to `bun run`. The EXPOSE in Dockerfile is documentation only; the actual port binding happens in Portainer's container configuration.

---

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

---

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

---

## Sources

- Bun Node.js Compatibility: https://bun.sh/docs/runtime/nodejs-apis (verified June 2026)
- Bun TypeScript docs: https://bun.sh/docs/typescript (verified June 2026)
- Bun Docker guide: https://bun.sh/guides/ecosystem/docker (verified June 2026)
- Bun HTTP server docs: https://bun.sh/docs/api/http (verified June 2026)
- Bun Express guide: https://bun.sh/docs/ecosystem/express (verified June 2026)
- Bun lockfile docs: https://bun.sh/docs/install/lockfile (verified June 2026)
- Express 5 API: https://expressjs.com/en/5x/api.html (verified June 2026)
- MinIO JS SDK: https://github.com/minio/minio-js (MEDIUM — only partial access)
