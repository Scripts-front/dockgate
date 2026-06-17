# Phase 4: Add ESLint configuration (.eslintrc) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 04-add-eslint-configuration-eslintrc
**Areas discussed:** Config format, Rule strictness, Integration scope, File targets

---

## Config format

| Option | Description | Selected |
|--------|-------------|----------|
| eslint.config.js | ESLint v9 flat config — padrão atual, menor complexidade, suporte oficial | ✓ |
| .eslintrc.json | ESLint v8 legacy format — deprecado desde ESLint v9, ainda funcional | |

**User's choice:** `eslint.config.js` (ESLint v9 flat config)
**Notes:** O nome `.eslintrc` no título da fase é apenas descritivo, não um requisito de formato.

---

## Rule strictness

| Option | Description | Selected |
|--------|-------------|----------|
| strict | `typescript-eslint/strict` — mais rigoroso que recommended, sem overhead de type-checking | ✓ |
| strict-type-checked | Type-aware rules, exige `parserOptions.project`, mais lento | |
| recommended | Regras mínimas, ponto de partida para customização manual | |

**User's choice:** `typescript-eslint/strict`
**Notes:** Alinhado com `strict: true` já ativo no tsconfig. Sem type-aware rules para evitar overhead.

---

## Integration scope

| Option | Description | Selected |
|--------|-------------|----------|
| Script package.json | Script `lint` em package.json | ✓ |
| CI (GitHub Actions) | Step no workflow de CI do repositório DockGate | ✓ |
| Pre-commit hook (husky) | husky + lint-staged para bloquear commits com lint error | ✓ |

**User's choice:** Todos os três
**Notes:** CI é um novo workflow `.github/workflows/lint.yml` para o repositório DockGate — diferente do workflow de exemplo da Fase 3 que fica em `docs/examples/`.

---

## File targets

| Option | Description | Selected |
|--------|-------------|----------|
| src/**/*.ts apenas | Só código de produção | ✓ |
| src/**/*.ts + root *.ts | Inclui scripts TypeScript na raiz | |

**User's choice:** `src/**/*.ts` apenas
**Notes:** Arquivos de config na raiz não precisam ser lintados.

---

## Claude's Discretion

- Regras customizadas adicionais além da base `strict`
- Configuração exata do lint-staged (flags --fix ou não)
- Nome do job e triggers do workflow lint.yml

## Deferred Ideas

None — discussion stayed within phase scope.
