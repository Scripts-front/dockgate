# Research Summary — DockGate

**Synthesized:** 2026-06-16

## Recommended Stack

| Area | Choice | Rationale |
|------|--------|-----------|
| Runtime | `oven/bun:1` (Debian) | Official image; Alpine crashes Bun due to musl vs glibc |
| Framework | Express 5.x | Native async error propagation; project constraint |
| MinIO client | `minio` npm (not `@aws-sdk`) | Native types; simpler presigned URL API; MinIO-official |
| TypeScript | `module: "Preserve"`, `moduleResolution: "bundler"`, `verbatimModuleSyntax: true` | Bun-official tsconfig; run `.ts` directly, no compile step |
| Env loading | Bun native (no `dotenv`) | Bun auto-loads `.env` |
| Auth | Custom middleware with `crypto.timingSafeEqual` | Two env-var tokens; no JWT, no libraries |
| Container | Multi-stage Dockerfile, `USER bun`, exec-form `ENTRYPOINT` | Non-root; correct SIGTERM handling |

## Table Stakes Features

| Endpoint | Auth | Returns |
|----------|------|---------|
| `GET /apps/:name/latest` | None | `{ schema: 1, version, sha256, size, publishedAt }` |
| `GET /apps/:name/download?version=X` | `DOWNLOAD_TOKEN` | `{ url, expiresAt }` |
| `POST /apps/:name/upload?version=X` | `UPLOAD_TOKEN` | `{ url, method: "PUT", expiresIn }` |
| `PUT /apps/:name/latest` | `UPLOAD_TOKEN` | `{ ok: true }` |
| `GET /health` | None | `{ ok: true, minio: "connected" }` ou 503 |

**Requisitos de correção obrigatórios:**
- `statObject` em todo download — 404 limpo se versão não existir
- `statObject` dentro do `PUT /latest` antes de escrever — sem phantom versions
- Schema do `latest.json` inclui `{ schema: 1, version, sha256, size, publishedAt }` desde o início
- Validação de input: `:name` = `/^[a-z0-9][a-z0-9-]{0,62}$/`, `version` = semver-like, rejeitar `/`, `..`, `\`
- Startup fail-fast: `process.exit(1)` em qualquer env var ausente

## Recommended Architecture

```
src/
├── index.ts              # Entry: bind server, SIGTERM handler
├── app.ts                # Express factory (testável)
├── config.ts             # requireEnv() — fail-fast validation
├── minio/client.ts       # Singleton MinIO Client
├── middleware/
│   ├── auth.ts           # requireDownloadToken + requireUploadToken
│   └── errorHandler.ts   # Global JSON error handler
├── routes/apps.ts        # Route wiring
└── handlers/
    ├── getLatest.ts
    ├── getDownload.ts
    ├── postUpload.ts
    └── putLatest.ts
```

**Ordem de build:** (1) config + app básico + /health stub → (2) MinIO client + health check real → (3) auth middleware + rotas stubadas → (4) handlers de leitura → (5) handlers de escrita → (6) Dockerfile + smoke test.

**Object naming:** `{appName}/{version}.tar` e `{appName}/latest.json`. Presigned URL expiry: 3600s download, 1800s upload (ambos configuráveis via env var).

## Critical Pitfalls to Avoid

1. **MinIO `endPoint` hostname-only** — sem prefixo `http://`; sempre definir `port` explicitamente.
2. **Presigned URL host deve ser resolvível externamente** — SDK configurado com hostname interno do Docker gera URLs que clientes não alcançam. Resolver antes da Fase 1.
3. **Phantom version** — `PUT /latest` deve chamar `statObject` antes de escrever. Check de correção mais crítico do sistema.
4. **Validação de env vars no startup é obrigatória** — `DOWNLOAD_TOKEN` não definido com comparação `undefined === undefined` abre todos os endpoints.
5. **`timingSafeEqual` não `===`** — fazer hash de ambos os lados para buffers SHA-256 de tamanho fixo antes de comparar.
6. **Validação de input em `:name` e `version`** — path traversal via `version=../otherapp/1.0.0` sobrescreve objetos MinIO de outra app.
7. **Dockerfile: nunca Alpine, ENTRYPOINT exec-form, `USER bun`** — crash musl, swallowing do SIGTERM e execução não-root são todos requisitos do Dockerfile na Fase 1.

## Key Decisions Made by Research

| Decisão | Resolução |
|---------|-----------|
| Express 4 vs 5 | Express 5 — erros async built-in |
| SDK MinIO | pacote `minio` — não `@aws-sdk/client-s3` |
| Entrega do token | Suporte a header e query param |
| Expiry de presigned URL | 3600s download / 1800s upload, configurável via env |
| Schema do `latest.json` | `{ schema: 1, version, sha256, size, publishedAt }` desde o início |
| Comportamento do `/health` | Chama `bucketExists` — probe combinado liveness + readiness |
| Quando escrever `latest.json` | Somente após `statObject` confirmar que o `.tar` existe |
| Imagem base | `oven/bun:1` Debian — Alpine incompatível com Bun |

## Open Questions

| Questão | Bloqueante? |
|---------|-------------|
| MinIO é acessível externamente por hostname público, ou apenas pela rede Docker? | Sim — config do MinIO Client na Fase 1 depende disso |
| MinIO tem TLS no endpoint público? | Sim — determina `useSSL` e se as presigned URLs são HTTP ou HTTPS |
| Convenção de extensão: `.tar` ou `.tar.gz`? | Antes da primeira integração CI/CD |
| CORS no bucket MinIO necessário? | Se algum cliente usar as presigned URLs de um browser |
| Política de retenção de versões antigas? | Não bloqueante para v1 |
