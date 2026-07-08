// Dispara webhook para o gestor externo (formato do CRM Oficial inbound).
// Segredos:
//   - URL_DE_WEBHOOK_DE_SAIDA  (ex: https://crmapioficial.lovable.app/api/public/billing/inbound)
//   - OUTBOUND_WEBHOOK_BEARER  (API key com escopo messages:write / broadcasts:write)
//   - WEBHOOK_OUTBOUND_SECRET  (opcional — se presente, também envia X-Signature HMAC-SHA256)
// Fire-and-forget: nunca lança.

const EVENT_MAP: Record<string, string> = {
  'billing.sent': 'faturamento.enviado',
  'billing.delivered': 'faturamento.entregue',
  'billing.read': 'faturamento.lido',
  'billing.failed': 'faturamento.falhou',
  'template.sent': 'modelo.enviado',
};

const STATUS_MAP: Record<string, string> = {
  'billing.sent': 'sent',
  'billing.delivered': 'delivered',
  'billing.read': 'read',
  'billing.failed': 'failed',
  'template.sent': 'sent',
};

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type OutboundPayload = {
  customer?: { id?: string; name?: string; phone?: string; due_date?: string };
  billing_type?: string;
  template?: string;
  status?: string;
  error?: string | null;
  provider?: string;
  wa_message_id?: string;
  broadcast_id?: string;
  [k: string]: unknown;
};

export async function fireOutboundWebhook(event: string, payload: OutboundPayload): Promise<void> {
  try {
    const url =
      Deno.env.get('URL_DE_WEBHOOK_DE_SAIDA') ||
      Deno.env.get('URL_DE_WEBHOOK_DE_SAÍDA') ||
      Deno.env.get('OUTBOUND_WEBHOOK_URL') ||
      'https://crmapioficial.lovable.app/api/public/billing/inbound';
    if (!url) return;

    const bearer =
      Deno.env.get('OUTBOUND_WEBHOOK_BEARER') ||
      Deno.env.get('CRM_OFICIAL_API_KEY');
    const hmacSecret = Deno.env.get('WEBHOOK_OUTBOUND_SECRET');

    const eventPt = EVENT_MAP[event] || event;
    const status = payload.status || STATUS_MAP[event] || 'sent';
    const phone = payload.customer?.phone
      ? String(payload.customer.phone).replace(/\D/g, '')
      : undefined;

    const body = JSON.stringify({
      event: eventPt,
      timestamp: new Date().toISOString(),
      wa_message_id: payload.wa_message_id,
      phone,
      status,
      broadcast_id: payload.broadcast_id,
      error: payload.error ?? undefined,
      // dados adicionais (o inbound do CRM ignora extras)
      customer: payload.customer,
      billing_type: payload.billing_type,
      template: payload.template,
      provider: payload.provider,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Event': eventPt,
    };
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
    if (hmacSecret) headers['X-Signature'] = `sha256=${await hmacSha256Hex(hmacSecret, body)}`;

    fetch(url, { method: 'POST', headers, body }).catch((e) =>
      console.error('[outbound-webhook] fetch error:', e),
    );
  } catch (e) {
    console.error('[outbound-webhook] error:', e);
  }
}
