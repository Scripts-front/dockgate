# Phase 5: subir docker image para o Docker Hub via CI/CD - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar o pipeline CI/CD do repositório DockGate em si: build da imagem Docker da API, push para Docker Hub e atualização automática da stack no Portainer. Ao final da fase:
- Push no branch `master` dispara automaticamente o build, push e redeploy
- Portainer sempre roda a imagem mais recente (`biellil/dockgate:latest`)
- Repositório inclui `deploy/docker-compose.yml` pronto para uso no Portainer

**Escopo:** pipeline do repositório DockGate (diferente da Fase 3, que criou docs para *clientes* usarem o DockGate).

</domain>

<decisions>
## Implementation Decisions

### Docker Hub

- **D-01:** Imagem publicada como `biellil/dockgate` — conta pessoal Docker Hub, imagem pública (pull sem credenciais).
- **D-02:** Tag única: `:latest`. Sobrescrita a cada push no master. Sem semver ou SHA — simplicidade para API interna.
- **D-03:** Autenticação no Docker Hub via secrets `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` (Access Token gerado em hub.docker.com, não senha da conta).
- **D-04:** Registry único: Docker Hub. Sem GHCR (GitHub Container Registry) como destino adicional.

### CI Trigger

- **D-05:** Workflow disparado por push no branch `master`. Sem trigger por tag — cada merge no master gera deploy imediato.

### Portainer Update (API + token)

- **D-06:** CI autentica no Portainer via `POST /api/auth` com `PORTAINER_USERNAME` + `PORTAINER_PASSWORD` → recebe JWT temporário.
- **D-07:** Com o JWT, busca o stack file atual via `GET /api/stacks/{PORTAINER_STACK_ID}` para preservar a configuração existente.
- **D-08:** Faz redeploy via `PUT /api/stacks/{PORTAINER_STACK_ID}` com `pullImage: true`, forçando pull da nova `:latest` do Docker Hub.
- **D-09:** Secrets necessários para o Portainer: `PORTAINER_URL` (ex: `https://portainer.meudominio.com`), `PORTAINER_USERNAME`, `PORTAINER_PASSWORD`, `PORTAINER_STACK_ID` (ID numérico da stack — configurado pelo usuário após criar a stack).
- **D-10:** Toda a lógica de autenticação e chamadas HTTP fica no próprio YAML do workflow (sem action externa para Portainer).

### Deploy Compose

- **D-11:** Criar `deploy/docker-compose.yml` com o serviço DockGate usando `biellil/dockgate:latest`. MinIO não incluído — já roda separado na VPS.
- **D-12:** Arquivo inclui todos os env vars obrigatórios da API (da Fase 1, D-03): `DOWNLOAD_TOKEN`, `UPLOAD_TOKEN`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `PORT`. Valores ficam em branco (ou com placeholder) para o usuário preencher ao importar no Portainer.

### Workflow File

- **D-13:** Workflow criado em `.github/workflows/deploy.yml` (ao lado do `lint.yml` existente da Fase 4).

### Claude's Discretion

- Plataforma de build (sugerir `linux/amd64` — VPS provavelmente amd64; sem multi-platform salvo indicação contrária).
- Nomes dos jobs e steps no YAML.
- Se adicionar step de verificação após redeploy (ex: wait + curl /health).
- Configuração de `restart: unless-stopped` no compose.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fase 1 (env vars obrigatórias)

- `.planning/phases/01-foundation/01-CONTEXT.md §D-03` — lista completa de env vars obrigatórias da API (replicar no docker-compose.yml)

### Projeto

- `.planning/PROJECT.md` — constraints de tech stack e deploy (container único no Portainer, MinIO separado)
- `.planning/REQUIREMENTS.md §INFRA-02` — imagem `oven/bun:1` Debian, não Alpine; usuário não-root `bun`; ENTRYPOINT exec-form

### Fase 4 (workflow CI existente)

- `.planning/phases/04-add-eslint-configuration-eslintrc/04-CONTEXT.md §D-05` — `lint.yml` já existe; o novo `deploy.yml` é paralelo, não substitui

### Dockerfile atual

- `Dockerfile` — multi-stage build existente (base: `oven/bun:1`); workflow faz build desta imagem

### CLAUDE.md

- `CLAUDE.md` — constraints de tech stack (sem `docker-compose.yml` junto ao MinIO neste repositório — válido para dev, mas `deploy/docker-compose.yml` é artefato de deploy para Portainer, diferente)

No external specs beyond files listed above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `Dockerfile` — multi-stage build pronto (`deps` + `final`). Workflow faz `docker build .` neste Dockerfile.
- `.github/workflows/lint.yml` — padrão de workflow existente (checkout + setup-bun + install + run). `deploy.yml` segue estrutura similar.
- `.dockerignore` — já configurado; excluído do build automaticamente.

### Established Patterns

- GitHub Actions: `uses: actions/checkout@v4` e `uses: oven-sh/setup-bun@v2` já validados na Fase 4.
- Sem docker-compose existente no repositório — `deploy/docker-compose.yml` é novo artefato.

### Integration Points

- `.github/workflows/deploy.yml` adiciona-se ao diretório existente sem conflito com `lint.yml`.
- `deploy/` é uma nova pasta — criar junto com o `docker-compose.yml`.

</code_context>

<specifics>
## Specific Ideas

- Portainer redeploy: fluxo específico definido pelo usuário: `POST /api/auth` → `GET /api/stacks/{id}` (para pegar stack file atual) → `PUT /api/stacks/{id}` com `pullImage: true`.
- O stack ID no Portainer será definido pelo usuário após criar a stack — configurado como secret `PORTAINER_STACK_ID` no GitHub.

</specifics>

<deferred>
## Deferred Ideas

None — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 05-subir-docker-image-para-o-docker-hub-via-ci-cd*
*Context gathered: 2026-06-17*
