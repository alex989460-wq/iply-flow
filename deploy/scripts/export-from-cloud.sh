#!/usr/bin/env bash
# Exporta o ambiente atual (banco + usuários + storage) para arquivos locais.
# Rode com a produção no ar — é somente leitura.
#
# Uso:
#   export SOURCE_DB_URL="postgresql://postgres:SENHA@HOST:5432/postgres"
#   export SOURCE_URL="https://SEU-PROJETO.supabase.co"
#   export SOURCE_SERVICE_KEY="chave service_role atual"
#   bash export-from-cloud.sh
set -euo pipefail

OUT="${OUT:-./export-$(date +%Y%m%d-%H%M)}"
mkdir -p "$OUT"

: "${SOURCE_DB_URL:?defina SOURCE_DB_URL}"

echo "==> Roles"
pg_dumpall --roles-only -d "$SOURCE_DB_URL" > "$OUT/roles.sql" || true

echo "==> Schema (estrutura, RLS, funções, triggers, tipos)"
pg_dump -d "$SOURCE_DB_URL" --schema-only --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage --schema=cron \
  > "$OUT/schema.sql"

echo "==> Dados públicos"
pg_dump -d "$SOURCE_DB_URL" --data-only --no-owner --disable-triggers \
  --schema=public > "$OUT/data-public.sql"

echo "==> Usuários e sessões de autenticação (mantém as senhas atuais)"
pg_dump -d "$SOURCE_DB_URL" --data-only --no-owner --disable-triggers \
  --schema=auth \
  --table=auth.users --table=auth.identities --table=auth.mfa_factors \
  > "$OUT/data-auth.sql"

echo "==> Metadados do storage"
pg_dump -d "$SOURCE_DB_URL" --data-only --no-owner --disable-triggers \
  --schema=storage > "$OUT/data-storage.sql"

echo "==> Contagens de referência"
psql -d "$SOURCE_DB_URL" -At -F'|' -c "
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', table_name), false, true, '')))[1]::text::bigint
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE'
order by table_name" > "$OUT/counts-source.txt"

echo "==> Arquivos do storage"
if [ -n "${SOURCE_URL:-}" ] && [ -n "${SOURCE_SERVICE_KEY:-}" ]; then
  mkdir -p "$OUT/storage"
  for BUCKET in $(psql -d "$SOURCE_DB_URL" -At -c "select id from storage.buckets"); do
    mkdir -p "$OUT/storage/$BUCKET"
    psql -d "$SOURCE_DB_URL" -At -c "select name from storage.objects where bucket_id='$BUCKET'" |
    while read -r OBJ; do
      [ -z "$OBJ" ] && continue
      mkdir -p "$OUT/storage/$BUCKET/$(dirname "$OBJ")"
      curl -s -H "Authorization: Bearer $SOURCE_SERVICE_KEY" \
        "$SOURCE_URL/storage/v1/object/$BUCKET/$OBJ" \
        -o "$OUT/storage/$BUCKET/$OBJ" || echo "falhou: $BUCKET/$OBJ"
    done
  done
else
  echo "SOURCE_URL/SOURCE_SERVICE_KEY não definidos — arquivos do storage não baixados."
fi

echo "Exportação concluída em: $OUT"
