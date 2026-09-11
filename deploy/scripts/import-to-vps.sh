#!/usr/bin/env bash
# Importa o export na VPS e confere as contagens.
# Uso: bash import-to-vps.sh ./export-20260911-1200
set -euo pipefail

DIR="${1:?informe a pasta do export}"
BASE=/opt/supergestor
# shellcheck disable=SC1091
source "$BASE/.env"
# shellcheck disable=SC1091
source "$BASE/keys.env"

DB="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5432/postgres"

echo "==> Estrutura"
psql -d "$DB" -v ON_ERROR_STOP=0 -f "$DIR/schema.sql" > /tmp/schema.log 2>&1 || true
grep -c "ERROR" /tmp/schema.log && echo "(erros esperados em objetos que já existem — confira /tmp/schema.log)"

echo "==> Usuários (senhas preservadas)"
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/data-auth.sql"

echo "==> Dados do sistema"
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DIR/data-public.sql"

echo "==> Storage"
psql -d "$DB" -v ON_ERROR_STOP=0 -f "$DIR/data-storage.sql" || true
if [ -d "$DIR/storage" ]; then
  for BUCKET in "$DIR"/storage/*; do
    B=$(basename "$BUCKET")
    find "$BUCKET" -type f | while read -r F; do
      REL="${F#"$BUCKET"/}"
      curl -s -X POST "http://127.0.0.1:8000/storage/v1/object/$B/$REL" \
        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
        --data-binary "@$F" > /dev/null || echo "falhou: $B/$REL"
    done
  done
fi

echo "==> Conferência de contagens"
psql -d "$DB" -At -F'|' -c "
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', table_name), false, true, '')))[1]::text::bigint
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE'
order by table_name" > /tmp/counts-target.txt

if diff -u "$DIR/counts-source.txt" /tmp/counts-target.txt > /tmp/counts-diff.txt; then
  echo "OK — todas as tabelas com a mesma quantidade de registros."
else
  echo "ATENÇÃO — diferenças encontradas:"
  cat /tmp/counts-diff.txt
fi
