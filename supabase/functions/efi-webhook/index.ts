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
        }
      } else if (charge.pending_kind === "activation_request" && charge.pending_id) {
        // Mark activation request as paid — reseller processes it manually.
        await admin.from("activation_requests")
          .update({ status: "pago", paid_at: new Date().toISOString() })
          .eq("id", charge.pending_id);
      } else if (charge.customer_id) {
        // Multi-customer charge (metadata.customer_ids) or single charge.
        const meta: any = charge.metadata || {};
        const ids: string[] = Array.isArray(meta.customer_ids) && meta.customer_ids.length
          ? meta.customer_ids
          : [charge.customer_id];
        // Fetch per-customer price (custom_price fallback to charge.amount/N)
        const { data: custs } = await admin.from("customers")
          .select("id, custom_price").in("id", ids);
        const fallback = dbAmount / ids.length;
        for (const cid of ids) {
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
