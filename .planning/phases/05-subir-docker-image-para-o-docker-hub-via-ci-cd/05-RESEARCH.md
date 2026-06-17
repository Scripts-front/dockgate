# Phase 5: subir docker image para o Docker Hub via CI/CD - Research

**Researched:** 2026-06-17
**Domain:** GitHub Actions CI/CD — Docker Hub build/push + Portainer API stack update
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Docker Hub**
- D-01: Imagem publicada como `biellil/dockgate` — conta pessoal Docker Hub, imagem pública
- D-02: Tag unica: `:latest`. Sobrescrita a cada push no master. Sem semver ou SHA
- D-03: Auth no Docker Hub via secrets `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` (Access Token, nao senha)
- D-04: Registry unico: Docker Hub. Sem GHCR

**CI Trigger**
- D-05: Workflow disparado por push no branch `master`

**Portainer Update**
- D-06: CI autentica no Portainer via `POST /api/auth` com `PORTAINER_USERNAME` + `PORTAINER_PASSWORD` — recebe JWT temporario
- D-07: Com JWT, busca stack file atual via `GET /api/stacks/{PORTAINER_STACK_ID}/file`
- D-08: Faz redeploy via `PUT /api/stacks/{PORTAINER_STACK_ID}?endpointId=...` com `RepullImageAndRedeploy: true`
- D-09: Secrets: `PORTAINER_URL`, `PORTAINER_USERNAME`, `PORTAINER_PASSWORD`, `PORTAINER_STACK_ID`
- D-10: Toda a logica HTTP fica no proprio YAML do workflow (sem action externa)

**Deploy Compose**
- D-11: Criar `deploy/docker-compose.yml` com `biellil/dockgate:latest`. MinIO nao incluido
- D-12: Incluir todos os env vars obrigatorios da API com placeholders: `DOWNLOAD_TOKEN`, `UPLOAD_TOKEN`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `PORT`

**Workflow File**
- D-13: Workflow em `.github/workflows/deploy.yml` (ao lado do `lint.yml` existente)

### Claude's Discretion

- Plataforma de build: sugerir `linux/amd64`
- Nomes dos jobs e steps no YAML
- Se adicionar step de verificacao apos redeploy (ex: wait + curl /health)
- Configuracao de `restart: unless-stopped` no compose

### Deferred Ideas (OUT OF SCOPE)

Nenhuma — discussao ficou dentro do escopo da fase.
</user_constraints>

---

## Summary

Esta fase cria dois artefatos: `.github/workflows/deploy.yml` (pipeline CI/CD) e `deploy/docker-compose.yml` (artefato de deploy para o Portainer). O pipeline usa as GitHub Actions oficiais Docker (`docker/login-action`, `docker/setup-buildx-action`, `docker/build-push-action`) para fazer build e push da imagem `biellil/dockgate:latest` no Docker Hub. Em seguida, chama a API REST do Portainer via `curl` inline no YAML para obter um JWT temporario e acionar o redeploy da stack com pull da nova imagem.

O ponto mais critico da implementacao e o fluxo Portainer: alem do `PORTAINER_STACK_ID`, a API `PUT /api/stacks/{id}` **exige** o query parameter `endpointId` (ID do ambiente Docker no Portainer). Esse ID precisa ser conhecido pelo usuario e armazenado como secret adicional. Isso nao esta nos decisions mas e bloqueante — documentado em Open Questions. O corpo do PUT precisa incluir `StackFileContent` (obtido do GET anterior), `Env`, `Prune` e `RepullImageAndRedeploy: true`.

**Recomendacao primaria:** Para `linux/amd64` (VPS tipica), nao ha necessidade de QEMU. `docker/setup-buildx-action@v4` e recomendado (nao obrigatorio) mas habilita cache de layers no buildx — incluir. Autenticacao Portainer via `POST /api/auth` + Bearer JWT e funcional; alternativa mais robusta seria Access Token (`X-API-Key`), mas o usuario escolheu usuario/senha.

---

## Standard Stack

### Acoes GitHub Actions

| Action | Versao | Proposito | Por que padrao |
|--------|--------|-----------|----------------|
| `actions/checkout` | `v4` | Checkout do repositorio | Ja validado na Fase 4 (`lint.yml`) |
| `docker/login-action` | `v4` | Login no Docker Hub | Action oficial Docker — autentica com DOCKERHUB_TOKEN |
| `docker/setup-buildx-action` | `v4` | Cria builder Buildx | Recomendada para cache de layers; nao exige QEMU em amd64 |
| `docker/build-push-action` | `v7` | Build + push da imagem | Action oficial Docker; v7.2.0 e a versao mais recente |

[VERIFIED: docs.docker.com/guides/gha] [VERIFIED: github.com/marketplace/actions/build-and-push-docker-images]

### Ferramentas de sistema (disponiveis nos runners ubuntu-latest)

| Ferramenta | Uso | Disponivel |
|-----------|-----|-----------|
| `curl` | Chamadas API Portainer | Pre-instalado no ubuntu-latest |
| `jq` | Parse JSON das respostas Portainer | Pre-instalado no ubuntu-latest |

[ASSUMED] `jq` pre-instalado no ubuntu-latest — padrao da comunidade amplamente citado, mas nao verificado em changelog oficial.

---

## Architecture Patterns

### Estrutura de Arquivos Criados

```
.github/
  workflows/
    lint.yml          # existente — nao alterar
    deploy.yml        # NOVO — pipeline desta fase
deploy/
  docker-compose.yml  # NOVO — artefato para Portainer
```

### Pattern 1: Deploy Workflow com dois jobs

**O que e:** Separar `build-push` de `portainer-deploy` em jobs distintos. O segundo job usa `needs: build-push` para garantir ordem.

**Por que:** Permite re-run do job de deploy sem refazer o build. Falha isolada por responsabilidade.

```yaml
# Source: docs.docker.com/guides/gha (adaptado para as decisoes D-01 a D-10)
name: Deploy

on:
  push:
    branches:
      - master

jobs:
  build-push:
    name: Build and Push to Docker Hub
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Login to Docker Hub
        uses: docker/login-action@v4
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Build and push
        uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: biellil/dockgate:latest
          platforms: linux/amd64

  portainer-deploy:
    name: Update Portainer Stack
    runs-on: ubuntu-latest
    needs: build-push
    steps:
      - name: Authenticate and redeploy
        run: |
          # D-06: POST /api/auth -> JWT
          JWT=$(curl -fsSL -X POST "${{ secrets.PORTAINER_URL }}/api/auth" \
            -H "Content-Type: application/json" \
            -d "{\"Username\":\"${{ secrets.PORTAINER_USERNAME }}\",\"Password\":\"${{ secrets.PORTAINER_PASSWORD }}\"}" \
            | jq -r '.jwt')

          # D-07: GET stack file content
          STACK_FILE=$(curl -fsSL \
            -H "Authorization: Bearer $JWT" \
            "${{ secrets.PORTAINER_URL }}/api/stacks/${{ secrets.PORTAINER_STACK_ID }}/file" \
            | jq -r '.StackFileContent')

          # D-08: PUT redeploy with RepullImageAndRedeploy
          curl -fsSL -X PUT \
            -H "Authorization: Bearer $JWT" \
            -H "Content-Type: application/json" \
            "${{ secrets.PORTAINER_URL }}/api/stacks/${{ secrets.PORTAINER_STACK_ID }}?endpointId=${{ secrets.PORTAINER_ENDPOINT_ID }}" \
            -d "{\"StackFileContent\": $(echo "$STACK_FILE" | jq -Rs .), \"Env\": [], \"Prune\": false, \"RepullImageAndRedeploy\": true}"
```

**ATENCAO:** `endpointId` e obrigatorio no PUT (ver Open Questions — este secret nao esta em D-09).

### Pattern 2: deploy/docker-compose.yml

**O que e:** Arquivo Compose minimo para Portainer importar. Servico unico `dockgate`, sem MinIO.

```yaml
# deploy/docker-compose.yml
services:
  dockgate:
    image: biellil/dockgate:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      PORT: ""
      DOWNLOAD_TOKEN: ""
      UPLOAD_TOKEN: ""
      MINIO_ENDPOINT: ""
      MINIO_PUBLIC_ENDPOINT: ""
      MINIO_BUCKET: ""
      MINIO_ACCESS_KEY: ""
      MINIO_SECRET_KEY: ""
```

Valores em branco — usuario preenche ao importar no Portainer (D-12).

### Anti-Patterns a Evitar

- **Usar `PORTAINER_PASSWORD` como Access Token:** A decisao D-06 escolheu usuario/senha + JWT. Nao misturar com `X-API-Key` (seria autenticacao diferente).
- **Omitir `?endpointId=` no PUT:** A API retorna erro 404/500 sem esse parametro. Veja seção de pitfalls.
- **Embutir senhas no YAML diretamente:** Sempre usar `${{ secrets.* }}` — nunca hardcode.
- **Push em pull_request:** Nao faz sentido para `:latest` — trigger apenas em `push.branches: [master]` (D-05).
- **Usar `shell-form` ENTRYPOINT no Dockerfile:** O Dockerfile existente ja usa exec-form corretamente — nao alterar.

---

## Don't Hand-Roll

| Problema | Nao Construir | Usar | Por que |
|----------|--------------|------|---------|
| Build multi-stage Docker + push | Script bash com `docker build && docker push` | `docker/build-push-action@v7` | Gerencia cache, provenance, SBOM, multi-platform automaticamente |
| Login no Docker Hub | Salvar credenciais manualmente | `docker/login-action@v4` | Gerencia `~/.docker/config.json` de forma segura, limpa no pos-job |
| Checkout do repo | `git clone` manual | `actions/checkout@v4` | Handles submodules, LFS, sparse checkout |

---

## Common Pitfalls

### Pitfall 1: `endpointId` ausente no PUT /api/stacks

**O que da errado:** API Portainer retorna `"Unable to find the environment associated to the stack"` (erro 404 ou 500).

**Por que acontece:** O endpoint `PUT /api/stacks/{id}` requer o query parameter `?endpointId={N}` para identificar o ambiente Docker. O stack ID (D-09) identifica a stack; o endpoint ID identifica o Docker engine. Sao valores distintos.

**Como evitar:** Adicionar `PORTAINER_ENDPOINT_ID` como secret no GitHub (tipicamente `1` para uma instalacao Portainer padrao com um unico Docker environment). Encontrado em Portainer > Environments > clicar no ambiente > inspecionar a URL (contem o ID).

**Sinal de alerta:** Teste manual da chamada PUT retorna JSON de erro sobre "environment" ou "endpoint".

[CITED: github.com/portainer/portainer/issues/9210]

### Pitfall 2: Escape incorreto do `StackFileContent` no JSON inline

**O que da errado:** O conteudo do stack file (multi-linha YAML) quebra o JSON enviado ao PUT, causando erro 400.

**Por que acontece:** O shell inline do GitHub Actions usa `$()` para capturar output, e o conteudo YAML com aspas e newlines precisa ser escapado corretamente para JSON.

**Como evitar:** Usar `jq -Rs .` para transformar string arbitraria em JSON string valida. Exemplo: `echo "$STACK_FILE" | jq -Rs .` produz string JSON com escapes corretos.

### Pitfall 3: JWT expirado antes do PUT

**O que da errado:** O JWT do Portainer tem tempo de expiracao curto (tipicamente 8h). Em workflows lentos, o token pode expirar entre o GET e o PUT.

**Por que acontece:** Os workflows rapidos (< 1 min) nao sofrem esse problema. Mas vale notar que o JWT e temporario, diferente do Access Token (`X-API-Key`) que e permanente.

**Como evitar:** Em workflows simples como este (build + push + 2 curl), o tempo total e < 5 minutos. Nao e um problema pratico. Documentar por completude.

### Pitfall 4: `DOCKERHUB_TOKEN` deve ser Access Token, nao senha

**O que da errado:** Docker Hub rejeita autenticacao com senha da conta em pipelines (politica de seguranca); rate limits mais agressivos.

**Por que acontece:** Docker Hub recomenda Access Tokens para CI/CD. Gerado em hub.docker.com > Account Settings > Personal Access Tokens.

**Como evitar:** Confirmar que o usuario gera um Access Token, nao usa a senha da conta. O secret se chama `DOCKERHUB_TOKEN` (D-03) — o nome ja comunica a expectativa.

[CITED: docs.docker.com/guides/gha]

### Pitfall 5: `RepullImageAndRedeploy` vs `pullImage`

**O que da errado:** Documentacoes antigas mencionam `pullImage: true` mas a API atual do Portainer usa `RepullImageAndRedeploy: true` no corpo do PUT.

**Por que acontece:** A API evoluiu e o campo foi renomeado/adicionado.

**Como evitar:** Usar `RepullImageAndRedeploy: true` no corpo do PUT para `api/stacks/{id}`.

[CITED: oneuptime.com/blog/post/2026-03-20-automate-image-updates-portainer-api]

---

## Code Examples

### Fluxo Portainer completo (curl + jq inline)

```bash
# Source: deviantony gist + oneuptime.com/blog/post/2026-03-20-github-actions-portainer
# Step 1: Autenticar - POST /api/auth
JWT=$(curl -fsSL -X POST "${PORTAINER_URL}/api/auth" \
  -H "Content-Type: application/json" \
  -d "{\"Username\":\"${PORTAINER_USERNAME}\",\"Password\":\"${PORTAINER_PASSWORD}\"}" \
  | jq -r '.jwt')

# Step 2: Buscar stack file - GET /api/stacks/{id}/file
STACK_FILE=$(curl -fsSL \
  -H "Authorization: Bearer $JWT" \
  "${PORTAINER_URL}/api/stacks/${PORTAINER_STACK_ID}/file" \
  | jq -r '.StackFileContent')

# Step 3: Redeploy - PUT /api/stacks/{id}?endpointId={N}
curl -fsSL -X PUT \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  "${PORTAINER_URL}/api/stacks/${PORTAINER_STACK_ID}?endpointId=${PORTAINER_ENDPOINT_ID}" \
  -d "{
    \"StackFileContent\": $(echo "$STACK_FILE" | jq -Rs .),
    \"Env\": [],
    \"Prune\": false,
    \"RepullImageAndRedeploy\": true
  }"
```

### Docker Hub build + push minimal

```yaml
# Source: github.com/marketplace/actions/build-and-push-docker-images (v7.2.0)
- name: Login to Docker Hub
  uses: docker/login-action@v4
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}

- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v4

- name: Build and push
  uses: docker/build-push-action@v7
  with:
    context: .
    push: true
    tags: biellil/dockgate:latest
    platforms: linux/amd64
```

---

## State of the Art

| Abordagem Antiga | Abordagem Atual | Quando Mudou | Impacto |
|-----------------|-----------------|--------------|---------|
| `docker/build-push-action@v6` | `docker/build-push-action@v7` | v7.2.0 lancado maio 2026 | Usar v7 em novos workflows |
| `docker/login-action@v3` | `docker/login-action@v4` | 2024/2025 | Usar v4 |
| `docker/setup-buildx-action@v3` | `docker/setup-buildx-action@v4` | 2024/2025 | Usar v4 |
| `pullImage: true` no Portainer PUT | `RepullImageAndRedeploy: true` | Versao Portainer recente | Campo antigo pode nao funcionar |

**Descontinuados/obsoletos:**
- `docker/build-push-action@v5` e anteriores: funcional mas nao recomendado para novos workflows
- Portainer `pullImage` (campo legado): substituido por `RepullImageAndRedeploy`

---

## Open Questions

### 1. `PORTAINER_ENDPOINT_ID` nao esta nos secrets de D-09

**O que sabemos:** A API `PUT /api/stacks/{id}` exige `?endpointId={N}` como query parameter obrigatorio. Sem ele, a API retorna erro sobre "environment not found".

**O que esta indefinido:** D-09 lista apenas `PORTAINER_URL`, `PORTAINER_USERNAME`, `PORTAINER_PASSWORD`, `PORTAINER_STACK_ID`. O `PORTAINER_ENDPOINT_ID` nao esta listado.

**Recomendacao:** O planner deve incluir um passo de configuracao que instrua o usuario a obter o `endpointId` (normalmente `1` em instalacoes Portainer padrao com um unico Docker environment) e adicioná-lo como secret `PORTAINER_ENDPOINT_ID`. O workflow deve referenciar `${{ secrets.PORTAINER_ENDPOINT_ID }}`.

**Alternativa se o planner quiser simplificar:** Usar `GET /api/stacks/${PORTAINER_STACK_ID}` (sem `/file`) e extrair o `EndpointId` do JSON de resposta com `jq -r '.EndpointId'` — evita um secret extra. Porem adiciona complexidade ao script inline.

### 2. Step de verificacao pos-redeploy

**O que sabemos:** Claude tem discricao para incluir ou nao um step de verificacao (ex: `curl /health` com retry).

**Recomendacao:** Incluir um step simples com `sleep 10 && curl -f ${PORTAINER_URL_APP}/health` aumenta confiabilidade, mas requer que o usuario configure a URL publica da app como secret/variavel adicional. Para um MVP, omitir e aceitavel.

---

## Environment Availability

| Dependencia | Exigida Por | Disponivel | Versao | Fallback |
|-------------|------------|-----------|--------|----------|
| Docker | Build local (nao necessario no CI) | Sim | 29.4.1 | — |
| `curl` | Chamadas Portainer API no runner | Sim (ubuntu-latest pre-instalado) | — | — |
| `jq` | Parse JSON no runner | [ASSUMED] Sim | — | `python3 -c 'import json,sys; ...'` |
| `docker/login-action@v4` | Auth Docker Hub | Sim (GitHub Marketplace) | v4 | — |
| `docker/setup-buildx-action@v4` | Buildx | Sim (GitHub Marketplace) | v4 | Omitir (build funciona sem, porem sem cache) |
| `docker/build-push-action@v7` | Build + push | Sim (GitHub Marketplace) | v7.2.0 | — |

**Dependencias faltantes sem fallback:** Nenhuma — todos os recursos estao disponiveis no ambiente GitHub Actions.

---

## Assumptions Log

| # | Claim | Secao | Risco se Errado |
|---|-------|-------|----------------|
| A1 | `jq` esta pre-instalado no `ubuntu-latest` | Environment Availability | Script inline quebra; fallback: usar `python3 -c 'import json,sys; ...'` |
| A2 | `RepullImageAndRedeploy` e o campo correto para a versao Portainer do usuario | Code Examples / Pitfall 5 | PUT retorna 400 ou ignora o campo; usuario precisa testar com sua versao |
| A3 | `endpointId=1` e o ID correto para instalacoes Portainer padrao | Open Questions | PUT retorna erro de environment; usuario precisa verificar no painel |

---

## Validation Architecture

> Fase de CI/CD pura — os artefatos produzidos sao YAML e Compose, sem codigo TypeScript de runtime. Nao ha suite de testes automatizados aplicavel. Validacao e feita via execucao manual do workflow.

### Checklist de Validacao Manual

| Req | Comportamento | Como Verificar |
|-----|--------------|---------------|
| D-01/02 | Imagem publicada como `biellil/dockgate:latest` | Acessar hub.docker.com/r/biellil/dockgate apos push no master |
| D-05 | Workflow dispara apenas em push no master | Abrir uma PR e confirmar que deploy.yml NAO executa |
| D-06/07/08 | Portainer faz pull e redeploy | Checar logs do container no Portainer apos pipeline |
| D-11/12 | `deploy/docker-compose.yml` existe com todos os env vars | `cat deploy/docker-compose.yml` e verificar campos |

**Wave 0 Gaps:** Nenhum arquivo de teste a criar — fase de infraestrutura CI/CD.

---

## Security Domain

| Categoria ASVS | Aplica | Controle |
|----------------|--------|---------|
| V2 Autenticacao | Sim (secrets) | GitHub Secrets para `DOCKERHUB_TOKEN`, `PORTAINER_PASSWORD` — nunca em plain text no YAML |
| V3 Session Management | Nao | JWT Portainer e efemero, usado e descartado |
| V4 Access Control | Sim | Workflow restrito a branch `master`; secrets nao expostos em logs |
| V5 Input Validation | Nao | Nao ha inputs de usuario neste pipeline |
| V6 Criptografia | Sim | HTTPS obrigatorio para `PORTAINER_URL` e Docker Hub |

### Ameacas Conhecidas

| Padrao | STRIDE | Mitigacao |
|--------|--------|-----------|
| Vazamento de secrets em logs | Information Disclosure | Nunca usar `echo $SECRET`; GitHub mascara automaticamente secrets registrados |
| Man-in-the-middle no PUT Portainer | Tampering | Usar `https://` em `PORTAINER_URL`; nao usar `curl -k` (skip TLS verification) |
| Token Docker Hub comprometido | Elevation of Privilege | Usar Access Token com escopo minimo (Read/Write, sem Admin); rotacionar periodicamente |

---

## Sources

### Primary (HIGH confidence)
- [Docker GitHub Actions guide](https://docs.docker.com/guides/gha/) — workflow canonico com versoes das actions
- [docker/build-push-action marketplace](https://github.com/marketplace/actions/build-and-push-docker-images) — versao atual v7.2.0, parametros
- [Portainer HTTP API by example (gist deviantony)](https://gist.github.com/deviantony/77026d402366b4b43fa5918d41bc42f8) — POST /api/auth, GET /file, PUT body
- `lint.yml` existente no repositorio — padrao de acoes e versoes ja validadas no projeto

### Secondary (MEDIUM confidence)
- [oneuptime.com: Automate Image Updates via Portainer API](https://oneuptime.com/blog/post/2026-03-20-automate-image-updates-portainer-api/view) — `RepullImageAndRedeploy`, `X-API-Key` pattern
- [oneuptime.com: GitHub Actions + Portainer](https://oneuptime.com/blog/post/2026-03-20-github-actions-portainer/view) — fluxo completo com GET /file + PUT, `python3 -c` para JSON

### Tertiary (LOW confidence)
- [portainer/portainer issue #9210](https://github.com/portainer/portainer/issues/9210) — `endpointId` obrigatorio no PUT (sinalizado pela comunidade, nao documentado oficialmente nesta pesquisa)

---

## Metadata

**Confidence breakdown:**
- Standard Stack (actions Docker): HIGH — versoes verificadas em marketplace e docs oficiais
- Workflow YAML pattern: HIGH — baseado em docs oficiais + lint.yml existente do projeto
- Portainer API flow: MEDIUM — POST /api/auth verificado; `RepullImageAndRedeploy` verificado em fonte de 2026; `endpointId` obrigatorio verificado por issue da comunidade
- `jq` disponibilidade no runner: LOW — amplamente assumido, nao verificado em changelog oficial ubuntu-latest

**Research date:** 2026-06-17
**Valid until:** 2026-09-17 (90 dias — Docker actions e Portainer API sao estaveis; verificar versoes das actions antes de implementar)
