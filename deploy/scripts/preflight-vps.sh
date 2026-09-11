#!/usr/bin/env bash
# Valida a VPS antes da virada sem alterar DNS nem ligar jobs.
set -euo pipefail

BASE=/opt/supergestor
ERR=0

source "$BASE/.env"
source "$BASE/keys.env"

echo "==> Containers"
for c in supabase-db supabase-auth supabase-rest supabase-storage supabase-edge-functions supabase-realtime supabase-pooler supabase-envoy; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$c"; then
    echo "FALHA: container $c nao esta rodando"
    ERR=1
  fi
done
if [ $ERR -eq 0 ]; then echo "OK — containers saudaveis"; fi

echo "==> Banco"
SQL() { docker exec -i supabase-db psql -U supabase_admin -d postgres -At -c "$1"; }
for q in "select count(*) from auth.users" \
         "select count(*) from public.customers" \
         "select count(*) from public.payments" \
         "select count(*) from public.billing_logs"; do
  echo "  $q -> $(SQL "$q")"
done

echo "==> Agendamentos desativados"
ACTIVE=$(SQL "select count(*) from cron.job where active")
if [ "$ACTIVE" != "0" ]; then
  echo "FALHA: $ACTIVE cron job(s) ativo(s). Deve estar 0 antes da virada."
  ERR=1
else
  echo "OK — nenhum cron ativo"
fi

echo "==> Storage"
SQL "select name from storage.buckets order by name"
SQL "select bucket_id||': '||count(*) from storage.objects group by bucket_id order by bucket_id"

echo "==> Funcoes"
FN_COUNT=$(ls -1 "$BASE/supabase/volumes/functions" | wc -l)
echo "  funcoes publicadas: $FN_COUNT"

echo "==> Endpoints"
HC=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/rest/v1/?apikey="$ANON_KEY" || true)
if [ "$HC" != "200" ]; then
  echo "FALHA: REST retornou $HC"
  ERR=1
else
  echo "OK — REST 200"
fi

echo "==> Nginx"
nginx -t >/dev/null 2>&1 && echo "OK — nginx -t" || ERR=1
curl -s -o /dev/null -w "site por IP: %{http_code}\n" http://127.0.0.1:80/

echo "==> SSL"
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "OK — certificado Lets Encrypt encontrado para $DOMAIN"
  openssl x509 -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" -noout -dates | head -2
else
  echo "PENDENTE — certificado ainda nao gerado (normal ate o DNS apontar)"
fi

echo "==> Segredos de integracao"
MISSING=0
for k in META_APP_ID META_APP_SECRET META_WEBHOOK_VERIFY_TOKEN CRM_OFICIAL_API_KEY CAKTO_WEBHOOK_SECRET GEMINI_API_KEY TURNSTILE_SECRET_KEY; do
  if ! grep -qE "^${k}=[^[:space:]]" "$BASE/functions.env"; then
    echo "  FALTA: $k"
    MISSING=1
  fi
done
if [ $MISSING -eq 0 ]; then echo "OK — principais segredos presentes"; fi

echo "==> SMTP"
if grep -qE "^SMTP_HOST=[^[:space:]]" "$BASE/supabase/.env" && grep -qE "^SMTP_PASS=[^[:space:]]" "$BASE/supabase/.env"; then
  echo "OK — SMTP configurado"
else
  echo "PENDENTE — SMTP nao configurado (recuperacao de senha pode falhar)"
fi

if [ $ERR -eq 0 ]; then
  echo ""
  echo "PREFLIGHT_APROVADO"
else
  echo ""
  echo "PREFLIGHT_REPROVADO — corrija os itens acima"
  exit 1
fi
