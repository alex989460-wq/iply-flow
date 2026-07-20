// Efí Pix — public endpoint for the /pedido/:id checkout.
// Actions:
//   - is-enabled: returns whether the owner has Efí enabled + Pix key present.
//   - create-charge-for-pending: creates a Pix cob for a pending_new_customers row.
//   - poll: returns the current status of a txid (paid/pending) without JWT.
//
// Never exposes any credentials; uses service role internally.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildCredentials,
  createCharge,
  getChargeStatus,
  newTxid,
  getQrCode,
} from "../_shared/efi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    // ---------------- is-enabled ----------------
    if (action === "is-enabled") {
      const ownerId = String(body.owner_id || "");
      if (!ownerId) return json({ enabled: false });
      const { data } = await admin
        .from("efi_settings")
        .select("enabled, environment, pix_key, client_id, cert_p12_base64, webhook_configured_at")
        .eq("user_id", ownerId)
        .maybeSingle();
      const enabled = !!(
        data?.enabled &&
        data?.pix_key &&
        data?.client_id &&
        data?.cert_p12_base64
      );
      return json({
        enabled,
        environment: data?.environment || null,
        webhook_configured: !!data?.webhook_configured_at,
      });
    }

    // ---------------- create-charge-for-pending ----------------
    if (action === "create-charge-for-pending") {
      const ownerId = String(body.owner_id || "");
      const pendingId = String(body.pending_id || "");
      if (!ownerId || !pendingId) return json({ error: "missing_params" }, 400);

      // Load pending row + plan price.
      const { data: pending, error: pendErr } = await admin
        .from("pending_new_customers")
        .select("id, owner_id, name, phone, plan_id, username")
        .eq("id", pendingId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (pendErr) throw pendErr;
      if (!pending) return json({ error: "pending_not_found" }, 404);

      const { data: plan } = await admin
        .from("plans")
        .select("id, plan_name, price")
        .eq("id", pending.plan_id)
        .maybeSingle();
      if (!plan) return json({ error: "plan_not_found" }, 404);

      const amount = Number(plan.price);
      if (!isFinite(amount) || amount <= 0) return json({ error: "plan_price_invalid" }, 400);

      // Load Efí settings for the owner.
      const { data: settings } = await admin
        .from("efi_settings")
        .select("*")
        .eq("user_id", ownerId)
        .eq("enabled", true)
        .maybeSingle();
      if (!settings) return json({ error: "efi_not_enabled_for_owner" }, 400);

      const creds = buildCredentials(settings as any);
      const txid = newTxid();
      const cobResp = await createCharge(creds, {
        txid,
        amount,
        description: `${plan.plan_name} — ${pending.name}`.slice(0, 140),
        expiresInSec: 86400,
      });
      if (cobResp.status < 200 || cobResp.status >= 300) {
        console.error("[efi-pix-public] cob failed", cobResp.status, cobResp.body);
        return json({ error: "cob_failed", status: cobResp.status, body: cobResp.body }, 400);
      }
      const pixCopiaCola: string = cobResp.body?.pixCopiaECola || "";
      let qrcodeBase64 = "";
      const locId = cobResp.body?.loc?.id;
      if (locId) {
        const qr = await getQrCode(creds, locId);
        if (qr.status === 200 && qr.body?.imagemQrcode) qrcodeBase64 = qr.body.imagemQrcode;
      }

      await admin.from("efi_charges").insert({
        owner_id: ownerId,
        customer_id: null,
        pending_id: pendingId,
        pending_kind: "new_customer",
        txid,
        amount,
        environment: creds.env,
        pix_copia_cola: pixCopiaCola,
        qrcode_base64: qrcodeBase64,
        metadata: { name: pending.name, phone: pending.phone, username: pending.username, plan_id: plan.id, plan_name: plan.plan_name },
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      });

      return json({ ok: true, txid, pix_copia_cola: pixCopiaCola, qrcode_base64: qrcodeBase64, amount });
    }

    // ---------------- poll ----------------
    if (action === "poll") {
      const txid = String(body.txid || "");
      if (!txid) return json({ error: "txid_required" }, 400);
      const { data: charge } = await admin
        .from("efi_charges")
        .select("txid, status, paid_at, owner_id")
        .eq("txid", txid)
        .maybeSingle();
      if (!charge) return json({ error: "charge_not_found" }, 404);
      return json({ status: charge.status, paid_at: charge.paid_at });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[efi-pix-public] error", msg);
    return json({ error: msg }, 500);
  }
});
