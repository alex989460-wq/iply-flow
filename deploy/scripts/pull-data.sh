#!/usr/bin/env bash
# Copia os dados do ambiente atual para a VPS, usando a função temporária de exportação.
# Uso: EXPORT_URL=... EXPORT_KEY=... bash pull-data.sh
set -uo pipefail

EXPORT_URL="${EXPORT_URL:?defina EXPORT_URL}"
EXPORT_KEY="${EXPORT_KEY:?defina EXPORT_KEY}"
BATCH="${BATCH:-2000}"
WORK=/tmp/migdata
mkdir -p "$WORK"

api() { curl -s --max-time 120 -X POST "$EXPORT_URL" -H "Content-Type: application/json" \
  -H "x-migration-secret: $EXPORT_KEY" -d "$1"; }

psqlq() { docker exec -i supabase-db psql -q -U postgres -d postgres "$@"; }

cols() { # $1 schema  $2 table -> lista de colunas graváveis
  docker exec -i supabase-db psql -At -U postgres -d postgres -c \
    "select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
     from information_schema.columns
     where table_schema='$1' and table_name='$2'
       and is_generated='NEVER' and coalesce(identity_generation,'')<>'ALWAYS'"
}

load() { # $1 schema  $2 table  $3 json file
  local C; C=$(cols "$1" "$2")
  docker cp "$3" supabase-db:/batch.json >/dev/null
  psqlq -v ON_ERROR_STOP=0 -c "set session_replication_role = replica;
    insert into $1.$2 ($C) select $C from jsonb_populate_recordset(null::$1.$2, pg_read_file('/batch.json')::jsonb)
    on conflict do nothing;" 2>&1 | grep -i "error" || true
}

echo "==> Contas de acesso"
for T in users identities mfa_factors; do
  OFF=0
  while :; do
    api "{\"action\":\"auth-rows\",\"table\":\"$T\",\"offset\":$OFF,\"limit\":$BATCH}" \
      | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin).get("rows") or []))' > "$WORK/b.json"
    N=$(python3 -c 'import json;print(len(json.load(open("'"$WORK"'/b.json"))))')
    [ "$N" = "0" ] && break
    load auth "$T" "$WORK/b.json"
    OFF=$((OFF+N)); [ "$N" -lt "$BATCH" ] && break
  done
  echo "   auth.$T: $OFF"
done

echo "==> Tabelas do sistema"
api '{"action":"tables"}' | python3 -c 'import json,sys
d=json.load(sys.stdin)["tables"]
for t in d: print(t["table_name"], t["row_count"])' > "$WORK/tables.txt"

while read -r TBL CNT; do
  [ -z "$TBL" ] && continue
  [ "$CNT" = "0" ] && { echo "   $TBL: 0"; continue; }
  OFF=0
  while :; do
    api "{\"action\":\"rows\",\"table\":\"$TBL\",\"offset\":$OFF,\"limit\":$BATCH}" \
      | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin).get("rows") or []))' > "$WORK/b.json"
    N=$(python3 -c 'import json;print(len(json.load(open("'"$WORK"'/b.json"))))')
    [ "$N" = "0" ] && break
    load public "$TBL" "$WORK/b.json"
    OFF=$((OFF+N)); [ "$N" -lt "$BATCH" ] && break
  done
  echo "   $TBL: $OFF/$CNT"
done < "$WORK/tables.txt"

echo "==> Concluído"
