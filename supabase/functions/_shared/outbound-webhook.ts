// Dispara webhook HMAC-assinado para o sistema externo do usuário.
// Requer segredos: URL_DE_WEBHOOK_DE_SAIDA e WEBHOOK_OUTBOUND_SECRET.
// Fire-and-forget: nunca lança — falhas são apenas logadas.

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

export async function fireOutboundWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const url =
      Deno.env.get('URL_DE_WEBHOOK_DE_SAIDA') ||
      Deno.env.get('URL_DE_WEBHOOK_DE_SAÍDA') ||
      Deno.env.get('OUTBOUND_WEBHOOK_URL');
    const secret = Deno.env.get('WEBHOOK_OUTBOUND_SECRET');
    if (!url || !secret) return;

    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    });
    const signature = await hmacSha256Hex(secret, body);

    // fire-and-forget
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Event': event,
      },
      body,
    }).catch((e) => console.error('[outbound-webhook] fetch error:', e));
  } catch (e) {
    console.error('[outbound-webhook] error:', e);
  }
}
