# Phase 6: Proteger repositório público - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 06-protect-public-repo
**Areas discussed:** Branch protection no master, Ferramentas de segurança automáticas, Política de atualizações de dependência, SECURITY.md e política de divulgação

---

## Branch protection no master

| Option | Description | Selected |
|--------|-------------|----------|
| Checks obrigatórios + sem PR | Push direto permitido, checks obrigatórios de CI | ✓ |
| PR obrigatório (sem review humana) | Todo merge via PR, deploy.yml precisaria ser ajustado | |
| Só bloquear push forçado | Proteção mínima, sem exigência de checks | |

**User's choice:** Checks obrigatórios + sem PR

---

| Option | Description | Selected |
|--------|-------------|----------|
| Lint + Typecheck | ESLint (lint.yml) + bun typecheck | ✓ |
| Apenas Lint | Só ESLint existente | |
| Lint + Deploy bem-sucedido | Checks de lint + deploy bem-sucedido | |

**User's choice:** Lint + Typecheck

---

## Ferramentas de segurança automáticas

| Option | Description | Selected |
|--------|-------------|----------|
| Dependabot | PRs automáticos para atualizações/vulnerabilidades | |
| CodeQL | Análise estática de vulnerabilidades no código | |
| Secret Scanning | Já ativo por padrão em repos públicos | |

**User's choice:** Nenhuma — "nao precisa disso"
**Notes:** Secret scanning já está ativo por padrão em repositórios públicos, sem configuração.

---

## Política de atualizações de dependência

| Option | Description | Selected |
|--------|-------------|----------|
| Manualmente, quando precisar | Sem automação — adequado para projeto pequeno | ✓ |
| Ativar Dependabot mesmo assim | Alertas de segurança sem PRs automáticos | |

**User's choice:** Manualmente, quando precisar

---

## SECURITY.md e política de divulgação

| Option | Description | Selected |
|--------|-------------|----------|
| Não precisa | Sem SECURITY.md | |
| SECURITY.md simples com email | Arquivo mínimo com email de contato | ✓ |

**User's choice:** SECURITY.md simples com email

**Follow-up:** Email para contato: `biel1313biel@gmail.com`

---

## Claude's Discretion

- Se adicionar typecheck como step em `lint.yml` ou criar `typecheck.yml` separado
- Formato exato do SECURITY.md
- Se branch protection será configurada via `gh api` ou documentada como passo manual

## Deferred Ideas

Nenhuma — discussão ficou dentro do escopo da fase.
