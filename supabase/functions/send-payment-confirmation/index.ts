// Internal helper: sends the same post-payment WhatsApp confirmations that
// cakto-webhook already sends (Meta template to client, dynamic text message,
// admin notification), but callable from any renewal source (Efí, reseller
// checkout, external API, manual). Owner is derived from customers.created_by.
//
// Input: { customer_id: string, amount: number, plan_name?: string,
//          new_due_date?: string (YYYY-MM-DD), source?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const KNOWN_FOREIGN_DDIS = [
  '1', '351', '353', '31', '32', '33', '34', '39', '41', '44', '49', '52', '54', '56', '57', '58', '61', '81', '86',
  '351', '971', '598', '595', '593', '591', '972',
];
function toWaPhone(raw: any): string {
  const s = String(raw ?? '').trim();
  const hasPlus = s.startsWith('+');
  const d = s.replace(/\D/g, '');
  if (!d) return '';
  if (hasPlus) return d;
  if (d.startsWith('55')) return d;
  if (KNOWN_FOREIGN_DDIS.some((ddi) => d.startsWith(ddi) && d.length > ddi.length)) return d;
  if (d.length >= 12) return d;
  if (d.length === 11) return d[2] === '9' ? '55' + d : d;
  if (d.length === 10) return '55' + d;
  return d;
}

const TIMEOUT = 45000;
async function fetchT(url: string, init: RequestInit) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try { return await fetch(url, { ...init, signal: c.signal }); }
  finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SRK, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const body = await req.json().catch(() => ({} as any));
    const customerId = String(body.customer_id || "");
    const amount = Number(body.amount || 0);
    const source = String(body.source || "manual");
    const planNameIn = body.plan_name ? String(body.plan_name) : null;
    if (!customerId) return json({ error: "customer_id_required" }, 400);

    const { data: cust } = await admin.from("customers")
      .select("id, name, phone, extra_phone, username, plan_id, server_id, created_by, due_date, screens, notes, status, start_date")
      .eq("id", customerId).maybeSingle();
    if (!cust) return json({ error: "customer_not_found" }, 404);

    const ownerId = cust.created_by;
    const newDueDate: string = String(body.new_due_date || cust.due_date || new Date().toISOString().slice(0, 10));

    // Plan name
    let planName = planNameIn;
    if (!planName && cust.plan_id) {
      const { data: pl } = await admin.from("plans").select("plan_name").eq("id", cust.plan_id).maybeSingle();
      planName = pl?.plan_name || null;
    }

    // Save payment_confirmations row (page /pedido/:id)
    try {
      await admin.from("payment_confirmations").insert({
        customer_id: cust.id, customer_name: cust.name, customer_phone: cust.phone,
        amount, plan_name: planName, new_due_date: newDueDate, status: "approved",
      });
    } catch (e) { console.warn("[send-payment-confirmation] payment_confirmations insert:", e); }

    const [{ data: zap }, { data: billing }] = await Promise.all([
      admin.from("zap_responder_settings").select("selected_department_id").eq("user_id", ownerId).maybeSingle(),
      admin.from("billing_settings")
        .select("notification_phone, renewal_message_template, renewal_image_url, meta_template_name, renewal_notification_target, meta_phone_number_id")
        .eq("user_id", ownerId).maybeSingle(),
    ]);

    const notifTarget = ((billing as any)?.renewal_notification_target || "both") as "admin" | "both";
    const shouldSendToClient = notifTarget === "both";
    const billingPhoneNumberId = (billing as any)?.meta_phone_number_id || undefined;
    const clientMetaPhone = toWaPhone(cust.phone);

    // Server name
    let serverName = "-";
    if (cust.server_id) {
      const { data: srv } = await admin.from("servers").select("server_name").eq("id", cust.server_id).maybeSingle();
      if (srv?.server_name) serverName = srv.server_name;
    }

    const [y, m, d] = newDueDate.split("-");
    const fmtDue = `${d}/${m}/${y}`;
    const now = new Date();
    const fmtTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const results: any = { template: null, text: null, admin: null };

    // 1) Meta template (SEMPRE dispara para o cliente se configurado)
    const tplName = billing?.meta_template_name;
    if (tplName && clientMetaPhone) {
      try {
        const r = await fetchT(`${SUPABASE_URL}/functions/v1/crm-oficial-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
          body: JSON.stringify({
            action: "enviar-template", template_name: tplName, number: clientMetaPhone,
            language: "pt_BR", user_id: ownerId,
            parameters: [cust.name || "-", fmtDue, cust.username || "-", `R$ ${Number(amount || 0).toFixed(2)}`, planName || "-", serverName],
            phone_number_id: billingPhoneNumberId,
          }),
        });
        const j = await r.json().catch(() => ({}));
        const ok = r.ok && j?.success !== false;
        results.template = { ok, status: r.status, body: j };
        await admin.from("message_logs").insert({
          user_id: ownerId, customer_id: cust.id, customer_name: cust.name, customer_phone: clientMetaPhone,
          message_type: "confirmation_template", source, status: ok ? "success" : "error",
          error_message: ok ? null : (j?.error || j?.message || `HTTP ${r.status}`),
          whatsapp_response: j, metadata: { template_name: tplName, always_send: true },
        });
      } catch (e) { console.error("[send-payment-confirmation] template err:", e); }
    }

    // 2) Dynamic text message (respeita regra admin/both)
    if (zap?.selected_department_id && shouldSendToClient && clientMetaPhone) {
      const defaultTpl = `✅ Olá, *{{nome}}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:\n\n==========================\n📅 Próx. Vencimento: *{{vencimento}} - {{hora}} hrs*\n💰 Valor: *{{valor}}*\n👤 Usuário: *{{usuario}}*\n📦 Plano: *{{plano}}*\n🔌 Status: *Ativo*\n⚡: *{{servidor}}*\n==========================`;
      const tpl = billing?.renewal_message_template || defaultTpl;
      const msg = tpl
        .replace(/\{\{nome\}\}/g, cust.name || "-")
        .replace(/\{\{vencimento\}\}/g, fmtDue)
        .replace(/\{\{hora\}\}/g, fmtTime)
        .replace(/\{\{valor\}\}/g, amount.toFixed(2))
        .replace(/\{\{usuario\}\}/g, cust.username || "-")
        .replace(/\{\{plano\}\}/g, planName || "-")
        .replace(/\{\{servidor\}\}/g, serverName)
        .replace(/\{\{obs\}\}/g, (cust as any).notes || "-")
        .replace(/\{\{telas\}\}/g, String(cust.screens || 1))
        .replace(/\{\{telefone\}\}/g, cust.phone || "-")
        .replace(/\{\{status\}\}/g, cust.status || "-");

      let ok = false, lastErr = "", lastRes: any = null;
      for (let i = 1; i <= 2; i++) {
        try {
          const r = await fetchT(`${SUPABASE_URL}/functions/v1/crm-oficial-sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
            body: JSON.stringify({
              action: "sendText", number: clientMetaPhone, text: msg, user_id: ownerId,
              image_url: billing?.renewal_image_url || undefined,
              require_media: !!billing?.renewal_image_url,
              phone_number_id: billingPhoneNumberId,
            }),
          });
          const j = await r.json().catch(() => ({}));
          lastRes = j;
          if (r.ok && j?.success !== false) { ok = true; break; }
          lastErr = j?.message || j?.error || `HTTP ${r.status}`;
          if (i < 2) await new Promise((rr) => setTimeout(rr, 3000));
        } catch (e) { lastErr = String(e); if (i < 2) await new Promise((rr) => setTimeout(rr, 3000)); }
      }
      results.text = { ok, error: lastErr };
      await admin.from("message_logs").insert({
        user_id: ownerId, customer_id: cust.id, customer_name: cust.name, customer_phone: clientMetaPhone,
        message_type: "confirmation", source, status: ok ? "success" : "error",
        error_message: ok ? null : lastErr, whatsapp_response: lastRes,
        metadata: { amount, plan: planName, server: serverName },
      });

      // Extra phone
      const extraRaw = (cust as any).extra_phone;
      if (extraRaw && String(extraRaw).replace(/\D/g, "").length >= 10) {
        try {
          const extra = toWaPhone(extraRaw);
          await fetchT(`${SUPABASE_URL}/functions/v1/crm-oficial-sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
            body: JSON.stringify({
              action: "sendText", department_id: zap.selected_department_id,
              number: extra, text: msg, user_id: ownerId,
              image_url: billing?.renewal_image_url || undefined,
              require_media: !!billing?.renewal_image_url,
              phone_number_id: billingPhoneNumberId,
            }),
          });
        } catch (e) { console.warn("[send-payment-confirmation] extra_phone err:", e); }
      }
    }

    // 3) Admin notification
    const notifPhone = billing?.notification_phone;
    if (zap?.selected_department_id && notifPhone) {
      try {
        const adminMsg = `🔔 *Renovação Automática (${source})*\n\n👤 Cliente: *${cust.name}*\n📞 Tel: ${clientMetaPhone}\n👤 Usuário: *${cust.username || "-"}*\n💰 Valor: *R$ ${amount.toFixed(2)}*\n📦 Plano: *${planName || "-"}*\n🖥️ Servidor: *${serverName}*\n📅 Novo vencimento: *${fmtDue}*\n✅ Status: Renovado`;
        const r = await fetchT(`${SUPABASE_URL}/functions/v1/crm-oficial-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
          body: JSON.stringify({
            action: "enviar-mensagem", department_id: zap.selected_department_id,
            number: notifPhone, text: adminMsg, user_id: ownerId,
            phone_number_id: billingPhoneNumberId,
          }),
        });
        const j = await r.json().catch(() => ({}));
        results.admin = { ok: r.ok && j?.success !== false };
      } catch (e) { console.warn("[send-payment-confirmation] admin err:", e); }
    }

    return json({ ok: true, results });
  } catch (err) {
    console.error("[send-payment-confirmation]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
