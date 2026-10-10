#!/bin/bash
# Installs the ZUI Efí Pix bridge on the VPS. Idempotent; keeps a backup of nginx conf.
set -euo pipefail
OWNER=1736505f-f34e-4153-abed-c3739f9c7c52
TS=$(date +%s); BK=/root/zui-efi-pix-before-$TS; mkdir -p $BK
NG=/etc/nginx/sites-enabled/zuiplayer.top.conf; cp -a $NG $BK/
id zuipix >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin zuipix
install -d -m 750 -o root -g zuipix /etc/zui-efi-pix /opt/zui-efi-pix
install -d -m 750 -o zuipix -g zuipix /var/lib/zui-efi-pix
install -m 640 -o root -g zuipix /tmp/zui-efi-pix/bridge.mjs /opt/zui-efi-pix/bridge.mjs
Q() { docker exec supabase-db psql -U postgres -tAc "select $1 from efi_settings where user_id='$OWNER' and enabled"; }
Q cert_p12_base64 | tr -d '\n ' | base64 -d > /tmp/efi.p12
openssl pkcs12 -in /tmp/efi.p12 -nokeys -passin pass: -out /etc/zui-efi-pix/cert.pem 2>/dev/null || openssl pkcs12 -legacy -in /tmp/efi.p12 -nokeys -passin pass: -out /etc/zui-efi-pix/cert.pem
openssl pkcs12 -in /tmp/efi.p12 -nocerts -nodes -passin pass: -out /etc/zui-efi-pix/key.pem 2>/dev/null || openssl pkcs12 -legacy -in /tmp/efi.p12 -nocerts -nodes -passin pass: -out /etc/zui-efi-pix/key.pem
shred -u /tmp/efi.p12
[ -f /etc/zui-efi-pix/secret ] || openssl rand -hex 32 > /etc/zui-efi-pix/secret
cat > /etc/zui-efi-pix/env <<EOF
EFI_CLIENT_ID=$(Q client_id)
EFI_CLIENT_SECRET=$(Q client_secret)
EFI_PIX_KEY=$(Q pix_key)
EFI_CERT=/etc/zui-efi-pix/cert.pem
EFI_KEY=/etc/zui-efi-pix/key.pem
ZUI_WEBHOOK_SECRET=$(cat /etc/zui-efi-pix/secret)
EOF
chown root:zuipix /etc/zui-efi-pix/*; chmod 640 /etc/zui-efi-pix/*
cat > /etc/systemd/system/zui-efi-pix.service <<'EOF'
[Unit]
Description=ZUI Player Efí Pix bridge
After=network-online.target zuiplayer.service
[Service]
User=zuipix
EnvironmentFile=/etc/zui-efi-pix/env
ExecStart=/usr/bin/node /opt/zui-efi-pix/bridge.mjs
Restart=always
MemoryMax=128M
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/zui-efi-pix
PrivateTmp=yes
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl enable --now zui-efi-pix; systemctl restart zui-efi-pix
if ! grep -q 'location ^~ /pix/' $NG; then
  sed -i '0,/    location \/ {/s//    location ^~ \/pix\/ { proxy_pass http:\/\/127.0.0.1:18790; proxy_set_header X-Real-IP $remote_addr; proxy_set_header Host $host; }\n    location \/ {/' $NG
fi
if nginx -t 2>/dev/null; then systemctl reload nginx; else cp -a $BK/$(basename $NG) $NG; echo NGINX_ROLLBACK; exit 1; fi
sleep 1; systemctl is-active zui-efi-pix zuiplayer zapcrm; echo backup=$BK
