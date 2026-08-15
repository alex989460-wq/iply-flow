// Consulta, por servidor, os dados reais do painel externo:
//   - créditos disponíveis
//   - conexões realmente online (clientes assistindo agora)
//
// Ação:
//   { action: "stats", server_ids?: string[] }
//   { action: "probe", connection_id, path }   -> diagnóstico (Sigma)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import mysql from "npm:mysql2@3.9.7/promise";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const browserHeaders: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
  locale: "pt",
  "x-app-version": "3.89",
};

function normBase(u: unknown) {
  let s = String(u || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/api$/i, "");
}

type Proxy = { url: string; secret: string } | null;
function buildProxy(url?: string | null, secret?: string | null): Proxy {
  const u = String(url || Deno.env.get("SIGMA_PROXY_URL") || "").trim().replace(/\/+$/, "");
  const s = String(secret || Deno.env.get("SIGMA_PROXY_SECRET") || "").trim();
  if (!u || !s) return null;
  return { url: /^https?:\/\//i.test(u) ? u : `https://${u}`, secret: s };
}

async function relay(target: string, init: RequestInit, proxy: Proxy) {
  if (!proxy) {
    const res = await fetch(target, init);
    return { ok: res.ok, status: res.status, text: await res.text() };
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((init.headers || {}) as Record<string, string>)) headers[k] = String(v);
  const res = await fetch(proxy.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sigma-proxy-secret": proxy.secret },
    body: JSON.stringify({
      url: target,
      method: init.method || "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
    }),
  });
  const payload = await res.json().catch(() => null) as any;
  if (!res.ok || !payload || typeof payload.status !== "number") {
    throw new Error(`O proxy respondeu com erro: ${payload?.message || payload?.error || `HTTP ${res.status}`}`);
  }
  return { ok: payload.status >= 200 && payload.status < 300, status: payload.status, text: String(payload.body ?? "") };
}

async function sigmaLogin(base: string, username: string, password: string, proxy: Proxy) {
  const res = await relay(`${base}/api/auth/login`, {
    method: "POST",
    headers: { ...browserHeaders, "Content-Type": "application/json", Origin: base, Referer: `${base}/` },
    body: JSON.stringify({
      username,
      password,
      captcha: "not-a-robot",
      captchaChecked: true,
      twofactor_code: "",
      twofactor_recovery_code: "",
      twofactor_trusted_device_id: "",
    }),
  }, proxy);
  let body: any = {};
  try { body = res.text ? JSON.parse(res.text) : {}; } catch { body = {}; }
  if (!res.ok || !body?.token) {
    throw new Error(body?.message || `Painel Sigma recusou o login (HTTP ${res.status}).`);
  }
  return { token: String(body.token), me: body };
}

async function sigmaGet(base: string, token: string, path: string, proxy: Proxy) {
  const res = await relay(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...browserHeaders, "Content-Type": "application/json" },
  }, proxy);
  let body: any = null;
  try { body = res.text ? JSON.parse(res.text) : null; } catch { body = { raw: String(res.text || "").slice(0, 400) }; }
  return { ok: res.ok, status: res.status, body };
}

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = Number(v);
    if (v !== null && v !== undefined && v !== "" && Number.isFinite(n)) return n;
  }
  return null;
}

// Conta as conexões online no Sigma. Tenta os formatos conhecidos da API e,
// se nenhum responder, varre a lista de clientes contando quem está online.
async function sigmaOnline(base: string, token: string, proxy: Proxy): Promise<number | null> {
  const candidates = [
    "/api/dashboard",
    "/api/dashboard/statistics",
    "/api/statistics",
    "/api/connections?page=1&per_page=1",
    "/api/customers/online?page=1&per_page=1",
  ];
  for (const path of candidates) {
    try {
      const r = await sigmaGet(base, token, path, proxy);
      if (!r.ok || !r.body) continue;
      const b: any = r.body;
      const d = b?.data ?? b;
      const n = pickNumber(
        d?.online_connections, d?.onlineConnections, d?.connections_online,
        d?.online_customers, d?.customers_online, d?.online,
        b?.meta?.total, b?.total,
      );
      if (n !== null) return n;
    } catch { /* tenta o próximo */ }
  }
  // Fallback: varre a lista de clientes (máx. 10 páginas de 100).
  try {
    let online = 0;
    for (let page = 1; page <= 10; page++) {
      const r = await sigmaGet(base, token, `/api/customers?page=${page}&per_page=100`, proxy);
      const list = Array.isArray(r.body?.data) ? r.body.data : [];
      if (!list.length) break;
      for (const c of list) {
        const flag = c?.online ?? c?.is_online ?? c?.status_online ?? c?.connections_online;
        if (flag === true || String(flag).toUpperCase() === "YES" || Number(flag) > 0) online++;
      }
      if (list.length < 100) break;
    }
    return online;
  } catch {
    return null;
  }
}

// ---- kOffice / P2Cine ----
async function kofficeLogin(base: string, username: string, apiKey: string) {
  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { ...browserHeaders, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, api_key: apiKey }).toString(),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* html */ }
  if (!parsed || String(parsed.result || "").toLowerCase() === "failed") {
    throw new Error(String(parsed?.error_message || parsed?.error_code || `o painel respondeu HTTP ${res.status}`));
  }
  const token = String(parsed.token || parsed.access_token || parsed.data?.token || "").trim();
  if (!token) throw new Error("o painel autenticou mas não devolveu o token da API");
  return { token, uid: String(parsed.uid ?? "") };
}

async function kofficeCall(base: string, token: string, action: string) {
  const res = await fetch(`${base}/api/${action}?${new URLSearchParams({ token })}`, {
    headers: { ...browserHeaders, Accept: "application/json" },
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* html */ }
  if (!parsed) throw new Error(`o painel respondeu HTTP ${res.status} sem JSON em "${action}"`);
  if (String(parsed.result || "").toLowerCase() === "failed") {
    throw new Error(String(parsed?.error_message || parsed?.error_code || "chamada recusada"));
  }
  return parsed;
}

// Detecta o painel do servidor (mesma regra do frontend).
const VALID = ["natv", "natv2", "vplay", "rush", "thebest", "uniplay", "p2cine", "koffice", "sigma", "none"];
function resolvePanel(server: any): string | null {
  const manual = String(server?.panel_type || "").trim().toLowerCase();
  if (manual && manual !== "auto" && VALID.includes(manual)) return manual === "koffice" ? "p2cine" : manual;
  const sn = String(server?.server_name || "").toLowerCase();
  const sh = String(server?.host || "").toLowerCase();
  const hay = `${sn} ${sh}`;
  if (sn.includes("natv²") || sn.includes("natv2") || sh.includes("natv2")) return "natv2";
  if (sn.includes("best") || sh.includes("best")) return "thebest";
  if (sn.includes("natv") || sh.includes("pixbot") || sh.includes("natv")) return "natv";
  if (sn.includes("vplay") || sh.includes("vplay")) return "vplay";
  if (sn.includes("rush") || sh.includes("rush")) return "rush";
  if (hay.includes("uniplay") || hay.includes("searchdefense") || hay.includes("gesapioffice")) return "uniplay";
  if (hay.includes("p2cine") || hay.includes("daily3") || hay.includes("painelacesso") || /\bp2c\b/.test(hay)) return "p2cine";
  return null;
}

function hostMatch(a?: string | null, b?: string | null) {
  try {
    const ha = new URL(normBase(a)).hostname.toLowerCase().replace(/^www\./, "");
    const hb = new URL(normBase(b)).hostname.toLowerCase().replace(/^www\./, "");
    return !!ha && ha === hb;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const ownerId = userData?.user?.id;
    if (!ownerId) return json({ error: "Não autorizado" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || "stats");

    // ---- credenciais do revendedor ----
    const [{ data: cfg }, { data: sigmaConns }, { data: kofficeConns }] = await Promise.all([
      admin.from("reseller_api_settings")
        .select("sigma_base_url, sigma_username, sigma_password, sigma_proxy_url, sigma_proxy_secret, p2cine_base_url, p2cine_username, p2cine_api_key, vplay_mysql_host, vplay_mysql_port, vplay_mysql_user, vplay_mysql_password, vplay_mysql_database, vplay_panel_username, natv_api_key, natv_base_url, natv2_api_key, natv2_base_url")
        .eq("user_id", ownerId).maybeSingle(),
      admin.from("sigma_panel_connections").select("id, base_url, username, password, proxy_url, proxy_secret")
        .eq("user_id", ownerId).eq("is_active", true).order("created_at"),
      admin.from("koffice_panel_connections").select("id, base_url, username, api_key")
        .eq("user_id", ownerId).eq("is_active", true).order("created_at"),
    ]);

    const sigmaList = (sigmaConns || []) as any[];
    const kofficeList = (kofficeConns || []) as any[];

    if (action !== "stats") return json({ error: `Ação não suportada: ${action}` }, 400);


    const ids: string[] = Array.isArray(body?.server_ids) ? body.server_ids.map(String) : [];
    let query = admin.from("servers").select("id, server_name, host, panel_type, sigma_connection_id, koffice_connection_id").eq("created_by", ownerId);
    if (ids.length) query = query.in("id", ids);
    const { data: servers } = await query;

    const results: Record<string, { panel: string | null; credits: number | null; online: number | null; error?: string }> = {};

    // Cache por conexão para não logar duas vezes no mesmo painel.
    const sigmaCache = new Map<string, Promise<{ credits: number | null; online: number | null }>>();
    const kofficeCache = new Map<string, Promise<{ credits: number | null; online: number | null }>>();
    let vplayPromise: Promise<{ credits: number | null; online: number | null }> | null = null;

    const sigmaStats = (conn: any) => {
      const key = String(conn.id || conn.base_url);
      if (!sigmaCache.has(key)) {
        sigmaCache.set(key, (async () => {
          const base = normBase(conn.base_url);
          const proxy = buildProxy(conn.proxy_url, conn.proxy_secret);
          const { token, me } = await sigmaLogin(base, conn.username, conn.password, proxy);
          const credits = pickNumber(me?.credits, me?.data?.credits, me?.user?.credits);
          const online = await sigmaOnline(base, token, proxy);
          return { credits, online };
        })());
      }
      return sigmaCache.get(key)!;
    };

    const kofficeStats = (conn: any) => {
      const key = String(conn.id || conn.base_url);
      if (!kofficeCache.has(key)) {
        kofficeCache.set(key, (async () => {
          const base = normBase(conn.base_url);
          const { token } = await kofficeLogin(base, conn.username, conn.api_key);
          let credits: number | null = null;
          try {
            const info = await kofficeCall(base, token, "get_credits");
            credits = pickNumber(info?.credits, info?.data?.credits, info?.saldo);
          } catch { /* opcional */ }
          let online: number | null = null;
          try {
            const info = await kofficeCall(base, token, "get_online");
            online = pickNumber(info?.online, info?.total, info?.data?.online, Array.isArray(info?.data) ? info.data.length : null);
          } catch { /* opcional */ }
          return { credits, online };
        })());
      }
      return kofficeCache.get(key)!;
    };

    const vplayStats = () => {
      if (!vplayPromise) {
        vplayPromise = (async () => {
          const host = String((cfg as any)?.vplay_mysql_host || "").trim();
          const user = String((cfg as any)?.vplay_mysql_user || "").trim();
          const password = String((cfg as any)?.vplay_mysql_password || "");
          const database = String((cfg as any)?.vplay_mysql_database || "").trim();
          const panelUser = String((cfg as any)?.vplay_panel_username || "").trim();
          if (!host || !user || !password || !database) {
            throw new Error("Credenciais MySQL do VPlay não configuradas em Configurações → APIs.");
          }
          const conn = await mysql.createConnection({
            host, user, password, database,
            port: Number((cfg as any)?.vplay_mysql_port) || 3306,
            connectTimeout: 10000,
          });
          try {
            let credits: number | null = null;
            if (panelUser) {
              const [rows]: any = await conn.query(
                "SELECT credits FROM users WHERE username = ? LIMIT 1", [panelUser],
              ).catch(() => [[]]);
              credits = pickNumber(rows?.[0]?.credits);
            }
            let online: number | null = null;
            const [act]: any = await conn.query("SELECT COUNT(*) AS c FROM user_activity_now").catch(() => [null]);
            if (act) online = pickNumber(act?.[0]?.c);
            return { credits, online };
          } finally {
            await conn.end().catch(() => {});
          }
        })();
      }
      return vplayPromise;
    };

    await Promise.all((servers || []).map(async (server: any) => {
      const panel = resolvePanel(server);
      const entry: { panel: string | null; credits: number | null; online: number | null; error?: string } = {
        panel, credits: null, online: null,
      };
      results[server.id] = entry;
      if (!panel || panel === "none") return;

      try {
        if (panel === "sigma") {
          const conn =
            sigmaList.find((c) => c.id === server.sigma_connection_id) ||
            sigmaList.find((c) => hostMatch(c.base_url, server.host)) ||
            (cfg && (cfg as any).sigma_base_url
              ? { id: "settings", base_url: (cfg as any).sigma_base_url, username: (cfg as any).sigma_username, password: (cfg as any).sigma_password, proxy_url: (cfg as any).sigma_proxy_url, proxy_secret: (cfg as any).sigma_proxy_secret }
              : null) ||
            (sigmaList.length === 1 ? sigmaList[0] : null);
          if (!conn) throw new Error("Nenhuma conexão Sigma vinculada a este servidor.");
          Object.assign(entry, await sigmaStats(conn));
        } else if (panel === "p2cine") {
          const conn =
            kofficeList.find((c) => c.id === server.koffice_connection_id) ||
            kofficeList.find((c) => hostMatch(c.base_url, server.host)) ||
            ((cfg as any)?.p2cine_api_key
              ? { id: "settings", base_url: (cfg as any).p2cine_base_url, username: (cfg as any).p2cine_username, api_key: (cfg as any).p2cine_api_key }
              : null) ||
            (kofficeList.length === 1 ? kofficeList[0] : null);
          if (!conn) throw new Error("Nenhuma conexão kOffice vinculada a este servidor.");
          Object.assign(entry, await kofficeStats(conn));
        } else if (panel === "vplay") {
          Object.assign(entry, await vplayStats());
        }
      } catch (e) {
        entry.error = e instanceof Error ? e.message : String(e);
      }
    }));

    // Guarda o último resultado para a tela abrir instantânea na próxima vez.
    const rows = Object.entries(results).map(([server_id, r]) => ({
      user_id: ownerId,
      server_id,
      panel: r.panel,
      credits: r.credits,
      online: r.online,
      error: r.error ?? null,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await admin.from("panel_stats_cache").upsert(rows, { onConflict: "user_id,server_id" });
    }

    return json({ ok: true, stats: results });

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
