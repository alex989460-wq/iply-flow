// Panel queue: consumed by the browser extension using the user's real session.
// The extension polls GET to receive the next pending renewal, executes it inside
// the logged-in panel tab, then POSTs the result back so we can update the
// customer's due_date and clear the pending item. Supports P2Cine and Uniplay.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-extension-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const EXPECTED_TOKEN = Deno.env.get("P2CINE_EXTENSION_TOKEN") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isP2Cine(row: { server_host?: string | null; server_name?: string | null }) {
  const h = (row.server_host || "").toLowerCase().trim();
  const n = (row.server_name || "").toLowerCase().trim();
  const hay = `${h} ${n}`;
  return (
    hay.includes("p2cine") || hay.includes("daily3") || hay.includes("painelacesso1") ||
    h === "p2c" || n === "p2c" ||
    hay.includes(" p2c ") || hay.startsWith("p2c ") || hay.endsWith(" p2c")
  );
}

function isUniplay(row: { server_host?: string | null; server_name?: string | null }) {
  const h = (row.server_host || "").toLowerCase().trim();
  const n = (row.server_name || "").toLowerCase().trim();
  const hay = `${h} ${n}`;
  return hay.includes("uniplay") || hay.includes("searchdefense") || hay.includes("gesapioffice");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token =
    req.headers.get("x-extension-token") ??
    url.searchParams.get("token") ?? "";

  if (!EXPECTED_TOKEN || token !== EXPECTED_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("pending_manual_renewals")
        .select("id, customer_id, customer_name, username, server_host, server_name, plan_name, new_due_date, created_at, owner_id")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;

      const candidates = (data ?? []).filter((row) => isP2Cine(row) || isUniplay(row));

      // Skip and cleanup any pending row whose customer was renewed in the last 12h
      // (prevents the extension from double-renewing after Cakto/webhook already paid it).
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      let next: any = null;
      for (const row of candidates) {
        if (row.customer_id) {
          const { data: recentPay } = await supabase
            .from("payments")
            .select("id, created_at, source")
            .eq("customer_id", row.customer_id)
            .eq("confirmed", true)
            .gte("created_at", cutoff)
            .limit(1)
            .maybeSingle();
          if (recentPay) {
            console.log(`[p2cine-queue] skipping ${row.id} (${row.customer_name}) — already paid at ${recentPay.created_at} via ${recentPay.source}`);
            await supabase.from("pending_manual_renewals").delete().eq("id", row.id);
            continue;
          }
        }
        next = row;
        break;
      }
      if (!next) return json({ item: null });

      const panelType = isUniplay(next) ? "uniplay" : "p2cine";

      // Resolve months from the plan registered in the system (fallback 1).
      let months = 1;
      if (next.plan_name) {
        const { data: plan } = await supabase
          .from("plans")
          .select("duration_days")
          .eq("plan_name", next.plan_name)
          .eq("created_by", next.owner_id)
          .maybeSingle();
        const days = plan?.duration_days ?? 0;
        if (days > 0) months = Math.max(1, Math.round(days / 30));
      }

      return json({
        item: {
          id: next.id,
          customer_id: next.customer_id,
          customer_name: next.customer_name,
          username: next.username,
          plan_name: next.plan_name,
          new_due_date: next.new_due_date,
          server_name: next.server_name,
          panel_type: panelType,
          months,
        },
      });
    }


    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { id, success, message, http_status } = body ?? {};
      if (!id || typeof id !== "string") {
        return json({ error: "id required" }, 400);
      }

      // Load the pending row
      const { data: pending, error: fetchErr } = await supabase
        .from("pending_manual_renewals")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!pending) return json({ error: "not_found" }, 404);

      if (success) {
        // Advance the customer's due_date by inserting a confirmed payment so the
        // renew_customer_due_date trigger handles calendar-month math consistently.
        // Frontend-created tasks already updated the local customer record; in that
        // case the extension only confirms the external panel action.
        if (pending.customer_id && !String(pending.source || "").startsWith("frontend_")) {
          // Guard against duplicate renewals: if this customer already has a confirmed
          // payment in the last 12h (e.g. Cakto webhook renewed while the extension
          // was still processing the panel queue with two tabs open), just delete
          // the pending row and log — do NOT insert another payment.
          const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
          const { data: recentPay } = await supabase
            .from("payments")
            .select("id, created_at, source")
            .eq("customer_id", pending.customer_id)
            .eq("confirmed", true)
            .gte("created_at", cutoff)
            .limit(1)
            .maybeSingle();

          if (recentPay) {
            console.warn(
              `[p2cine-queue] DUPLICATE BLOCKED: ${pending.customer_name} (${pending.customer_id}) ` +
              `already paid at ${recentPay.created_at} via ${recentPay.source}. ` +
              `Skipping extension payment insert.`,
            );
            await supabase.from("pending_manual_renewals").delete().eq("id", id);
            return json({ ok: true, action: "skipped_duplicate", recent_source: recentPay.source });
          }

          const panelSource = isUniplay(pending) ? "uniplay_extension" : "p2cine_extension";
          const { error: payErr } = await supabase.from("payments").insert({
            customer_id: pending.customer_id,
            amount: pending.amount ?? 0,
            payment_date: new Date().toISOString().slice(0, 10),
            method: "pix",
            confirmed: true,
            source: panelSource,
          });
          if (payErr) console.error("[p2cine-queue] payment insert error", payErr);
        }

        await supabase.from("pending_manual_renewals").delete().eq("id", id);
        return json({ ok: true, action: "renewed" });
      }

      // Failure: mark reason, clear lock so it can be retried after cooldown.
      await supabase
        .from("pending_manual_renewals")
        .update({
          reason: `${isUniplay(pending) ? "uniplay" : "p2cine"}_extension_failed`,
          error_details: { message: message ?? "unknown", http_status: http_status ?? null },
        })
        .eq("id", id);
      return json({ ok: true, action: "flagged" });

    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (err) {
    console.error("[p2cine-queue] error", err);
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});
