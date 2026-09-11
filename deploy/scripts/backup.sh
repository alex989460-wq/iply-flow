#!/usr/bin/env bash
# Backup do banco. Instalado como /usr/local/bin/supergestor-backup pelo install.sh
# Uso: supergestor-backup snapshot | supergestor-backup daily
set -euo pipefail

MODE="${1:-daily}"
BASE=/opt/supergestor
# shellcheck disable=SC1091
source "$BASE/.env"
DB="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5432/postgres"
DEST="$BASE/backups/$MODE"
mkdir -p "$DEST"

FILE="$DEST/$(date +%Y%m%d-%H%M).sql.gz"
pg_dump -d "$DB" --no-owner | gzip -9 > "$FILE"

# Retenção: snapshots 24h, diários 30 dias
if [ "$MODE" = "snapshot" ]; then
  find "$DEST" -type f -mmin +1440 -delete
else
  find "$DEST" -type f -mtime +30 -delete
fi

# Cópia fora da VPS (recomendado). Configure RCLONE_REMOTE em $BASE/.env
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$FILE" "$RCLONE_REMOTE/$MODE/" --quiet || true
fi
