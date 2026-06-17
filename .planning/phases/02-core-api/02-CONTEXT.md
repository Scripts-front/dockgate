# Phase 2: Core API - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar todos os endpoints de negócio do DockGate: leitura para clientes (GET /latest, GET /download) e escrita para CI/CD (POST /upload, PUT /latest). Ao final da fase, clientes conseguem descobrir e baixar versões de apps; CI/CD consegue subir e publicar novas versões atomicamente. Nenhum novo endpoint além desses quatro é implementado aqui.

</domain>

<decisions>
## Implementation Decisions

### Response Shape — Endpoints de URL Pré-assinada

- **D-01:** `GET /apps/:name/download` e `POST /apps/:name/upload` retornam apenas `{ url: string }`. Nenhum metadado adicional (expiresIn, expiresAt, method). Scripts cliente usam a URL imediatamente após receber.
- **D-02:** Expiry das URLs pré-assinadas (já definido em CLAUDE.md): download = 3600s, upload = 900s. O valor não é incluído na resposta (D-01 acima).

### Response Shape — GET /latest

- **D-03:** `GET /apps/:name/latest` retorna o conteúdo do `latest.json` diretamente: `{ schema: 1, version, sha256, size, publishedAt }`. Nenhum envelope adicional.
- **D-04:** Quando `latest.json` não existe no MinIO (app sem versões publicadas): 404 com `{ error: "No versions published" }`.

### Body de PUT /latest

- **D-05:** CI/CD envia `{ version: string, sha256: string, size: number }` no body de `PUT /apps/:name/latest`. A API é responsável por adicionar `schema: 1` e `publishedAt` antes de escrever o `latest.json`.
- **D-06:** A API valida que `sha256` é uma string hex de exatamente 64 caracteres (`/^[a-f0-9]{64}$/i`). Requisição com sha256 inválido retorna 400 antes do anti-phantom check.
- **D-07:** A API valida que `size` é um número inteiro positivo. Requisição com size inválido retorna 400.

### publishedAt

- **D-08:** A API define `publishedAt` com server time (`new Date().toISOString()`) no momento em que `PUT /apps/:name/latest` é processado. O CI/CD não envia este campo.

### Mensagens de Erro

- **D-09:** `GET /apps/:name/download?version=X` quando o `.tar` não existe no MinIO: 404 com `{ error: "Version X not found" }` (substituindo X pela versão literal da request).
- **D-10:** `PUT /apps/:name/latest` quando o `.tar` correspondente não existe no MinIO (anti-phantom check, WRITE-03): 422 com `{ error: "Tar file not found for version X" }`.
- **D-11:** Formato consistente de erro em todos os endpoints: `{ error: string }` (mesmo padrão estabelecido em auth.ts e sanitize.ts na Fase 1).

### Claude's Discretion

- Organização dos arquivos de rota: um `apps.ts` ou arquivos separados por concern — implementador decide.
- Ordem de aplicação dos middlewares nos routes (sanitize antes de auth, ou auth antes de sanitize).
- Tratamento de erros inesperados do SDK MinIO (log + 500 genérico, já coberto pelo error handler global do index.ts).
- Formato das mensagens de log por endpoint.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` — especificações completas de READ-01, READ-02, READ-03, WRITE-01, WRITE-02, WRITE-03 (todos mapeados para esta fase)

### Project Constraints

- `.planning/PROJECT.md` — decisões de tech stack, constraints, out-of-scope items (especialmente: sem proxy de upload, sem banco de dados, tokens fixos)

### Roadmap

- `.planning/ROADMAP.md §Phase 2` — success criteria para esta fase (4 critérios de aceitação)

### Phase 1 Context (decisões carregadas desta fase)

- `.planning/phases/01-foundation/01-CONTEXT.md` — D-01 a D-08: MinIO connectivity (endpoint interno vs público), auth middlewares, sanitize middleware, schemas de dados

### CLAUDE.md Tech Stack

- `CLAUDE.md` — tech stack oficial (Bun + Express 5 + TypeScript), presigned URL expiry strategy (3600s download / 900s upload), dependências proibidas (multer, proxy de arquivo)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/middleware/auth.ts` — `requireDownloadToken` e `requireUploadToken` prontos para uso como middleware Express
- `src/middleware/sanitize.ts` — `validateAppName` e `validateVersion` prontos; validam `:name` e `version` com regex `[a-zA-Z0-9._-]+`
- `src/lib/schemas.ts` — `LatestManifest` interface define o shape exato do `latest.json`; `tarKey(app, version)` e `latestKey(app)` geram as chaves de objeto MinIO
- `src/lib/minio.ts` — `minioClient` exportado como singleton; métodos relevantes: `getObject`, `putObject`, `statObject`, `presignedGetObject`, `presignedPutObject`
- `src/config.ts` — `config.minioPublicEndpoint` disponível para construção de URLs pré-assinadas externamente acessíveis; `config.minioBucket` para todas as chamadas ao MinIO

### Established Patterns

- Erros: `res.status(N).json({ error: 'mensagem' })` — padrão de `auth.ts` e `sanitize.ts`
- Middleware chain no Express: cada middleware chama `next()` ou encerra com `res.json()`
- Bun executa `.ts` diretamente — imports com `.ts` extension são necessários

### Integration Points

- `src/index.ts` — onde novos routers precisam ser registrados com `app.use()`
- MinIO client (`minioClient`) já inicializado e com bucket verificado antes de qualquer request

</code_context>

<specifics>
## Specific Ideas

- `MINIO_PUBLIC_ENDPOINT` contém a URL base completa com protocolo e porta (ex: `http://192.168.1.10:9000`). As URLs pré-assinadas devem usar este endpoint como base, não o endpoint interno (`MINIO_ENDPOINT`). O SDK MinIO gera URLs com o endpoint interno — é necessário substituir o host nas URLs geradas antes de retornar ao cliente.
- O anti-phantom check de WRITE-03 usa `minioClient.statObject(bucket, tarKey(name, version))` — se lançar NoSuchKey, retornar 422. Esta chamada também retorna `size` como campo `stat.size`, mas o CI/CD já envia `size` no body (D-05), então não é necessário usar o valor do stat para popular o latest.json.
- Schema de `latest.json` a ser escrito pela API: `{ schema: 1, version, sha256, size, publishedAt: new Date().toISOString() }` — campos montados pela API a partir do body + server time.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-core-api*
*Context gathered: 2026-06-16*
