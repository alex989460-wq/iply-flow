// Mantém a sessão do IBO Player Pro (cms.iboplayer.pro) viva.
// API real: https://api.iboproapp.com  (fallback https://api.proapqapi.xyz)
//   POST /admin/login   { username, password } -> { accessToken, refreshToken }
//   GET  /admin/me      (Authorization: Bearer <accessToken>)
// Faz login com o e-mail/senha salvos em activation_panel_credentials
// (panel_type = 'iboplayerpro'), guarda o accessToken em `notes` para o
// activate reutilizar e alerta o revendedor se o login falhar.
// Agendar via pg_cron a cada 10 minutos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const API_BASES = [
  "https://api.iboproapp.com",
  "https://api.proapqapi.xyz",
];

const commonHeaders = () => ({
  "User-Agent": UA,
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  Origin: "https://cms.iboplayer.pro",
  Referer: "https://cms.iboplayer.pro/",
});

export async function iboProLogin(email: string, password: string) {
  let lastErr = "";
  for (const base of API_BASES) {
    try {
      const r = await fetch(`${base}/admin/login`, {
        method: "POST",
        headers: commonHeaders(),
        body: JSON.stringify({ username: email, password }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.status === true && j?.accessToken) {
        return { ok: true, base, token: j.accessToken as string, refresh: j.refreshToken || null };
      }
      lastErr = `HTTP ${r.status} ${j?.message || ""} @ ${base}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  return { ok: false, base: null as string | null, token: "", refresh: null, error: lastErr };
}

async function pingMe(base: string, token: string) {
  const r = await fetch(`${base}/admin/me`, {
    headers: { ...commonHeaders(), Authorization: `Bearer ${token}` },
  });
  await r.body?.cancel();
  return r.status;
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
      .select("id, user_id, username, password, is_enabled")
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
      const login = await iboProLogin(email, password);
      if (!login.ok) {
        results.push({ user_id: c.user_id, ok: false, error: login.error });
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
              message: "Login no IBO Player Pro falhou. Verifique e-mail/senha em Ativação de Apps → IBO Player Pro.",
              detail: login.error,
            },
          });
        }
        continue;
      }
      const meStatus = await pingMe(login.base!, login.token);
      // Guarda o token/base em `extra` para o activate reutilizar sem novo login
      await admin
        .from("activation_panel_credentials")
        .update({
          extra: {
            access_token: login.token,
            refresh_token: login.refresh,
            api_base: login.base,
            refreshed_at: new Date().toISOString(),
          },
        })
        .eq("id", (c as any).id);
      results.push({ user_id: c.user_id, ok: meStatus === 200 || meStatus === 304, me_status: meStatus, base: login.base });
    }
    return new Response(JSON.stringify({ pinged: results.length, results }), { headers: jh });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: jh });
  }
});
