#!/usr/bin/env bash
# Publica as funções de servidor (Deno) na VPS.
# Uso: bash deploy-functions.sh /caminho/do/repositorio
set -euo pipefail

REPO="${1:?informe o caminho do repositório do sistema}"
BASE=/opt/supergestor
# shellcheck disable=SC1091
source "$BASE/.env"

echo "==> Copiando funções"
# Preserva o entrypoint padrão do Edge Runtime (main, hello, deno.jsonc)
rsync -a --delete --exclude=main --exclude=hello --exclude=deno.jsonc "$REPO/supabase/functions/" "$BASE/supabase/volumes/functions/"
# Se por algum motivo o entrypoint sumiu, restaura o do repositório de backup
if [ ! -f "$BASE/supabase/volumes/functions/deno.jsonc" ]; then
  cp "$REPO/deploy/supabase-runtime/deno.jsonc" "$BASE/supabase/volumes/functions/deno.jsonc" 2>/dev/null || true
fi
if [ ! -f "$BASE/supabase/volumes/functions/main/index.ts" ]; then
  cp "$REPO/deploy/supabase-runtime/main/index.ts" "$BASE/supabase/volumes/functions/main/index.ts" 2>/dev/null || true
fi

echo "==> Carregando segredos das funções"
# As chaves ficam em $BASE/functions.env (veja SECRETS.md)
if [ -f "$BASE/functions.env" ]; then
  cp "$BASE/functions.env" "$BASE/supabase/.env.functions"
fi

echo "==> Reiniciando o runtime das funções"
cd "$BASE/supabase"
docker compose restart functions

echo "==> Teste rápido"
sleep 5
curl -s -o /dev/null -w "healthcheck: %{http_code}\n" \
  "http://127.0.0.1:8000/functions/v1/customer-lookup" || true

echo "Funções publicadas."
