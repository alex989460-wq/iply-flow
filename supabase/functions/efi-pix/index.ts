// Efí Pix — authenticated actions used by the reseller's own settings panel.
// Actions: verify-connection, register-webhook, create-charge.
// Public checkout uses efi-pix-public instead (no JWT, service-role read).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildCredentials,
  createCharge,
  getAccessToken,
  getChargeStatus,
  getQrCode,
  getWebhook,
  newTxid,
  registerWebhook,
} from "../_shared/efi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function webhookUrlFor() {
  // Public webhook endpoint that Efí will POST to when a Pix is paid.
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/efi-webhook`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: settings, error: setErr } = await admin
      .from("efi_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (setErr) throw setErr;
    if (!settings) return json({ error: "efi_not_configured" }, 400);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    const creds = buildCredentials(settings as any);

    if (action === "verify-connection") {
      // Just try to mint a token — proves cert + client_id/secret work.
      const token = await getAccessToken(creds);
      const wh = await getWebhook(creds).catch((e) => ({ status: 0, body: { message: String(e) } }));
      await admin.from("efi_settings").update({
        last_verified_at: new Date().toISOString(),
        last_error: null,
      }).eq("user_id", userId);
      return json({
        ok: true,
        environment: creds.env,
        token_prefix: token.slice(0, 12) + "…",
        webhook_status: wh.status,
        webhook_body: wh.body,
      });
    }

    if (action === "register-webhook") {
      const url = webhookUrlFor();
      const result = await registerWebhook(creds, url);
      // Efí returns 200 or 204 on success.
      const ok = result.status === 200 || result.status === 204;
      await admin.from("efi_settings").update({
        webhook_configured_at: ok ? new Date().toISOString() : null,
        last_error: ok ? null : `Webhook falhou (${result.status}): ${JSON.stringify(result.body).slice(0, 300)}`,
      }).eq("user_id", userId);
      return json({ ok, webhook_url: url, status: result.status, body: result.body });
    }

    if (action === "create-charge") {
      const amount = Number(body.amount);
      const description = String(body.description || "Cobrança Pix");
      if (!isFinite(amount) || amount <= 0) return json({ error: "amount_invalid" }, 400);

      const txid = newTxid();
      const cobResp = await createCharge(creds, { txid, amount, description, expiresInSec: 3600 });
      if (cobResp.status < 200 || cobResp.status >= 300) {
        return json({ error: "cob_failed", status: cobResp.status, body: cobResp.body }, 400);
      }
      const locId = cobResp.body?.loc?.id;
      const pixCopiaCola: string = cobResp.body?.pixCopiaECola || "";
      let qrcodeBase64 = "";
      if (locId) {
        const qr = await getQrCode(creds, locId);
        if (qr.status === 200 && qr.body?.imagemQrcode) {
          qrcodeBase64 = qr.body.imagemQrcode;
        }
      }

      await admin.from("efi_charges").insert({
        owner_id: userId,
        customer_id: body.customer_id || null,
        pending_id: body.pending_id || null,
        pending_kind: body.pending_kind || null,
        txid,
        amount,
        environment: creds.env,
        pix_copia_cola: pixCopiaCola,
        qrcode_base64: qrcodeBase64,
        metadata: { description, source: "manual" },
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });

      return json({
        ok: true,
        txid,
        pix_copia_cola: pixCopiaCola,
        qrcode_base64: qrcodeBase64,
      });
    }

    if (action === "get-charge-status") {
      const txid = String(body.txid || "");
      if (!txid) return json({ error: "txid_required" }, 400);
      const r = await getChargeStatus(creds, txid);
      return json({ status: r.status, body: r.body });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[efi-pix] error", msg);
    return json({ error: msg }, 500);
  }
});
