// Stable REST API for external sites (e.g. planos.socialplay.com.br) to integrate
// with a reseller's SuperGestor account. Authenticated by header `x-api-key`.
//
// Endpoints:
//   GET  /plans
//   POST /lookup           { phone }
//   POST /charge           { customer_id, plan_id, method: "pix"|"cakto" }
//   GET  /charge/:txid
//
// Base path (relative to Supabase functions):
//   /reseller-api/<endpoint>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCredentials, createCharge, getQrCode, newTxid } from "../_shared/efi-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function digits(s: string) { return String(s || "").replace(/\D/g, ""); }
function cleanCode(s: string) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normalizeUsername(s: string) { return String(s || "").trim().toLowerCase(); }
function phoneVariants(raw: string): string[] {
  const d = digits(raw);
  if (!d) return [];
  const set = new Set<string>([d]);
  if (d.startsWith("55") && d.length >= 12) set.add(d.slice(2));
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) set.add("55" + d);
  if (d.length >= 9) set.add(d.slice(-9));
  return Array.from(set);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const apiKey = req.headers.get("x-api-key") || "";
    if (!apiKey) return json({ error: "missing_api_key" }, 401);

    const { data: settings } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, is_active, enable_efi, enable_cakto, slug")
      .eq("api_key", apiKey)
      .maybeSingle();
    if (!settings || !settings.is_active) return json({ error: "invalid_api_key" }, 401);
    const ownerId = settings.user_id;

    const url = new URL(req.url);
    // Strip up to and including "/reseller-api"
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("reseller-api");
    const route = idx >= 0 ? parts.slice(idx + 1) : parts;
    const endpoint = (route[0] || "").toLowerCase();
    const arg = route[1] || "";

    // ---------------- GET /plans ----------------
    if (req.method === "GET" && endpoint === "plans") {
      const { data: plans } = await admin
        .from("plans")
        .select("id, plan_name, duration_days, price, checkout_url")
        .eq("created_by", ownerId)
        .order("price", { ascending: true });
      return json({
        plans: (plans || []).map((p: any) => ({
          id: p.id, name: p.plan_name, duration_days: p.duration_days,
          price: Number(p.price), cakto_url: p.checkout_url || null,
        })),
      });
    }

    // ---------------- POST /lookup ----------------
    if (req.method === "POST" && endpoint === "lookup") {
      const body = await req.json().catch(() => ({} as any));
      const phone = String(body.phone || "");
      const variants = phoneVariants(phone);
      if (variants.length === 0) return json({ customers: [] });
      const orExact = variants.map((v) => `phone.eq.${v},extra_phone.eq.${v}`).join(",");
      const last9 = digits(phone).slice(-9);
      const orFuzzy = last9.length >= 8 ? `,phone.ilike.%${last9},extra_phone.ilike.%${last9}` : "";
      const { data: customers } = await admin
        .from("customers")
        .select("id, checkout_code, name, phone, username, due_date, status, plan_id, screens, plans:plan_id(plan_name)")
        .eq("created_by", ownerId)
        .or(orExact + orFuzzy)
        .limit(50);
      return json({
        customers: (customers || []).map((c: any) => ({
          id: c.id, checkout_code: c.checkout_code, name: c.name, phone: c.phone, username: c.username,
          due_date: c.due_date, status: c.status, screens: c.screens,
          current_plan: c.plans?.plan_name || null,
        })),
      });
    }

    // ---------------- POST /lookup-by-code ----------------
    if (req.method === "POST" && endpoint === "lookup-by-code") {
      const body = await req.json().catch(() => ({} as any));
      const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!code) return json({ customers: [] });
      const { data: customers } = await admin
        .from("customers")
        .select("id, checkout_code, name, phone, username, due_date, status, plan_id, screens, plans:plan_id(plan_name)")
        .eq("created_by", ownerId)
        .eq("checkout_code", code)
        .limit(10);
      return json({
        customers: (customers || []).map((c: any) => ({
          id: c.id, checkout_code: c.checkout_code, name: c.name, phone: c.phone, username: c.username,
          due_date: c.due_date, status: c.status, screens: c.screens,
          current_plan: c.plans?.plan_name || null,
        })),
      });
    }

    // ---------------- POST /charge ----------------
    if (req.method === "POST" && endpoint === "charge") {
      const body = await req.json().catch(() => ({} as any));
      const customerId = String(body.customer_id || "");
      const checkoutCode = cleanCode(body.checkout_code || body.customer_code || body.code || "");
      const requestedUsername = normalizeUsername(body.username || "");
      const planId = String(body.plan_id || "");
      const method = String(body.method || "pix");
      if (!customerId || !planId) return json({ error: "missing_params" }, 400);

      const { data: plan } = await admin
        .from("plans").select("id, plan_name, price, checkout_url, created_by")
        .eq("id", planId).maybeSingle();
      if (!plan || plan.created_by !== ownerId) return json({ error: "plan_not_found" }, 404);

      const { data: customer } = await admin
        .from("customers").select("id, checkout_code, name, username, created_by, custom_price")
        .eq("id", customerId).maybeSingle();
      if (!customer || customer.created_by !== ownerId) return json({ error: "customer_not_found" }, 404);

      // External sites must not be able to renew the wrong account when the user
      // selected a different row. If the checkout code or username is sent, it
      // must match the customer_id exactly.
      if (checkoutCode && cleanCode(customer.checkout_code || "") !== checkoutCode) {
        return json({ error: "customer_code_mismatch", message: "O ID da conta selecionada não confere com o cliente enviado." }, 409);
      }
      if (requestedUsername && normalizeUsername(customer.username || "") !== requestedUsername) {
        return json({ error: "customer_username_mismatch", message: "O usuário selecionado não confere com o cliente enviado." }, 409);
      }

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

      // Anti-duplicate guard: if the external site accidentally sends the same
      // customer_id twice for the same plan, do not create a second payable Pix.
      const duplicateWindow = new Date(Date.now() - 12 * 3600_000).toISOString();
      const { data: recentCharges } = await admin
        .from("efi_charges")
        .select("txid, status, amount, pix_copia_cola, qrcode_base64, created_at, paid_at, metadata")
        .eq("owner_id", ownerId)
        .eq("customer_id", customerId)
        .in("status", ["pending", "paid"])
        .gte("created_at", duplicateWindow)
        .order("created_at", { ascending: false })
        .limit(10);
      const existing = (recentCharges || []).find((c: any) => String(c?.metadata?.plan_id || "") === plan.id);
      if (existing?.status === "pending") {
        return json({
          ok: true,
          method: "pix",
          existing: true,
          txid: existing.txid,
          amount: Number(existing.amount),
          pix_copia_cola: existing.pix_copia_cola || "",
          qrcode_base64: existing.qrcode_base64 || "",
        });
      }
      if (existing?.status === "paid") {
        return json({
          error: "recent_payment_exists",
          message: "Essa conta já teve um Pix confirmado recentemente. Gere uma nova cobrança apenas para a outra conta selecionada.",
          existing_txid: existing.txid,
          paid_at: existing.paid_at,
        }, 409);
      }

      const { data: efi } = await admin
        .from("efi_settings").select("*").eq("user_id", ownerId).eq("enabled", true).maybeSingle();
      if (!efi) return json({ error: "efi_not_configured" }, 400);

      const creds = buildCredentials(efi as any);
      const txid = newTxid();
      const cob = await createCharge(creds, {
        txid, amount,
        description: `${plan.plan_name} — ${customer.username || customer.name}`.slice(0, 140),
        expiresInSec: 3600,
      });
      if (cob.status < 200 || cob.status >= 300) {
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
        txid, amount,
        environment: creds.env,
        pix_copia_cola: cob.body?.pixCopiaECola || "",
        qrcode_base64: qrcodeBase64,
        metadata: {
          source: "reseller_api",
          slug: settings.slug,
          plan_id: plan.id,
          plan_name: plan.plan_name,
          customer_id: customer.id,
          checkout_code: customer.checkout_code,
          username: customer.username,
        },
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });

      return json({
        ok: true, method: "pix", txid, amount,
        pix_copia_cola: cob.body?.pixCopiaECola || "",
        qrcode_base64: qrcodeBase64,
      });
    }

    // ---------------- GET /charge/:txid ----------------
    if (req.method === "GET" && endpoint === "charge" && arg) {
      const { data: charge } = await admin
        .from("efi_charges")
        .select("txid, status, paid_at, amount, customer_id, metadata")
        .eq("txid", arg)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (!charge) return json({ error: "not_found" }, 404);
      return json(charge);
    }

    return json({ error: "not_found", endpoint, method: req.method }, 404);
  } catch (err) {
    console.error("[reseller-api]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
