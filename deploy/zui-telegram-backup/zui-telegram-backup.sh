#!/usr/bin/env bash
# Backup do ZUI a cada 10 min para o mesmo Telegram do Super Gestor.
# Snapshot consistente (VACUUM INTO) + chaves, cifrado com AES-256 (gpg) antes de sair do servidor.
set -euo pipefail
umask 077
DATA=/var/lib/zuiplayer
PASS=/root/zui-telegram-backup.pass
ENVF=/opt/supergestor/functions.env
[ -s "$PASS" ] || openssl rand -base64 33 > "$PASS"
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENVF" | cut -d= -f2- | tr -d '"\r')
CHAT=$(grep -E '^TELEGRAM_CHAT_ID=' "$ENVF" | cut -d= -f2- | tr -d '"\r')
THREAD=""; if [[ "$CHAT" =~ ^(-?[0-9]+):([0-9]+)$ ]]; then CHAT=${BASH_REMATCH[1]}; THREAD=${BASH_REMATCH[2]}; fi
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
STAMP=$(TZ=America/Sao_Paulo date +%Y%m%d-%H%M)
mkdir "$W/zui"
node -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1],{readOnly:true});d.exec("VACUUM INTO \x27"+process.argv[2]+"\x27");d.close()' "$DATA/zui.sqlite" "$W/zui/zui.sqlite"
cp "$DATA"/backup-recovery.key "$DATA"/credential-key.bin "$W/zui/"
cp /etc/zuiplayer/runtime.env "$W/zui/" 2>/dev/null || true
OUT="$W/zui-backup-$STAMP.tar.gz.gpg"
tar -C "$W" -czf - zui | gpg --batch --yes --pinentry-mode loopback --passphrase-file "$PASS" --symmetric --cipher-algo AES256 -o "$OUT"
ARGS=(-F "chat_id=$CHAT" -F "document=@$OUT" -F "caption=🔐 Backup ZUI Player $(TZ=America/Sao_Paulo date '+%d/%m/%Y %H:%M')")
[ -n "$THREAD" ] && ARGS+=(-F "message_thread_id=$THREAD")
for i in 1 2 3; do
  R=$(curl -sS --max-time 60 "${ARGS[@]}" "https://api.telegram.org/bot$TOKEN/sendDocument" 2>&1 | sed "s/$TOKEN/***/g") || true
  echo "$R" | grep -q '"ok":true' && { echo "ok $STAMP $(stat -c%s "$OUT")"; exit 0; }
  sleep $((i*5))
done
echo "falha: $R" >&2; exit 1
