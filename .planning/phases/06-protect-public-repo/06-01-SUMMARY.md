---
phase: 06-protect-public-repo
plan: 01
subsystem: ci
tags: [github-actions, typecheck, typescript, security-policy]

requires:
  - phase: 04-add-eslint-configuration-eslintrc
    provides: "lint.yml workflow com job ESLint — base para adição do job Typecheck paralelo"

provides:
  - "Job Typecheck paralelo ao ESLint em lint.yml — status check context 'Typecheck' disponível para branch protection"
  - "SECURITY.md na raiz com email de contato biel1313biel@gmail.com"

affects:
  - "06-02 (branch protection) — depende do contexto 'Typecheck' criado aqui"

tech-stack:
  added: []
  patterns:
    - "Dois jobs paralelos em workflow GitHub Actions sem needs dependency"

key-files:
  created:
    - SECURITY.md
  modified:
    - .github/workflows/lint.yml

key-decisions:
  - "Job typecheck usa name: 'Typecheck' exato — esse é o contexto de status check para branch protection"
  - "Sem needs: entre jobs — lint e typecheck rodam em paralelo, não em sequência"
  - "SECURITY.md sem Dependabot/CodeQL (per D-06) — apenas email de contato"

patterns-established:
  - "Parallel CI jobs: each check as independent job with identical setup steps (checkout, bun, install)"

requirements-completed:
  - REPO-01
  - REPO-02

duration: 10min
completed: 2026-06-17
---

# Phase 06 Plan 01: Typecheck CI Job + SECURITY.md Summary

**Job Typecheck paralelo ao ESLint em lint.yml e SECURITY.md com email biel1313biel@gmail.com — pré-requisitos para branch protection**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-17T19:45:00Z
- **Completed:** 2026-06-17T19:55:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `.github/workflows/lint.yml` atualizado com job `typecheck:` paralelo ao `lint:` — status check context "Typecheck" agora disponível no GitHub
- `SECURITY.md` criado na raiz com canal de reporte de vulnerabilidades via email
- Ambos os jobs (ESLint e Typecheck) rodarão em paralelo em cada push/PR para master

## Task Commits

1. **Task 1: Adicionar job Typecheck ao lint.yml** - `13a8a59` (ci)
2. **Task 2: Criar SECURITY.md na raiz do repositório** - `9e06359` (security)

## Files Created/Modified

- `.github/workflows/lint.yml` - Adicionado job `typecheck:` paralelo ao `lint:`, ambos com `name:` exato para status checks do GitHub
- `SECURITY.md` - Security policy com email biel1313biel@gmail.com e instrução de não abrir issues públicas

## Status Check Contexts

| Job Key | name: field | GitHub Status Context |
|---------|------------|----------------------|
| `lint:` | `name: ESLint` | `ESLint` |
| `typecheck:` | `name: Typecheck` | `Typecheck` |

Esses são os nomes exatos a usar em branch protection settings (plano 06-02).

## Decisions Made

- Jobs rodam em paralelo (sem `needs:`) — cada um independente, CI mais rápido
- `name: Typecheck` (não `TypeCheck`, não `Type Check`) — preciso exato para o contexto do GitHub Actions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Git reset --soft deixou mudanças staged indesejadas**
- **Found during:** Task 1 (commit)
- **Issue:** O `git reset --soft` para ajustar o base do worktree deixou staged deleções de arquivos de planning que não deveriam estar no commit da Task 1
- **Fix:** `git reset --soft HEAD~1` + `git restore --staged .planning/ docs/` para destagear apenas o `lint.yml` antes de recommitar
- **Files modified:** Nenhum arquivo adicional — apenas correção do staging area
- **Verification:** `git diff --cached --name-only` retornou apenas `.github/workflows/lint.yml`
- **Committed in:** `13a8a59` (commit correto com apenas 1 arquivo)

---

**Total deviations:** 1 auto-fixed (blocking — problema de staging do worktree)
**Impact on plan:** Necessário para garantir commits limpos. Sem impacto funcional.

## Issues Encountered

- Worktree inicializado a partir de commit mais antigo que o target; `git reset --soft` para o commit correto (`a8dd9b5`) deixou staged diferenças reversas de arquivos de planning — resolvido com `git restore --staged` antes do commit

## User Setup Required

Após push deste branch para o GitHub (via orquestrador), o workflow "Lint" rodará automaticamente com os dois jobs. Para usar em branch protection:

1. Ir em Settings > Branches > Branch protection rules > master
2. Adicionar "ESLint" e "Typecheck" como required status checks
3. Isso é feito no plano 06-02

## Next Phase Readiness

- Plano 06-02 (branch protection via GitHub API) pode prosseguir assim que este branch for mergeado e o workflow rodar pelo menos uma vez
- Contextos "ESLint" e "Typecheck" precisam ter ao menos uma execução para aparecerem no autocomplete de branch protection settings

## Threat Surface Scan

Nenhuma nova superfície de segurança introduzida. O job Typecheck executa `tsc --noEmit` (sem side effects de rede). O SECURITY.md expõe email intencionalmente — documentado como `accept` no threat register (T-06-03).

---
*Phase: 06-protect-public-repo*
*Completed: 2026-06-17*
