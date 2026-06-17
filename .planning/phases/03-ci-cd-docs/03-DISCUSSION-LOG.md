# Phase 3: CI/CD Docs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 03-ci-cd-docs
**Areas discussed:** Localização do guia e do YAML, Trigger e versionamento, Escopo do YAML de exemplo, Secrets e setup instructions

---

## Localização do guia e do YAML

### Onde fica o documento de guia CI/CD?

| Option | Description | Selected |
|--------|-------------|----------|
| docs/ci-cd.md | Documento dedicado em pasta docs/. README aponta para ele com um link. | ✓ |
| Seção no README.md | Tudo em um arquivo só. Mais simples, mas o README pode ficar longo. | |

**User's choice:** docs/ci-cd.md

---

### Onde fica o YAML de exemplo do GitHub Actions?

| Option | Description | Selected |
|--------|-------------|----------|
| docs/examples/github-actions.yml | Arquivo de referência fora do .github/. Não é executado automaticamente no repo do DockGate. | ✓ |
| .github/workflows/release.yml | Fica dentro do .github/ do repo DockGate. É executado pelo GitHub Actions no próprio repo. | |

**User's choice:** docs/examples/github-actions.yml

---

## Trigger e versionamento

### O que dispara o workflow de exemplo?

| Option | Description | Selected |
|--------|-------------|----------|
| Tag push (v*.*.*) | Workflow roda quando o dev cria uma tag de release. Padrão de mercado para releases. | ✓ |
| Workflow dispatch (input manual) | Dev aciona manualmente e digita a versão no campo de input. | |
| Push to main | Roda em todo push para main. Versão precisa vir de outra fonte. | |

**User's choice:** Tag push (v*.*.*)

---

### Como a versão é derivada no workflow de tag push?

| Option | Description | Selected |
|--------|-------------|----------|
| Da tag git, sem o 'v' | Ex: tag v1.2.3 → versão "1.2.3". Shell: ${GITHUB_REF#refs/tags/v}. | ✓ |
| Da tag git, mantendo o 'v' | Ex: tag v1.2.3 → versão "v1.2.3". Prefixo 'v' fica no nome do arquivo no MinIO. | |
| Claude decide | Sem preferência — implementador escolhe. | |

**User's choice:** Da tag git, sem o 'v'

---

## Escopo do YAML de exemplo

### Quão completo deve ser o workflow YAML de exemplo?

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline completo | Inclui todos os passos: checkout, docker build, docker save, sha256/size, request URL, PUT MinIO, PUT /latest. | ✓ |
| Só os passos DockGate | Assume que o dev já tem os passos de build. YAML mostra apenas as chamadas de API. | |
| Dois YAMLs: completo e mínimo | Um completo para iniciantes, um snippet mínimo para quem já tem pipeline. | |

**User's choice:** Pipeline completo

---

### O YAML deve incluir cálculo de sha256 e size do .tar?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, incluir no workflow | Workflow usa sha256sum e stat -c%s para calcular antes de chamar a API. | ✓ |
| Documentar como responsabilidade do dev | Guia explica que o dev precisa calcular, mas YAML não inclui a lógica. | |

**User's choice:** Sim, incluir no workflow

---

## Secrets e setup instructions

### Qual o nome dos secrets no GitHub Actions?

| Option | Description | Selected |
|--------|-------------|----------|
| DOCKGATE_URL + DOCKGATE_UPLOAD_TOKEN | Nome específico por serviço. Claro que são credenciais do DockGate. | ✓ |
| APP_REGISTRY_URL + APP_REGISTRY_TOKEN | Nome mais genérico orientado ao uso. | |

**User's choice:** DOCKGATE_URL + DOCKGATE_UPLOAD_TOKEN

---

### O guia deve incluir instruções de setup dos secrets no GitHub?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, com passo a passo | Guia explica Settings > Secrets, quais valores adicionar, o que cada um mapeia na API. | |
| Só a lista de secrets necessários | Documenta apenas os nomes e valores esperados. | ✓ |

**User's choice:** Só a lista de secrets necessários

---

## Claude's Discretion

- Estrutura interna do docs/ci-cd.md (ordem das seções, nível de detalhe)
- Nome da app (APP_NAME) no YAML — variável de env no topo do workflow
- Formato exato dos curl commands
- Comentários inline no YAML

## Deferred Ideas

None.
