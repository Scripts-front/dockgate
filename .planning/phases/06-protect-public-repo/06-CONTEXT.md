# Phase 6: Proteger repositório público - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Configurar proteções para o repositório público no GitHub: branch protection rules no master com checks obrigatórios, e arquivo SECURITY.md com canal de contato para relato de vulnerabilidades. Sem ferramentas de scanning automático (Dependabot, CodeQL).

**Escopo:**
- Branch protection no master (configurado via GitHub API ou UI + workflow de typecheck adicionado ao CI)
- `SECURITY.md` na raiz do repositório
- Workflow de typecheck (`bun typecheck`) adicionado como required check

**Fora de escopo:** Dependabot, CodeQL, CODEOWNERS, múltiplos branches, PR review obrigatória.

</domain>

<decisions>
## Implementation Decisions

### Branch Protection

- **D-01:** Branch `master` protegido com required status checks — sem exigir PR humana. Push direto continua permitido (compatível com o `deploy.yml` existente que faz push via Actions).
- **D-02:** Required checks: **ESLint** (`lint.yml`) + **Typecheck** (`bun typecheck`). O typecheck precisa de um novo job/workflow de CI ou ser adicionado ao `lint.yml` existente.
- **D-03:** Push forçado (`--force`) bloqueado no master.
- **D-04:** GitHub Actions são isentas de branch protection por padrão — o CI de deploy não é afetado.

### Typecheck no CI

- **D-05:** Adicionar step/job `bun run typecheck` ao pipeline de CI (novo step em `lint.yml` ou novo workflow `typecheck.yml`). Este check deve ser o required status check registrado na branch protection rule.

### Ferramentas de segurança automáticas

- **D-06:** Nenhuma ferramenta de scanning automático ativada (sem Dependabot, sem CodeQL). Secret scanning já está ativo por padrão em repositórios públicos — sem configuração necessária.

### Atualizações de dependências

- **D-07:** Dependências atualizadas manualmente quando necessário. Sem automação (sem Dependabot).

### SECURITY.md

- **D-08:** Criar `SECURITY.md` na raiz do repositório com email de contato: `biel1313biel@gmail.com`. Arquivo simples — instrução de como reportar vulnerabilidades.

### Claude's Discretion

- Se adicionar typecheck como novo step em `lint.yml` (ao lado do ESLint) ou criar `typecheck.yml` separado.
- Formato exato do `SECURITY.md` (GitHub tem template recomendado).
- Se configurar branch protection via GitHub CLI (`gh api`) como parte do plano, ou documentar como passo manual.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CI existente

- `.github/workflows/lint.yml` — workflow ESLint atual; typecheck será adicionado aqui ou em paralelo
- `.github/workflows/deploy.yml` — faz push direto no master via Actions; branch protection não pode bloquear esse fluxo

### Package.json (scripts disponíveis)

- `package.json §scripts` — script `typecheck` já existe? Verificar antes de planejar o step de CI

### Fase 4 (contexto do lint.yml)

- `.planning/phases/04-add-eslint-configuration-eslintrc/04-CONTEXT.md §D-05` — lint.yml criado na Fase 4 com triggers push + PR no master

### Projeto

- `.planning/PROJECT.md §Constraints` — tech stack: Bun + Express + TypeScript
- `CLAUDE.md §Commit Message Format` — formato de commits desta fase

No external specs além dos arquivos listados acima.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `.github/workflows/lint.yml` — estrutura de workflow existente (checkout + setup-bun + install + run) reutilizável para typecheck
- `package.json §scripts` — verificar se `typecheck` já existe como script (provavelmente sim, dado tsconfig com `noEmit: true`)

### Established Patterns

- GitHub Actions: `uses: actions/checkout@v4` + `uses: oven-sh/setup-bun@v2` já validados nas Fases 4 e 5
- Workflows disparam em `push` e `pull_request` no master

### Integration Points

- `lint.yml` — ponto natural para adicionar typecheck (um step a mais no mesmo job)
- Branch protection rules configuradas via `gh api` ou GitHub UI após criação dos workflows

</code_context>

<specifics>
## Specific Ideas

- Email de contato no SECURITY.md: `biel1313biel@gmail.com`
- Branch protection: preservar compatibilidade com push direto do deploy.yml (Actions são isentas por padrão no GitHub)
- Required checks: os nomes dos jobs precisam bater exatamente com os nomes registrados na branch protection rule (ex: `ESLint`, `Typecheck`)

</specifics>

<deferred>
## Deferred Ideas

None — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 06-protect-public-repo*
*Context gathered: 2026-06-17*
