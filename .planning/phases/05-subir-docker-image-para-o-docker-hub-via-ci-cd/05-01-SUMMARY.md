---
phase: 05-subir-docker-image-para-o-docker-hub-via-ci-cd
plan: 01
subsystem: infra
tags: [github-actions, docker-hub, portainer, ci-cd, docker-compose]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: env vars obrigatorios da API (DOWNLOAD_TOKEN, UPLOAD_TOKEN, MINIO_*)
  - phase: 04-add-eslint-configuration-eslintrc
    provides: lint.yml existente como referência de padrão de workflow
provides:
  - Pipeline CI/CD completo: push no master -> build -> push Docker Hub -> redeploy Portainer
  - deploy/docker-compose.yml pronto para importar no Portainer
  - Imagem biellil/dockgate:latest publicada automaticamente a cada push no master
affects:
  - 06-protect-public-repo

# Tech tracking
tech-stack:
  added:
    - docker/login-action@v4
    - docker/setup-buildx-action@v4
    - docker/build-push-action@v7
  patterns:
    - Two-job workflow (build-push + portainer-deploy com needs:)
    - Portainer API flow via curl inline: POST /api/auth -> GET /stacks/{id}/file -> PUT /stacks/{id}?endpointId=
    - jq -Rs . para escapar YAML multi-linha como JSON string valida

key-files:
  created:
    - deploy/docker-compose.yml
    - .github/workflows/deploy.yml
  modified: []

key-decisions:
  - "PORTAINER_ENDPOINT_ID adicionado como 8o secret (nao estava em D-09 do CONTEXT.md) — obrigatorio para PUT /api/stacks/{id}?endpointId= funcionar"
  - "Validacao explicita de JWT e STACK_FILE com exit 1 antes do PUT — mitiga T-05-02"
  - "Sem step de verificacao pos-redeploy — URL publica da app seria secret adicional; MVP omite (Claude's Discretion)"
  - "push no master como unico trigger — sem pull_request para evitar push de :latest em PRs abertas"

patterns-established:
  - "Portainer API: sempre incluir ?endpointId= no PUT /api/stacks/{id}"
  - "Portainer API: usar RepullImageAndRedeploy: true (nao pullImage — campo legado)"
  - "JSON inline com YAML multi-linha: escapar com jq -Rs ."

requirements-completed: [INFRA-02, INFRA-04]

# Metrics
duration: 15min
completed: 2026-06-17
---

# Phase 5 Plan 01: CI/CD Deploy Workflow + Compose Summary

**GitHub Actions pipeline com dois jobs (build-push + portainer-deploy) publicando biellil/dockgate:latest no Docker Hub e acionando redeploy automatico da stack no Portainer via API REST a cada push no master**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-17T21:00:00Z
- **Completed:** 2026-06-17T21:15:00Z
- **Tasks:** 2
- **Files modified:** 2 criados

## Accomplishments

- `deploy/docker-compose.yml` com servico unico `dockgate`, imagem `biellil/dockgate:latest`, restart policy e todos os 8 env vars obrigatorios como placeholders para preenchimento no Portainer
- `.github/workflows/deploy.yml` com dois jobs sequenciais: `build-push` (Docker Hub via actions oficiais v4/v4/v7) e `portainer-deploy` (fluxo curl inline: auth JWT -> get stack file -> PUT redeploy com RepullImageAndRedeploy)
- Todos os pitfalls criticos da pesquisa mitigados: `?endpointId=` obrigatorio, `RepullImageAndRedeploy` (nao `pullImage`), `jq -Rs .` para escape de YAML, validacao de JWT e STACK_FILE

## Task Commits

1. **Task 1: Criar deploy/docker-compose.yml** - `a5a5bb1` (ci)
2. **Task 2: Criar .github/workflows/deploy.yml** - `5b256e8` (ci)

## Files Created/Modified

- `deploy/docker-compose.yml` - Compose para Portainer: servico dockgate com imagem latest, restart:unless-stopped, porta 3000, 8 env vars como placeholders vazios
- `.github/workflows/deploy.yml` - Pipeline CI/CD: job build-push (login/buildx/push para biellil/dockgate:latest em linux/amd64) + job portainer-deploy (POST /api/auth -> GET stack file -> PUT redeploy)

## Decisions Made

- **PORTAINER_ENDPOINT_ID adicionado como secret obrigatorio:** D-09 do CONTEXT.md nao listava este secret, mas a pesquisa identificou que `PUT /api/stacks/{id}` exige `?endpointId=` como query param obrigatorio — sem ele a API retorna erro de environment not found. Secret adicionado e documentado.
- **Validacao de JWT e STACK_FILE antes do PUT:** Verifica que os valores nao sao vazios ou "null", com `exit 1` explicito — mitiga T-05-02 (tampering por falta de validacao de resposta).
- **Sem step de verificacao pos-redeploy:** Requereria URL publica da app como secret adicional; MVP omite conforme Claude's Discretion documentada no plano.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma devio do plano — os arquivos foram criados exatamente como especificado no PLAN.md.

A unica diferenca em relacao ao CONTEXT.md original (D-09) foi a adicao do secret `PORTAINER_ENDPOINT_ID`, que ja estava documentada no RESEARCH.md como "Open Question" resolvida e incorporada explicitamente ao PLAN.md como requisito.

---

**Total deviations:** 0

## Issues Encountered

**Worktree rebase acidental deletou arquivos de planning:** Ao executar `git reset --soft dfe5a4e` para posicionar o worktree no commit correto, os arquivos adicionados entre `6ea14ac` e `dfe5a4e` (05-01-PLAN.md, 05-CONTEXT.md, 05-DISCUSSION-LOG.md, 05-RESEARCH.md) foram marcados como staged deletions e incluidos no primeiro commit de task. Esses arquivos foram restaurados via `git checkout dfe5a4e -- <path>` e commitados separadamente (18474a2) antes de continuar com a Task 2.

## User Setup Required

Para o pipeline funcionar, o usuario precisa configurar os seguintes secrets no repositorio GitHub (`Settings > Secrets and variables > Actions`):

### Secrets do Docker Hub

| Secret | Como Obter |
|--------|-----------|
| `DOCKERHUB_USERNAME` | Nome de usuario no hub.docker.com (ex: `biellil`) |
| `DOCKERHUB_TOKEN` | hub.docker.com > Account Settings > Personal Access Tokens > Generate new token (escopo: Read/Write, **nao Admin** — veja T-05-04) |

### Secrets do Portainer

| Secret | Como Obter |
|--------|-----------|
| `PORTAINER_URL` | URL base do Portainer, com `https://` (ex: `https://portainer.meudominio.com`) — **obrigatoriamente HTTPS** |
| `PORTAINER_USERNAME` | Usuario de login no painel Portainer |
| `PORTAINER_PASSWORD` | Senha do usuario Portainer |
| `PORTAINER_STACK_ID` | Apos importar `deploy/docker-compose.yml` como nova Stack no Portainer: painel > Stacks > clicar na stack > inspecionar a URL do navegador (contem `/stacks/{ID}`) |
| `PORTAINER_ENDPOINT_ID` | Portainer > Environments > clicar no seu ambiente Docker > inspecionar a URL (contem `/endpoints/{ID}`). Em instalacoes padrao com um unico ambiente, normalmente e `1` |

### Onboarding: Criando a Stack no Portainer

1. Abrir o Portainer e navegar para **Stacks > Add stack**
2. Selecionar **Upload** e enviar o arquivo `deploy/docker-compose.yml`
3. Preencher todos os valores de environment variables (DOWNLOAD_TOKEN, UPLOAD_TOKEN, MINIO_*, PORT)
4. Clicar em **Deploy the stack** — anotar o ID na URL para configurar `PORTAINER_STACK_ID`
5. Anotar o ID do ambiente em Portainer > Environments para configurar `PORTAINER_ENDPOINT_ID`
6. Configurar os 7 secrets no GitHub
7. Fazer um push no master — o pipeline ira buildar, publicar e acionar o redeploy automaticamente

## Next Phase Readiness

- Pipeline CI/CD completo — qualquer push no master publica nova versao em producao
- `deploy/docker-compose.yml` pronto para importar no Portainer
- Proximo passo: Phase 6 (proteger repositorio publico)

## Known Stubs

Nenhum — os arquivos criados sao artefatos de infraestrutura (YAML de workflow e Compose), sem stubs de codigo.

## Threat Flags

Nenhuma superficie de seguranca nova alem do documentado no threat model do plano (T-05-01 a T-05-07 todos mitigados ou aceitos conforme especificado).

## Self-Check: PASSED

- FOUND: deploy/docker-compose.yml
- FOUND: .github/workflows/deploy.yml
- FOUND: 05-01-SUMMARY.md
- FOUND commit: a5a5bb1 (Task 1 — docker-compose.yml)
- FOUND commit: 5b256e8 (Task 2 — deploy.yml)
