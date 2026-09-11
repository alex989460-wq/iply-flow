#!/usr/bin/env bash
# Instalação da VPS — Ubuntu 22.04/24.04
# Uso: sudo bash install.sh dominio.com email@dominio.com
set -euo pipefail

DOMAIN="${1:?informe o domínio, ex: supergestor.top}"
EMAIL="${2:?informe um e-mail para o SSL}"
BASE=/opt/supergestor

echo "==> Pacotes base"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git jq ufw fail2ban nginx unzip postgresql-client

echo "==> Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

echo "==> Estrutura em $BASE"
mkdir -p "$BASE"/{app,functions,backups}
cd "$BASE"

echo "==> Supabase self-hosted"
if [ ! -d "$BASE/supabase" ]; then
  git clone --depth 1 https://github.com/supabase/supabase /tmp/supabase-src
  cp -r /tmp/supabase-src/docker "$BASE/supabase"
  cp "$BASE/supabase/.env.example" "$BASE/supabase/.env"
fi

echo "==> Gerando segredos da instalação"
if [ ! -f "$BASE/.env" ]; then
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 32)
  DASH_PASS=$(openssl rand -hex 12)
  cat > "$BASE/.env" <<EOF
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$DASH_PASS
EOF
  chmod 600 "$BASE/.env"
  echo "Segredos gravados em $BASE/.env (guarde em local seguro)."
fi
# shellcheck disable=SC1091
source "$BASE/.env"

python3 - "$JWT_SECRET" <<'PY' > "$BASE/keys.env"
import base64, hmac, hashlib, json, sys, time
secret = sys.argv[1].encode()
def b64(d): return base64.urlsafe_b64encode(d).rstrip(b'=').decode()
def jwt(role):
    now = int(time.time())
    h = b64(json.dumps({"alg":"HS256","typ":"JWT"},separators=(',',':')).encode())
    p = b64(json.dumps({"role":role,"iss":"supabase","iat":now,"exp":now+60*60*24*365*10},separators=(',',':')).encode())
    sig = b64(hmac.new(secret, f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"
print("ANON_KEY=" + jwt("anon"))
print("SERVICE_ROLE_KEY=" + jwt("service_role"))
PY
chmod 600 "$BASE/keys.env"
# shellcheck disable=SC1091
source "$BASE/keys.env"

echo "==> Configurando .env do Supabase"
SB="$BASE/supabase/.env"
set_env() { grep -q "^$1=" "$SB" && sed -i "s|^$1=.*|$1=$2|" "$SB" || echo "$1=$2" >> "$SB"; }
set_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
set_env JWT_SECRET "$JWT_SECRET"
set_env ANON_KEY "$ANON_KEY"
set_env SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
set_env DASHBOARD_USERNAME "$DASHBOARD_USERNAME"
set_env DASHBOARD_PASSWORD "$DASHBOARD_PASSWORD"
set_env SITE_URL "https://$DOMAIN"
set_env API_EXTERNAL_URL "https://$DOMAIN"
set_env SUPABASE_PUBLIC_URL "https://$DOMAIN"
set_env ADDITIONAL_REDIRECT_URLS "https://$DOMAIN,https://$DOMAIN/dashboard"
set_env DISABLE_SIGNUP "false"
set_env ENABLE_EMAIL_AUTOCONFIRM "false"
set_env STUDIO_DEFAULT_PROJECT "SuperGestor"

echo "==> Subindo o stack"
cd "$BASE/supabase"
docker compose pull
docker compose up -d

echo "==> Nginx"
cp "$(dirname "$0")/nginx/supergestor.conf" /etc/nginx/sites-available/supergestor.conf
sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/sites-available/supergestor.conf
ln -sf /etc/nginx/sites-available/supergestor.conf /etc/nginx/sites-enabled/supergestor.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> SSL"
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect || \
  echo "SSL pendente: rode o certbot após o DNS apontar para esta VPS."

echo "==> Backup automático"
install -m 0755 "$(dirname "$0")/scripts/backup.sh" /usr/local/bin/supergestor-backup
( crontab -l 2>/dev/null | grep -v supergestor-backup; echo "*/10 * * * * /usr/local/bin/supergestor-backup snapshot"; echo "15 4 * * * /usr/local/bin/supergestor-backup daily" ) | crontab -

cat <<EOF

===========================================
Instalação concluída.
Chaves públicas/privadas em: $BASE/keys.env
Senhas em: $BASE/.env
Próximo passo: scripts/export-from-cloud.sh e scripts/import-to-vps.sh
===========================================
EOF
