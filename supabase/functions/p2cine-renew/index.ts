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
): Promise<{ ok: boolean; token?: string; uid?: string; detail: string }> {
  try {
    const res = await apiFetch(`${base}/api/login`, {
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
    const uid = String(parsed.uid ?? parsed.data?.uid ?? "").trim();
    if (!token) return { ok: false, detail: "o painel autenticou mas não devolveu o token da API" };
    return { ok: true, token, uid, detail: "" };

  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

// A API JSON do painel não usa captcha: chamamos direto (rápido) e só caímos
// no proxy residencial se o Cloudflare bloquear a requisição direta.
async function apiFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<Relayed> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: init.method || "GET",
      headers: init.headers,
      body: init.body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    // Resposta JSON da API (mesmo com erro) já é definitiva: não vale a pena
    // repetir a chamada pelo proxy residencial, que é bem mais lento.
    let isJson = false;
    try { JSON.parse(text); isJson = true; } catch { /* HTML */ }
    if (isJson || (res.status < 400 && !/just a moment|cf-challenge/i.test(text))) {
      return { status: res.status, body: text, cookies: [], headers: {} };
    }
  } catch { /* cai para o proxy */ }
  return await relay(url, init);
}


// Faz uma chamada autenticada na API usando o token JWT da sessão de API.
async function apiCall(base: string, token: string, action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ token, ...params }).toString();
  const res = await apiFetch(`${base}/api/${action}?${qs}`, {
    headers: { ...browserHeaders, Accept: "application/json" },
  });
  const text = String(res.body || "").trim();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* HTML */ }
  if (!parsed) throw new Error(`O painel respondeu HTTP ${res.status} sem JSON na ação "${action}".`);
  if (String(parsed.result || "").toLowerCase() === "failed") throw new Error(apiErrorPt(parsed));
  return parsed;
}

// ---------------------------------------------------------------------------
// Renovação sem extensão: o token da API também autentica as rotas internas do
// painel (basta enviá-lo na query). Assim usamos as mesmas chamadas que o painel
// faz no navegador — sem captcha e sem sessão de navegador.
//   POST /clients/api/?get_clients&token=...        -> localiza o client_id
//   POST /clients/api/?renew_client_plus&client_id=&months=&token=... -> renova
// ---------------------------------------------------------------------------
async function panelPost(base: string, token: string, action: string, params: Record<string, string>, form?: URLSearchParams) {
  const qs = new URLSearchParams({ ...params, token }).toString();
  const res = await apiFetch(`${base}/clients/api/?${action}&${qs}`, {
    method: "POST",
    headers: {
      ...browserHeaders,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: base,
      Referer: `${base}/clients/?token=${token}`,
    },
    body: (form ?? new URLSearchParams()).toString(),
  });
  const text = String(res.body || "").trim();
  if (/<meta http-equiv="Refresh"|\/login\//i.test(text) && text.length < 400) {
    throw new Error("O painel não aceitou o token da API (sessão expirada). Confira usuário e chave de API.");
  }
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* pode ser texto simples */ }
  return { status: res.status, text, parsed };
}

// Procura o client_id do login informado usando a pesquisa nativa do painel.
// O painel só devolve resultados com o payload completo do DataTables e com
// reseller_id = uid da conta autenticada (o uid vem do /api/login).
async function findClientId(base: string, token: string, login: string, resellerId?: string): Promise<string | null> {
  const wanted = login.toLowerCase().trim();

  const page = async (search: string, length: number) => {
    const form = new URLSearchParams();
    form.set("draw", "1");
    form.set("start", "0");
    form.set("length", String(length));
    form.set("search[value]", search);
    form.set("search[regex]", "false");
    form.set("filter_value", "#");
    form.set("search_column", "login");
    form.set("reseller_id", String(resellerId || "-1"));
    for (let i = 0; i < 10; i++) {
      form.set(`columns[${i}][data]`, String(i));
      form.set(`columns[${i}][searchable]`, "true");
      form.set(`columns[${i}][orderable]`, "true");
      form.set(`columns[${i}][search][value]`, "");
      form.set(`columns[${i}][search][regex]`, "false");
    }
    form.set("order[0][column]", "0");
    form.set("order[0][dir]", "desc");
    const { parsed } = await panelPost(base, token, "get_clients", {}, form);
    return Array.isArray(parsed?.data) ? (parsed.data as any[]) : [];
  };

  const pick = (rows: any[]): string | null => {
    for (const row of rows) {
      const cells = (row as any[]).map((c) => String(c ?? "").replace(/<[^>]*>/g, "").trim());
      if (cells.slice(0, 3).some((c) => c.toLowerCase() === wanted)) {
        return String(cells[0] || "").trim() || null;
      }
    }
    return null;
  };

  const searched = await page(login, 25).catch(() => []);
  return pick(searched);
}



// Renova o cliente pela rota interna do painel (mesma do botão "Renovar").
async function renewClient(base: string, token: string, clientId: string, months: number) {
  const { text, parsed } = await panelPost(base, token, "renew_client_plus", {
    client_id: clientId,
    months: String(Math.max(1, months)),
  });
  const result = String(parsed?.result || "").toLowerCase();
  if (result === "success" || /success|sucesso|renovad/i.test(text)) {
    return { ok: true, detail: String(parsed?.message || "Cliente renovado no painel.") };
  }
  return { ok: false, detail: parsed ? apiErrorPt(parsed) : text.slice(0, 200) || "resposta não reconhecida do painel" };
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

    const body = await req.json().catch(() => ({}));
    let apiKeyDiagnostic = "";
    const action = String(body?.action || "test");

    // Chamada interna (outras Edge Functions) usa a chave de serviço + owner_id.
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const internal = authHeader.slice(7).trim() === srk;
    let user: { id: string } | null = null;

    if (internal) {
      const ownerId = String(body?.owner_id || "").trim();
      if (!ownerId) return json({ error: "owner_id é obrigatório na chamada interna" }, 400);
      user = { id: ownerId };
    } else {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: authed }, error: authError } = await sb.auth.getUser();
      if (authError || !authed) return json({ error: "Não autorizado" }, 401);
      user = { id: authed.id };
    }



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

      // Painéis kOffice cadastrados na lista (usuário + chave de API por painel).
      if (!apiKey || !username || !base) {
        const { data: conns } = await admin
          .from("koffice_panel_connections")
          .select("name, base_url, username, api_key, is_active")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at");
        const wanted = normBase(body?.p2cine_base_url || base);
        const picked = (conns || []).find((c: any) => wanted && normBase(c.base_url) === wanted) || (conns || [])[0];
        if (picked) {
          base = normBase((picked as any).base_url);
          username = String((picked as any).username || "");
          apiKey = String((picked as any).api_key || "");
        }
      }
    }


    if (!apiKey && (!username || !password)) {
      return json({ error: "Informe a chave de API ou o usuário e a senha do painel P2Cine em Configurações → APIs." }, 400);
    }

    if (!["test", "connect", "status", "renew", "lookup"].includes(action)) {
      return json({ error: `Ação não suportada: ${action}` }, 400);
    }

    // Renovação/consulta direto pela API do painel — sem extensão e sem captcha.
    if (action === "renew" || action === "lookup") {
      if (!apiKey || !username) {
        return json({ success: false, error: "Cadastre o usuário e a chave de API do painel kOffice em Configurações → APIs." }, 200);
      }
      const login = await apiLogin(base, username, apiKey);
      if (!login.ok) {
        return json({ success: false, error: `A API do painel recusou a autenticação: ${login.detail}` }, 200);
      }

      const clientLogin = String(body?.username || body?.client_login || "").trim();
      if (!clientLogin) return json({ success: false, error: "Informe o usuário do cliente no painel." }, 200);

      const clientId = String(body?.client_id || "").trim() || await findClientId(base, login.token!, clientLogin, login.uid);
      if (!clientId) {
        return json({ success: false, error: `Cliente "${clientLogin}" não encontrado no painel.` }, 200);
      }
      if (action === "lookup") {
        return json({ success: true, client_id: clientId, username: clientLogin, base_url: base });
      }

      const months = Math.max(1, Number(body?.months || 1));
      const result = await renewClient(base, login.token!, clientId, months);
      return json({
        success: result.ok,
        client_id: clientId,
        months,
        base_url: base,
        message: result.ok ? `Cliente renovado no painel por ${months} mês(es).` : undefined,
        error: result.ok ? undefined : `Falha ao renovar no painel: ${result.detail}`,
      }, 200);
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
      // Falha rápida: com chave de API cadastrada não abrimos o navegador do
      // proxy (que demora minutos). O erro quase sempre é chave de outro painel.
      return json({
        success: false,
        base_url: base,
        username,
        error: `O painel ${base.replace(/^https?:\/\//, "")} recusou essa chave de API. ${login.detail}. Confira se a URL do painel é exatamente a mesma de onde a chave foi gerada (Perfil → API KEY).`,
      }, 200);
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
