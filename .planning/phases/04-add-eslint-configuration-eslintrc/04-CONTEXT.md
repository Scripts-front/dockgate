# Phase 4: Add ESLint configuration (.eslintrc) - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar ESLint ao projeto DockGate: arquivo de configuração, dependências, script `lint`, integração com CI (GitHub Actions para o próprio repositório DockGate) e pre-commit hook (husky + lint-staged). Ferramental de desenvolvimento puro — nenhum código de runtime da API é alterado.

</domain>

<decisions>
## Implementation Decisions

### Config Format

- **D-01:** Usar **ESLint v9 flat config** — arquivo `eslint.config.js` na raiz. O nome `.eslintrc` no título da fase é apenas o nome descritivo; não é requisito de formato. Flat config é o padrão oficial e evita a API legada deprecated.

### Rule Strictness

- **D-02:** Base de regras: **`typescript-eslint/strict`** — mais rigoroso que `recommended`, sem precisar de type-checking (`parserOptions.project` não necessário). Alinhado com `strict: true` já ativo no `tsconfig.json`.
- **D-03:** Não usar `strict-type-checked` — sem overhead de performance de type-aware linting para este projeto.

### Integration Scope

- **D-04:** Adicionar script `"lint": "eslint src"` em `package.json`.
- **D-05:** Criar workflow GitHub Actions `.github/workflows/lint.yml` para rodar `bun run lint` em push e pull request para o repositório DockGate (diferente do workflow de CI/CD de distribuição de imagens da Fase 3, que fica em `docs/examples/`).
- **D-06:** Instalar **husky** + **lint-staged** para rodar ESLint no pre-commit em arquivos `.ts` staged. Bloqueia commit se lint falhar.

### File Targets

- **D-07:** ESLint cobre apenas `src/**/*.ts`. Arquivos de config na raiz (`eslint.config.js`, `tsconfig.json`) ficam fora do escopo de lint.

### Claude's Discretion

- Regras customizadas adicionais além da base `strict` (ex: `no-console`, `prefer-const` — podem ser habilitadas se já não cobertas pelo preset).
- Configuração exata de `lint-staged` (quais flags `--fix` usar ou não).
- Nome do job e triggers exatos do workflow `.github/workflows/lint.yml`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap

- `.planning/ROADMAP.md §Phase 4` — goal e success criteria desta fase

### TypeScript Config (alinhamento com ESLint)

- `tsconfig.json` — configuração atual: `strict: true`, `verbatimModuleSyntax: true`, `moduleResolution: bundler`, `allowImportingTsExtensions: true`. ESLint deve ser compatível com estas opções.

### Project Constraints

- `CLAUDE.md §TypeScript Config` — padrões oficiais Bun para tsconfig; `verbatimModuleSyntax` exige `import type` para imports type-only — regra ESLint `@typescript-eslint/consistent-type-imports` é relevante.
- `CLAUDE.md §What NOT to Use` — lista de ferramentas descartadas (não adicionar `ts-node`, `dotenv`, etc.).

### Phase 3 CI/CD Docs (para não conflitar)

- `.planning/phases/03-ci-cd-docs/03-CONTEXT.md` — o workflow YAML em `docs/examples/github-actions.yml` é para o pipeline de distribuição do cliente; o novo `.github/workflows/lint.yml` é para o repositório DockGate em si.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `package.json` — já tem scripts `start`, `dev`, `typecheck`. O script `lint` se adiciona ao lado de `typecheck`.
- `tsconfig.json` — config existente que o ESLint parser deve referenciar para resolver imports.

### Established Patterns

- Nenhum padrão de linting estabelecido ainda — esta fase cria o padrão.
- Runtime é Bun: ferramentas devem ser instaladas via `bun add -d` e scripts via `bun run`.

### Integration Points

- `package.json §scripts` — adicionar `lint`.
- `package.json §devDependencies` — adicionar `eslint`, `typescript-eslint`, `husky`, `lint-staged`.
- `.github/workflows/` — criar `lint.yml` (diretório pode não existir ainda, a criar).
- `.husky/` — criar via `husky init`.

</code_context>

<specifics>
## Specific Ideas

- O script `lint-staged` deve rodar apenas em arquivos `.ts` dentro de `src/` para evitar erros em arquivos fora do target do ESLint.
- O workflow `lint.yml` deve rodar em `push` e `pull_request` na branch `master`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-add-eslint-configuration-eslintrc*
*Context gathered: 2026-06-17*
