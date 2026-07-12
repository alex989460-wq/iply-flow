// Mantém a sessão do IBO Player Pro (cms.iboplayer.pro) viva.
// Faz login periódico com o e-mail/senha salvos em activation_panel_credentials
// (panel_type = 'iboplayerpro'). Se o login falhar, cria um pending_manual_renewals
// alertando o revendedor para atualizar as credenciais.
// Agendar via pg_cron a cada 10 minutos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

// Endpoints de login tentados (o painel é SPA e o endpoint pode variar entre builds).
// Retorna no primeiro que responder JSON com token/status válido.
const LOGIN_CANDIDATES = [
  "https://cms.iboplayer.pro/api/login",
  "https://cms.iboplayer.pro/api/auth/login",
  "https://cms.iboplayer.pro/api/reseller/login",
  "https://api.iboplayer.pro/api/login",
  "https://api.iboplayer.pro/login",
  "https://backend.iboplayer.pro/api/login",
];

async function tryLogin(email: string, password: string) {
  for (const url of LOGIN_CANDIDATES) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: "https://cms.iboplayer.pro",
          Referer: "https://cms.iboplayer.pro/",
        },
        body: JSON.stringify({ email, password }),
      });
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) { await r.body?.cancel(); continue; }
      const j = await r.json().catch(() => null);
      if (!j) continue;
      const ok = r.ok && (j.token || j.access_token || j.status === true || j.success === true);
      return { url, status: r.status, ok: !!ok, body: j };
    } catch (_) { /* try next */ }
  }
  return { url: null, status: 0, ok: false, body: null };
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
      .select("user_id, username, password, is_enabled")
      .eq("panel_type", "iboplayerpro")
      .eq("is_enabled", true);

    const results: any[] = [];
    for (const c of creds || []) {
      const email = String((c as any).username || "").trim();
      const password = String((c as any).password || "").trim();
      if (!email || !password) {
        results.push({ user_id: c.user_id, ok: false, error: "credenciais vazias" });
        continue;
      }
      const r = await tryLogin(email, password);
      results.push({ user_id: c.user_id, ok: r.ok, status: r.status, endpoint: r.url });

      if (!r.ok) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await admin
          .from("pending_manual_renewals")
          .select("id")
          .eq("owner_id", c.user_id)
          .eq("reason", "iboplayerpro_session_expired")
          .gte("created_at", since)
          .limit(1);
        if (!existing || existing.length === 0) {
          await admin.from("pending_manual_renewals").insert({
            owner_id: c.user_id,
            customer_name: "⚠️ Sessão IBO Player Pro expirada",
            reason: "iboplayerpro_session_expired",
            source: "iboplayerpro-keepalive",
            error_details: {
              message: "Não foi possível manter a sessão do IBO Player Pro ativa. Verifique e-mail/senha em Ativação de Apps → IBO Player Pro.",
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
