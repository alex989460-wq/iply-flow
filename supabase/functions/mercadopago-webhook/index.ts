// Webhook do Mercado Pago (Pix).
// O Mercado Pago avisa apenas o ID do pagamento; nós consultamos a API com o
// token do revendedor dono da cobrança e, se estiver aprovado, reaproveitamos
// exatamente o mesmo processamento já usado pelo Pix da Efí (efi-webhook),
// que cria o pagamento, renova o cliente e dispara o painel externo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPayment } from "../_shared/mercadopago-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method === "GET") return json({ ok: true, service: "mercadopago-webhook" });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as any));

    const topic = String(body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
    const paymentId = String(
      body?.data?.id || body?.resource || url.searchParams.get("data.id") || url.searchParams.get("id") || "",
    ).replace(/^.*\//, "");

    if (!paymentId) return json({ ok: true, ignored: "sem_id" });
    if (topic && !topic.includes("payment")) return json({ ok: true, ignored: topic });

    // Localiza a cobrança criada por nós.
    const { data: charge } = await admin
      .from("efi_charges")
      .select("id, owner_id, txid, amount, status, provider, provider_payment_id")
      .eq("provider_payment_id", paymentId)
      .maybeSingle();

    if (!charge) {
      console.warn("[mercadopago-webhook] pagamento sem cobrança registrada", paymentId);
      return json({ ok: true, ignored: "cobranca_nao_encontrada" });
    }
    if (charge.status === "paid") return json({ ok: true, already: true });

    const { data: settings } = await admin
      .from("mercadopago_settings")
      .select("access_token, environment, payer_email")
      .eq("user_id", charge.owner_id)
      .maybeSingle();
    if (!settings?.access_token) return json({ ok: false, error: "mercadopago_nao_configurado" }, 400);

    const pay = await getPayment(settings as any, paymentId);
    if (!pay.ok) {
      console.error("[mercadopago-webhook] falha ao consultar pagamento", pay.status, pay.body);
      return json({ ok: false, error: "consulta_falhou" }, 400);
    }

    const status = String(pay.body?.status || "");
    if (status !== "approved") return json({ ok: true, status });

    const valor = Number(pay.body?.transaction_amount || 0);
    if (Math.abs(Number(charge.amount) - valor) > 0.01) {
      console.error("[mercadopago-webhook] valor divergente", charge.amount, valor);
      return json({ ok: false, error: "valor_divergente" }, 400);
    }

    // Reaproveita o processamento do Pix já existente (mesma cobrança/txid).
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/efi-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
      body: JSON.stringify({
        pix: [{ txid: charge.txid, valor, endToEndId: `MP-${paymentId}` }],
      }),
    });
    const out = await res.json().catch(() => ({}));
    return json({ ok: res.ok, forwarded: out });
  } catch (err) {
    console.error("[mercadopago-webhook]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
