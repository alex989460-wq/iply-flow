// Pinga o painel P2Cine periodicamente para manter a sessão PHPSESSID viva.
// Se detectar expiração real, cria pendência manual (1 por dia por revendedor).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

function extractPhpSessId(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const parsed = JSON.parse(s);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const found = arr.find((c: any) => String(c?.name).toUpperCase() === "PHPSESSID");
    if (found?.value) return String(found.value).trim();
  } catch { /* not JSON */ }
  const m = s.match(/PHPSESSID\s*=\s*([A-Za-z0-9]+)/i);
  return (m ? m[1] : s).trim();
}

function looksLikeLoginUrl(url: string | null): boolean {
  return /\/(auth\/login|login|signin)(?:[/?#]|$)/i.test(String(url || ""));
}
function looksLikeLoginHtml(html: string): boolean {
  return /type=["']password["']/i.test(html) && /(login|entrar|senha|sign in|e-mail|email)/i.test(html);
}

async function checkP2CineSession(baseUrl: string, phpsessid: string) {
  const headers = {
    "User-Agent": UA,
    Cookie: `PHPSESSID=${phpsessid}`,
    Accept: "text/html",
  };
  const entryUrl = `${baseUrl}/clients/`;

  try {
    const first = await fetch(entryUrl, { headers, redirect: "manual" });
    const status = first.status;
    const location = first.headers.get("location");

    if (status === 401 || status === 403 || looksLikeLoginUrl(location)) {
      await first.body?.cancel();
      return { alive: false, expired: true, status, location, reason: "auth_rejected" };
    }
    if (status >= 300 && status < 400 && location) {
      await first.body?.cancel();
      const followUrl = location.startsWith("http") ? location : `${baseUrl}/${location.replace(/^\/+/, "")}`;
      const follow = await fetch(followUrl, { headers, redirect: "follow" });
      const html = await follow.text();
      const expired = follow.status === 401 || follow.status === 403 || looksLikeLoginUrl(follow.url) || looksLikeLoginHtml(html);
      return { alive: !expired && follow.status >= 200 && follow.status < 400, expired, status: follow.status, location, reason: expired ? "login_redirect" : "redirect_ok" };
    }
    const html = await first.text();
    const expired = looksLikeLoginUrl(first.url) || looksLikeLoginHtml(html);
    return { alive: !expired && status >= 200 && status < 400, expired, status, location, reason: expired ? "login_page" : "ok" };
  } catch (e) {
    return { alive: false, expired: false, status: 0, location: null, reason: "network_uncertain", error: (e as Error).message };
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
      .eq("panel_type", "p2cine")
      .eq("is_enabled", true);

    const results: any[] = [];
    for (const c of creds || []) {
      const baseUrl = String((c as any).username || "").replace(/\/+$/, "");
      const phpsessid = extractPhpSessId(String((c as any).password || ""));
      if (!baseUrl || !phpsessid) {
        results.push({ user_id: c.user_id, ok: false, error: "sem baseUrl/PHPSESSID" });
        continue;
      }
      const session = await checkP2CineSession(baseUrl, phpsessid);
      results.push({ user_id: c.user_id, ok: session.alive, expired: session.expired, status: session.status, reason: session.reason });

      if (session.expired) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await admin
          .from("pending_manual_renewals")
          .select("id")
          .eq("owner_id", c.user_id)
          .eq("reason", "p2cine_session_expired")
          .gte("created_at", since)
          .limit(1);
        if (!existing || existing.length === 0) {
          await admin.from("pending_manual_renewals").insert({
            owner_id: c.user_id,
            customer_name: "⚠️ Sessão P2Cine expirada",
            reason: "p2cine_session_expired",
            source: "p2cine-keepalive",
            error_details: {
              message: "Cookie PHPSESSID do painel P2Cine expirou. Faça login no painel, copie o PHPSESSID do DevTools e atualize em Configurações → APIs Externas → P2Cine.",
              status: session.status,
              reason: session.reason,
              base_url: baseUrl,
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
