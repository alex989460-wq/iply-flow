// Pinga /reseller/ de cada credencial Clouddy salva para manter a sessão viva.
// Rode a cada 2h via cron (pg_cron ou serviço externo).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

function normalizeCookie(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const parsed = JSON.parse(s);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const parts = arr
      .filter((c: any) => c && c.name && c.value != null)
      .map((c: any) => `${c.name}=${c.value}`);
    if (parts.length) return parts.join("; ");
  } catch { /* not JSON */ }
  return s.replace(/^cookie:\s*/i, "").trim();
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
      .eq("panel_type", "clouddy")
      .eq("is_enabled", true);

    const results: any[] = [];
    for (const c of creds || []) {
      const baseUrl = String((c as any).username || "https://console.clouddy.online").replace(/\/+$/, "");
      const cookie = normalizeCookie(String((c as any).password || ""));
      if (!cookie) { results.push({ user_id: c.user_id, ok: false, error: "sem cookie" }); continue; }
      let alive = false;
      let status = 0;
      let errMsg: string | null = null;
      try {
        const r = await fetch(`${baseUrl}/reseller/`, {
          headers: { "User-Agent": UA, Cookie: cookie, Accept: "text/html" },
          redirect: "manual",
        });
        status = r.status;
        alive = r.status === 200;
        await r.body?.cancel();
      } catch (e) {
        errMsg = (e as Error).message;
      }
      results.push({ user_id: c.user_id, ok: alive, status, error: errMsg });

      // Sessão morta → criar pendência manual (uma por dia por revendedor)
      if (!alive) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await admin
          .from("pending_manual_renewals")
          .select("id")
          .eq("owner_id", c.user_id)
          .eq("reason", "clouddy_session_expired")
          .gte("created_at", since)
          .limit(1);
        if (!existing || existing.length === 0) {
          await admin.from("pending_manual_renewals").insert({
            owner_id: c.user_id,
            customer_name: "⚠️ Sessão Clouddy expirada",
            reason: "clouddy_session_expired",
            source: "clouddy-keepalive",
            error_details: {
              message: "Cookie de sessão do painel Clouddy expirou. Faça login em console.clouddy.online, copie o Cookie do DevTools e atualize em Configurações → Ativações → Clouddy.",
              status,
              error: errMsg,
              base_url: baseUrl,
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
