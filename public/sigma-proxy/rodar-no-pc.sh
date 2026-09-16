#!/usr/bin/env bash
# SuperGestor - Agente do Duplecast para rodar no seu PC (Linux ou Mac)
# Uso: curl -fsSL https://supergestor.top/sigma-proxy/rodar-no-pc.sh | bash
set -e

SECRET="sg-duplecast-2026-7Kq3Vt9Zr1Ax"
DIR="$HOME/supergestor-agente"
mkdir -p "$DIR"
cd "$DIR"

echo "1/4 Instalando o navegador automatico..."
python3 -m pip install --upgrade --quiet seleniumbase

echo "2/4 Baixando o programa..."
curl -fsSL "https://supergestor.top/sigma-proxy/seleniumbase_agent.py" -o agente.py

echo "3/4 Preparando a conexao..."
if ! command -v cloudflared >/dev/null 2>&1; then
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"; [ "$ARCH" = "x86_64" ] && ARCH="amd64"; [ "$ARCH" = "aarch64" ] && ARCH="arm64"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${OS}-${ARCH}" -o cloudflared
  chmod +x cloudflared
  CF="./cloudflared"
else
  CF="cloudflared"
fi

echo "4/4 Iniciando..."
SIGMA_PROXY_SECRET="$SECRET" HEADLESS=0 PORT=8788 python3 agente.py &
sleep 6
echo ""
echo "Pronto! Copie o link https://....trycloudflare.com que aparecer abaixo e mande no chat do SuperGestor."
echo "Deixe esta janela aberta."
$CF tunnel --url http://127.0.0.1:8788
