# Agente SeleniumBase (pular captcha do Duplecast, IBO Sol e Uniplay)

Este agente substitui o 2Captcha/Bright Data no seu proxy. Ele abre um Chrome
real em "UC Mode" (não detectável) e clica sozinho no Cloudflare Turnstile /
"Just a moment" / checkbox do reCAPTCHA-hCaptcha.

> Captcha de imagem ("selecione as motos") continua sem solução automática —
> nesses casos o sistema cai na fila de pendências manuais.

## 1. Instalar na VPS (Ubuntu)

```bash
sudo apt update
sudo apt install -y python3-pip xvfb chromium-browser
pip3 install --upgrade seleniumbase
```

## 2. Copiar o agente

Baixe `seleniumbase_agent.py` (está nesta mesma pasta / disponível em
`https://SEU-DOMINIO/sigma-proxy/seleniumbase_agent.py`) para a VPS.

## 3. Rodar como serviço

```bash
sudo tee /etc/systemd/system/sg-agent.service >/dev/null <<'EOF'
[Unit]
Description=SuperGestor SeleniumBase Agent
After=network.target

[Service]
Environment=SIGMA_PROXY_SECRET=coloque-a-mesma-chave-do-supergestor
Environment=PORT=8788
Environment=HEADLESS=1
ExecStart=/usr/bin/python3 /opt/supergestor/seleniumbase_agent.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload && sudo systemctl enable --now sg-agent
curl http://127.0.0.1:8788/    # deve responder {"ok":true,"engine":"seleniumbase"}
```

## 4. Ligar no SuperGestor

O agente fala exatamente o mesmo protocolo do mini-proxy Node, então basta
apontar o segredo `SIGMA_PROXY_URL` para `http://SEU_IP:8788` (mantendo
`SIGMA_PROXY_SECRET` igual). A partir daí, Duplecast, IBO Sol e Uniplay passam
pelo agente e resolvem o desafio sem chave paga de captcha.

Dica: exponha por HTTPS (Nginx + Certbot) se a VPS for pública, e libere a
porta somente para o backend.

## 5. Testar

```bash
curl -s -X POST http://127.0.0.1:8788/ \
  -H 'content-type: application/json' \
  -H 'x-sigma-proxy-secret: SUA-CHAVE' \
  -d '{"browser":true,"url":"https://ibosol.com/login","wait_ms":6000}' | head -c 600
```

O campo `captcha.status` deve voltar `solve_finished` ou `not_detected`.
