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

load() { # $1 schema.table  $2 json file
  docker cp "$2" supabase-db:/batch.json >/dev/null
  psqlq -v ON_ERROR_STOP=0 -c "set session_replication_role = replica;
    insert into $1 select * from jsonb_populate_recordset(null::$1, pg_read_file('/batch.json')::jsonb)
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
    load "auth.$T" "$WORK/b.json"
    OFF=$((OFF+N)); [ "$N" -lt "$BATCH" ] && break
  done
  echo "   auth.$T: $OFF"
done

echo "==> Tabelas do sistema"
api '{"action":"tables"}' | python3 -c 'import json,sys
d=json.load(sys.stdin)["tables"]
print("\n".join(f"{t[\"table_name\"]} {t[\"row_count\"]}" for t in d))' > "$WORK/tables.txt"

while read -r TBL CNT; do
  [ -z "$TBL" ] && continue
  [ "$CNT" = "0" ] && { echo "   $TBL: 0"; continue; }
  OFF=0
  while :; do
    api "{\"action\":\"rows\",\"table\":\"$TBL\",\"offset\":$OFF,\"limit\":$BATCH}" \
      | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin).get("rows") or []))' > "$WORK/b.json"
    N=$(python3 -c 'import json;print(len(json.load(open("'"$WORK"'/b.json"))))')
    [ "$N" = "0" ] && break
    load "public.$TBL" "$WORK/b.json"
    OFF=$((OFF+N)); [ "$N" -lt "$BATCH" ] && break
  done
  echo "   $TBL: $OFF/$CNT"
done < "$WORK/tables.txt"

echo "==> Concluído"
