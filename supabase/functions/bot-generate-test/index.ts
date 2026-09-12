// Endpoint público para chatbots gerarem teste automático (Uniplay).
// Autenticação: header x-api-key (a mesma chave do checkout do revendedor).
// Limite: 1 teste por telefone a cada 24h.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const DEFAULT_BASE_URL = "https://gesapioffice.com";
const PANEL_HOST = "searchdefense.top";
const ALLOWED_HOURS = [1, 2, 3, 6];

function normalizePhone(raw: unknown): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10 && digits.length <= 11) return "55" + digits;
  return digits;
}

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
    return new Response(text, {
      status: payload.status,
      headers: { "content-type": String(payload.headers?.["content-type"] || "application/json") },
    });
  } catch {
    return await fetch(url, init as RequestInit);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({} as any));
    const apiKey = String(req.headers.get("x-api-key") || body?.api_key || "").trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "Chave de API obrigatória" }), { status: 401, headers: jsonHeaders });
    }

    const { data: settings } = await admin
      .from("reseller_checkout_settings")
      .select("user_id")
      .eq("api_key", apiKey)
      .maybeSingle();

    const userId = settings?.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Chave de API inválida" }), { status: 401, headers: jsonHeaders });
    }

    const phone = normalizePhone(body?.phone);
    if (!phone) {
      return new Response(JSON.stringify({ success: false, error: "Telefone obrigatório" }), { status: 400, headers: jsonHeaders });
    }

    // Limite: 1 teste por telefone a cada 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("bot_test_generations")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("phone", phone)
      .gte("created_at", since)
      .limit(1);

    if (recent && recent.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          limited: true,
          message: "Você já gerou um teste nas últimas 24 horas. Fale com o atendimento para continuar. 😉",
        }),
        { headers: jsonHeaders },
      );
    }

    // Duração: usa o painel Uniplay cadastrado no Gerador de Teste
    const { data: servers } = await admin
      .from("vplay_servers")
      .select("server_name, server_type, test_minutes, is_default")
      .eq("user_id", userId)
      .eq("server_type", "uniplay")
      .order("is_default", { ascending: false })
      .limit(1);

    const configured = servers?.[0];
    const rawHours = Number(body?.hours) || Math.round(Number(configured?.test_minutes || 360) / 60);
    const hours = ALLOWED_HOURS.includes(rawHours) ? rawHours : 6;
    const kind = String(body?.kind || "iptv").toLowerCase() === "p2p" ? "p2p" : "iptv";

    const { data: api } = await admin
      .from("reseller_api_settings")
      .select("uniplay_username, uniplay_password, uniplay_base_url")
      .eq("user_id", userId)
      .maybeSingle();

    const uUser = String(api?.uniplay_username || "").trim();
    const uPass = String(api?.uniplay_password || "").trim();
    const baseUrl = normalizeApiBaseUrl(api?.uniplay_base_url);
    if (!uUser || !uPass) {
      return new Response(
        JSON.stringify({ success: false, error: "Configure usuário e senha do Uniplay em Configurações > APIs Externas." }),
        { status: 400, headers: jsonHeaders },
      );
    }

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
        JSON.stringify({ success: false, error: `Não foi possível entrar no Uniplay (${loginRes.status}).` }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const payload = kind === "p2p"
      ? { isOficial: false, productid: String(body?.productid || "1"), credits: 1, nota: "Teste chatbot", test_hours: hours }
      : { isOficial: false, package: String(body?.package || "1"), credits: 1, isCustomPackage: false, nota: "Teste chatbot", test_hours: hours };

    const createRes = await pfetch(`${baseUrl}/api/users-${kind}`, {
      method: "POST",
      headers: uniplayHeaders({ "Content-Type": "application/json;charset=UTF-8", Authorization: `Bearer ${token}` }),
      body: JSON.stringify(payload),
    });
    const createText = await createRes.text();
    let result: any = null;
    try { result = JSON.parse(createText); } catch { /* ignore */ }

    if (!createRes.ok || !result?.username) {
      return new Response(
        JSON.stringify({ success: false, error: `Falha ao gerar teste (${createRes.status}): ${String(createText).slice(0, 200)}` }),
        { status: 502, headers: jsonHeaders },
      );
    }

    await admin.from("bot_test_generations").insert({
      user_id: userId,
      phone,
      panel: "uniplay",
      test_username: String(result.username),
    });

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
      JSON.stringify({ success: true, message, username: result.username, password: result.password, m3u, hls, dns, expires_at: result.exp_date || null }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[bot-generate-test]", err);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: jsonHeaders });
  }
});
