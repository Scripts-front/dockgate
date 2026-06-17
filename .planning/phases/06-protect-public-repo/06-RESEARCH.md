# Phase 6: Proteger repositório público - Research

**Researched:** 2026-06-17
**Domain:** GitHub Branch Protection + GitHub Actions CI + SECURITY.md
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Branch `master` protegido com required status checks — sem exigir PR humana. Push direto continua permitido (compatível com `deploy.yml` que faz push via Actions).
- **D-02:** Required checks: **ESLint** (`lint.yml`) + **Typecheck** (`bun typecheck`). O typecheck precisa de um novo step em CI.
- **D-03:** Push forçado (`--force`) bloqueado no master.
- **D-04:** GitHub Actions são isentas de branch protection por padrão — CI de deploy não é afetado.
- **D-05:** Adicionar step/job `bun run typecheck` ao pipeline de CI. Este check deve ser o required status check registrado na branch protection rule.
- **D-06:** Nenhuma ferramenta de scanning automático (sem Dependabot, sem CodeQL). Secret scanning já ativo por padrão em repositórios públicos.
- **D-07:** Dependências atualizadas manualmente. Sem automação.
- **D-08:** Criar `SECURITY.md` na raiz com email `biel1313biel@gmail.com`.

### Claude's Discretion

- Se adicionar typecheck como novo step em `lint.yml` (ao lado do ESLint) ou criar `typecheck.yml` separado.
- Formato exato do `SECURITY.md`.
- Se configurar branch protection via `gh api` como parte do plano, ou documentar como passo manual.

### Deferred Ideas (OUT OF SCOPE)

None — discussão ficou dentro do escopo da fase.
</user_constraints>

---

## Summary

Esta fase tem três entregáveis independentes: (1) adicionar um job/step de typecheck ao CI, (2) registrar branch protection rules no GitHub via API, e (3) criar o arquivo `SECURITY.md`. Os três podem ser planejados em sequência lógica, pois branch protection depende dos checks existirem antes de serem registrados como obrigatórios.

O script `typecheck` já existe em `package.json` (`tsc --noEmit`), então o step de CI é trivial — apenas um step adicional no `lint.yml` existente ou um workflow separado. O nome do job no YAML vira o contexto exato registrado na branch protection rule: se o job se chama `Typecheck` no `name:`, o contexto é `Typecheck`.

A configuração de branch protection foi testada via `gh api PUT` durante a pesquisa e funcionou corretamente com `restrictions: null` (sem bloquear push direto) e `allow_force_pushes: false`. GitHub Actions não são afetadas por branch protection no modelo de push direto — o `deploy.yml` continua funcionando.

**Primary recommendation:** Adicionar typecheck como novo job em `lint.yml` (paralelismo grátis, contextos distintos), configurar branch protection via `gh api` como task automatizável no plano, e criar `SECURITY.md` simples seguindo o template mínimo do GitHub.

---

## Standard Stack

### Core

| Componente | Versão/Recurso | Propósito | Justificativa |
|-----------|---------------|-----------|---------------|
| GitHub Branch Protection API | REST v3 PUT | Configurar proteções no master | API oficial do GitHub, sem alternativa |
| `gh api` CLI | Token com escopo `repo` (verificado) | Executar PUT branch protection como task automatizável | Mais rastreável que UI; pode ser re-executado |
| `bun run typecheck` | script existente em package.json | Executar `tsc --noEmit` no CI | Script já existe — nenhuma instalação necessária |
| GitHub Actions `oven-sh/setup-bun@v2` | v2 (já em uso) | Runtime Bun no CI | Padrão já validado nas Fases 4 e 5 |

### Nenhum pacote NPM novo necessário

`typecheck` já está disponível via `tsc` (TypeScript já instalado como devDependency) e invocado pelo script existente.

**Instalação:** Nenhuma. Todos os componentes já existem no repo ou no GitHub.

---

## Architecture Patterns

### Opção A: Typecheck como step adicional em `lint.yml` (RECOMENDADA)

**O que é:** Adicionar um segundo step `bun run typecheck` no mesmo job `lint` de `lint.yml`.

**Problema:** Um único job tem um único nome de status check. Se o ESLint falhar, o typecheck não roda — e o contexto reportado é apenas `ESLint`. Não há como registrar dois required checks distintos de um único job.

**Conclusão:** Esta abordagem NÃO atende D-02 (dois required checks distintos). Descartada.

### Opção B: Typecheck como novo job em `lint.yml` (RECOMENDADA)

**O que é:** Adicionar um segundo job `typecheck:` com `name: Typecheck` em `lint.yml`, paralelo ao job `lint` existente.

**Vantagem:** Cada job gera um status check distinto. ESLint e Typecheck aparecem como dois contextos separados — `ESLint` e `Typecheck` — exatamente como D-02 exige.

**Estrutura resultante:**

```yaml
name: Lint

on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master

jobs:
  lint:
    name: ESLint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run lint

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
```

**Status check contexts gerados:** `ESLint` e `Typecheck` (exatamente o `name:` de cada job).

### Opção C: Workflow separado `typecheck.yml`

**O que é:** Arquivo novo `.github/workflows/typecheck.yml` com um único job.

**Vantagem:** Separação de responsabilidades. Desvantagem: duplicação de configuração de triggers. Funcional, mas sem vantagem real sobre Opção B para este projeto.

**Recomendação do discretion:** Usar Opção B (job adicional em `lint.yml`). Mesmos triggers, mesmo arquivo, paralelismo automático.

### Pattern: Branch Protection via `gh api`

```bash
# Source: testado durante pesquisa contra API GitHub
gh api repos/Scripts-front/dockgate/branches/master/protection \
  --method PUT \
  --header "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "checks": [
      {"context": "ESLint"},
      {"context": "Typecheck"}
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

**Parâmetros críticos:**
- `restrictions: null` — sem restrições de push, push direto continua permitido (D-01)
- `enforce_admins: false` — admins não são bloqueados, Actions não são afetadas (D-04)
- `allow_force_pushes: false` — força bloqueada (D-03)
- `strict: false` — não exige branch atualizada antes de merge (não relevante sem PRs obrigatórias)
- `required_pull_request_reviews: null` — sem exigência de review humana (D-01)

### Pattern: SECURITY.md mínimo (discretion do Claude)

Formato recomendado pelo GitHub para SECURITY.md:

```markdown
# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | ✓         |

## Reporting a Vulnerability

To report a security vulnerability, please email **biel1313biel@gmail.com**.

Do not open a public issue for security vulnerabilities.

We will respond within 5 business days.
```

**Localização:** `/SECURITY.md` na raiz do repositório. O GitHub reconhece automaticamente e exibe link "Security policy" no repositório.

---

## Don't Hand-Roll

| Problema | Não construir | Usar em vez disso | Motivo |
|---------|--------------|------------------|--------|
| Configurar branch protection | Script bash customizado | `gh api PUT /branches/{branch}/protection` | API oficial, idempotente, re-executável |
| Verificar nome do status check | Grep no YAML | Inspecionar output real de `gh api /actions/runs/{id}/jobs` | Nome do `name:` no YAML é o contexto exato — verificado via API |

---

## Common Pitfalls

### Pitfall 1: Nome do status check não bate com o registrado na branch protection

**O que dá errado:** Registrar `"context": "lint"` (nome do job-key no YAML) quando o contexto real é `"ESLint"` (o campo `name:` do job). Branch protection fica pendente para sempre.

**Por que acontece:** GitHub usa o valor de `name:` do job, não a chave YAML (`lint:`, `typecheck:`).

**Como evitar:** Sempre verificar o contexto real via `gh api repos/{owner}/{repo}/actions/runs/{run_id}/jobs` e usar o campo `name` retornado. Para jobs novos que ainda não rodaram, o contexto será exatamente o `name:` definido no YAML — mas a branch protection mostrará `app_id: null` até a primeira execução.

**Sinal de alerta:** Branch protection criada com sucesso mas status check fica como "Expected" sem nunca passar — indica nome errado.

### Pitfall 2: Registrar branch protection antes do workflow de typecheck existir

**O que dá errado:** A branch protection exige `Typecheck` mas o job ainda não existe → qualquer push ao master fica bloqueado indefinidamente por um check que nunca roda.

**Por que acontece:** GitHub não valida se os checks registrados existem — aceita qualquer string.

**Como evitar:** Ordem de execução correta: (1) adicionar job Typecheck ao `lint.yml`, (2) fazer push para disparar o workflow e confirmar que o job roda, (3) somente então registrar a branch protection.

**Sinal de alerta:** Commit preso com status "Waiting for Typecheck" sem o workflow aparecer na aba Actions.

### Pitfall 3: `enforce_admins: true` bloqueando deploy.yml

**O que dá errado:** Com `enforce_admins: true`, o GitHub Actions bot também fica sujeito às proteções. Push direto do `deploy.yml` falharia se os checks ainda não rodaram para aquele commit.

**Por que acontece:** `enforce_admins: true` aplica as regras a todos, inclusive bots com acesso de admin.

**Como evitar:** Manter `enforce_admins: false` (confirmado na decisão D-04 e testado na pesquisa).

### Pitfall 4: `strict: true` em `required_status_checks` sem uso de PRs

**O que dá errado:** `strict: true` exige que o branch esteja atualizado com base antes de merge — irrelevante e potencialmente bloqueante num fluxo sem PRs obrigatórias.

**Como evitar:** Usar `strict: false` (já incluído no payload de referência acima).

---

## State of the Art

| Abordagem antiga | Abordagem atual | Impacto |
|-----------------|----------------|---------|
| `contexts` array (deprecated) | `checks` array com objetos `{context, app_id}` | A API ainda aceita `contexts` mas retorna aviso de deprecação; usar `checks` |
| Configurar via GitHub UI | `gh api PUT` automatizável | Rastreável, re-executável, pode ser documentado como step no plano |

---

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|------------|--------------|-----------|--------|----------|
| `gh` CLI | Configurar branch protection via API | ✓ | Token com escopo `repo` e `workflow` verificado | Configuração manual via GitHub UI |
| GitHub Actions | CI typecheck job | ✓ | `oven-sh/setup-bun@v2` já validado | — |
| `tsc` (TypeScript) | `bun run typecheck` | ✓ | `typescript@^6.0.3` em devDependencies | — |

**Token `gh` verificado:** Scopes `admin:org`, `gist`, `repo`, `workflow` — suficiente para `PUT /branches/master/protection`.

**Nenhuma dependência bloqueante sem fallback.**

---

## Ordering Constraint (Critical)

A ordem de execução das tasks IMPORTA:

```
1. Adicionar job Typecheck ao lint.yml
2. Push para master → esperar lint.yml rodar com ambos jobs (ESLint + Typecheck)
3. Verificar que o job "Typecheck" aparece nas Actions runs
4. Configurar branch protection via gh api (registrar ambos os contextos)
5. Criar SECURITY.md (independente — pode ser feito em qualquer momento)
```

Se branch protection for configurada antes do job Typecheck existir e rodar, qualquer push subsequente ficará bloqueado indefinidamente.

---

## Assumptions Log

| # | Claim | Seção | Risco se errado |
|---|-------|-------|----------------|
| A1 | `strict: false` em required_status_checks não bloqueia push direto sem PR | Architecture Patterns | Se strict:true for necessário, pushes diretos sem branch atualizada seriam bloqueados — mas sem PRs obrigatórias, strict:true não se aplica |

**Todas as demais claims foram verificadas via ferramentas durante esta sessão (API GitHub real, leitura de arquivos do repo).**

---

## Open Questions

1. **Typecheck novo job em `lint.yml` ou `typecheck.yml` separado?**
   - O que sabemos: Ambas funcionam; Opção B (job adicional em `lint.yml`) é mais limpa
   - O que está claro: Claude tem discretion aqui — recomendação é Opção B
   - Recomendação: Job adicional no mesmo `lint.yml`

2. **Branch protection deve ser configurada via `gh api` no plano ou documentada como passo manual?**
   - O que sabemos: `gh api PUT` funciona e foi testado; token tem permissão
   - Recomendação: Incluir como task automatizável no plano (mais rastreável que UI)

---

## Sources

### Primary (HIGH confidence)

- Leitura direta de `.github/workflows/lint.yml` — estrutura atual do workflow e nome do job `ESLint`
- Leitura direta de `package.json` — script `typecheck: tsc --noEmit` já existe
- `gh api repos/Scripts-front/dockgate/actions/runs/{id}/jobs` — contexto real retornado: `{"name":"ESLint"}` [VERIFIED: GitHub API]
- `gh api PUT /repos/Scripts-front/dockgate/branches/master/protection` — payload testado e aceito pela API real [VERIFIED: GitHub API]
- `gh api repos/Scripts-front/dockgate` — repo público, default_branch: master [VERIFIED: GitHub API]
- Remoção da branch protection após pesquisa — estado restaurado [VERIFIED: GitHub API]

### Secondary (MEDIUM confidence)

- [GitHub REST API — Branch Protection](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection) — estrutura do payload PUT
- [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks) — comportamento de nomes de checks

### Tertiary (LOW confidence)

- Nenhuma claim de confiança baixa nesta pesquisa.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todos componentes verificados no repo real e via API
- Architecture: HIGH — payload testado contra API GitHub real, job names verificados via runs reais
- Pitfalls: HIGH — baseado em comportamento verificado da API e inspeção do código existente

**Research date:** 2026-06-17
**Valid until:** 2026-12-17 (APIs GitHub estáveis; verificar se `oven-sh/setup-bun@v2` ainda é versão atual em projetos novos)
