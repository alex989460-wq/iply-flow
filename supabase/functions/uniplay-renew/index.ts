import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cakto-webhook-secret",
};

const DEFAULT_BASE_URL = "https://gesapioffice.com";
const PANEL_HOST = "searchdefense.top";

class UniplayExternalError extends Error {
  status?: number;
  endpoint?: string;
  body?: string;

  constructor(message: string, details?: { status?: number; endpoint?: string; body?: string }) {
    super(message);
    this.name = "UniplayExternalError";
    this.status = details?.status;
    this.endpoint = details?.endpoint;
    this.body = details?.body;
  }
}

function normalizeApiBaseUrl(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value) return DEFAULT_BASE_URL;

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();

    // searchdefense.top is only the browser panel. Its own JS calls gesapioffice.com for the API.
    if (host === PANEL_HOST) return DEFAULT_BASE_URL;

    const path = url.pathname.replace(/\/+$/, "");
    const cleanPath = path === "/api" ? "" : path;
    return `${url.protocol}//${url.host}${cleanPath}`.replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function previewBody(body: string): string {
  const text = body.trim();
  if (!text) return "resposta vazia";
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    return "retornou HTML em vez de JSON";
  }
  return text.slice(0, 500);
}

async function parseJsonResponse<T>(res: Response, endpoint: string, label: string): Promise<T> {
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    throw new UniplayExternalError(
      `${label} falhou: ${res.status} - ${previewBody(text)}. Endpoint testado: ${endpoint}`,
      { status: res.status, endpoint, body: text },
    );
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new UniplayExternalError(
      `${label} retornou resposta inválida (${contentType || "sem content-type"}) - ${previewBody(text)}. Endpoint testado: ${endpoint}`,
      { status: res.status, endpoint, body: text },
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UniplayExternalError(
      `${label} retornou JSON inválido - ${previewBody(text)}. Endpoint testado: ${endpoint}`,
      { status: res.status, endpoint, body: text },
    );
  }
}

function uniplayHeaders(extra?: HeadersInit): HeadersInit {
  return {
    Accept: "application/json, text/plain, */*",
    Origin: "https://searchdefense.top",
    Referer: "https://searchdefense.top/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    ...extra,
  };
}

// Build phone/username variants (55 country code, 9th digit) like rush-renew does.
function buildUsernameVariants(raw: string): string[] {
  const base = String(raw || "").trim();
  const set = new Set<string>();
  if (!base) return [];
  set.add(base);
  const digits = base.replace(/\D/g, "");
  if (digits) {
    set.add(digits);
    if (digits.startsWith("55") && digits.length >= 12) {
      const wo = digits.slice(2);
      set.add(wo);
      if (wo.length === 11 && wo[2] === "9") {
        set.add(wo.slice(0, 2) + wo.slice(3));
        set.add("55" + wo.slice(0, 2) + wo.slice(3));
      } else if (wo.length === 10) {
        set.add(wo.slice(0, 2) + "9" + wo.slice(2));
        set.add("55" + wo.slice(0, 2) + "9" + wo.slice(2));
      }
    } else if (digits.length >= 10) {
      set.add("55" + digits);
    }
  }
  return [...set].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Proxy global (VPS com IP residencial). Evita bloqueio de IP de datacenter.
// Mesma infraestrutura usada pelo Sigma: SIGMA_PROXY_URL / SIGMA_PROXY_SECRET.
// ---------------------------------------------------------------------------
function proxyConfig(): { url: string; secret: string } | null {
  const u = String(Deno.env.get("SIGMA_PROXY_URL") || "").trim().replace(/\/+$/, "");
  const s = String(Deno.env.get("SIGMA_PROXY_SECRET") || "").trim();
  if (!u || !s) return null;
  return { url: /^https?:\/\//i.test(u) ? u : `https://${u}`, secret: s };
}

async function pfetch(url: string, init: RequestInit = {}): Promise<Response> {
  const proxy = proxyConfig();
  if (!proxy) return await fetch(url, init);

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((init.headers || {}) as Record<string, string>)) headers[k] = String(v);

  let relayed: Response;
  try {
    relayed = await fetch(proxy.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
      body: JSON.stringify({
        url,
        method: init.method || "GET",
        headers,
        body: typeof init.body === "string" ? init.body : undefined,
      }),
    });
  } catch (err) {
    // Se o proxy estiver fora do ar, tenta direto para não travar a renovação.
    console.warn("[Uniplay] proxy indisponível, tentando conexão direta:", err instanceof Error ? err.message : String(err));
    return await fetch(url, init);
  }

  const payload = await relayed.json().catch(() => null) as any;
  if (!relayed.ok || !payload || typeof payload.status !== "number" || payload.status === 0) {
    // status 0 = o navegador da VPS não conseguiu completar a chamada.
    console.warn("[Uniplay] proxy respondeu com erro/status 0, tentando conexão direta");
    return await fetch(url, init);
  }
  const text = String(payload.body ?? "");
  const contentType = String(payload.headers?.["content-type"] || (text.trim().startsWith("{") || text.trim().startsWith("[") ? "application/json" : "text/html"));
  return new Response(text, { status: payload.status, headers: { "content-type": contentType } });
}

// ---------------------------------------------------------------------------
// Fluxo completo dentro do navegador da VPS: login + busca + renovação.
// Roda a partir do próprio painel (searchdefense.top), então a API aceita a
// origem e o Cloudflare já está resolvido.
// ---------------------------------------------------------------------------
async function browserFullFlow(opts: {
  username: string;
  password: string;
  target?: string[];
  credits?: number;
  action?: string;
}): Promise<any> {
  const proxy = proxyConfig();
  if (!proxy) throw new UniplayExternalError("O proxy do painel não está configurado. Fale com o suporte do SuperGestor.");

  const js = `
    const done = arguments[arguments.length - 1];
    (async () => {
      const API = ${JSON.stringify(DEFAULT_BASE_URL)};
      const targets = ${JSON.stringify((opts.target || []).map((t) => String(t).toLowerCase().trim()))};
      const credits = ${JSON.stringify(Math.max(1, Number(opts.credits) || 1))};
      const onlyLogin = ${JSON.stringify(opts.action === "test")};
      const jf = async (path, init) => {
        const r = await fetch(API + path, Object.assign({ credentials: "omit" }, init || {}));
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch (e) {}
        return { status: r.status, json: j, text: t.slice(0, 500) };
      };
      try {
        const login = await jf("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json;charset=UTF-8" },
          body: JSON.stringify({ username: ${JSON.stringify(opts.username)}, password: ${JSON.stringify(opts.password)}, code: "" }),
        });
        const data = (login.json && (login.json.data || login.json)) || {};
        const token = data.access_token || data.token || "";
        if (!token) return done({ error: "login_sem_token", status: login.status, body: login.text });
        if (onlyLogin) return done({ ok: true, token: token, id: data.id || 0, username: data.username || "" });
        const auth = { Authorization: "Bearer " + token };
        const iptv = await jf("/api/users-iptv?reg_password=" + encodeURIComponent(data.crypt_pass || ""), { headers: auth });
        const p2p = await jf("/api/users-p2p", { headers: auth });
        const iptvList = Array.isArray(iptv.json) ? iptv.json : (iptv.json && iptv.json.data) || [];
        const p2pList = Array.isArray(p2p.json) ? p2p.json : (p2p.json && p2p.json.data) || [];
        const mI = iptvList.find((u) => targets.includes(String(u.username || "").toLowerCase().trim()));
        const mP = p2pList.find((u) => targets.includes(String(u.name || u.username || "").toLowerCase().trim()));
        if (!mI && !mP) return done({ error: "nao_encontrado", iptv_count: iptvList.length, p2p_count: p2pList.length });
        const results = [];
        for (const [kind, m] of [["iptv", mI], ["p2p", mP]]) {
          if (!m) continue;
          const r = await jf("/api/users-" + kind + "/" + m.id, {
            method: "PUT",
            headers: Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, auth),
            body: JSON.stringify({ action: 1, credits: credits }),
          });
          results.push({ kind: kind, id: m.id, status: r.status, ok: r.status >= 200 && r.status < 300, body: r.text });
        }
        done({ ok: results.some((r) => r.ok), token: token, results: results });
      } catch (e) {
        done({ error: String(e) });
      }
    })();
  `;

  const res = await fetch(proxy.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
    body: JSON.stringify({ browser: true, url: `https://${PANEL_HOST}/`, wait_ms: 2000, js }),
  }).catch((err) => {
    throw new UniplayExternalError(
      `Não foi possível falar com o proxy do painel. Verifique se a VPS está ligada. Detalhe: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  const payload = await res.json().catch(() => null) as any;
  if (!res.ok || !payload) {
    throw new UniplayExternalError(`Proxy respondeu HTTP ${res.status} ao abrir o painel Uniplay.`);
  }
  const out = payload.js_result;
  if (!out) {
    throw new UniplayExternalError("O agente da VPS está desatualizado (sem suporte a JS). Atualize o seleniumbase_agent.py.");
  }
  if (out.error === "login_sem_token") {
    throw new UniplayExternalError(`O Uniplay recusou o login (HTTP ${out.status}). Confira usuário e senha do painel.`);
  }
  if (out.error === "nao_encontrado") return out;
  if (out.error) throw new UniplayExternalError(`Falha no navegador do proxy: ${out.error}`);
  return out;
}


interface LoginResp {
  access_token: string;
  crypt_pass: string;
  id: number;
  username: string;
}

async function login(baseUrl: string, username: string, password: string): Promise<LoginResp> {
  const endpoint = `${baseUrl}/api/login`;
  const res = await pfetch(endpoint, {
    method: "POST",
    headers: uniplayHeaders({ "Content-Type": "application/json;charset=UTF-8" }),
    body: JSON.stringify({ username, password, code: "" }),
  });
  return await parseJsonResponse<LoginResp>(res, endpoint, "Login Uniplay");
}

async function loginWithFallback(
  preferredBaseUrl: string,
  username: string,
  password: string,
): Promise<{ session: LoginResp; apiBaseUrl: string }> {
  const candidates = [...new Set([preferredBaseUrl, DEFAULT_BASE_URL].map(normalizeApiBaseUrl))];
  const errors: string[] = [];

  for (const apiBaseUrl of candidates) {
    try {
      return { session: await login(apiBaseUrl, username, password), apiBaseUrl };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
    }
  }

  throw new UniplayExternalError(
    `Não foi possível conectar na API Uniplay. ${errors.join(" | ")}`,
  );
}

// Faz o login dentro de um navegador real na VPS (IP residencial) e captura o
// token que o painel guarda no navegador. Assim a conta fica logada sem extensão.
async function browserLoginUniplay(
  username: string,
  password: string,
): Promise<{ access_token: string; crypt_pass: string; id: number; username: string }> {
  const proxy = proxyConfig();
  if (!proxy) throw new UniplayExternalError("O proxy do painel não está configurado. Fale com o suporte do SuperGestor.");

  const res = await fetch(proxy.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
    body: JSON.stringify({
      browser: true,
      // O painel é uma SPA com rota em hash (#/login).
      url: `https://${PANEL_HOST}/#/login`,
      wait_ms: 12000,
      capture: "login|auth|token|signin",
      steps: [
        { selector: "input[name='username'], input[type='text'], #username", value: username, wait_ms: 800 },
        { selector: "input[name='password'], input[type='password'], #password", value: password, wait_ms: 800 },
        { selector: "button[type='submit'], .btn-login, form button, button", click: true, wait_ms: 12000 },
      ],
    }),

  }).catch((err) => {
    throw new UniplayExternalError(
      `Não foi possível falar com o proxy do painel. Verifique se a VPS do proxy está ligada. Detalhe: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  const payload = await res.json().catch(() => null) as any;
  if (!res.ok || !payload?.ok) {
    const msg = String(payload?.message || payload?.error || `HTTP ${res.status}`);
    if (payload?.error === "navegador_indisponivel") {
      throw new UniplayExternalError("O navegador do proxy não está instalado na VPS. Atualize o proxy para a versão 1.4.0.");
    }
    throw new UniplayExternalError(`Falha ao abrir o painel Uniplay no navegador do proxy: ${msg}`);
  }

  const storage = (payload.storage && typeof payload.storage === "object" ? payload.storage : {}) as Record<string, string>;
  let token = "";
  let cryptPass = "";
  let id = 0;
  let user = username;

  for (const raw of Object.values(storage)) {
    const value = String(raw ?? "");
    if (!token && /^ey[A-Za-z0-9_\-]+\./.test(value)) token = value;
    if (value.trim().startsWith("{")) {
      try {
        const obj = JSON.parse(value);
        token = token || String(obj.access_token || obj.token || "");
        cryptPass = cryptPass || String(obj.crypt_pass || "");
        id = id || Number(obj.id || 0);
        user = String(obj.username || user);
      } catch { /* ignora */ }
    }
  }

  // O painel pode não guardar nada no navegador: então lê o token direto da
  // resposta de login capturada pelo proxy.
  const captured: any[] = Array.isArray(payload.captured) ? payload.captured : [];
  if (!token) {
    for (const item of captured) {
      const raw = String(item?.body || "");
      if (!raw.trim().startsWith("{")) continue;
      try {
        const obj = JSON.parse(raw);
        const data = obj?.data && typeof obj.data === "object" ? obj.data : obj;
        const found = String(data.access_token || data.token || obj.access_token || obj.token || "");
        if (found) {
          token = found;
          cryptPass = cryptPass || String(data.crypt_pass || obj.crypt_pass || "");
          id = id || Number(data.id || obj.id || 0);
          user = String(data.username || obj.username || user);
          break;
        }
      } catch { /* ignora */ }
    }
  }

  if (!token) {

    const finalUrl = String(payload.final_url || "");
    const html = String(payload.html || "");
    const captchaStatus = String(payload?.captcha?.status || "sem_captcha");
    const keys = Object.keys(storage).slice(0, 12).join(", ") || "nenhuma";
    if (/captcha/i.test(html) || /solve_failed|need_key|unavailable|failed/i.test(captchaStatus)) {
      const captchaMessage = String(payload?.captcha?.message || "").trim();
      throw new UniplayExternalError(
        `O painel Uniplay pediu captcha e o proxy não conseguiu resolver (${captchaStatus}).${captchaMessage ? ` Detalhe: ${captchaMessage}` : " Verifique a chave e o saldo do 2Captcha na VPS."}`,
      );
    }
    const net = captured
      .map((c: any) => `${String(c?.url || "").slice(0, 90)} (${c?.status})`)
      .slice(0, 6)
      .join(" | ") || "nenhuma";
    throw new UniplayExternalError(
      `Login Uniplay não retornou o token. Página final: ${finalUrl || "desconhecida"}. Captcha: ${captchaStatus}. Chaves no navegador: ${keys}. Chamadas de login vistas: ${net}.`,
    );

  }

  return { access_token: token, crypt_pass: cryptPass, id, username: user };
}

async function listIptv(baseUrl: string, token: string, cryptPass: string): Promise<any[]> {
  const url = `${baseUrl}/api/users-iptv?reg_password=${encodeURIComponent(cryptPass)}`;
  const res = await pfetch(url, {
    headers: uniplayHeaders({ Authorization: `Bearer ${token}` }),
  });
  return await parseJsonResponse<any[]>(res, url, "Listagem IPTV Uniplay");
}

async function listP2p(baseUrl: string, token: string): Promise<any[]> {
  const endpoint = `${baseUrl}/api/users-p2p`;
  const res = await pfetch(endpoint, {
    headers: uniplayHeaders({ Authorization: `Bearer ${token}` }),
  });
  return await parseJsonResponse<any[]>(res, endpoint, "Listagem P2P Uniplay");
}

async function extend(
  baseUrl: string,
  token: string,
  kind: "iptv" | "p2p",
  id: number | string,
  credits: number,
): Promise<{ ok: boolean; body: string; status: number }> {
  const res = await pfetch(`${baseUrl}/api/users-${kind}/${id}`, {
    method: "PUT",
    headers: uniplayHeaders({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json;charset=UTF-8",
    }),
    body: JSON.stringify({ action: 1, credits }),
  });
  const body = await res.text();
  return { ok: res.ok, body, status: res.status };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const internalSecret = req.headers.get("x-cakto-webhook-secret");
    const configuredWebhookSecret = Deno.env.get("CAKTO_WEBHOOK_SECRET");
    const isInternalWebhookCall =
      !!configuredWebhookSecret && internalSecret === configuredWebhookSecret;

    let callerUserId: string | null = null;
    if (!isInternalWebhookCall) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error } = await sb.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      callerUserId = user.id;
    }

    const body = await req.json();
    const {
      username,
      months,
      customer_id,
      uniplay_username,
      uniplay_password,
      uniplay_base_url,
      action,
    } = body ?? {};

    // Load credentials from reseller_api_settings if not provided
    let uUser = uniplay_username || "";
    let uPass = uniplay_password || "";
    let uBase = normalizeApiBaseUrl(uniplay_base_url);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    if (!uUser && (customer_id || callerUserId)) {
      let ownerId = callerUserId;
      if (customer_id) {
        const { data: c } = await admin
          .from("customers")
          .select("created_by")
          .eq("id", customer_id)
          .maybeSingle();
        ownerId = c?.created_by || ownerId;
      }
      if (ownerId) {
        const { data: s } = await admin
          .from("reseller_api_settings")
          .select("uniplay_username, uniplay_password, uniplay_base_url")
          .eq("user_id", ownerId)
          .maybeSingle();
        if (s?.uniplay_username && s?.uniplay_password) {
          uUser = s.uniplay_username;
          uPass = s.uniplay_password;
          uBase = normalizeApiBaseUrl(s.uniplay_base_url);
        }
      }
    }

    if (!uUser || !uPass) {
      return new Response(
        JSON.stringify({
          error:
            "Credenciais do Uniplay não configuradas. Configure usuário e senha em API Externa.",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    console.log(`[Uniplay] Login as ${uUser} @ ${uBase}`);

    // Dono das credenciais (para salvar/reaproveitar a sessão).
    let sessionOwnerId: string | null = callerUserId;
    if (!sessionOwnerId && customer_id) {
      const { data: co } = await admin.from("customers").select("created_by").eq("id", customer_id).maybeSingle();
      sessionOwnerId = co?.created_by || null;
    }

    let session: LoginResp;
    try {
      const out = await loginWithFallback(uBase, uUser, uPass);
      session = out.session;
      uBase = out.apiBaseUrl;
    } catch (loginErr) {
      console.warn("[Uniplay] login por API falhou, tentando sessão salva/navegador:", loginErr instanceof Error ? loginErr.message : loginErr);

      let saved: any = null;
      if (sessionOwnerId) {
        const { data } = await admin
          .from("reseller_api_settings")
          .select("uniplay_session_token, uniplay_session_pass")
          .eq("user_id", sessionOwnerId)
          .maybeSingle();
        saved = data;
      }

      let candidate: LoginResp | null = saved?.uniplay_session_token
        ? {
          access_token: String(saved.uniplay_session_token),
          crypt_pass: String(saved.uniplay_session_pass || ""),
          id: 0,
          username: uUser,
        }
        : null;

      // Valida a sessão salva; se estiver vencida, refaz o login pelo navegador da VPS.
      let alive = false;
      if (candidate) {
        alive = await listP2p(uBase, candidate.access_token).then(() => true).catch(() => false);
      }

      if (!alive) {
        // Último recurso: faz login + busca + renovação dentro do navegador da VPS.
        const flow = await browserFullFlow({
          username: uUser,
          password: uPass,
          target: username ? buildUsernameVariants(username) : [],
          credits: Math.max(1, Number(months) || 1),
          action,
        });

        if (flow?.token && sessionOwnerId) {
          await admin
            .from("reseller_api_settings")
            .update({
              uniplay_session_token: flow.token,
              uniplay_session_at: new Date().toISOString(),
            })
            .eq("user_id", sessionOwnerId);
        }

        if (action === "test") {
          return new Response(
            JSON.stringify({ success: true, via: "navegador", message: "Login Uniplay OK (via navegador da VPS)" }),
            { headers: jsonHeaders },
          );
        }

        if (flow?.error === "nao_encontrado") {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Username "${username}" não encontrado em IPTV nem P2P`,
            }),
            { headers: jsonHeaders },
          );
        }

        if (!flow?.ok) {
          return new Response(
            JSON.stringify({ success: false, error: "Todas as renovações Uniplay falharam", results: flow?.results }),
            { headers: jsonHeaders },
          );
        }

        if (customer_id) {
          await admin.rpc("renew_customer_due_date", {
            _customer_id: customer_id,
            _months: Math.max(1, Number(months) || 1),
          }).catch?.(() => {});
        }

        return new Response(
          JSON.stringify({ success: true, via: "navegador", results: flow.results }),
          { headers: jsonHeaders },
        );
      }

      session = candidate!;
    }


    if (action === "test") {
      return new Response(
        JSON.stringify({
          success: true,
          id: session.id,
          username: session.username,
          apiBaseUrl: uBase,
          message: "Login Uniplay OK",
        }),
        { headers: jsonHeaders },
      );
    }

    if (!username) {
      return new Response(JSON.stringify({ error: "Username é obrigatório" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const credits = Math.max(1, Number(months) || 1);
    const candidates = buildUsernameVariants(username);
    const norms = candidates.map((c) => c.toLowerCase().trim());
    console.log(`[Uniplay] Procurando "${username}" (variantes: ${candidates.join(", ")})`);

    // Fetch both lists in parallel
    const [iptvResult, p2pResult] = await Promise.allSettled([
      listIptv(uBase, session.access_token, session.crypt_pass),
      listP2p(uBase, session.access_token),
    ]);

    const listErrors: string[] = [];
    const iptvList = iptvResult.status === "fulfilled" ? iptvResult.value : [];
    const p2pList = p2pResult.status === "fulfilled" ? p2pResult.value : [];
    if (iptvResult.status === "rejected") {
      const msg = iptvResult.reason instanceof Error ? iptvResult.reason.message : String(iptvResult.reason);
      console.error("[Uniplay] iptv list err", msg);
      listErrors.push(msg);
    }
    if (p2pResult.status === "rejected") {
      const msg = p2pResult.reason instanceof Error ? p2pResult.reason.message : String(p2pResult.reason);
      console.error("[Uniplay] p2p list err", msg);
      listErrors.push(msg);
    }

    if (listErrors.length === 2) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Login Uniplay OK, mas não foi possível listar IPTV/P2P: ${listErrors.join(" | ")}`,
        }),
        { headers: jsonHeaders },
      );
    }

    const matchIptv = iptvList.find((u: any) => {
      const un = String(u?.username || "").toLowerCase().trim();
      return norms.includes(un);
    });
    const matchP2p = p2pList.find((u: any) => {
      const un = String(u?.name || "").toLowerCase().trim();
      return norms.includes(un);
    });

    if (!matchIptv && !matchP2p) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Username "${username}" não encontrado em IPTV nem P2P`,
          tried: candidates,
          list_errors: listErrors,
        }),
        { headers: jsonHeaders },
      );
    }

    const results: Array<{ kind: string; ok: boolean; body: string; status: number }> = [];
    if (matchIptv) {
      console.log(`[Uniplay] Renovando IPTV id=${matchIptv.id} credits=${credits}`);
      const r = await extend(uBase, session.access_token, "iptv", matchIptv.id, credits);
      results.push({ kind: "iptv", ...r });
    }
    if (matchP2p) {
      console.log(`[Uniplay] Renovando P2P id=${matchP2p.id} credits=${credits}`);
      const r = await extend(uBase, session.access_token, "p2p", matchP2p.id, credits);
      results.push({ kind: "p2p", ...r });
    }

    const anyOk = results.some((r) => r.ok);
    if (!anyOk) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Todas as renovações Uniplay falharam",
          results,
        }),
        { headers: jsonHeaders },
      );
    }

    // Credit deduction (once, based on credits used) — mirror rush-renew behavior
    if (customer_id) {
      const { data: c } = await admin
        .from("customers")
        .select("created_by, screens")
        .eq("id", customer_id)
        .maybeSingle();
      if (c?.created_by) {
        const extraScreens = Math.max(0, (Number(c?.screens) || 1) - 1);
        const creditsToDeduct = credits + extraScreens * 0.5 * credits;
        const { data: acc } = await admin
          .from("reseller_access")
          .select("id, credits")
          .eq("user_id", c.created_by)
          .maybeSingle();
        if (acc && (acc.credits ?? 0) >= creditsToDeduct) {
          await admin
            .from("reseller_access")
            .update({ credits: acc.credits - creditsToDeduct })
            .eq("id", acc.id);
        }
      }

    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Renovado no Uniplay (${results
          .filter((r) => r.ok)
          .map((r) => r.kind.toUpperCase())
          .join(" + ")}) por ${credits} mês(es)`,
        renewed_in: results.filter((r) => r.ok).map((r) => r.kind),
        results,
      }),
      { headers: jsonHeaders },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[Uniplay] Erro:", err);
    return new Response(JSON.stringify({ success: false, error: `Erro Uniplay: ${msg}` }), {
      headers: jsonHeaders,
    });
  }
});
