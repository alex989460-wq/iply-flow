#!/usr/bin/env bash
# Validação segura da VPS antes da virada. Não altera DNS, dados, jobs ou serviços.
# Uso na VPS: sudo bash preflight-vps.sh [contagens-da-origem.txt]
set -euo pipefail

BASE=/opt/supergestor
SOURCE_COUNTS="${1:-}"
FAIL=0

ok() { printf 'OK   %s\n' "$1"; }
bad() { printf 'ERRO %s\n' "$1"; FAIL=1; }
note() { printf 'INFO %s\n' "$1"; }

test -r "$BASE/.env" || { bad "arquivo principal de configuração ausente"; exit 1; }
test -r "$BASE/keys.env" || { bad "chaves locais ausentes"; exit 1; }
# shellcheck disable=SC1091
source "$BASE/.env"
# shellcheck disable=SC1091
source "$BASE/keys.env"

cd "$BASE/supabase"

unhealthy="$(docker compose ps --format json 2>/dev/null \
  | jq -rs '[.[] | select((.State != "running") or (.Health != "" and .Health != "healthy"))] | length' 2>/dev/null || echo 1)"
if [ "$unhealthy" = "0" ]; then ok "serviços da VPS em execução"; else bad "há serviços parados ou sem saúde"; fi

if curl -fsS -H "apikey: $ANON_KEY" http://127.0.0.1:8000/auth/v1/health >/dev/null; then
  ok "autenticação responde localmente"
else
  bad "autenticação não respondeu"
fi

if curl -fsS -H "apikey: $ANON_KEY" http://127.0.0.1:8000/rest/v1/ >/dev/null; then
  ok "API do banco responde localmente"
else
  bad "API do banco não respondeu"
fi

if test -s "$BASE/app/index.html"; then ok "site compilado está instalado"; else bad "site compilado ausente"; fi

DB_CONTAINER="$(docker compose ps -q db 2>/dev/null || true)"
if [ -z "$DB_CONTAINER" ]; then
  bad "container do banco não encontrado"
else
  active_jobs="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
    "select count(*) from cron.job where active" 2>/dev/null || echo query_failed)"
  if [ "$active_jobs" = "0" ]; then
    ok "todos os agendamentos permanecem desativados"
  else
    bad "agendamentos ativos antes da virada: $active_jobs"
  fi

  target_counts="$(mktemp)"
  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -At -F'|' -c \
    "select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', table_name), false, true, '')))[1]::text::bigint
     from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE'
     order by table_name" > "$target_counts"
  ok "contagens do banco coletadas ($(wc -l < "$target_counts") tabelas)"

  if [ -n "$SOURCE_COUNTS" ]; then
    if diff -u "$SOURCE_COUNTS" "$target_counts" > /tmp/supergestor-counts-diff.txt; then
      ok "contagens do banco iguais à origem"
    else
      bad "há diferenças de dados; confira /tmp/supergestor-counts-diff.txt"
    fi
  else
    note "comparação com a origem não solicitada"
  fi
  rm -f "$target_counts"

  storage_rows="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc \
    "select count(*) from storage.objects" 2>/dev/null || echo query_failed)"
  copied_rows="$(wc -l < /var/lib/supergestor-migstorage.done 2>/dev/null || echo 0)"
  if [ "$storage_rows" != "query_failed" ] && [ "$storage_rows" -gt 0 ] && [ "$copied_rows" -ge "$storage_rows" ]; then
    ok "arquivos conferidos: $copied_rows copiados / $storage_rows registrados"
  else
    bad "cópia de arquivos incompleta: $copied_rows copiados / $storage_rows registrados"
  fi
fi

if test -s "$BASE/functions.env" && [ "$(stat -c '%a' "$BASE/functions.env")" = "600" ]; then
  ok "segredos das funções presentes e protegidos"
else
  bad "segredos das funções ausentes ou com permissão diferente de 600"
fi

function_count="$(find "$BASE/supabase/volumes/functions" -mindepth 2 -maxdepth 2 -name index.ts 2>/dev/null | wc -l)"
if [ "$function_count" -ge 100 ]; then ok "$function_count funções instaladas"; else bad "somente $function_count funções instaladas"; fi

if curl -fsS -H "Host: $DOMAIN" http://127.0.0.1/ | grep -qi '<title>'; then
  ok "Nginx entrega o site pelo domínio configurado"
else
  bad "Nginx não entregou o site"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "PREFLIGHT_REPROVADO — não faça a virada."
  exit 1
fi

echo "PREFLIGHT_APROVADO — a VPS está preparada; DNS e jobs continuam inalterados."