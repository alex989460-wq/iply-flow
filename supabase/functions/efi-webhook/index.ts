// Efí Pix webhook.
// Receives POSTs from Efí when a Pix is paid. Payload format:
// { pix: [ { endToEndId, txid, valor, chave, horario, infoPagador } ] }
// Efí validates mTLS on the receiving end, but Supabase's public function URL
// terminates TLS at the platform layer — so we authenticate the request by:
//   1) looking up the txid in `efi_charges`;
//   2) matching the received `valor` against `efi_charges.amount`.
// If they don't match, we log and reject.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

async function triggerExternalRenewal(admin: any, customerId: string, source: string) {
  const { data: customer } = await admin
    .from("customers")
    .select("id, name, phone, username, due_date, screens, server_id, plan_id, created_by, servers(server_name, host), plans(plan_name, duration_days)")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer?.username?.trim() || !customer.server_id) return { skipped: true, reason: "missing_username_or_server" };

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serverName = String(customer.servers?.server_name || "");
  const serverHost = String(customer.servers?.host || "");
  const haystack = `${serverName} ${serverHost}`.toLowerCase();
  const durationDays = Number(customer.plans?.duration_days || 30);
  const months = Math.max(1, Math.round(durationDays / 30));

  const post = async (fn: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SRK}`,
          "x-cakto-webhook-secret": Deno.env.get("CAKTO_WEBHOOK_SECRET") || "",
        },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      return { ok: res.ok && payload?.success !== false, status: res.status, body: payload };
    } catch (error) {
      return { ok: false, status: 0, body: { error: error instanceof Error ? error.message : String(error) } };
    }
  };

  let result: any;
  if (haystack.includes("the best") || haystack.includes("the-best") || haystack.includes("painel.best")) {
    result = await post("the-best-renew", { username: customer.username.trim(), months, customer_id: customer.id });
  } else if (haystack.includes("natv") || haystack.includes("pixbot")) {
    result = await post("natv-renew", { username: customer.username.trim(), months, duration_days: durationDays, customer_id: customer.id });
  } else if (haystack.includes("vplay")) {
    result = await post("vplay-renew", { username: customer.username.trim(), new_due_date: customer.due_date, customer_id: customer.id });
  } else if (haystack.includes("rush")) {
    result = await post("rush-renew", { username: customer.username.trim(), months, customer_id: customer.id, screens: customer.screens || 1 });
  } else if (haystack.includes("uniplay") || haystack.includes("searchdefense") || haystack.includes("gesapioffice")) {
    const { error } = await admin.from("pending_manual_renewals").insert({
      owner_id: customer.created_by,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      username: customer.username.trim(),
      server_id: customer.server_id,
      server_name: serverName,
      server_host: serverHost,
      plan_name: customer.plans?.plan_name || null,
      amount: 0,
      new_due_date: customer.due_date,
      reason: "uniplay_extension_pending",
      source,
      error_details: { message: "Aguardando extensão para concluir renovação externa" },
    });
    result = { ok: !error, status: error ? 500 : 200, body: error || { queued: true } };
  } else {
    result = await post("xui-renew", { username: customer.username.trim(), new_due_date: customer.due_date, customer_id: customer.id });
  }

  if (!result?.ok) {
    await admin.from("pending_manual_renewals").insert({
      owner_id: customer.created_by,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      username: customer.username.trim(),
      server_id: customer.server_id,
      server_name: serverName,
      server_host: serverHost,
      plan_name: customer.plans?.plan_name || null,
      amount: 0,
      new_due_date: customer.due_date,
      reason: "efi_external_renewal_failed",
      source,
      error_details: result?.body || result,
    });
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Efí also probes with a GET during webhook registration on some setups.
  if (req.method === "GET") return json({ ok: true, service: "efi-webhook" });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let raw = "";
  try {
    raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const pixItems: any[] = Array.isArray(body?.pix) ? body.pix : [];

    if (pixItems.length === 0) {
      // Efí often sends a validation ping to /pix (empty). Just acknowledge.
      return json({ ok: true, processed: 0 });
    }

    let processed = 0;
    for (const item of pixItems) {
      const txid = String(item?.txid || "");
      const valor = Number(item?.valor || 0);
      const endToEndId = String(item?.endToEndId || "");
      if (!txid) continue;

      const { data: charge } = await admin
        .from("efi_charges")
        .select("id, owner_id, customer_id, pending_id, pending_kind, amount, status, environment, metadata")
        .eq("txid", txid)
        .maybeSingle();

      if (!charge) {
        console.warn(`[efi-webhook] txid desconhecido: ${txid}`);
        continue;
      }
      if (charge.status === "paid") {
        // Idempotency: Efí may retry the same event.
        processed++;
        continue;
      }

      // Sanity check: amount must match (avoid spoofed callbacks).
      const dbAmount = Number(charge.amount);
      if (Math.abs(dbAmount - valor) > 0.01) {
        console.error(`[efi-webhook] valor mismatch txid=${txid} db=${dbAmount} recv=${valor}`);
        continue;
      }

      // Mark charge paid.
      await admin.from("efi_charges").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        metadata: { ...(charge.metadata || {}), endToEndId },
      }).eq("id", charge.id);

      // If tied to a pending new customer, materialize the customer + payment.
      if (charge.pending_kind === "new_customer" && charge.pending_id) {
        const { data: pending } = await admin
          .from("pending_new_customers")
          .select("*")
          .eq("id", charge.pending_id)
          .maybeSingle();

        if (pending) {
          // Only create if no customer exists yet for this owner+username.
          const { data: existing } = await admin
            .from("customers")
            .select("id")
            .eq("created_by", pending.owner_id)
            .eq("username", pending.username)
            .maybeSingle();

          let customerId = existing?.id || null;
          if (!customerId) {
            const { data: created, error: createErr } = await admin
              .from("customers")
              .insert({
                created_by: pending.owner_id,
                name: pending.name,
                phone: pending.phone,
                username: pending.username,
                server_id: pending.server_id,
                plan_id: pending.plan_id,
                status: "inativa",
                start_date: new Date().toISOString().slice(0, 10),
                due_date: new Date().toISOString().slice(0, 10),
              })
              .select("id")
              .single();
            if (createErr) {
              console.error("[efi-webhook] erro ao criar customer", createErr);
              continue;
            }
            customerId = created.id;
          }

          // Insert confirmed payment — the DB trigger `renew_customer_due_date`
          // will advance due_date and set status = 'ativa' automatically.
          await admin.from("payments").insert({
            customer_id: customerId,
            amount: dbAmount,
            payment_date: new Date().toISOString().slice(0, 10),
            method: "pix",
            confirmed: true,
            source: `efi:${txid}`,
          });

          // Link the charge to the customer.
          await admin.from("efi_charges").update({ customer_id: customerId }).eq("id", charge.id);

          // Cleanup the pending row.
          await admin.from("pending_new_customers").delete().eq("id", pending.id);

          // Trigger external panel renewal (VPlay/NATV/The Best/Rush/XUI).
          await triggerExternalRenewal(admin, customerId, `efi:${txid}`);
        }
      } else if (charge.pending_kind === "activation_request" && charge.pending_id) {
        // Mark activation request as paid.
        await admin.from("activation_requests")
          .update({ status: "pago", paid_at: new Date().toISOString() })
          .eq("id", charge.pending_id);

        // Fetch request details for auto-activation + notifications.
        const { data: actReq } = await admin
          .from("activation_requests")
          .select("id, user_id, app_name, customer_name, customer_phone, mac_address, email, amount, payment_method")
          .eq("id", charge.pending_id)
          .maybeSingle();

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // 1) Try auto-activation on the external panel (same fn Cakto uses).
        let autoActivateOk = false;
        let autoActivateError = "";
        try {
          const actRes = await fetch(`${SUPABASE_URL}/functions/v1/confirm-activation`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
            body: JSON.stringify({ request_id: charge.pending_id, auto: true }),
          });
          const actJson = await actRes.json().catch(() => ({}));
          autoActivateOk = actRes.ok && actJson?.success !== false;
          if (!autoActivateOk) autoActivateError = actJson?.error || actJson?.message || `HTTP ${actRes.status}`;
        } catch (e) {
          autoActivateError = e instanceof Error ? e.message : String(e);
        }

        // 2) Notify admin (owner) on WhatsApp about the paid activation.
        try {
          if (actReq?.user_id) {
            const [{ data: zap }, { data: billing }] = await Promise.all([
              admin.from("zap_responder_settings").select("selected_department_id").eq("user_id", actReq.user_id).maybeSingle(),
              admin.from("billing_settings").select("notification_phone, meta_phone_number_id").eq("user_id", actReq.user_id).maybeSingle(),
            ]);
            const notifPhone = (billing as any)?.notification_phone;
            if (zap?.selected_department_id && notifPhone) {
              const method = (actReq.payment_method || "PIX").toString();
              const activationMsg = `📱 *Nova Solicitação de Ativação (Efí Pix)*\n\n📦 App: *${actReq.app_name || "-"}*\n👤 Cliente: *${actReq.customer_name || "-"}*\n📞 Tel: *${actReq.customer_phone || "-"}*\n${actReq.mac_address ? `🔗 MAC: *${actReq.mac_address}*\n` : ""}${actReq.email ? `📧 Email: *${actReq.email}*\n` : ""}💰 Valor: *R$ ${Number(actReq.amount || 0).toFixed(2)}*\n💳 Pagamento: *${method}*\n\n${autoActivateOk ? "✅ Status: Ativado automaticamente" : `⏳ Status: Pendente de ativação${autoActivateError ? ` (${autoActivateError})` : ""}`}`;
              await fetch(`${SUPABASE_URL}/functions/v1/crm-oficial-sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}` },
                body: JSON.stringify({
                  action: "enviar-mensagem",
                  department_id: zap.selected_department_id,
                  number: notifPhone,
                  text: activationMsg,
                  user_id: actReq.user_id,
                  phone_number_id: (billing as any)?.meta_phone_number_id || undefined,
                }),
              });
            }
          }
        } catch (notifErr) {
          console.error("[efi-webhook] activation notify error", notifErr);
        }
      } else if (charge.customer_id) {
        // Multi-customer charge (metadata.customer_ids) or single charge.
        const meta: any = charge.metadata || {};
        const ids: string[] = Array.isArray(meta.customer_ids) && meta.customer_ids.length
          ? meta.customer_ids
          : [charge.customer_id];

        // ── Activation guard ──
        // If the buyer recently filled an app-activation form (pending_activation_data
        // unused + not expired) for this phone, route the payment to the app-activation
        // flow instead of advancing the monthly subscription. Fixes the case where the
        // external checkout collects Clouddy/IBO/etc. activation data but still POSTs a
        // regular plan charge to reseller-api, which used to renew the wrong thing.
        try {
          const { data: buyerCust } = await admin
            .from("customers")
            .select("phone, name")
            .eq("id", charge.customer_id)
            .maybeSingle();
          const buyerPhone = String(buyerCust?.phone || "").replace(/\D/g, "");
          if (buyerPhone) {
            const variants = new Set<string>([buyerPhone]);
            if (buyerPhone.startsWith("55")) variants.add(buyerPhone.slice(2));
            else variants.add("55" + buyerPhone);
            if (buyerPhone.length >= 9) variants.add(buyerPhone.slice(-9));

            const { data: pendingAct } = await admin
              .from("pending_activation_data")
              .select("id, app_name, customer_name, mac_address, email, phone_normalized")
              .in("phone_normalized", [...variants])
              .eq("used", false)
              .gt("expires_at", new Date().toISOString())
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (pendingAct?.app_name) {
              const { data: app } = await admin
                .from("activation_apps")
                .select("user_id, app_name")
                .ilike("app_name", pendingAct.app_name)
                .eq("is_enabled", true)
                .maybeSingle();

              const ownerId = app?.user_id || charge.owner_id;
              await admin.from("activation_requests").insert({
                user_id: ownerId,
                app_name: app?.app_name || pendingAct.app_name,
                customer_name: pendingAct.customer_name || buyerCust?.name || null,
                customer_phone: pendingAct.phone_normalized || buyerPhone,
                mac_address: pendingAct.mac_address || null,
                email: pendingAct.email || null,
                payment_method: "PIX",
                amount: dbAmount,
                status: "pago",
                cakto_payload: {
                  source: "efi_webhook",
                  efi_txid: txid,
                  charge_id: charge.id,
                  routed_from: "reseller_api_plan_charge",
                },
              });
              await admin.from("pending_activation_data").update({ used: true }).eq("id", pendingAct.id);
              await admin.from("efi_charges").update({
                pending_kind: "activation_request",
                metadata: { ...(charge.metadata || {}), routed_to: "activation" },
              }).eq("id", charge.id);
              console.log(`[efi-webhook] charge ${txid} roteado para ativação ${pendingAct.app_name} (phone ${buyerPhone})`);
              processed++;
              continue;
            }
          }
        } catch (guardErr) {
          console.error("[efi-webhook] activation guard error", guardErr);
        }

        // Fetch per-customer price (custom_price fallback to charge.amount/N)
        const selectedPlanId = meta.plan_id ? String(meta.plan_id) : null;
        if (selectedPlanId) {
          await admin.from("customers")
            .update({ plan_id: selectedPlanId })
            .in("id", ids)
            .eq("created_by", charge.owner_id);
        }

        const { data: custs } = await admin.from("customers")
          .select("id, custom_price").in("id", ids).eq("created_by", charge.owner_id);
        const fallback = dbAmount / ids.length;
        for (const cid of ids) {
          if (!(custs || []).some((c: any) => c.id === cid)) {
            console.warn(`[efi-webhook] customer_id fora do owner ignorado: ${cid}`);
            continue;
          }
          const cust = (custs || []).find((c: any) => c.id === cid);
          const perAmount = Number(cust?.custom_price ?? fallback);
          await admin.from("payments").insert({
            customer_id: cid,
            amount: perAmount,
            payment_date: new Date().toISOString().slice(0, 10),
            method: "pix",
            confirmed: true,
            source: `efi:${txid}`,
          });
          await triggerExternalRenewal(admin, cid, `efi:${txid}`);
        }
      }

      const meta2: any = charge.metadata || {};
      const notifyIds: string[] = Array.isArray(meta2.customer_ids) && meta2.customer_ids.length
        ? meta2.customer_ids
        : (charge.customer_id ? [charge.customer_id] : []);
      for (const cid of notifyIds) {
        const { data: freshCust } = await admin.from("customers")
          .select("due_date").eq("id", cid).maybeSingle();
        const perAmount = notifyIds.length > 1 ? Math.round((dbAmount / notifyIds.length) * 100) / 100 : dbAmount;
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-confirmation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            customer_id: cid,
            amount: perAmount,
            plan_name: meta2.plan_name || null,
            new_due_date: freshCust?.due_date || null,
            source: meta2.source ? `efi:${meta2.source}` : `efi:${txid}`,
          }),
        }).catch((e) => console.error("[efi-webhook] send-payment-confirmation err", e));
      }

      processed++;
    }

    return json({ ok: true, processed });
  } catch (err) {
    console.error("[efi-webhook] error", err, "raw:", raw.slice(0, 500));
    // Return 200 anyway so Efí doesn't spam retries on malformed events we can't handle.
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
  }
});
