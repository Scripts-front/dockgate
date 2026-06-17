# Phase 3: CI/CD Docs - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar o guia de integração CI/CD do DockGate e um workflow GitHub Actions completo e pronto para copiar. Ao final da fase, qualquer desenvolvedor consegue configurar o pipeline de distribuição de imagens Docker via DockGate lendo apenas o repositório, sem perguntar para ninguém. Nenhum novo endpoint de API é implementado nesta fase.

</domain>

<decisions>
## Implementation Decisions

### Localização dos Arquivos

- **D-01:** O guia escrito fica em `docs/ci-cd.md`. O `README.md` inclui um link para ele (não repete o conteúdo).
- **D-02:** O workflow YAML de exemplo fica em `docs/examples/github-actions.yml`. Não vai para `.github/workflows/` para não ser executado no repositório do DockGate. O dev copia para o próprio repositório.

### Trigger e Versionamento

- **D-03:** O workflow de exemplo é disparado por **tag push** com padrão `v*.*.*`. Este é o trigger padrão de mercado para releases.
- **D-04:** A versão é derivada da tag git **sem o prefixo `v`**. Extração via shell: `${GITHUB_REF#refs/tags/v}`. Ex: tag `v1.2.3` → versão `"1.2.3"` (valor enviado para a API e usado como nome do arquivo no MinIO).

### Escopo do Workflow YAML

- **D-05:** O YAML deve cobrir o **pipeline completo**, passo a passo:
  1. Checkout do código
  2. Docker build da imagem
  3. Docker save (export do `.tar`)
  4. Cálculo de `sha256` e `size` do `.tar` (usando `sha256sum` e `stat -c%s`)
  5. Request da upload URL (`POST /apps/:name/upload?version=X` com UPLOAD_TOKEN)
  6. PUT direto no MinIO usando a URL pré-assinada retornada
  7. Publicação via `PUT /apps/:name/latest` com body `{ version, sha256, size }`
- **D-06:** SHA256 e size são calculados no próprio workflow antes de chamar a API. O YAML inclui a lógica de cálculo — o exemplo é verdadeiramente copy-paste, sem passos implícitos.

### Secrets e Setup

- **D-07:** Os secrets usados no YAML se chamam `DOCKGATE_URL` (URL base da API, ex: `https://dockgate.meudominio.com`) e `DOCKGATE_UPLOAD_TOKEN` (valor do `UPLOAD_TOKEN` configurado na API).
- **D-08:** O guia documenta **apenas a lista de secrets necessários** com o valor esperado de cada um. Não inclui passo a passo de configuração no GitHub (assume que o dev sabe onde adicionar secrets em Settings > Secrets).

### Claude's Discretion

- Estrutura interna do `docs/ci-cd.md` (ordem das seções, nível de detalhe de cada passo).
- Nome da app (`APP_NAME`) no YAML de exemplo — usar uma variável de env configurável no topo do workflow.
- Formato exato dos `curl` commands no YAML (headers, flags).
- Inclusão ou não de comentários inline no YAML para explicar cada passo.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md §DOCS-01` — requisito único desta fase: guia de integração GitHub Actions com workflow YAML ready-to-copy, instrução de secrets e fluxo completo

### Roadmap

- `.planning/ROADMAP.md §Phase 3` — success criteria para esta fase (2 critérios de aceitação)

### Phase 1 Context (env vars e configuração da API)

- `.planning/phases/01-foundation/01-CONTEXT.md` — D-01/D-02/D-03: env vars obrigatórias da API, MINIO_PUBLIC_ENDPOINT como base de URLs pré-assinadas, lista completa de variáveis de ambiente

### Phase 2 Context (contratos de API)

- `.planning/phases/02-core-api/02-CONTEXT.md` — D-01/D-05/D-06/D-07/D-08/D-09/D-10: shapes exatos das requests e responses de todos os endpoints relevantes para o CI/CD (POST /upload, PUT /latest, GET /latest)

### CLAUDE.md Tech Stack

- `CLAUDE.md` — expiry strategy das URLs pré-assinadas (upload = 900s), arquitetura de upload direto para MinIO (sem proxy pela API)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/routes/apps.ts` — implementação atual dos endpoints. Útil para confirmar os contratos de request/response antes de documentar.

### Established Patterns

- Nenhum padrão de documentação estabelecido ainda — esta fase cria o padrão.

### Integration Points

- `docs/` — diretório a ser criado; `docs/examples/` também novo.
- `README.md` — a ser atualizado com link para o guia.

</code_context>

<specifics>
## Specific Ideas

- O `DOCKGATE_URL` no YAML deve ser a URL base da API (sem trailing slash), ex: `https://dockgate.meudominio.com`. As chamadas concatenam o path: `$DOCKGATE_URL/apps/$APP_NAME/upload?version=$VERSION`.
- O PUT direto no MinIO usa a URL retornada pelo `POST /upload` sem autenticação adicional (a URL pré-assinada já carrega as credenciais MinIO). O YAML usa `curl -X PUT --upload-file`.
- A chamada `PUT /latest` usa `Content-Type: application/json` e envia `{ "version": "$VERSION", "sha256": "$SHA256", "size": $SIZE }`. O SIZE deve ser número inteiro (não string).
- O guia deve mencionar que o UPLOAD_TOKEN tem 900s de expiração na URL pré-assinada — CI/CD deve fazer o upload logo após receber a URL.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-ci-cd-docs*
*Context gathered: 2026-06-17*
