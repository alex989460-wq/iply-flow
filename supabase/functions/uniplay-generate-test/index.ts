// Gera usuário de TESTE no painel Uniplay.
// O painel (searchdefense.top) cria testes usando o mesmo endpoint de criação
// de usuário da API (gesapioffice.com), enviando o campo `test_hours`.
//   IPTV: POST /api/users-iptv  { isOficial, package, credits, isCustomPackage, nota, test_hours }
//   P2P : POST /api/users-p2p   { isOficial, productid, credits, nota, test_hours }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const DEFAULT_BASE_URL = "https://gesapioffice.com";
const PANEL_HOST = "searchdefense.top";
const ALLOWED_HOURS = [1, 2, 3, 6];

function normalizeApiBaseUrl(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value) return DEFAULT_BASE_URL;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === PANEL_HOST) return DEFAULT_BASE_URL;
    const path = url.pathname.replace(/\/+$/, "");
    const cleanPath = path === "/api" ? "" : path;
    return `${url.protocol}//${url.host}${cleanPath}`.replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function uniplayHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    Origin: "https://searchdefense.top",
    Referer: "https://searchdefense.top/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    ...(extra || {}),
  };
}

function proxyConfig(): { url: string; secret: string } | null {
  const u = String(Deno.env.get("UNIPLAY_PROXY_URL") || Deno.env.get("SIGMA_PROXY_URL") || "").trim().replace(/\/+$/, "");
  const s = String(Deno.env.get("UNIPLAY_PROXY_SECRET") || Deno.env.get("SIGMA_PROXY_SECRET") || "").trim();
  if (!u || !s) return null;
  return { url: /^https?:\/\//i.test(u) ? u : `https://${u}`, secret: s };
}

// O painel bloqueia IPs de datacenter: as chamadas passam pelo relay brasileiro.
async function pfetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  const proxy = proxyConfig();
  if (!proxy) return await fetch(url, init as RequestInit);
  try {
    const relayed = await fetch(proxy.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
      body: JSON.stringify({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body }),
    });
    const payload = await relayed.json().catch(() => null) as any;
    if (!relayed.ok || !payload || typeof payload.status !== "number" || payload.status === 0) {
      return await fetch(url, init as RequestInit);
    }
    const text = String(payload.body ?? "");
    const contentType = String(
      payload.headers?.["content-type"] ||
        (text.trim().startsWith("{") || text.trim().startsWith("[") ? "application/json" : "text/html"),
    );
    return new Response(text, { status: payload.status, headers: { "content-type": contentType } });
  } catch {
    return await fetch(url, init as RequestInit);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const rawHours = Number(body?.hours);
    const hours = ALLOWED_HOURS.includes(rawHours) ? rawHours : 6;
    const kind = String(body?.kind || "iptv").toLowerCase() === "p2p" ? "p2p" : "iptv";
    const note = String(body?.note || "").trim().slice(0, 60) || "Teste SuperGestor";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: settings } = await admin
      .from("reseller_api_settings")
      .select("uniplay_username, uniplay_password, uniplay_base_url")
      .eq("user_id", user.id)
      .maybeSingle();

    const uUser = String(settings?.uniplay_username || "").trim();
    const uPass = String(settings?.uniplay_password || "").trim();
    const baseUrl = normalizeApiBaseUrl(settings?.uniplay_base_url);

    if (!uUser || !uPass) {
      return new Response(
        JSON.stringify({ error: "Configure usuário e senha do Uniplay em Configurações > APIs Externas." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // 1) Login
    const loginRes = await pfetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: uniplayHeaders({ "Content-Type": "application/json;charset=UTF-8" }),
      body: JSON.stringify({ username: uUser, password: uPass, code: "" }),
    });
    const loginText = await loginRes.text();
    let loginJson: any = null;
    try { loginJson = JSON.parse(loginText); } catch { /* ignore */ }
    const token = String(loginJson?.access_token || loginJson?.token || "");
    if (!loginRes.ok || !token) {
      return new Response(
        JSON.stringify({ error: `Não foi possível entrar no Uniplay (${loginRes.status}). ${String(loginText).slice(0, 200)}` }),
        { status: 502, headers: jsonHeaders },
      );
    }

    // 2) Cria o teste
    const payload = kind === "p2p"
      ? { isOficial: false, productid: String(body?.productid || "1"), credits: 1, nota: note, test_hours: hours }
      : { isOficial: false, package: String(body?.package || "1"), credits: 1, isCustomPackage: false, nota: note, test_hours: hours };

    const createRes = await pfetch(`${baseUrl}/api/users-${kind}`, {
      method: "POST",
      headers: uniplayHeaders({
        "Content-Type": "application/json;charset=UTF-8",
        Authorization: `Bearer ${token}`,
      }),
      body: JSON.stringify(payload),
    });
    const createText = await createRes.text();
    let result: any = null;
    try { result = JSON.parse(createText); } catch { /* ignore */ }

    if (!createRes.ok || !result?.username) {
      return new Response(
        JSON.stringify({ error: `Falha ao gerar teste no Uniplay (${createRes.status}): ${String(createText).slice(0, 300)}` }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const expTxt = result.exp_date
      ? new Date(result.exp_date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : `${hours}h`;
    const m3u = String(result.M3U8 || "");
    const hls = String(result.M3U8_2 || result.SSIPTV_M3U8 || "");
    const dns = String(result.DNS_SMARTER || "");

    const message =
      `🎬 *TESTE GERADO*\n\n` +
      `👤 Usuário: ${result.username}\n` +
      `🔑 Senha: ${result.password}\n` +
      (dns ? `🌐 Servidor: ${dns}\n` : "") +
      `⏰ Expira: ${expTxt}\n\n` +
      (m3u ? `*Link (M3U)* 👉 ${m3u}\n\n` : "") +
      (hls ? `*Link (HLS)* 👉 ${hls}` : "");

    return new Response(
      JSON.stringify({ success: true, message, m3u, hls, dns, user: result }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[uniplay-generate-test]", err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
