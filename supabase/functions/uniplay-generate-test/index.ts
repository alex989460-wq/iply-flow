// Gera usuário de TESTE no painel Uniplay.
// O painel (searchdefense.top) cria testes usando o mesmo endpoint de criação
// de usuário da API (gesapioffice.com), enviando o campo `test_hours`.
//   IPTV: POST /api/users-iptv  { isOficial, package, credits, isCustomPackage, nota, test_hours }
//   P2P : POST /api/users-p2p   { isOficial, productid, credits, nota, test_hours }
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const DEFAULT_BASE_URL = "https://gesapioffice.com";
const PANEL_HOST = "searchdefense.top";
const ALLOWED_HOURS = [1, 2, 3, 6];
const REQUEST_TIMEOUT_MS = 35_000;

const BodySchema = z.object({
  hours: z.coerce.number().int().refine((value) => ALLOWED_HOURS.includes(value)).default(6),
  kind: z.enum(["iptv", "p2p"]).default("iptv"),
  note: z.string().trim().max(60).optional(),
  package: z.union([z.string(), z.number()]).optional(),
  productid: z.union([z.string(), z.number()]).optional(),
});

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

// O painel bloqueia IPs de datacenter: as chamadas passam pelo relay brasileiro.
async function pfetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  const proxy = proxyConfig();
  if (!proxy) return await fetchWithTimeout(url, init as RequestInit);
  try {
    const relayed = await fetchWithTimeout(proxy.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
      body: JSON.stringify({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body }),
    });
    const payload = await relayed.json().catch(() => null) as any;
    if (!relayed.ok || !payload || typeof payload.status !== "number" || payload.status === 0) {
      return await fetchWithTimeout(url, init as RequestInit);
    }
    const text = String(payload.body ?? "");
    const contentType = String(
      payload.headers?.["content-type"] ||
        (text.trim().startsWith("{") || text.trim().startsWith("[") ? "application/json" : "text/html"),
    );
    return new Response(text, { status: payload.status, headers: { "content-type": contentType } });
  } catch {
    return await fetchWithTimeout(url, init as RequestInit);
  }
}

function buildResult(result: any, hours: number) {
  const expTxt = result?.exp_date
    ? new Date(result.exp_date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : `${hours}h`;
  const m3u = String(result?.M3U8 || result?.m3u || "");
  const hls = String(result?.M3U8_2 || result?.SSIPTV_M3U8 || result?.hls || "");
  const dns = String(result?.DNS_SMARTER || result?.dns || "");
  const username = String(result?.username || result?.name || "");
  const password = String(result?.password || "");
  const message =
    `🎬 *TESTE GERADO*\n\n` +
    `👤 Usuário: ${username}\n` +
    `🔑 Senha: ${password}\n` +
    (dns ? `🌐 Servidor: ${dns}\n` : "") +
    `⏰ Expira: ${expTxt}\n\n` +
    (m3u ? `*Link (M3U)* 👉 ${m3u}\n\n` : "") +
    (hls ? `*Link (HLS)* 👉 ${hls}` : "");
  return { success: true, message, m3u, hls, dns, user: result };
}

async function browserGenerateTest(opts: {
  username: string;
  password: string;
  hours: number;
  kind: "iptv" | "p2p";
  note: string;
  packageId: string;
  productId: string;
}): Promise<any> {
  const proxy = proxyConfig();
  if (!proxy) throw new Error("O acesso protegido do Uniplay não está configurado.");

  const js = `
    const done = arguments[arguments.length - 1];
    (async () => {
      const USER = ${JSON.stringify(opts.username)};
      const PASS = ${JSON.stringify(opts.password)};
      const kind = ${JSON.stringify(opts.kind)};
      const payload = ${JSON.stringify(opts.kind === "p2p"
        ? { isOficial: false, productid: opts.productId, credits: 1, nota: opts.note, test_hours: opts.hours }
        : { isOficial: false, package: opts.packageId, credits: 1, isCustomPackage: false, nota: opts.note, test_hours: opts.hours })};
      const bases = ["", ${JSON.stringify(DEFAULT_BASE_URL)}];
      const request = async (base, path, init) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(base + path, Object.assign({ credentials: "include", signal: controller.signal }, init || {}));
          const text = await response.text();
          let json = null; try { json = JSON.parse(text); } catch (_) {}
          return { status: response.status, ok: response.ok, json, text: text.slice(0, 500) };
        } finally { clearTimeout(timer); }
      };
      const readToken = () => {
        for (const store of [window.localStorage, window.sessionStorage]) {
          for (let index = 0; index < store.length; index++) {
            const raw = String(store.getItem(store.key(index)) || "");
            if (/^ey[A-Za-z0-9_\\-]+\\./.test(raw)) return raw;
            if (raw.trim().startsWith("{")) {
              try {
                const parsed = JSON.parse(raw);
                const data = parsed && parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
                if (data.access_token || data.token) return String(data.access_token || data.token);
              } catch (_) {}
            }
          }
        }
        return "";
      };
      try {
        let token = readToken();
        let apiBase = "";
        if (!token) {
          for (const base of bases) {
            for (const path of ["/api/login", "/api/auth/login", "/api/reseller/login"]) {
              const login = await request(base, path, {
                method: "POST",
                headers: { "Content-Type": "application/json;charset=UTF-8" },
                body: JSON.stringify({ username: USER, password: PASS, code: "" }),
              });
              const data = login.json && (login.json.data || login.json);
              token = String((data && (data.access_token || data.token)) || "");
              if (token) { apiBase = base; break; }
            }
            if (token) break;
          }
        }
        if (!token) return done({ success: false, error: "O painel não liberou a sessão de acesso." });
        for (const base of [...new Set([apiBase, ...bases])]) {
          const created = await request(base, "/api/users-" + kind, {
            method: "POST",
            headers: { "Content-Type": "application/json;charset=UTF-8", Authorization: "Bearer " + token },
            body: JSON.stringify(payload),
          });
          const data = created.json && (created.json.data || created.json);
          if (created.ok && data && (data.username || data.name)) return done({ success: true, result: data });
        }
        done({ success: false, error: "O painel recusou a criação do teste." });
      } catch (error) { done({ success: false, error: String(error) }); }
    })();
  `;

  const response = await fetchWithTimeout(proxy.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
    body: JSON.stringify({
      browser: true,
      url: `https://${PANEL_HOST}/#/login`,
      wait_ms: 8_000,
      force_captcha: true,
      capture: "login|auth|token|signin",
      steps: [
        { selector: "input[name='username'], input[type='text'], #username", value: opts.username, wait_ms: 500 },
        { selector: "input[name='password'], input[type='password'], #password", value: opts.password, wait_ms: 500 },
        { selector: "button[type='submit'], .btn-login, form button, button", click: true, wait_ms: 8_000 },
      ],
      js,
    }),
  }, 45_000);
  const payload = await response.json().catch(() => null) as any;
  const result = payload?.js_result;
  if (!response.ok || !result?.success || !result?.result) {
    throw new Error(String(result?.error || payload?.message || payload?.error || `Acesso protegido respondeu ${response.status}`));
  }
  return result.result;
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

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ success: false, error: "Dados inválidos para gerar o teste." }), { status: 200, headers: jsonHeaders });
    }
    const body = parsed.data;
    const hours = body.hours;
    const kind = body.kind;
    const note = body.note || "Teste SuperGestor";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: settings } = await admin
      .from("reseller_api_settings")
      .select("uniplay_username, uniplay_password, uniplay_base_url, uniplay_session_token")
      .eq("user_id", user.id)
      .maybeSingle();

    const uUser = String(settings?.uniplay_username || "").trim();
    const uPass = String(settings?.uniplay_password || "").trim();
    const baseUrl = normalizeApiBaseUrl(settings?.uniplay_base_url);

    if (!uUser || !uPass) {
      return new Response(
        JSON.stringify({ success: false, error: "Configure usuário e senha do Uniplay em Configurações > APIs Externas." }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // Primeiro reaproveita a sessão salva pelas renovações; evita um novo login lento.
    let token = String(settings?.uniplay_session_token || "");
    if (!token) {
      const loginRes = await pfetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: uniplayHeaders({ "Content-Type": "application/json;charset=UTF-8" }),
        body: JSON.stringify({ username: uUser, password: uPass, code: "" }),
      });
      const loginText = await loginRes.text();
      let loginJson: any = null;
      try { loginJson = JSON.parse(loginText); } catch { /* ignore */ }
      token = String(loginJson?.access_token || loginJson?.token || "");
    }

    const payload = kind === "p2p"
      ? { isOficial: false, productid: String(body.productid || "1"), credits: 1, nota: note, test_hours: hours }
      : { isOficial: false, package: String(body.package || "1"), credits: 1, isCustomPackage: false, nota: note, test_hours: hours };

    let result: any = null;
    if (token) {
      try {
        const createRes = await pfetch(`${baseUrl}/api/users-${kind}`, {
          method: "POST",
          headers: uniplayHeaders({ "Content-Type": "application/json;charset=UTF-8", Authorization: `Bearer ${token}` }),
          body: JSON.stringify(payload),
        });
        const createText = await createRes.text();
        try { result = JSON.parse(createText); } catch { /* browser fallback below */ }
        result = result?.data || result;
        if (!createRes.ok || !(result?.username || result?.name)) result = null;
      } catch { /* browser fallback below */ }
    }

    if (!result) {
      result = await browserGenerateTest({
        username: uUser,
        password: uPass,
        hours,
        kind,
        note,
        packageId: String(body.package || "1"),
        productId: String(body.productid || "1"),
      });
    }

    return new Response(JSON.stringify(buildResult(result, hours)), { headers: jsonHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[uniplay-generate-test]", err);
    const friendly = /AbortError|aborted/i.test(msg)
      ? "O painel Uniplay demorou demais para responder. Tente novamente em alguns segundos."
      : msg;
    return new Response(JSON.stringify({ success: false, error: friendly }), { status: 200, headers: jsonHeaders });
  }
});
