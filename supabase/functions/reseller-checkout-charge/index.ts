// Public endpoint: creates a payment for a specific customer + plan of a reseller.
// Two methods:
//   - "pix": creates an Efí Pix cob and returns QR + txid.
//   - "cakto": returns the plan's Cakto checkout URL (must be preconfigured).
// Actions:
//   action = "create" -> creates the charge
//   action = "poll"   -> polls Efí charge status by txid
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCredentials, createCharge, getQrCode, newTxid } from "../_shared/efi-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || "create");

    if (action === "poll") {
      const txid = String(body.txid || "");
      if (!txid) return json({ error: "txid_required" }, 400);
      const { data: charge } = await admin
        .from("efi_charges").select("status, paid_at").eq("txid", txid).maybeSingle();
      if (!charge) return json({ error: "not_found" }, 404);
      return json({ status: charge.status, paid_at: charge.paid_at });
    }

    // ---- create ----
    const slug = String(body.slug || "").trim().toLowerCase();
    const customerId = String(body.customer_id || "");
    const planId = String(body.plan_id || "");
    const method = String(body.method || "pix");
    if (!slug || !customerId || !planId) return json({ error: "missing_params" }, 400);

    const { data: settings } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, is_active, enable_efi, enable_cakto")
      .eq("slug", slug)
      .maybeSingle();
    if (!settings || !settings.is_active) return json({ error: "not_found" }, 404);

    const ownerId = settings.user_id;

    const { data: plan } = await admin
      .from("plans")
      .select("id, plan_name, price, checkout_url, created_by")
      .eq("id", planId)
      .maybeSingle();
    if (!plan || plan.created_by !== ownerId) return json({ error: "plan_not_found" }, 404);

    const { data: customer } = await admin
      .from("customers")
      .select("id, name, username, created_by, custom_price")
      .eq("id", customerId)
      .maybeSingle();
    if (!customer || customer.created_by !== ownerId) return json({ error: "customer_not_found" }, 404);

    if (method === "cakto") {
      if (!settings.enable_cakto) return json({ error: "cakto_disabled" }, 400);
      const link = String(plan.checkout_url || "").trim();
      if (!link) return json({ error: "cakto_link_missing" }, 400);
      return json({ ok: true, method: "cakto", checkout_url: link });
    }

    if (method !== "pix") return json({ error: "unknown_method" }, 400);
    if (!settings.enable_efi) return json({ error: "efi_disabled" }, 400);

    const amount = Number(customer.custom_price ?? plan.price);
    if (!isFinite(amount) || amount <= 0) return json({ error: "invalid_amount" }, 400);

    const { data: efi } = await admin
      .from("efi_settings").select("*").eq("user_id", ownerId).eq("enabled", true).maybeSingle();
    if (!efi) return json({ error: "efi_not_configured" }, 400);

    const creds = buildCredentials(efi as any);
    const txid = newTxid();
    const cob = await createCharge(creds, {
      txid,
      amount,
      description: `${plan.plan_name} — ${customer.username || customer.name}`.slice(0, 140),
      expiresInSec: 3600,
    });
    if (cob.status < 200 || cob.status >= 300) {
      console.error("[reseller-checkout-charge] cob failed", cob.status, cob.body);
      return json({ error: "cob_failed", status: cob.status, body: cob.body }, 400);
    }
    let qrcodeBase64 = "";
    const locId = cob.body?.loc?.id;
    if (locId) {
      const qr = await getQrCode(creds, locId);
      if (qr.status === 200 && qr.body?.imagemQrcode) qrcodeBase64 = qr.body.imagemQrcode;
    }

    await admin.from("efi_charges").insert({
      owner_id: ownerId,
      customer_id: customerId,
      pending_id: null,
      pending_kind: null,
      txid,
      amount,
      environment: creds.env,
      pix_copia_cola: cob.body?.pixCopiaECola || "",
      qrcode_base64: qrcodeBase64,
      metadata: {
        source: "reseller_checkout",
        slug,
        plan_id: plan.id,
        plan_name: plan.plan_name,
        username: customer.username,
      },
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    return json({
      ok: true,
      method: "pix",
      txid,
      amount,
      pix_copia_cola: cob.body?.pixCopiaECola || "",
      qrcode_base64: qrcodeBase64,
    });
  } catch (err) {
    console.error("[reseller-checkout-charge]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
