// Mantém o Bearer token da IBO Sol ativo pingando /check-token a cada execução.
// Deve ser agendado via pg_cron a cada 3 minutos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const API_BASE = "https://backend-apis.ibosol.com/api";

async function pingIbosol(token: string) {
  // Endpoints leves que renovam a sessão Sanctum. Tenta em ordem até um responder 2xx.
  const endpoints = ["/user", "/get-reseller-info", "/get-packages"];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${API_BASE}${ep}`, {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const status = r.status;
      await r.body?.cancel();
      if (status === 401 || status === 403) {
        return { alive: false, expired: true, status, endpoint: ep };
      }
      if (status >= 200 && status < 500) {
        return { alive: true, expired: false, status, endpoint: ep };
      }
    } catch (_) { /* tenta próximo */ }
  }
  return { alive: false, expired: false, status: 0, endpoint: null, error: "network" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const jh = { ...cors, "Content-Type": "application/json" };
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: creds } = await admin
      .from("activation_panel_credentials")
      .select("user_id, password, is_enabled")
      .eq("panel_type", "ibosol")
      .eq("is_enabled", true);

    const results: any[] = [];
    for (const c of creds || []) {
      const token = String((c as any).password || "").trim();
      if (!token) { results.push({ user_id: c.user_id, ok: false, error: "sem token" }); continue; }
      const r = await pingIbosol(token);
      results.push({ user_id: c.user_id, ok: r.alive, expired: r.expired, status: r.status, endpoint: r.endpoint });

      if (r.expired) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await admin
          .from("pending_manual_renewals")
          .select("id")
          .eq("owner_id", c.user_id)
          .eq("reason", "ibosol_session_expired")
          .gte("created_at", since)
          .limit(1);
        if (!existing || existing.length === 0) {
          await admin.from("pending_manual_renewals").insert({
            owner_id: c.user_id,
            customer_name: "⚠️ Sessão IBO Sol expirada",
            reason: "ibosol_session_expired",
            source: "ibosol-keepalive",
            error_details: {
              message: "Bearer token da IBO Sol expirou. Faça login em ibosol.com, copie o novo token do DevTools (Application → Cookies → token) e atualize em Ativação de Apps → IBO Sol.",
              status: r.status,
            },
          });
        }
      }
    }
    return new Response(JSON.stringify({ pinged: results.length, results }), { headers: jh });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: jh });
  }
});
