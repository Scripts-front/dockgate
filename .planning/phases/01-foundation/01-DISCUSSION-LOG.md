# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 01-foundation
**Areas discussed:** MinIO network access, MinIO TLS, Container port, Project structure

---

## MinIO network access

| Option | Description | Selected |
|--------|-------------|----------|
| Internal Docker network only | API usa hostname interno (ex: minio:9000); presigned URLs precisam de endpoint público separado | ✓ |
| External public hostname | API e clientes usam o mesmo hostname público | |
| Both — internal + external | API usa interno, presigned URLs usam público via MINIO_PUBLIC_ENDPOINT | |

**User's choice:** Internal Docker network only  
**Notes:** Implica que `MINIO_PUBLIC_ENDPOINT` deve ser um env var obrigatório separado para que clientes consigam acessar URLs pré-assinadas.

---

## MinIO TLS (SSL)

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP (sem TLS) | MinIO sem certificado, useSSL: false | ✓ |
| HTTPS (com TLS) | MinIO com certificado TLS, useSSL: true | |

**User's choice:** HTTP (sem TLS)  
**Notes:** `useSSL: false` no cliente MinIO. URLs pré-assinadas usarão `http://`.

---

## Container port

| Option | Description | Selected |
|--------|-------------|----------|
| Configurável via PORT env var | Porta definida por env var com fallback 3000 | ✓ |
| Fixa 3000 | Sempre porta 3000 | |

**User's choice:** Configurável via PORT env var  
**Notes:** Mais flexível para Portainer — pode mapear porta diferente sem rebuild.

---

## Project structure

| Option | Description | Selected |
|--------|-------------|----------|
| Flat (arquivos na raiz de src/) | src/index.ts, config.ts, middleware.ts, minio.ts | |
| Organizado por camada | src/routes/, src/middleware/, src/lib/ | ✓ |

**User's choice:** Organizado por camada  
**Notes:** Estrutura definida em D-08 no CONTEXT.md.

---

## Claude's Discretion

- Formato exato de mensagens de erro de startup
- Estratégia de log (console.log simples)
- Sem retry na conexão MinIO (fail-fast por design, per INFRA-03)

## Deferred Ideas

None.
