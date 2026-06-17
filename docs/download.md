# Download de imagens Docker via DockGate

Este guia mostra como buscar e carregar uma imagem Docker usando apenas `curl` e `docker load`.

**Pré-requisito:** você precisa do valor de `DOWNLOAD_TOKEN` configurado na instância DockGate.

---

## Fluxo em 3 passos

```
1. [opcional] Descobrir a versão mais recente  →  GET /apps/:name/latest
2. Obter URL de download                        →  GET /apps/:name/download?version=X
3. Baixar o .tar e carregar no Docker           →  curl + docker load
```

---

## Passo 1 — Descobrir a versão mais recente (sem autenticação)

```bash
curl https://dockgate.example.com/apps/minha-app/latest
```

Resposta:

```json
{
  "schema": 1,
  "version": "1.4.2",
  "sha256": "a3f2c1...",
  "size": 182374912,
  "publishedAt": "2026-06-17T10:00:00.000Z"
}
```

Use o campo `version` para o próximo passo.

---

## Passo 2 — Obter a URL de download (requer token)

### Via header `Authorization`

```bash
curl -H "Authorization: Bearer SEU_DOWNLOAD_TOKEN" \
  "https://dockgate.example.com/apps/minha-app/download?version=1.4.2"
```

### Via query string (alternativa)

```bash
curl "https://dockgate.example.com/apps/minha-app/download?version=1.4.2&token=SEU_DOWNLOAD_TOKEN"
```

Resposta:

```json
{
  "url": "https://minio.example.com/images/minha-app/1.4.2.tar?X-Amz-Signature=..."
}
```

A URL expira em **1 hora** — use-a imediatamente.

---

## Passo 3 — Baixar e carregar no Docker

```bash
# 1. Pegar a URL e salvar em variável
URL=$(curl -s -H "Authorization: Bearer SEU_DOWNLOAD_TOKEN" \
  "https://dockgate.example.com/apps/minha-app/download?version=1.4.2" \
  | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

# 2. Baixar o .tar
curl -L -o minha-app-1.4.2.tar "$URL"

# 3. Carregar no Docker
docker load -i minha-app-1.4.2.tar
```

Ou em um único pipeline sem arquivo intermediário:

```bash
curl -s -L "$URL" | docker load
```

---

## Script completo — buscar latest e carregar

```bash
#!/usr/bin/env bash
set -euo pipefail

DOCKGATE_URL="https://dockgate.example.com"
DOWNLOAD_TOKEN="SEU_DOWNLOAD_TOKEN"
APP="minha-app"

# Pegar versão mais recente
VERSION=$(curl -sf "$DOCKGATE_URL/apps/$APP/latest" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
echo "Versão: $VERSION"

# Pegar URL de download
DOWNLOAD_URL=$(curl -sf -H "Authorization: Bearer $DOWNLOAD_TOKEN" \
  "$DOCKGATE_URL/apps/$APP/download?version=$VERSION" \
  | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

# Baixar e carregar no Docker
echo "Baixando $APP:$VERSION..."
curl -sL "$DOWNLOAD_URL" | docker load

echo "Imagem carregada com sucesso."
```

> **Dica:** se o servidor tiver `jq` instalado, substitua os `grep/cut` por `jq -r .version` e `jq -r .url` para parsing mais robusto.

---

## Referência de endpoints

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| `GET` | `/apps/:name/latest` | Nenhuma | Retorna metadados da versão mais recente |
| `GET` | `/apps/:name/download?version=X` | `DOWNLOAD_TOKEN` | Retorna URL presignada para download do `.tar` |

### Códigos de resposta

| Código | Significado |
|--------|-------------|
| `200` | Sucesso |
| `401` | Token ausente ou inválido |
| `404` | App ou versão não encontrada |
| `500` | Erro interno (verificar logs do container) |

---

## Passando o token de formas diferentes

```bash
# Header (recomendado)
curl -H "Authorization: Bearer SEU_TOKEN" ...

# Query string (quando header não é possível)
curl "...?token=SEU_TOKEN"
```

Ambas as formas são aceitas pelo middleware de autenticação.
