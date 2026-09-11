#!/usr/bin/env bash
# Compila o site apontando para a própria VPS e publica no Nginx.
# Uso: bash deploy-frontend.sh /caminho/do/repositorio
set -euo pipefail

REPO="${1:?informe o caminho do repositório do sistema}"
BASE=/opt/supergestor
# shellcheck disable=SC1091
source "$BASE/.env"
# shellcheck disable=SC1091
source "$BASE/keys.env"

cd "$REPO"

cat > .env.production <<EOF
VITE_SUPABASE_URL=https://$DOMAIN
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_ANON_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=supergestor
EOF

command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

bun install
bun run build

rsync -a --delete dist/ "$BASE/app/"
systemctl reload nginx
echo "Site publicado em https://$DOMAIN"
