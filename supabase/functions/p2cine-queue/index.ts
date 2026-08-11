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

async function resolveOwner(token: string): Promise<string | null> {
  // Token individual: "<userId>.<hmac(userId, secret)>"
  const [uid, sig] = token.split(".");
  if (!uid || !sig || !EXPECTED_TOKEN) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(EXPECTED_TOKEN),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(uid));
  const expected = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected === sig.toLowerCase() ? uid : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token =
    req.headers.get("x-extension-token") ??
    url.searchParams.get("token") ?? "";

  const ownerId = await resolveOwner(token);
  if (!ownerId) {
    return json({
      error: "unauthorized",
      message: "Token da extensão inválido ou antigo. Copie o token novamente em Configurações.",
    }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );


  try {
    if (req.method === "GET") {
      // Filter panel rows on the server so P2Cine/Uniplay items are never pushed out
      // of the window by unrelated pending rows (previous limit(50) hid them).
      const like = [
        "server_host.ilike.%p2cine%", "server_name.ilike.%p2cine%",
        "server_host.ilike.%daily3%", "server_name.ilike.%daily3%",
        "server_host.ilike.%painelacesso%", "server_name.ilike.%painelacesso%",
        "server_host.ilike.%uniplay%", "server_name.ilike.%uniplay%",
        "server_host.ilike.%searchdefense%", "server_name.ilike.%searchdefense%",
        "server_host.ilike.%gesapioffice%", "server_name.ilike.%gesapioffice%",
        "server_host.ilike.%p2c%", "server_name.ilike.%p2c%",
      ].join(",");

      const { data, error } = await supabase
        .from("pending_manual_renewals")
        .select("id, customer_id, customer_name, username, server_host, server_name, plan_name, new_due_date, created_at, owner_id")
        .eq("owner_id", ownerId)
        .or(like)
        .order("created_at", { ascending: true })
        .limit(30);
      if (error) throw error;

      const candidates = (data ?? []).filter((row) => isP2Cine(row) || isUniplay(row));
      if (candidates.length === 0) return json({ item: null });

      // A pendência SEMPRE nasce depois de um pagamento (é a falha da renovação no
      // painel externo). Por isso só consideramos duplicidade quando existe um
      // pagamento confirmado registrado DEPOIS da criação da pendência — aí sim
      // outra origem já renovou. Antes disso a pendência era apagada sozinha e a
      // extensão nunca era acionada.
      const oldest = candidates.reduce(
        (min, r) => (r.created_at < min ? r.created_at : min),
        candidates[0].created_at as string,
      );
      const customerIds = candidates.map((r) => r.customer_id).filter(Boolean) as string[];
      const paidAfter = new Map<string, string>();
      if (customerIds.length) {
        const { data: recent } = await supabase
          .from("payments")
          .select("customer_id, created_at, source")
          .in("customer_id", customerIds)
          .eq("confirmed", true)
          .gte("created_at", oldest);
        for (const p of recent ?? []) {
          const prev = paidAfter.get(String(p.customer_id));
          if (!prev || String(p.created_at) > prev) paidAfter.set(String(p.customer_id), String(p.created_at));
        }
      }

      // Tolerância: pagamento e criação da pendência acontecem no mesmo webhook,
      // com segundos de diferença. Só invalida se veio bem depois (>10 min).
      const GRACE_MS = 10 * 60 * 1000;

      let next: any = null;
      const staleIds: string[] = [];
      for (const row of candidates) {
        const paidAt = row.customer_id ? paidAfter.get(String(row.customer_id)) : undefined;
        if (paidAt && new Date(paidAt).getTime() - new Date(row.created_at).getTime() > GRACE_MS) {
          console.log(`[p2cine-queue] skipping ${row.id} (${row.customer_name}) — pago em ${paidAt}, depois da pendência`);
          staleIds.push(row.id);
          continue;
        }
        next = row;
        break;
      }
      if (staleIds.length) {
        await supabase.from("pending_manual_renewals").delete().in("id", staleIds);
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
      if (pending.owner_id !== ownerId) {
        console.warn(`[p2cine-queue] BLOCKED cross-reseller report: pending ${id} owner ${pending.owner_id} != token owner ${ownerId}`);
        return json({ error: "forbidden", message: "Esta pendência pertence a outra revenda." }, 403);
      }

      if (success) {
        // Check reseller access expiry before performing automated activation/renewal
        const { data: resellerAccess } = await supabase
          .from('reseller_access')
          .select('is_active, access_expires_at')
          .eq('user_id', pending.owner_id)
          .maybeSingle();

        const { data: ownerAdminRow } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', pending.owner_id)
          .eq('role', 'admin')
          .maybeSingle();

        const isExpired = resellerAccess?.access_expires_at && new Date(resellerAccess.access_expires_at) < new Date();
        if (!ownerAdminRow && (resellerAccess?.is_active === false || isExpired)) {
          console.warn(`[p2cine-queue] BLOCKED: Reseller ${pending.owner_id} is inactive or expired. Skipping extension update.`);
          // We don't delete the pending row yet, it stays locked until they renew or we wipe it
          return json({ ok: false, error: "reseller_expired", message: "Sua mensalidade expirou. Renove para processar pendências." }, 403);
        }

        // Advance the customer's due_date by inserting a confirmed payment so the
        // DB trigger handles the date math.
        if (pending.customer_id) {
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
