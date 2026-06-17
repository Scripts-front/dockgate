# Phase 5: subir docker image para o Docker Hub via CI/CD - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 05-subir-docker-image-para-o-docker-hub-via-ci-cd
**Areas discussed:** Docker Hub target, Portainer update, CI trigger, Image tagging

---

## Docker Hub target

| Option | Description | Selected |
|--------|-------------|----------|
| biellil/dockgate | Imagem pública no Docker Hub, org = username pessoal | ✓ |
| Outra org ou nome | Org customizada ou nome diferente | |

**User's choice:** `biellil/dockgate`, público

---

## Hub visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Pública | Acessível sem login. Portainer faz pull sem credenciais | ✓ |
| Privada | Requer imagePullSecret ou credenciais no Portainer | |

**User's choice:** Pública

---

## Portainer update mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Portainer webhook | POST na webhook URL gerada pelo Portainer — 1 secret | |
| Portainer API + token | Chamada REST com autenticação — mais flexível | ✓ |
| Watchtower | Monitoramento automático no servidor — não determinístico | |

**User's choice:** Portainer API + token

**Notes:** Usuário especificou fluxo exato: `POST /api/auth` (user+pass → JWT) → `GET /api/stacks/{id}` (pegar stack file atual) → `PUT /api/stacks/{id}` com `pullImage: true`. Secrets: `PORTAINER_URL`, `PORTAINER_USERNAME`, `PORTAINER_PASSWORD`. Stack ID como secret `PORTAINER_STACK_ID` (não o ID 665 inicialmente mencionado — será o ID real após criar a stack no Portainer).

---

## Portainer API endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| POST /api/stacks/{id}/redeploy | Endpoint de redeploy simplificado | |
| PUT /api/stacks/{id} com stack file atual | Atualização completa da stack com pullImage: true | ✓ |

**User's choice:** Fluxo completo: GET stack file + PUT com pullImage: true

---

## Portainer secrets

| Option | Description | Selected |
|--------|-------------|----------|
| PORTAINER_URL + PORTAINER_API_TOKEN + PORTAINER_STACK_ID | 3 secrets com token direto | |
| PORTAINER_URL + PORTAINER_USERNAME + PORTAINER_PASSWORD + PORTAINER_STACK_ID | 4 secrets com credenciais de login | ✓ |

**User's choice:** Username + Password (JWT obtido em runtime)

---

## CI trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Tag push v*.*.* | Releases explícitas — consistente com Fase 3 | |
| Push no master | Cada merge gera deploy imediato | ✓ |
| Tag push + dispatch manual | Trigger principal + redeploy manual | |

**User's choice:** Push no master

---

## Image tagging

| Option | Description | Selected |
|--------|-------------|----------|
| :latest | Sobrescreve a cada build. Simples para API interna | ✓ |
| :latest + SHA do commit | Permite rollback por SHA | |
| :latest + data YYYY-MM-DD | Legível por data | |

**User's choice:** :latest only

---

## Registry

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas Docker Hub | Mais simples | ✓ |
| Docker Hub + GHCR | Redundância entre registries | |

**User's choice:** Apenas Docker Hub

---

## Docker Hub secrets

| Option | Description | Selected |
|--------|-------------|----------|
| DOCKERHUB_USERNAME + DOCKERHUB_TOKEN | Nomes padrão da comunidade | ✓ |
| Nomes customizados | — | |

**User's choice:** DOCKERHUB_USERNAME + DOCKERHUB_TOKEN

---

## Deploy Compose

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas DockGate | Serviço da API com biellil/dockgate:latest | ✓ |
| DockGate + MinIO | Stack completa | |

**User's choice:** Apenas DockGate (MinIO já roda separado)

---

## Compose path

| Option | Description | Selected |
|--------|-------------|----------|
| deploy/docker-compose.yml | Pasta dedicada a artefatos de deploy | ✓ |
| docker-compose.yml na raiz | Mais visibilidade, pode confundir com dev local | |

**User's choice:** deploy/docker-compose.yml

---

## Claude's Discretion

- Plataforma de build (linux/amd64 sugerido)
- Nomes dos jobs e steps no YAML
- Step de verificação pós-redeploy
- Configuração de restart no compose

## Deferred Ideas

Nenhuma ideia fora do escopo mencionada.
