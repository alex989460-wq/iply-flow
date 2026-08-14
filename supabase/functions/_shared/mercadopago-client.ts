// Cliente mínimo da API do Mercado Pago (somente Pix).
// Documentação: https://www.mercadopago.com.br/developers/pt/reference
// Cada revendedor guarda o próprio access token em `mercadopago_settings`.

export type MpSettings = {
  access_token?: string | null;
  environment?: string | null;
  payer_email?: string | null;
};

const API = "https://api.mercadopago.com";

export function mpToken(settings: MpSettings): string {
  return String(settings?.access_token || "").trim();
}

/** Cria um pagamento Pix e devolve o QR Code / copia e cola. */
export async function createPixPayment(
  settings: MpSettings,
  opts: {
    amount: number;
    description: string;
    externalReference: string;
    notificationUrl?: string;
    payerEmail?: string;
    payerName?: string;
    expiresInSec?: number;
  },
): Promise<{
  status: number;
  body: any;
  ok: boolean;
  id?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}> {
  const token = mpToken(settings);
  if (!token) return { status: 400, body: { message: "Access token do Mercado Pago não configurado." }, ok: false };

  const expires = new Date(Date.now() + (opts.expiresInSec ?? 86400) * 1000);
  const email = String(opts.payerEmail || settings.payer_email || "").trim() || "cliente@email.com";

  const payload: Record<string, unknown> = {
    transaction_amount: Math.round(Number(opts.amount) * 100) / 100,
    description: String(opts.description || "Pagamento").slice(0, 250),
    payment_method_id: "pix",
    external_reference: opts.externalReference,
    date_of_expiration: expires.toISOString().replace("Z", "-00:00"),
    payer: {
      email,
      first_name: String(opts.payerName || "Cliente").slice(0, 60),
    },
  };
  if (opts.notificationUrl) payload.notification_url = opts.notificationUrl;

  const res = await fetch(`${API}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-Idempotency-Key": opts.externalReference,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  const td = body?.point_of_interaction?.transaction_data || {};
  return {
    status: res.status,
    body,
    ok: res.ok,
    id: body?.id != null ? String(body.id) : undefined,
    qrCode: td?.qr_code || "",
    qrCodeBase64: td?.qr_code_base64 || "",
    ticketUrl: td?.ticket_url || "",
  };
}

/** Consulta um pagamento pelo id. */
export async function getPayment(settings: MpSettings, paymentId: string) {
  const token = mpToken(settings);
  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

/** Testa as credenciais (endpoint leve que exige token válido). */
export async function testCredentials(settings: MpSettings) {
  const token = mpToken(settings);
  if (!token) return { ok: false, message: "Informe o Access Token do Mercado Pago." };
  const res = await fetch(`${API}/v1/payment_methods`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body?.message || `Credenciais rejeitadas (HTTP ${res.status}).` };
  }
  const list = await res.json().catch(() => []);
  const hasPix = Array.isArray(list) && list.some((m: any) => m?.id === "pix");
  return {
    ok: true,
    message: hasPix
      ? "Conexão OK e Pix disponível nesta conta."
      : "Conexão OK, mas a conta não tem Pix habilitado. Cadastre uma chave Pix no Mercado Pago.",
    pix_enabled: hasPix,
  };
}
