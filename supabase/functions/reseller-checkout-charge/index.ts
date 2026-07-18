// Public endpoint: creates a payment for one or more customers of a reseller.
// Two methods:
//   - "pix": creates a single Efí Pix cob summing all selected customers.
//   - "cakto": returns the plan's Cakto checkout URL (must be preconfigured).
// Actions:
//   action = "create" -> creates the charge  (accepts customer_id or customer_ids[])
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

/** Ensure a base64 image string does NOT include a data: prefix (raw base64 only). */
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

    // ---- create ----
    const slug = String(body.slug || "").trim().toLowerCase();
    const rawIds: string[] = Array.isArray(body.customer_ids) && body.customer_ids.length
      ? body.customer_ids.map((x: any) => String(x))
      : (body.customer_id ? [String(body.customer_id)] : []);
    const customerIds = Array.from(new Set(rawIds.filter(Boolean)));
    const planId = String(body.plan_id || "");
    const method = String(body.method || "pix");
    if (!slug || customerIds.length === 0 || !planId) return json({ error: "missing_params" }, 400);

    const { data: settings } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, is_active, enable_efi, enable_cakto")
      .eq("slug", slug)
      .maybeSingle();
    if (!settings || !settings.is_active) return json({ error: "not_found" }, 404);

    const ownerId = settings.user_id;

    const { data: plan } = await admin
      .from("plans")
      .select("id, plan_name, price, checkout_url, card_checkout_url, created_by")
      .eq("id", planId)
      .maybeSingle();
    if (!plan || plan.created_by !== ownerId) return json({ error: "plan_not_found" }, 404);

    const { data: customers } = await admin
      .from("customers")
      .select("id, checkout_code, name, username, created_by, custom_price, screens")
      .in("id", customerIds)
      .eq("created_by", ownerId);
    if (!customers || customers.length !== customerIds.length) {
      return json({ error: "customer_not_found" }, 404);
    }

    if (method === "cakto" || method === "cakto_card") {
      if (!settings.enable_cakto) return json({ error: "cakto_disabled" }, 400);
      const link = method === "cakto_card"
        ? String((plan as any).card_checkout_url || plan.checkout_url || "").trim()
        : String(plan.checkout_url || (plan as any).card_checkout_url || "").trim();
      if (!link) return json({ error: "cakto_link_missing" }, 400);
      return json({ ok: true, method, checkout_url: link });
    }

    if (method !== "pix") return json({ error: "unknown_method" }, 400);
    if (!settings.enable_efi) return json({ error: "efi_disabled" }, 400);

    // Sum per-customer prices (custom_price override supported).
    let amount = 0;
    for (const c of customers) {
      const p = Number((c as any).custom_price ?? plan.price);
      if (!isFinite(p) || p <= 0) return json({ error: "invalid_amount" }, 400);
      amount += p;
    }
    amount = Math.round(amount * 100) / 100;

    const { data: efi } = await admin
      .from("efi_settings").select("*").eq("user_id", ownerId).eq("enabled", true).maybeSingle();
    if (!efi) return json({ error: "efi_not_configured" }, 400);

    const creds = buildCredentials(efi as any);
    const txid = newTxid();
    const usernamesLabel = customers.map((c: any) => c.username || c.name).join(", ").slice(0, 100);
    const cob = await createCharge(creds, {
      txid,
      amount,
      description: `${plan.plan_name} — ${usernamesLabel}`.slice(0, 140),
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
      if (qr.status === 200 && qr.body?.imagemQrcode) qrcodeBase64 = stripDataPrefix(qr.body.imagemQrcode);
    }

    await admin.from("efi_charges").insert({
      owner_id: ownerId,
      customer_id: customers[0].id,
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
        customer_ids: customers.map((c: any) => c.id),
        checkout_codes: customers.map((c: any) => c.checkout_code).filter(Boolean),
        usernames: customers.map((c: any) => c.username || c.name),
        screens: customers.map((c: any) => c.screens || 1),
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
