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
      try {
        const r = await fetch(`${baseUrl}/reseller/`, {
          headers: { "User-Agent": UA, Cookie: cookie, Accept: "text/html" },
          redirect: "manual",
        });
        const alive = r.status === 200;
        results.push({ user_id: c.user_id, ok: alive, status: r.status });
      } catch (e) {
        results.push({ user_id: c.user_id, ok: false, error: (e as Error).message });
      }
    }
    return new Response(JSON.stringify({ pinged: results.length, results }), { headers: jh });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: jh });
  }
});
