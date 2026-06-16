# Phase 1: Foundation - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Construir o scaffold do projeto DockGate: configuração de env vars com fail-fast, cliente MinIO com verificação de bucket no startup, middleware de autenticação (dois tokens), sanitização de inputs, schema de dados, e container Docker funcional. Único endpoint nesta fase: `GET /health`. Nenhum endpoint de negócio (download/upload) é implementado aqui.

</domain>

<decisions>
## Implementation Decisions

### MinIO Connectivity

- **D-01:** MinIO acessível apenas via rede interna Docker (ex: `minio:9000`). A API se conecta usando hostname interno. `useSSL: false` (HTTP sem TLS).
- **D-02:** URLs pré-assinadas precisarão de hostname público diferente do hostname interno — um env var `MINIO_PUBLIC_ENDPOINT` deve ser definido desde o início (ex: `http://192.168.1.10:9000` ou `http://storage.meudominio.com`). O cliente MinIO usa `MINIO_ENDPOINT` (interno); as URLs pré-assinadas usam `MINIO_PUBLIC_ENDPOINT` como base. Este env var é obrigatório — incluir no fail-fast de startup (SEC-04).
- **D-03:** Lista completa de env vars obrigatórias (fail-fast no startup): `DOWNLOAD_TOKEN`, `UPLOAD_TOKEN`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`. A ausência de qualquer uma deve encerrar o processo com mensagem clara antes de iniciar o servidor.

### Auth Middleware

- **D-04:** `timingSafeEqual` requer buffers de tamanho igual — implementar com SHA-256 hash de ambos os lados (`crypto.createHash('sha256')`), não comparação direta de string.
- **D-05:** Dois middlewares separados: `requireDownloadToken` e `requireUploadToken`. Cada um valida o respectivo token.

### Input Sanitization

- **D-06:** Regex de validação para `:name` (app name) e `version`: rejeitar strings contendo `/`, `\`, `..`, null bytes, ou qualquer caractere fora de `[a-zA-Z0-9._-]`. Retornar 400 com mensagem descritiva antes de qualquer chamada ao MinIO.

### Container Port

- **D-07:** Porta configurável via env var `PORT`, com fallback para `3000`. Portainer pode mapear qualquer porta sem rebuild da imagem.

### Project Structure

- **D-08:** Projeto organizado por camada:
  ```
  src/
    config.ts        — validação de env vars (fail-fast)
    lib/
      minio.ts       — cliente MinIO e verificação de bucket
    middleware/
      auth.ts        — requireDownloadToken, requireUploadToken
      sanitize.ts    — validação de :name e version
    routes/
      health.ts      — GET /health
    index.ts         — bootstrap do app Express
  ```

### Claude's Discretion

- Formato exato das mensagens de erro de startup (clareza > formato específico)
- Log format (console.log simples — Portainer exibe os logs)
- Estratégia de retry na conexão MinIO (INFRA-03 diz fail-fast, sem retry)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` — especificações completas de SEC-01/02/03/04/05, INFRA-01/02/03/04, DATA-01/02 (todos mapeados para esta fase)

### Project Constraints

- `.planning/PROJECT.md` — decisões de tech stack, constraints, out-of-scope items

### Roadmap

- `.planning/ROADMAP.md §Phase 1` — success criteria para esta fase (4 critérios)

### Research Notes (STATE.md)

- `.planning/STATE.md §Accumulated Context` — pitfalls críticos de implementação:
  - MinIO `endPoint` deve ser hostname-only (sem `http://`), `port` separado
  - `timingSafeEqual` exige SHA-256 hash (buffers de tamanho fixo)
  - Presigned URL hostname deve ser externamente resolvável (resolvido por D-02 acima)

### CLAUDE.md Tech Stack

- `CLAUDE.md` — tech stack oficial (Bun + Express 5 + TypeScript), Dockerfile pattern, tsconfig recomendado, dependências proibidas

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- Nenhum código existente — projeto greenfield.

### Established Patterns

- Nenhum padrão estabelecido ainda. Esta fase define os padrões base.

### Integration Points

- Express 5 como framework HTTP
- MinIO SDK (`minio`) como único cliente de armazenamento
- Bun como runtime (sem compilação, executa `.ts` diretamente)

</code_context>

<specifics>
## Specific Ideas

- O env var `MINIO_PUBLIC_ENDPOINT` deve ser a URL base completa (incluindo protocolo e porta) que os clientes usarão para acessar as URLs pré-assinadas. Ex: `http://192.168.1.10:9000`. Isso é diferente de `MINIO_ENDPOINT` que é só o hostname para o SDK interno.
- Estrutura de objetos no MinIO: `{appName}/{version}.tar` e `{appName}/latest.json` (DATA-02) — já decidida nos requirements, sem variação.
- Schema de `latest.json`: `{ schema: 1, version, sha256, size, publishedAt }` (DATA-01) — já definida, sem variação.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-06-16*
