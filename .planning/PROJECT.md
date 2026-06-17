# DockGate

## What This Is

API de distribuição privada de imagens Docker para clientes autorizados. Armazena imagens exportadas como arquivos `.tar` no MinIO e permite que clientes façam download direto sem precisar de Docker Registry ou credenciais de registry. Suporta múltiplas apps e versionamento semântico.

## Core Value

Clientes autorizados conseguem baixar a versão mais recente de qualquer app registrada com um único token — sem Docker Registry, sem login, sem complexidade.

## Requirements

### Validated

- [x] Endpoint `GET /apps/:name/latest` retorna a versão mais recente da app — Validated in Phase 2: Core API
- [x] Endpoint `GET /apps/:name/download?version=X` valida token, verifica existência da versão e retorna URL pré-assinada do MinIO — Validated in Phase 2: Core API
- [x] Endpoint `POST /apps/:name/upload?version=X` gera URL pré-assinada de upload para CI/CD enviar o `.tar` diretamente ao MinIO — Validated in Phase 2: Core API
- [x] Endpoint `PUT /apps/:name/latest` atualiza o `latest.json` no MinIO com a nova versão (requer UPLOAD_TOKEN) — Validated in Phase 2: Core API
- [x] Autenticação por dois tokens fixos: `DOWNLOAD_TOKEN` (clientes) e `UPLOAD_TOKEN` (CI/CD) — Validated in Phase 1: Foundation

### Validated

- [x] Documentação CI/CD completa: workflow GitHub Actions copy-paste + guia de integração com secrets, walk-through e troubleshooting — Validated in Phase 3: CI/CD Docs

### Active

- [ ] Bucket único no MinIO com estrutura de pastas por app (`myapp/1.0.0.tar`, `myapp/latest.json`)
- [ ] Container Docker da API com deploy via CI/CD no Portainer

### Out of Scope

- Docker Registry — objetivo é eliminar a necessidade
- Sistema de usuários, login, refresh token ou rotação de credenciais — token fixo é suficiente
- Banco de dados — estado mantido exclusivamente no MinIO
- Painel administrativo — gestão via API + CI/CD
- Controle avançado de permissões — dois tokens (leitura / escrita) é o limite
- Upload de `.tar` com proxy pela API — CI/CD faz upload direto no MinIO via URL pré-assinada

## Context

- **MinIO existente**: MinIO já roda separado na VPS; a API apenas se conecta via SDK.
- **Clientes finais**: scripts de atualização que consultam `/latest`, comparam versão local, baixam `.tar` e executam `docker load` + `docker compose up -d`.
- **CI/CD**: pipeline que builda, exporta o `.tar`, solicita URL de upload, envia para MinIO e atualiza o `latest.json`.
- **Deploy**: API sobe como container único no Portainer — sem `docker-compose` junto ao MinIO.

## Constraints

- **Tech stack**: Bun + Express + TypeScript — decisão do dono do projeto
- **Armazenamento**: MinIO (SDK oficial `minio`) — bucket único, pastas por app
- **Auth**: tokens fixos via variáveis de ambiente (`DOWNLOAD_TOKEN`, `UPLOAD_TOKEN`) — sem JWT, OAuth ou complexidade adicional
- **Runtime**: Container Docker, deploy via CI/CD no Portainer
- **Sem estado local**: API é stateless — todo estado (versões, arquivos) fica no MinIO

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Multi-app via path params (`/apps/:name`) | Permite servir N apps sem criar novos buckets ou instâncias da API | — Pending |
| Upload via URL pré-assinada (não proxy) | CI/CD faz upload direto no MinIO — API não precisa fazer buffer de arquivos `.tar` (podem ser grandes) | — Pending |
| `UPLOAD_TOKEN` separado do `DOWNLOAD_TOKEN` | CI/CD tem credencial de escrita isolada; comprometer token de cliente não dá acesso de escrita | — Pending |
| Um bucket, pastas por app | Mais simples de gerenciar e configurar permissões no MinIO | — Pending |
| Bun como runtime | Performance superior ao Node.js para I/O e startup time em container | — Pending |

## Evolution

Este documento evolui em transições de fase e marcos do projeto.

**Após cada fase** (via `/gsd-transition`):
1. Requirements invalidados? → Mover para Out of Scope com motivo
2. Requirements validados? → Mover para Validated com referência da fase
3. Novos requirements emergiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se divergiu

**Após cada milestone** (via `/gsd-complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value — ainda é a prioridade certa?
3. Auditoria de Out of Scope — motivos ainda válidos?
4. Atualizar Context com estado atual

---
*Last updated: 2026-06-17 — Phase 3 complete: CI/CD integration docs (GitHub Actions YAML + guide)*
