// Public endpoint: creates a payment for one or more customers of a reseller.
// Two methods:
//   - "pix": creates a single Efí Pix cob summing all selected customers.
//   - "cakto": returns the plan's Cakto checkout URL (must be preconfigured).
// Actions:
//   action = "create" -> creates the charge  (accepts customer_id, customer_ids[], checkout_code or phone)
//   action = "poll"   -> polls Efí charge status by txid
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCredentials, createCharge, getQrCode, newTxid } from "../_shared/efi-client.ts";
import { createPixPayment } from "../_shared/mercadopago-client.ts";

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

/** Busca e valida um cupom do revendedor. Retorna null se inválido. */
async function findCoupon(admin: any, ownerId: string, rawCode: string) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return null;
  const { data } = await admin
    .from("discount_coupons")
    .select("id, code, discount_type, discount_value, is_active, max_uses, used_count, expires_at")
    .eq("owner_id", ownerId)
    .ilike("code", code)
    .maybeSingle();
  if (!data) return { error: "Cupom não encontrado." };
  if (!data.is_active) return { error: "Este cupom está desativado." };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { error: "Este cupom expirou." };
  }
  if (data.max_uses != null && Number(data.used_count) >= Number(data.max_uses)) {
    return { error: "Este cupom atingiu o limite de usos." };
  }
  return { coupon: data };
}

function applyDiscount(amount: number, coupon: any) {
  const value = Number(coupon.discount_value || 0);
  const discount = coupon.discount_type === "fixed"
    ? value
    : (amount * value) / 100;
  const final = Math.max(0.01, Math.round((amount - discount) * 100) / 100);
  return { final, discount: Math.round((amount - final) * 100) / 100 };
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

    // ---- validate_coupon ----
    if (action === "validate_coupon") {
      const slug0 = String(body.slug || "").trim().toLowerCase();
      const { data: st } = await admin
        .from("reseller_checkout_settings").select("user_id, is_active").eq("slug", slug0).maybeSingle();
      if (!st || !st.is_active) return json({ error: "Revendedor não encontrado." }, 404);
      const res = await findCoupon(admin, st.user_id, body.coupon_code || body.code);
      if (!res || (res as any).error) return json({ error: (res as any)?.error || "Cupom inválido." }, 400);
      const c = (res as any).coupon;
      const base = Number(body.amount || 0);
      const preview = base > 0 ? applyDiscount(base, c) : null;
      return json({
        ok: true,
        coupon: { code: c.code, discount_type: c.discount_type, discount_value: Number(c.discount_value) },
        amount: preview?.final ?? null,
        discount: preview?.discount ?? null,
      });
    }


    // ---- create ----
    const slug = String(body.slug || "").trim().toLowerCase();
    const rawIds: string[] = Array.isArray(body.customer_ids) && body.customer_ids.length
      ? body.customer_ids.map((x: any) => String(x))
      : (body.customer_id || body.customerId || body.id || body.customer?.id ? [String(body.customer_id || body.customerId || body.id || body.customer?.id)] : []);
    let customerIds = Array.from(new Set(rawIds.filter(Boolean)));
    const checkoutCode = cleanCode(body.checkout_code || body.customer_code || body.code || "");
    const requestedUsername = normalizeUsername(body.username || "");
    const requestedPhone = String(body.phone || body.customer_phone || body.whatsapp || body.customer?.phone || "");
    const planId = String(body.plan_id || body.planId || body.plan?.id || "");
    const method = String(body.method || body.payment_method || "pix");
    if (!slug || !planId) return json({ error: "missing_params" }, 400);

    const { data: settings } = await admin
      .from("reseller_checkout_settings")
      .select("user_id, is_active, enable_efi, enable_cakto, enable_mercadopago")
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

    if (customerIds.length === 0 && checkoutCode) {
      const { data: byCode } = await admin
        .from("customers")
        .select("id")
        .eq("created_by", ownerId)
        .eq("checkout_code", checkoutCode)
        .maybeSingle();
      if (byCode?.id) customerIds = [byCode.id];
    }

    if (customerIds.length === 0 && requestedPhone) {
      const variants = phoneVariants(requestedPhone);
      if (variants.length > 0) {
        const orExact = variants.map((v) => `phone.eq.${v},extra_phone.eq.${v}`).join(",");
        const last9 = digits(requestedPhone).slice(-9);
        const orFuzzy = last9.length >= 8 ? `,phone.ilike.%${last9},extra_phone.ilike.%${last9}` : "";
        const { data: matches } = await admin
          .from("customers")
          .select("id, username")
          .eq("created_by", ownerId)
          .or(orExact + orFuzzy)
          .limit(50);
        let filtered = matches || [];
        if (requestedUsername) filtered = filtered.filter((c: any) => normalizeUsername(c.username || "") === requestedUsername);
        if (filtered.length === 1) customerIds = [filtered[0].id];
        if (filtered.length > 1) {
          return json({
            error: "checkout_code_required",
            message: "Esse telefone possui mais de uma conta. Envie o ID/código ou usuário da conta selecionada para gerar o Pix correto.",
          }, 409);
        }
      }
    }

    if (customerIds.length === 0) return json({ error: "customer_not_found" }, 404);

    const { data: customers } = await admin
      .from("customers")
      .select("id, checkout_code, name, username, created_by, custom_price, screens, plan_id")
      .in("id", customerIds)
      .eq("created_by", ownerId);
    if (!customers || customers.length !== customerIds.length) {
      return json({ error: "customer_not_found" }, 404);
    }

    // Persist the plan selected after registration before redirecting to either
    // payment provider, so the webhook activates the exact chosen plan.
    await admin.from("customers")
      .update({ plan_id: plan.id })
      .in("id", customerIds)
      .eq("created_by", ownerId);
    const selectedUsernames = customers.map((customer: any) => String(customer.username || "").trim()).filter(Boolean);
    if (selectedUsernames.length > 0) {
      await admin.from("pending_new_customers")
        .update({ plan_id: plan.id })
        .eq("owner_id", ownerId)
        .eq("used", false)
        .in("username", selectedUsernames);
    }

    if (method === "cakto" || method === "cakto_card") {
      if (!settings.enable_cakto) return json({ error: "cakto_disabled" }, 400);
      const link = method === "cakto_card"
        ? String((plan as any).card_checkout_url || plan.checkout_url || "").trim()
        : String(plan.checkout_url || (plan as any).card_checkout_url || "").trim();
      if (!link) return json({ error: "cakto_link_missing" }, 400);
      return json({ ok: true, method, checkout_url: link });
    }

    const isMercadoPago = method === "mercadopago" || method === "pix_mp";
    if (method !== "pix" && !isMercadoPago) return json({ error: "unknown_method" }, 400);
    if (isMercadoPago) {
      if (!(settings as any).enable_mercadopago) return json({ error: "mercadopago_disabled" }, 400);
    } else if (!settings.enable_efi) {
      return json({ error: "efi_disabled" }, 400);
    }

    // Sum per-customer prices. custom_price só vale quando o cliente está
    // comprando exatamente o mesmo plano que já possui — caso contrário o preço
    // do plano selecionado é o correto (evita cobrar valor de outro plano).
    let amount = Number(plan.price);
    if (!isFinite(amount) || amount <= 0) return json({ error: "invalid_amount" }, 400);
    amount = Math.round(amount * 100) / 100;

    // ---- cupom de desconto (opcional) ----
    let appliedCoupon: any = null;
    let discountValue = 0;
    const couponCode = String(body.coupon_code || body.coupon || "").trim();
    if (couponCode) {
      const res = await findCoupon(admin, ownerId, couponCode);
      if (!res || (res as any).error) return json({ error: (res as any)?.error || "Cupom inválido." }, 400);
      appliedCoupon = (res as any).coupon;
      const applied = applyDiscount(amount, appliedCoupon);
      discountValue = applied.discount;
      amount = applied.final;
    }

    const chargeMetadata = {
      source: "reseller_checkout",
      slug,
      plan_id: plan.id,
      plan_name: plan.plan_name,
      customer_ids: customers.map((c: any) => c.id),
      checkout_codes: customers.map((c: any) => c.checkout_code).filter(Boolean),
      usernames: customers.map((c: any) => c.username || c.name),
      screens: customers.map((c: any) => c.screens || 1),
      coupon_code: appliedCoupon?.code || null,
      discount: discountValue || 0,
    };

    const bumpCoupon = async () => {
      if (!appliedCoupon) return;
      await admin
        .from("discount_coupons")
        .update({ used_count: Number(appliedCoupon.used_count || 0) + 1 })
        .eq("id", appliedCoupon.id);
    };

    // ---------------- Mercado Pago (Pix) ----------------
    if (isMercadoPago) {
      const { data: mp } = await admin
        .from("mercadopago_settings").select("*").eq("user_id", ownerId).eq("enabled", true).maybeSingle();
      if (!mp?.access_token) return json({ error: "mercadopago_not_configured" }, 400);

      const mpTxid = newTxid();
      const label = customers.map((c: any) => c.username || c.name).join(", ").slice(0, 100);
      const payment = await createPixPayment(mp as any, {
        amount,
        description: `${plan.plan_name} — ${label}`,
        externalReference: mpTxid,
        notificationUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
        payerEmail: String(body.email || "").trim() || undefined,
        payerName: customers[0]?.name || undefined,
        expiresInSec: 86400,
      });
      if (!payment.ok || !payment.id) {
        console.error("[reseller-checkout-charge] mp failed", payment.status, payment.body);
        return json({
          error: "mercadopago_falhou",
          message: payment.body?.message || "Não foi possível gerar o Pix no Mercado Pago.",
        }, 400);
      }

      await admin.from("efi_charges").insert({
        owner_id: ownerId,
        customer_id: customers[0].id,
        pending_id: null,
        pending_kind: null,
        txid: mpTxid,
        amount,
        environment: String(mp.environment || "production"),
        provider: "mercadopago",
        provider_payment_id: payment.id,
        pix_copia_cola: payment.qrCode || "",
        qrcode_base64: stripDataPrefix(payment.qrCodeBase64 || ""),
        metadata: { ...chargeMetadata, provider: "mercadopago", ticket_url: payment.ticketUrl || null },
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      });

      await bumpCoupon();

      return json({
        ok: true,
        method: "mercadopago",
        provider: "mercadopago",
        txid: mpTxid,
        amount,
        discount: discountValue || 0,
        coupon_code: appliedCoupon?.code || null,
        pix_copia_cola: payment.qrCode || "",
        qrcode_base64: stripDataPrefix(payment.qrCodeBase64 || ""),
        ticket_url: payment.ticketUrl || null,
      });
    }


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
      expiresInSec: 86400,
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
        coupon_code: appliedCoupon?.code || null,
        discount: discountValue || 0,
      },
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });

    if (appliedCoupon) {
      await admin
        .from("discount_coupons")
        .update({ used_count: Number(appliedCoupon.used_count || 0) + 1 })
        .eq("id", appliedCoupon.id);
    }

    return json({
      ok: true,
      method: "pix",
      txid,
      amount,
      discount: discountValue || 0,
      coupon_code: appliedCoupon?.code || null,
      pix_copia_cola: cob.body?.pixCopiaECola || "",
      qrcode_base64: qrcodeBase64,

    });
  } catch (err) {
    console.error("[reseller-checkout-charge]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
