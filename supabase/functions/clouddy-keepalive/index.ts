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

function looksLikeLoginUrl(url: string | null): boolean {
  return /\/(auth\/login|login|signin)(?:[/?#]|$)/i.test(String(url || ""));
}

function looksLikeLoginHtml(html: string): boolean {
  return /type=["']password["']/i.test(html) && /(login|entrar|senha|sign in|e-mail|email)/i.test(html);
}

async function checkClouddySession(baseUrl: string, cookie: string) {
  const headers = { "User-Agent": UA, Cookie: cookie, Accept: "text/html" };
  const entryUrl = `${baseUrl}/reseller/`;

  let status = 0;
  let finalUrl = entryUrl;
  let location: string | null = null;

  try {
    const first = await fetch(entryUrl, { headers, redirect: "manual" });
    status = first.status;
    location = first.headers.get("location");

    if (status === 401 || status === 403 || looksLikeLoginUrl(location)) {
      await first.body?.cancel();
      return { alive: false, expired: true, status, finalUrl, location, error: null, reason: "auth_rejected" };
    }

    if (status >= 300 && status < 400 && location) {
      await first.body?.cancel();
      const followUrl = location.startsWith("http") ? location : `${baseUrl}/${location.replace(/^\/+/, "")}`;
      const follow = await fetch(followUrl, { headers, redirect: "follow" });
      status = follow.status;
      finalUrl = follow.url || followUrl;
      const html = await follow.text();
      const expired = status === 401 || status === 403 || looksLikeLoginUrl(finalUrl) || looksLikeLoginHtml(html);
      return { alive: !expired && status >= 200 && status < 400, expired, status, finalUrl, location, error: null, reason: expired ? "login_redirect" : "redirect_ok" };
    }

    const html = await first.text();
    const expired = looksLikeLoginUrl(first.url) || looksLikeLoginHtml(html);
    return { alive: !expired && status >= 200 && status < 400, expired, status, finalUrl: first.url || finalUrl, location, error: null, reason: expired ? "login_page" : "ok" };
  } catch (e) {
    return { alive: false, expired: false, status, finalUrl, location, error: (e as Error).message, reason: "network_uncertain" };
  }
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
      const session = await checkClouddySession(baseUrl, cookie);
      results.push({ user_id: c.user_id, ok: session.alive, expired: session.expired, status: session.status, reason: session.reason, error: session.error });

      // Só cria pendência quando há sinal claro de expiração/login.
      // Redirects 301/302 não relacionados a login e falhas de rede são tratados como inconclusivos.
      if (session.expired) {
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
              status: session.status,
              reason: session.reason,
              error: session.error,
              base_url: baseUrl,
              final_url: session.finalUrl,
              location: session.location,
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
