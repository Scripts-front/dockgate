# Phase 2: Core API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 02-core-api
**Areas discussed:** Shape das respostas com URL, Body do PUT /latest, publishedAt: API ou CI/CD?, Mensagens de erro 404

---

## Shape das respostas com URL

| Option | Description | Selected |
|--------|-------------|----------|
| `{ url }` apenas | Mínimo necessário. Scripts usam imediatamente, sem precisar do TTL. | ✓ |
| `{ url, expiresIn: 3600 }` | Inclui TTL em segundos para scripts verificarem validade. | |
| `{ url, expiresAt: "ISO timestamp" }` | Inclui timestamp absoluto de vencimento. | |

**User's choice:** `{ url }` apenas

---

| Option | Description | Selected |
|--------|-------------|----------|
| 404 com `{ error: "No versions published" }` | Informa que o app existe mas não tem versões. Distingue de "versão não encontrada". | ✓ |
| 404 com `{ error: "Not found" }` | Genérico — não distingue os casos. | |
| Claude decide | Deixar a implementação escolher conforme erro do SDK MinIO. | |

**User's choice:** 404 com `{ error: "No versions published" }`

---

## Body do PUT /latest

| Option | Description | Selected |
|--------|-------------|----------|
| `{ version, sha256, size }` | CI/CD calcula sha256 e size. API recebe, valida, faz anti-phantom e escreve latest.json. | ✓ |
| `{ version, sha256 }` | CI/CD só envia sha256; API busca size via statObject() que já é chamado para anti-phantom. | |
| `{ version, sha256, size, publishedAt }` | CI/CD controla todos os campos do latest.json, incluindo timestamp. | |

**User's choice:** `{ version, sha256, size }`

---

| Option | Description | Selected |
|--------|-------------|----------|
| Validar formato do sha256 | Rejeita com 400 se sha256 não for hex de 64 chars. Detecta erros de integração cedo. | ✓ |
| Confiar sem validar | Só checa presença do campo. Problemas aparecem quando cliente verifica download. | |

**User's choice:** Validar formato (hex de 64 caracteres)

---

## publishedAt: API ou CI/CD?

| Option | Description | Selected |
|--------|-------------|----------|
| API define (server time) | API usa `new Date().toISOString()` no processamento. Simples, CI/CD não precisa enviar. | ✓ |
| CI/CD envia no body | Mais auditável, reflete timestamp do build. Requer validação de formato ISO 8601. | |

**User's choice:** API define com server time

---

## Mensagens de erro 404

| Option | Description | Selected |
|--------|-------------|----------|
| `{ error: "Version X not found" }` | Inclui versão solicitada. Fácil de debugar nos logs. | ✓ |
| `{ error: "Not found" }` | Genérico. O caller já sabe qual versão pediu. | |

**User's choice:** `{ error: "Version X not found" }` (com versão interpolada)

---

| Option | Description | Selected |
|--------|-------------|----------|
| `{ error: "Tar file not found for version X" }` | Claramente indica que o .tar não foi encontrado no MinIO. CI/CD entende que precisa subir o arquivo primeiro. | ✓ |
| `{ error: "Version not uploaded" }` | Mais amigável, menos preciso sobre o que fazer. | |
| `{ error: "Unprocessable" }` | Só o status 422 explica, sem mensagem útil. | |

**User's choice:** `{ error: "Tar file not found for version X" }` (com versão interpolada)

---

## Claude's Discretion

- Organização dos arquivos de rota (um apps.ts ou arquivos separados)
- Ordem de middlewares nos routes (sanitize vs auth)
- Tratamento de erros inesperados do MinIO SDK
- Formato de mensagens de log

## Deferred Ideas

Nenhuma ideia fora do escopo surgiu durante a discussão.
