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

// Abre o painel num navegador real na VPS (IP residencial) e faz o login lá.
// É assim que a sessão fica salva sem precisar da extensão do navegador.
async function browserLogin(base: string, username: string, password: string) {
  const proxy = proxyConfig();
  if (!proxy) {
    throw new Error("O proxy do painel não está configurado. Fale com o suporte do SuperGestor.");
  }

  const res = await fetch(proxy.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
    body: JSON.stringify({
      browser: true,
      url: `${base}/login`,
      wait_ms: 8000,
      steps: [
        { selector: "input[name='username'], #username", value: username },
        { selector: "input[name='password'], #password", value: password },
        { selector: "button[type='submit'], input[type='submit'], .btn-login", click: true, wait_ms: 9000 },
      ],
    }),
  }).catch((err) => {
    throw new Error(
      `Não foi possível falar com o proxy do painel. Verifique se a VPS do proxy está ligada. Detalhe: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  const payload = await res.json().catch(() => null) as any;
  if (res.status === 401) throw new Error("A chave secreta do proxy está incorreta.");
  if (!res.ok || !payload?.ok) {
    const msg = String(payload?.message || payload?.error || `HTTP ${res.status}`);
    if (/navegador_indisponivel/i.test(msg) || payload?.error === "navegador_indisponivel") {
      throw new Error("O navegador do proxy não está instalado na VPS. Atualize o proxy para a versão 1.4.0.");
    }
    throw new Error(`Falha ao abrir o painel no navegador do proxy: ${msg}`);
  }

  const cookies: string[] = (Array.isArray(payload.cookies) ? payload.cookies : [])
    .map((c: any) => `${c.name}=${c.value}`);
  const finalUrl = String(payload.final_url || "");
  const html = String(payload.html || "");

  const stillOnLogin = /\/login/i.test(finalUrl) || /name="password"/i.test(html);
  if (!cookies.length || stillOnLogin) {
    if (/captcha/i.test(html)) {
      const captchaStatus = String(payload?.captcha?.status || "desconhecido");
      const captchaMessage = String(payload?.captcha?.message || "").trim();
      const detail = captchaMessage ? ` Detalhe: ${captchaMessage}` : ` Status do resolvedor: ${captchaStatus}.`;
      throw new Error(`O painel pediu hCaptcha e o proxy não concluiu a validação.${detail}`);
    }
    throw new Error("Login recusado pelo painel. Confira usuário e senha do P2Cine.");
  }

  return cookies.join("; ");
}

// Mensagens de erro da API do painel traduzidas para português.
const API_ERRORS: Record<string, string> = {
  MISSING_CREDENTIALS: 'O painel exigiu "username" e "api_key" na chamada.',
  INVALID_DATA:
    "O painel recusou o par usuário + chave de API. Confira se a chave foi copiada inteira e se ela pertence exatamente a esse usuário (Perfil → API KEY).",
  ACCESS_DENIED: "Esse usuário não tem a API liberada no painel.",
};

function apiErrorPt(payload: any): string {
  const code = String(payload?.error_code || "").toUpperCase();
  if (API_ERRORS[code]) return API_ERRORS[code];
  const raw = String(payload?.error_message || payload?.message || "").trim();
  return raw || "resposta não reconhecida do painel";
}

// Autentica direto na API do painel (POST /api/login com username + api_key).
// Retorna o token JWT da sessão de API — sem navegador, sem captcha, sem login no painel.
async function apiLogin(
  base: string,
  username: string,
  apiKey: string,
): Promise<{ ok: boolean; token?: string; detail: string }> {
  try {
    const res = await relay(`${base}/api/login`, {
      method: "POST",
      headers: {
        ...browserHeaders,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ username, api_key: apiKey }).toString(),
    });

    const text = String(res.body || "").trim();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* HTML */ }

    if (!parsed) {
      return {
        ok: false,
        detail: /just a moment|cloudflare/i.test(text)
          ? "o Cloudflare do painel bloqueou a chamada da API"
          : `o painel respondeu HTTP ${res.status} sem JSON`,
      };
    }

    if (String(parsed.result || "").toLowerCase() === "failed") {
      return { ok: false, detail: apiErrorPt(parsed) };
    }

    const token = String(parsed.token || parsed.access_token || parsed.jwt || parsed.data?.token || "").trim();
    if (!token) return { ok: false, detail: "o painel autenticou mas não devolveu o token da API" };
    return { ok: true, token, detail: "" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

// Faz uma chamada autenticada na API usando o token JWT da sessão de API.
async function apiCall(base: string, token: string, action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ token, ...params }).toString();
  const res = await relay(`${base}/api/${action}?${qs}`, {
    headers: { ...browserHeaders, Accept: "application/json" },
  });
  const text = String(res.body || "").trim();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* HTML */ }
  if (!parsed) throw new Error(`O painel respondeu HTTP ${res.status} sem JSON na ação "${action}".`);
  if (String(parsed.result || "").toLowerCase() === "failed") throw new Error(apiErrorPt(parsed));
  return parsed;
}


// Confere se a sessão salva ainda está válida.
async function sessionAlive(base: string, cookieHeader: string): Promise<boolean> {

  if (!cookieHeader) return false;
  try {
    const res = await relay(`${base}/dashboard`, { headers: { ...browserHeaders, Cookie: cookieHeader } });
    if (res.status >= 400) return false;
    return !/name="password"/i.test(res.body);
  } catch {
    return false;
  }
}

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
    let apiKeyDiagnostic = "";

    const action = String(body?.action || "test");

    // Diagnóstico rápido do proxy (versão, navegador, solucionador de captcha).
    if (action === "proxy_health") {
      const proxy = proxyConfig();
      if (!proxy) return json({ success: false, error: "Proxy não configurado (SIGMA_PROXY_URL / SIGMA_PROXY_SECRET)." }, 200);
      try {
        const healthUrl = proxy.url.replace(/\/+$/, "") + "/health";
        const r = await fetch(healthUrl, { headers: { "x-sigma-proxy-secret": proxy.secret } });
        const txt = await r.text();
        return json({ success: r.ok, status: r.status, health: txt.slice(0, 800), proxy_url: proxy.url });
      } catch (e) {
        return json({ success: false, error: `Proxy inacessível: ${e instanceof Error ? e.message : String(e)}` }, 200);
      }
    }

    // Abre uma página no navegador da VPS e devolve o que apareceu (diagnóstico).
    if (action === "browser_debug") {
      const proxy = proxyConfig();
      if (!proxy) return json({ success: false, error: "Proxy não configurado." }, 200);
      const r = await fetch(proxy.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
        body: JSON.stringify({
          browser: true,
          url: String(body?.url || ""),
          wait_ms: Number(body?.wait_ms || 9000),
          capture: body?.capture,
          steps: Array.isArray(body?.steps) ? body.steps : [],
        }),
      });
      const payload = await r.json().catch(() => null) as any;
      return json({
        success: r.ok,
        final_url: payload?.final_url,
        captcha: payload?.captcha,
        error: payload?.error || payload?.message,
        storage_keys: Object.keys(payload?.storage || {}),
        captured: payload?.captured,
        steps: payload?.steps,
        fields: payload?.fields,

        html: body?.html_grep
          ? (String(payload?.html || "").match(new RegExp(String(body.html_grep), "gi")) || []).slice(0, 40)
          : String(payload?.html || "").slice(0, Number(body?.html_len || 4000)),

      });
    }


    let base = normBase(body?.p2cine_base_url);
    let username = String(body?.p2cine_username || "").trim();
    let password = String(body?.p2cine_password || "");
    let apiKey = String(body?.p2cine_api_key || "").trim();

    if (!username || !password || !apiKey) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: s } = await admin
        .from("reseller_api_settings")
        .select("p2cine_username, p2cine_password, p2cine_base_url, p2cine_api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      username = username || String((s as any)?.p2cine_username || "");
      password = password || String((s as any)?.p2cine_password || "");
      apiKey = apiKey || String((s as any)?.p2cine_api_key || "");
      if (!body?.p2cine_base_url) base = normBase((s as any)?.p2cine_base_url);
    }

    if (!apiKey && (!username || !password)) {
      return json({ error: "Informe a chave de API ou o usuário e a senha do painel P2Cine em Configurações → APIs." }, 400);
    }

    if (action !== "test" && action !== "connect" && action !== "status") {
      return json({ error: `Ação não suportada: ${action}` }, 400);
    }

    // 1) Caminho preferido: API oficial do painel (usuário + chave de API).
    // Não abre o painel, não passa por captcha e não depende de sessão de navegador.
    if (apiKey && username && (action === "test" || action === "connect" || action === "status")) {
      const login = await apiLogin(base, username, apiKey);
      if (login.ok) {
        let credits: number | null = null;
        try {
          const info = await apiCall(base, login.token!, "get_credits");
          const raw = info?.credits ?? info?.data?.credits ?? info?.saldo;
          if (raw !== undefined && raw !== null) credits = Number(raw);
        } catch { /* saldo é opcional */ }

        return json({
          success: true,
          base_url: base,
          username,
          connected: true,
          auth_mode: "api_key",
          credits,
          message: credits === null
            ? "Conectado pela API do painel (usuário + chave). Não é preciso logar no painel."
            : `Conectado pela API do painel (usuário + chave). Créditos disponíveis: ${credits}.`,
        });
      }
      apiKeyDiagnostic = login.detail;
    } else if (apiKey && !username) {
      apiKeyDiagnostic = "a API do painel exige o usuário junto com a chave — preencha o campo Usuário.";
    }


    if (!username || !password) {
      return json({
        success: false,
        error: `A chave de API não foi aceita pelo painel P2Cine.${apiKeyDiagnostic ? ` Detalhe: ${apiKeyDiagnostic}.` : ""} Preencha também o usuário e a senha do painel para tentar o login automático.`,
      }, 200);
    }


    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: saved } = await admin
      .from("reseller_api_settings")
      .select("p2cine_session_cookie, p2cine_session_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const savedCookie = String((saved as any)?.p2cine_session_cookie || "");

    if (action === "status") {
      const alive = await sessionAlive(base, savedCookie);
      return json({ success: true, connected: alive, session_at: (saved as any)?.p2cine_session_at ?? null });
    }

    // Sessão salva ainda válida: não precisa logar de novo (nem da extensão).
    if (action === "test" && await sessionAlive(base, savedCookie)) {
      return json({
        success: true,
        base_url: base,
        username,
        connected: true,
        message: "Sessão salva do P2Cine está ativa. Não é preciso usar a extensão.",
      });
    }

    // Login pelo navegador real da VPS e salva a sessão para os próximos usos.
    let cookieHeader: string;
    try {
      cookieHeader = await browserLogin(base, username, password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(apiKeyDiagnostic ? `${msg} (A chave de API também foi recusada — ${apiKeyDiagnostic})` : msg);
    }

    await admin
      .from("reseller_api_settings")
      .update({
        p2cine_session_cookie: cookieHeader,
        p2cine_session_at: new Date().toISOString(),
        p2cine_base_url: base,
      })
      .eq("user_id", user.id);

    return json({
      success: true,
      base_url: base,
      username,
      connected: true,
      message: "Conectado ao P2Cine e sessão salva. A renovação funciona sem a extensão.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[p2cine-renew]", message);
    return json({ success: false, error: message }, 200);
  }
});
