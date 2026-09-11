# Chaves das integrações

Todas as chaves usadas pelas funções ficam em `/opt/supergestor/functions.env`
(permissão 600). Elas nunca vão para o código nem para o site.

Crie o arquivo assim:

```bash
sudo install -m 600 /dev/null /opt/supergestor/functions.env
sudo nano /opt/supergestor/functions.env
```

## Preenchidas automaticamente pela instalação
```
SUPABASE_URL=https://supergestor.top
SUPABASE_ANON_KEY=          # de /opt/supergestor/keys.env
SUPABASE_SERVICE_ROLE_KEY=  # de /opt/supergestor/keys.env
```

## Você precisa recadastrar (mesmos valores usados hoje)

WhatsApp e mensagens
```
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
CRM_OFICIAL_API_KEY=
ZAP_RESPONDER_TOKEN=
EVOLUTION_WEBHOOK_FORWARD_URL=
ONESIGNAL_APP_ID=
ONESIGNAL_REST_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Pagamentos
```
CAKTO_WEBHOOK_SECRET=
```
(Efí e Mercado Pago já ficam por revendedor, dentro do banco — nada a fazer.)

Painéis
```
NATV_API_KEY=
NATV_BASE_URL=
NATV2_API_KEY=
NATV2_BASE_URL=
THE_BEST_API_KEY=
SIGMA_PROXY_URL=
SIGMA_PROXY_SECRET=
P2CINE_EXTENSION_TOKEN=
VPLAY_PANEL_USERNAME=
VPLAY_MYSQL_HOST=
VPLAY_MYSQL_PORT=
VPLAY_MYSQL_USER=
VPLAY_MYSQL_PASSWORD=
VPLAY_MYSQL_DATABASE=
XUI_MYSQL_HOST=
XUI_MYSQL_PORT=
XUI_MYSQL_USER=
XUI_MYSQL_PASSWORD=
XUI_MYSQL_DATABASE=
TWOCAPTCHA_API_KEY=
```

Segurança e utilidades
```
TURNSTILE_SECRET_KEY=
BACKUP_CRON_SECRET=
OUTBOUND_WEBHOOK_URL=
OUTBOUND_WEBHOOK_BEARER=
WEBHOOK_OUTBOUND_SECRET=
PANEL_PASSWORD_SYNC_CRON_SECRET=
LOVABLE_SEND_URL=
URL_DE_WEBHOOK_DE_SAIDA=
```

## Inteligência artificial — única troca obrigatória

Hoje a IA usa o intermediário da Lovable. Na VPS passa a usar sua chave direta:

```
GEMINI_API_KEY=            # console Google AI Studio
LOVABLE_API_KEY=           # deixe VAZIO na VPS
LOVABLE_AI_GATEWAY_KEY=    # deixe VAZIO na VPS
```

As funções que usam IA (`ai-chat-reply`, `ai-training-analyze`, `ai-flow-builder`,
otimizador de templates, agente de utilidade) já leem `GEMINI_API_KEY` como
alternativa — basta preencher.

## E-mail e recuperação de senha

Para continuar enviando códigos, confirmações e recuperação de senha sem a
Lovable, configure o SMTP do seu webmail Hostinger em
`/opt/supergestor/supabase/.env`:

```text
SMTP_ADMIN_EMAIL=
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=SuperGestor
```

Não faça a virada enquanto o teste de recuperação de senha não chegar ao
e-mail de teste.

## Segredos temporários da migração

`MIGRATION_EXPORT_KEY` ou `MIGRATION_EXPORT_SECRET` existem somente durante a
cópia. Depois da conferência final, remova ambos e exclua a função
`migration-export` nos dois ambientes.

## Importante
- Antes da virada, libere o IP da VPS nos painéis que restringem por IP
  (Rush, Sigma, Uniplay, P2Cine/kOffice, MySQL de XUI/VPlay).
- Depois de editar o arquivo: `bash deploy/scripts/deploy-functions.sh /caminho/do/repo`
