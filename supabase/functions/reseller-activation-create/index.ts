// Public endpoint: creates an activation_request for a reseller and generates
// a Pix (Efí) charge OR returns a Cakto checkout URL. When the Pix is paid,
// the efi-webhook will mark the request as "paid" and the reseller processes
// it manually from the Ativações panel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCredentials, createCharge, getQrCode, newTxid } from "../_shared/efi-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function stripDataPrefix(s: string): string {
  if (!s) return "";
  const idx = s.indexOf("base64,");
  return idx >= 0 ? s.slice(idx + 7) : s;
}

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

    const slug = String(body.slug || "").trim().toLowerCase();
    const appId = String(body.app_id || "");
    const duration = String(body.duration || "monthly"); // monthly | quarterly | annual
    const method = String(body.method || "pix");
    const customerName = String(body.name || "").trim();
    const customerPhone = String(body.phone || "").trim();
    const mac = String(body.mac || "").trim().toUpperCase();
    const email = String(body.email || "").trim();
    if (!slug || !appId || !customerName || !customerPhone) {
      return json({ error: "missing_params" }, 400);
    }

    const { data: settings } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, is_active, enable_efi, enable_cakto, activation_cakto_url")
      .eq("slug", slug).maybeSingle();
    if (!settings || !settings.is_active) return json({ error: "not_found" }, 404);
    const ownerId = settings.user_id;

    const { data: app } = await admin
      .from("activation_apps")
      .select("id, app_name, requires_mac, requires_email, price_monthly, price_quarterly, price_annual")
      .eq("id", appId).eq("user_id", ownerId).maybeSingle();
    if (!app) return json({ error: "app_not_found" }, 404);
    if (app.requires_mac && !mac) return json({ error: "mac_required" }, 400);
    if (app.requires_email && !email) return json({ error: "email_required" }, 400);

    const priceMap: Record<string, any> = {
      monthly: app.price_monthly,
      quarterly: app.price_quarterly,
      annual: app.price_annual,
    };
    const rawPrice = priceMap[duration];
    if (rawPrice == null) return json({ error: "duration_unavailable" }, 400);
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0) return json({ error: "invalid_price" }, 400);

    const durationLabel = duration === 'annual' ? 'Anual' : duration === 'quarterly' ? 'Trimestral' : 'Mensal';

    // Register activation request as "pending".
    const { data: reqRow, error: reqErr } = await admin
      .from("activation_requests")
      .insert({
        user_id: ownerId,
        app_name: app.app_name,
        customer_name: customerName,
        customer_phone: customerPhone,
        mac_address: mac || null,
        email: email || null,
        amount: price,
        payment_method: method,
        status: "aguardando_pagamento",
      })
      .select().single();
    if (reqErr) throw reqErr;

    if (method === "cakto" || method === "cakto_card") {
      if (!settings.enable_cakto) return json({ error: "cakto_disabled" }, 400);
      const link = String(settings.activation_cakto_url || "").trim();
      if (!link) return json({ error: "cakto_link_missing" }, 400);
      return json({ ok: true, method, checkout_url: link, request_id: reqRow.id });
    }

    if (method !== "pix") return json({ error: "unknown_method" }, 400);
    if (!settings.enable_efi) return json({ error: "efi_disabled" }, 400);

    const { data: efi } = await admin
      .from("efi_settings").select("*").eq("user_id", ownerId).eq("enabled", true).maybeSingle();
    if (!efi) return json({ error: "efi_not_configured" }, 400);

    const amount = Math.round(price * 100) / 100;
    const creds = buildCredentials(efi as any);
    const txid = newTxid();
    const cob = await createCharge(creds, {
      txid, amount,
      description: `Ativação ${app.app_name} ${durationLabel} — ${customerName}`.slice(0, 140),
      expiresInSec: 86400,
    });
    if (cob.status < 200 || cob.status >= 300) {
      console.error("[reseller-activation-create] cob failed", cob.status, cob.body);
      return json({ error: "cob_failed", body: cob.body }, 400);
    }
    let qrcodeBase64 = "";
    const locId = cob.body?.loc?.id;
    if (locId) {
      const qr = await getQrCode(creds, locId);
      if (qr.status === 200 && qr.body?.imagemQrcode) qrcodeBase64 = stripDataPrefix(qr.body.imagemQrcode);
    }

    await admin.from("efi_charges").insert({
      owner_id: ownerId,
      customer_id: null,
      pending_id: reqRow.id,
      pending_kind: "activation_request",
      txid, amount,
      environment: creds.env,
      pix_copia_cola: cob.body?.pixCopiaECola || "",
      qrcode_base64: qrcodeBase64,
      metadata: {
        source: "reseller_activation",
        slug, duration, duration_label: durationLabel,
        activation_request_id: reqRow.id,
        app_id: app.id, app_name: app.app_name,
        customer_name: customerName, customer_phone: customerPhone,
        mac, email,
      },
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });

    return json({
      ok: true, method: "pix", txid, amount,
      pix_copia_cola: cob.body?.pixCopiaECola || "",
      qrcode_base64: qrcodeBase64,
      request_id: reqRow.id,
    });
  } catch (err) {
    console.error("[reseller-activation-create]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
