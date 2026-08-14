// Integração com o painel P2Cine (kOfficePanel, ex.: https://daily3.news)
// Ações:
//   { action: "test" } -> valida usuário e senha do painel
//
// Todas as chamadas saem pelo proxy global (VPS com IP residencial),
// evitando o bloqueio de IPs de datacenter do Cloudflare.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const DEFAULT_BASE = "https://daily3.news";

const browserHeaders: Record<string, string> = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
};

function normBase(raw: unknown): string {
  let s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return DEFAULT_BASE;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return DEFAULT_BASE;
  }
}

function proxyConfig(): { url: string; secret: string } | null {
  const u = String(Deno.env.get("SIGMA_PROXY_URL") || "").trim().replace(/\/+$/, "");
  const s = String(Deno.env.get("SIGMA_PROXY_SECRET") || "").trim();
  if (!u || !s) return null;
  return { url: /^https?:\/\//i.test(u) ? u : `https://${u}`, secret: s };
}

type Relayed = { status: number; body: string; cookies: string[]; headers: Record<string, string> };

async function relay(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<Relayed> {
  const proxy = proxyConfig();
  if (!proxy) {
    const res = await fetch(url, { method: init.method || "GET", headers: init.headers, body: init.body });
    const setCookie = (res.headers as any).getSetCookie?.() ?? [];
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return { status: res.status, body: await res.text(), cookies: setCookie, headers };
  }

  const res = await fetch(proxy.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
    body: JSON.stringify({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body }),
  }).catch((err) => {
    throw new Error(
      `Não foi possível falar com o proxy do painel. Verifique se a VPS do proxy está ligada. Detalhe: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  if (res.status === 401) throw new Error("A chave secreta do proxy está incorreta.");
  const payload = await res.json().catch(() => null) as any;
  if (!res.ok || !payload || typeof payload.status !== "number") {
    throw new Error(`O proxy respondeu com erro: ${payload?.message || payload?.error || `HTTP ${res.status}`}`);
  }
  return {
    status: payload.status,
    body: String(payload.body ?? ""),
    cookies: Array.isArray(payload.cookies) ? payload.cookies.map(String) : [],
    headers: (payload.headers && typeof payload.headers === "object" ? payload.headers : {}) as Record<string, string>,
  };
}

function mergeCookies(jar: Record<string, string>, raw: string[]): string {
  for (const line of raw) {
    for (const piece of String(line).split(/,(?=[^;]+?=)/)) {
      const [pair] = piece.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    }
  }
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(base: string, username: string, password: string) {
  const jar: Record<string, string> = {};

  const page = await relay(`${base}/login`, { headers: browserHeaders });
  const cookieHeader = mergeCookies(jar, page.cookies);
  const csrf = page.body.match(/name="csrf_token"\s+value="([^"]+)"/i)?.[1] || "";
  const hasCaptcha = /hcaptcha|recaptcha|turnstile/i.test(page.body) &&
    /h-captcha|g-recaptcha|cf-turnstile/i.test(page.body);

  const form = new URLSearchParams();
  form.set("try_login", "1");
  if (csrf) form.set("csrf_token", csrf);
  form.set("username", username);
  form.set("password", password);

  const res = await relay(`${base}/login`, {
    method: "POST",
    headers: {
      ...browserHeaders,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Origin": base,
      "Referer": `${base}/login`,
      "X-Requested-With": "XMLHttpRequest",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: form.toString(),
  });

  const cookies = mergeCookies(jar, res.cookies);
  const text = res.body.trim();

  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* resposta em HTML */ }

  const ok = res.status >= 200 && res.status < 400 &&
    (parsed ? (parsed.status === true || parsed.success === true || /ok|success/i.test(String(parsed.type || parsed.message || ""))) : /dashboard|painel/i.test(text));

  if (!ok) {
    const reason = String(parsed?.message || parsed?.msg || "").trim();
    if (/captcha/i.test(reason) || (!reason && hasCaptcha)) {
      throw new Error(
        "O painel P2Cine está pedindo captcha no login. Use a extensão do SuperGestor para esse painel enquanto o captcha estiver ativo.",
      );
    }
    throw new Error(reason || `Login recusado pelo painel (HTTP ${res.status}). Confira usuário e senha.`);
  }

  return { cookies, message: String(parsed?.message || "Login realizado") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) return json({ error: "Não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "test");

    let base = normBase(body?.p2cine_base_url);
    let username = String(body?.p2cine_username || "").trim();
    let password = String(body?.p2cine_password || "");

    if (!username || !password) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: s } = await admin
        .from("reseller_api_settings")
        .select("p2cine_username, p2cine_password, p2cine_base_url")
        .eq("user_id", user.id)
        .maybeSingle();
      username = username || String((s as any)?.p2cine_username || "");
      password = password || String((s as any)?.p2cine_password || "");
      if (!body?.p2cine_base_url) base = normBase((s as any)?.p2cine_base_url);
    }

    if (!username || !password) {
      return json({ error: "Informe usuário e senha do painel P2Cine em Configurações → APIs." }, 400);
    }

    if (action !== "test") return json({ error: `Ação não suportada: ${action}` }, 400);

    const session = await login(base, username, password);
    return json({ success: true, base_url: base, username, message: session.message });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[p2cine-renew]", message);
    return json({ success: false, error: message }, 200);
  }
});
