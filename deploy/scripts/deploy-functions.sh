#!/usr/bin/env bash
# Publica as funções de servidor (Deno) na VPS.
# Uso: bash deploy-functions.sh /caminho/do/repositorio
set -euo pipefail

REPO="${1:?informe o caminho do repositório do sistema}"
BASE=/opt/supergestor
# shellcheck disable=SC1091
source "$BASE/.env"

echo "==> Copiando funções"
rsync -a --delete "$REPO/supabase/functions/" "$BASE/supabase/volumes/functions/"

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
