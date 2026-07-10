// send-push: envia notificações push via OneSignal REST API.
// Recebe { type, owner_id, title, body, data } — busca device_tokens do owner
// e dispara para o OneSignal (iOS + Android + Web).
//
// Requer secrets:
//   ONESIGNAL_APP_ID
//   ONESIGNAL_REST_API_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return json({ error: "onesignal_not_configured" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { owner_id, user_ids, title, body, data } = await req.json();
    const ownerIds: string[] = Array.isArray(user_ids) ? user_ids : owner_id ? [owner_id] : [];
    if (ownerIds.length === 0) return json({ error: "owner_id required" }, 400);

    const { data: rows, error } = await supabase
      .from("device_tokens")
      .select("token, platform")
      .in("user_id", ownerIds);
    if (error) throw error;

    const tokens = (rows ?? []).map((r) => r.token).filter(Boolean);
    if (tokens.length === 0) return json({ ok: true, sent: 0, reason: "no_tokens" });

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: tokens,
        headings: { en: title || "SuperGestor", pt: title || "SuperGestor" },
        contents: { en: body || "", pt: body || "" },
        data: data ?? {},
      }),
    });
    const out = await res.json().catch(() => ({}));
    return json({ ok: res.ok, sent: tokens.length, onesignal: out }, res.ok ? 200 : 502);
  } catch (err) {
    console.error("[send-push] error", err);
    return json({ error: err instanceof Error ? err.message : "unknown" }, 500);
  }
});
