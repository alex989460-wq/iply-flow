// P2Cine queue: consumed by the browser extension using the user's real session.
// The extension polls GET to receive the next pending renewal, executes it inside
// the logged-in daily3.news tab, then POSTs the result back so we can update the
// customer's due_date and clear the pending item.
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
    hay.includes("p2cine") || hay.includes("daily3") ||
    h === "p2c" || n === "p2c" ||
    hay.includes(" p2c ") || hay.startsWith("p2c ") || hay.endsWith(" p2c")
  );
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
      // Fetch a batch of pending items and filter P2Cine in memory.
      const { data, error } = await supabase
        .from("pending_manual_renewals")
        .select("id, customer_id, customer_name, username, server_host, server_name, plan_name, new_due_date, created_at")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;

      const next = (data ?? []).find(isP2Cine);
      if (!next) return json({ item: null });

      return json({
        item: {
          id: next.id,
          customer_id: next.customer_id,
          customer_name: next.customer_name,
          username: next.username,
          plan_name: next.plan_name,
          new_due_date: next.new_due_date,
          server_name: next.server_name,
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
        if (pending.customer_id) {
          const { error: payErr } = await supabase.from("payments").insert({
            customer_id: pending.customer_id,
            amount: pending.amount ?? 0,
            payment_date: new Date().toISOString().slice(0, 10),
            confirmed: true,
            notes: "Renovado via extensão P2Cine",
          });
          if (payErr) console.error("[p2cine-queue] payment insert error", payErr);
        }

        await supabase.from("pending_manual_renewals").delete().eq("id", id);
        return json({ ok: true, action: "renewed" });
      }

      // Failure: mark reason and keep in the queue for manual handling.
      await supabase
        .from("pending_manual_renewals")
        .update({
          reason: "p2cine_extension_failed",
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
