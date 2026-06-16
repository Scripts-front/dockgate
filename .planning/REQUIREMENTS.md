# Requirements: DockGate

**Defined:** 2026-06-16
**Core Value:** Clientes autorizados conseguem baixar a versão mais recente de qualquer app registrada com um único token — sem Docker Registry, sem login, sem complexidade.

## v1 Requirements

### API de Leitura (Clientes)

- [ ] **READ-01**: Cliente pode consultar `GET /apps/:name/latest` sem autenticação e receber versão mais recente com sha256, size e publishedAt
- [ ] **READ-02**: Cliente pode solicitar `GET /apps/:name/download?version=X` com DOWNLOAD_TOKEN e receber URL pré-assinada do MinIO para download direto do `.tar`
- [ ] **READ-03**: API retorna 404 com mensagem clara quando versão solicitada não existe no MinIO

### API de Escrita (CI/CD)

- [ ] **WRITE-01**: CI/CD pode solicitar `POST /apps/:name/upload?version=X` com UPLOAD_TOKEN e receber URL pré-assinada de PUT para enviar o `.tar` diretamente ao MinIO
- [ ] **WRITE-02**: CI/CD pode chamar `PUT /apps/:name/latest` com UPLOAD_TOKEN para atualizar o `latest.json` da app — API verifica que o `.tar` existe no MinIO antes de escrever (anti-phantom-version)
- [ ] **WRITE-03**: API rejeita `PUT /latest` com erro 422 quando o arquivo `.tar` correspondente não existe no MinIO

### Autenticação e Segurança

- [ ] **SEC-01**: API valida DOWNLOAD_TOKEN usando `timingSafeEqual` (resistente a timing attack) em endpoints de leitura protegidos
- [ ] **SEC-02**: API valida UPLOAD_TOKEN usando `timingSafeEqual` em todos os endpoints de escrita
- [ ] **SEC-03**: API valida `:name` e `version` contra regex seguro (rejeita `/`, `..`, `\`, null bytes) para prevenir path traversal em chaves MinIO
- [ ] **SEC-04**: API falha no startup com erro claro se qualquer env var obrigatória (`DOWNLOAD_TOKEN`, `UPLOAD_TOKEN`, `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) estiver ausente
- [ ] **SEC-05**: Tokens não aparecem em logs (middleware de redação de query params)

### Infraestrutura e Deploy

- [ ] **INFRA-01**: `GET /health` retorna status da API e conectividade com MinIO (usado pelo Portainer como health check)
- [ ] **INFRA-02**: API roda como container Docker com `oven/bun:1` Debian (não Alpine), usuário não-root `bun`, ENTRYPOINT exec-form para SIGTERM correto
- [ ] **INFRA-03**: API inicia conexão com MinIO no startup e falha rápido se o bucket não existir
- [ ] **INFRA-04**: Dockerfile multi-stage com separação de dependências dev/prod

### Schema e Integridade

- [ ] **DATA-01**: `latest.json` segue schema versionado: `{ schema: 1, version, sha256, size, publishedAt }` — campos de integridade presentes desde o início
- [ ] **DATA-02**: Estrutura de objetos no MinIO segue padrão `{appName}/{version}.tar` e `{appName}/latest.json` (um bucket, pastas por app)

### Documentação CI/CD

- [ ] **DOCS-01**: Repositório inclui guia de integração GitHub Actions com workflow YAML pronto para copiar, instruções de setup de secrets e fluxo completo (build → export `.tar` → upload via DockGate → atualizar latest)

## v2 Requirements

### Operações Avançadas

- **OPS-01**: `GET /apps/:name/versions` lista todas as versões disponíveis no bucket para uma app
- **OPS-02**: `DELETE /apps/:name/version/:ver` remove uma versão específica do MinIO
- **OPS-03**: Política de retenção automática — manter apenas as últimas N versões por app (configurável)

### Segurança Avançada

- **SEC-V2-01**: Rate limiting nos endpoints de download para prevenir abuso
- **SEC-V2-02**: Log de auditoria de downloads (qual versão, quando)

### Extensões de Deploy

- **INFRA-V2-01**: `docker-compose.yml` completo com MinIO + DockGate para ambientes novos (onboarding mais rápido)

## Out of Scope

| Feature | Motivo |
|---------|--------|
| Docker Registry Protocol (v2) | Objetivo é eliminar a necessidade de registry; adicionar o protocolo duplica complexidade |
| Sistema de usuários / login / refresh token | Token fixo por env var é suficiente para o escopo; complexidade adicional não tem benefício |
| Banco de dados | Estado mantido exclusivamente no MinIO; banco de dados adicionaria dependência desnecessária |
| Painel administrativo | Gestão via API + CI/CD cobre os casos de uso; UI adicionaria escopo significativo |
| Proxy de arquivo pela API | CI/CD faz upload direto no MinIO via URL pré-assinada; proxy adicionaria latência e consumo de memória |
| Autenticação OAuth / JWT | Token fixo é mais simples e suficiente para distribuição privada para clientes autorizados |
| Múltiplos buckets por app | Um bucket com pastas é mais simples de configurar e gerenciar |
| Notificações de nova versão | Fora do escopo da API de distribuição |

## Traceability

*Preenchido durante criação do roadmap.*

| Requirement | Phase | Status |
|-------------|-------|--------|
| READ-01 | — | Pending |
| READ-02 | — | Pending |
| READ-03 | — | Pending |
| WRITE-01 | — | Pending |
| WRITE-02 | — | Pending |
| WRITE-03 | — | Pending |
| SEC-01 | — | Pending |
| SEC-02 | — | Pending |
| SEC-03 | — | Pending |
| SEC-04 | — | Pending |
| SEC-05 | — | Pending |
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| INFRA-04 | — | Pending |
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DOCS-01 | — | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 0 (pendente roadmap)
- Unmapped: 18 ⚠️

---
*Requirements defined: 2026-06-16*
*Last updated: 2026-06-16 after initial definition*
