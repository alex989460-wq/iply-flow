// Consulta, por servidor, os dados reais do painel externo:
//   - créditos disponíveis
//   - conexões realmente online (clientes assistindo agora)
//
// Ação:
//   { action: "stats", server_ids?: string[] }
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

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = Number(v);
    if (v !== null && v !== undefined && v !== "" && Number.isFinite(n)) return n;
  }
  return null;
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
const VALID = ["natv", "natv2", "vplay", "rush", "thebest", "uniplay", "p2cine", "koffice", "none"];
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
    const { data: cfg } = await admin.from("reseller_api_settings")
        .select("*")
        .eq("user_id", ownerId).maybeSingle();

    const { data: kofficeConns } = await admin.from("koffice_panel_connections")
        .select("id, base_url, username, api_key")
        .eq("user_id", ownerId).eq("is_active", true).order("created_at");

    const kofficeList = (kofficeConns || []) as any[];

    if (action !== "stats") return json({ error: `Ação não suportada: ${action}` }, 400);

    const ids: string[] = Array.isArray(body?.server_ids) ? body.server_ids.map(String) : [];
    let query = admin.from("servers").select("id, server_name, host, panel_type, koffice_connection_id").eq("created_by", ownerId);
    if (ids.length) query = query.in("id", ids);
    const { data: servers } = await query;

    const results: Record<string, { panel: string | null; credits: number | null; online: number | null; error?: string }> = {};

    // Cache por conexão para não logar duas vezes no mesmo painel.
    const kofficeCache = new Map<string, Promise<{ credits: number | null; online: number | null }>>();
    let vplayPromise: Promise<{ credits: number | null; online: number | null }> | null = null;

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

    // ---- NATV / NATV² : créditos do revendedor via API ----
    const natvCache = new Map<string, Promise<{ credits: number | null; online: number | null }>>();
    const natvStats = (kind: "natv" | "natv2") => {
      if (!natvCache.has(kind)) {
        natvCache.set(kind, (async () => {
          const apiKey = String((cfg as any)?.[`${kind}_api_key`] || "").trim();
          const baseRaw = String((cfg as any)?.[`${kind}_base_url`] || "").trim();
          if (!apiKey || !baseRaw) {
            throw new Error(`Credenciais do ${kind.toUpperCase()} não configuradas em Configurações → APIs.`);
          }
          const root = normBase(baseRaw).replace(/\/api$/i, "");
          const bases = [root, `${root}/api`];
          let lastErr = "";
          for (const b of bases) {
            for (const p of ["/report/actionlog", "/report/extrato"]) {
              try {
                const res = await fetch(`${b}${p}`, {
                  headers: { ...browserHeaders, Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
                });
                const text = await res.text();
                if (!res.ok) {
                  if (res.status === 429) {
                    lastErr = "o painel limita 1 consulta por minuto — tente de novo em instantes";
                  } else {
                    let msg = "";
                    try { msg = String(JSON.parse(text)?.detail || ""); } catch { /* ignore */ }
                    lastErr = `HTTP ${res.status}${msg ? ` (${msg})` : ""} em ${p}`;
                  }
                  continue;
                }
                let body: any = null;
                try { body = JSON.parse(text); } catch { continue; }
                const list = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
                for (const item of list) {
                  const credits = pickNumber(item?.b, item?.balance, item?.saldo, item?.credits);
                  if (credits !== null) return { credits, online: null };
                }
                lastErr = `o painel não devolveu saldo em ${p}`;
              } catch (e) {
                lastErr = e instanceof Error ? e.message : String(e);
              }
            }
          }
          throw new Error(`Não foi possível ler os créditos do ${kind.toUpperCase()} (${lastErr || "sem resposta"}).`);
        })());
      }
      return natvCache.get(kind)!;
    };

    const vplayStats = () => {
      if (!vplayPromise) {
        vplayPromise = (async () => {
          const host = String((cfg as any)?.vplay_mysql_host || Deno.env.get("VPLAY_MYSQL_HOST") || "").trim();
          const user = String((cfg as any)?.vplay_mysql_user || Deno.env.get("VPLAY_MYSQL_USER") || "").trim();
          const password = String((cfg as any)?.vplay_mysql_password || Deno.env.get("VPLAY_MYSQL_PASSWORD") || "");
          const database = String((cfg as any)?.vplay_mysql_database || Deno.env.get("VPLAY_MYSQL_DATABASE") || "").trim();
          const panelUser = String((cfg as any)?.vplay_panel_username || Deno.env.get("VPLAY_PANEL_USERNAME") || "").trim();
          if (!host || !user || !password || !database) {
            throw new Error(
              "O VPlay só informa créditos pela conexão MySQL. Preencha host, usuário, senha, banco e o usuário do painel em Configurações → APIs → VPlay.",
            );
          }
          if (!panelUser) {
            throw new Error("Informe o 'usuário do painel VPlay' em Configurações → APIs para eu localizar o saldo de créditos.");
          }
          const conn = await mysql.createConnection({
            host, user, password, database,
            port: Number((cfg as any)?.vplay_mysql_port || Deno.env.get("VPLAY_MYSQL_PORT")) || 3306,
            connectTimeout: 10000,
          });
          try {
            let credits: number | null = null;
            for (const sql of [
              "SELECT credits FROM users WHERE username = ? LIMIT 1",
              "SELECT credits FROM users WHERE TRIM(username) = TRIM(?) LIMIT 1",
              "SELECT credit AS credits FROM users WHERE TRIM(username) = TRIM(?) LIMIT 1",
              "SELECT credits FROM reg_users WHERE TRIM(username) = TRIM(?) LIMIT 1",
              "SELECT credits FROM users WHERE member_id = (SELECT id FROM reg_users WHERE TRIM(username) = TRIM(?) LIMIT 1) LIMIT 1",
            ]) {
              const [rows]: any = await conn.query(sql, [panelUser]).catch(() => [[]]);
              credits = pickNumber(rows?.[0]?.credits);
              if (credits !== null) break;
            }
            if (credits === null) {
              throw new Error(`O usuário "${panelUser}" não foi encontrado no banco do VPlay.`);
            }

            let online: number | null = null;
            for (const sql of [
              "SELECT COUNT(*) AS c FROM lines_live",
              "SELECT COUNT(*) AS c FROM user_activity_now",
              "SELECT COUNT(*) AS c FROM lines_activity WHERE date_end IS NULL",
            ]) {
              const [act]: any = await conn.query(sql).catch(() => [null]);
              if (act) {
                online = pickNumber(act?.[0]?.c);
                if (online !== null) break;
              }
            }
            return { credits, online };
          } finally {
            await conn.end().catch(() => {});
          }
        })();
      }
      return vplayPromise;
    };

    // ---- The Best ----
    let theBestPromise: Promise<{ credits: number | null; online: number | null }> | null = null;
    const theBestStats = () => {
      if (!theBestPromise) {
        theBestPromise = (async () => {
          const apiKey = String((cfg as any)?.the_best_api_key || "").trim();
          const username = String((cfg as any)?.the_best_username || "").trim();
          const password = String((cfg as any)?.the_best_password || "").trim();
          const base = normBase((cfg as any)?.the_best_base_url || "https://api.painel.best");
          if (!apiKey && (!username || !password)) {
            throw new Error("Credenciais do The Best não configuradas.");
          }
          const headers: any = { Accept: "application/json" };
          if (apiKey) {
            headers["Api-Key"] = apiKey;
          } else {
            const res = await fetch(`${base}/auth/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ username, password }),
            });
            if (!res.ok) throw new Error(`Falha no login do The Best (HTTP ${res.status})`);
            const data = await res.json();
            if (!data.token) throw new Error("O painel The Best não devolveu o token de acesso.");
            headers["Authorization"] = `Bearer ${data.token}`;
          }

          const res = await fetch(`${base}/reseller/credits`, { headers });
          if (!res.ok) throw new Error(`Falha ao ler créditos do The Best (HTTP ${res.status})`);
          const data = await res.json();
          return { credits: pickNumber(data.credits, data.saldo, data.balance), online: null };
        })();
      }
      return theBestPromise;
    };

    // ---- Rush ----
    let rushPromise: Promise<{ credits: number | null; online: number | null }> | null = null;
    const rushStats = () => {
      if (!rushPromise) {
        rushPromise = (async () => {
          const user = String((cfg as any)?.rush_username || "").trim();
          const pass = String((cfg as any)?.rush_password || "").trim();
          const token = String((cfg as any)?.rush_token || "").trim();
          const base = normBase((cfg as any)?.rush_base_url || "https://api-new.painel.ai");
          if (!user || !pass || !token) throw new Error("Credenciais da Rush não configuradas.");
          
          const auth = `user=${user}&pass=${pass}&token=${token}`;
          let credits: number | null = null;
          let lastErr = "";

          const deepCredits = (obj: any): number | null => {
            if (!obj || typeof obj !== "object") return null;
            return pickNumber(obj.credits, obj.credits_iptv, obj.credits_p2p, obj.saldo, obj.balance, obj.credits_total);
          };

          for (const p of ["/reseller/info", "/credits/info", "/iptv/credits", "/p2p/credits"]) {
            try {
              const r = await fetch(`${base}${p}?${auth}`, { headers: { Accept: "application/json" } });
              const t = await r.text();
              if (!r.ok) { lastErr = `HTTP ${r.status} em ${p}`; continue; }
              let b: any = null;
              try { b = JSON.parse(t); } catch { lastErr = `resposta não-JSON em ${p}`; continue; }
              credits = deepCredits(b);
              if (credits !== null) break;
              lastErr = `sem campo de saldo em ${p}`;
            } catch (e) {
              lastErr = e instanceof Error ? e.message : String(e);
            }
          }
          if (credits === null) throw new Error(`Não foi possível ler os créditos da Rush (${lastErr || "sem resposta"}).`);

          let online: number | null = null;
          for (const p of ["/iptv/online", "/p2p/online", "/iptv/list?online=1&per_page=1"]) {
            try {
              const r = await fetch(`${base}${p.includes("?") ? `${p}&` : `${p}?`}${auth}`, { headers: { Accept: "application/json" } });
              if (!r.ok) continue;
              const b = await r.json();
              online = pickNumber(b?.online, b?.total, b?.count, Array.isArray(b?.items) ? b.items.length : null, Array.isArray(b) ? b.length : null);
              if (online !== null) break;
            } catch { /* opcional */ }
          }
          return { credits, online };
        })();
      }
      return rushPromise;
    };

    await Promise.all((servers || []).map(async (server: any) => {
      const panel = resolvePanel(server);
      const entry: { panel: string | null; credits: number | null; online: number | null; error?: string } = {
        panel, credits: null, online: null,
      };
      results[server.id] = entry;
      if (!panel || panel === "none") return;

      try {
        if (panel === "p2cine") {
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
        } else if (panel === "natv" || panel === "natv2") {
          Object.assign(entry, await natvStats(panel));
        } else if (panel === "thebest") {
          Object.assign(entry, await theBestStats());
        } else if (panel === "rush") {
          Object.assign(entry, await rushStats());
        }
      } catch (e) {
        entry.error = e instanceof Error ? e.message : String(e);
      }
    }));

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
