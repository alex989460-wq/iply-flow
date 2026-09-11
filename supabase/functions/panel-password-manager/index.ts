import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import mysql from "npm:mysql2@3.9.7/promise";
import { z } from "npm:zod@3.23.8";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function normalizeBaseUrl(raw: unknown, fallback = ""): string {
  let s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return fallback;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return fallback;
  }
}

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
      if (digits.length === 11 && digits[2] === "9") {
        set.add(digits.slice(0, 2) + digits.slice(3));
      } else if (digits.length === 10) {
        set.add(digits.slice(0, 2) + "9" + digits.slice(2));
      }
    }
  }
  return [...set].filter(Boolean);
}

async function getResellerSettings(admin: any, ownerId: string) {
  const { data } = await admin
    .from("reseller_api_settings")
    .select("*")
    .eq("user_id", ownerId)
    .maybeSingle();
  return data || {};
}

async function updateCustomerPassword(admin: any, ownerId: string, username: string, password: string) {
  const variants = buildUsernameVariants(username);
  const { data: customers } = await admin
    .from("customers")
    .select("id, username")
    .eq("created_by", ownerId)
    .in("username", variants)
    .limit(10);

  const updated: string[] = [];
  for (const c of customers || []) {
    const { error } = await admin
      .from("customers")
      .update({ password })
      .eq("id", c.id);
    if (!error) updated.push(c.id);
  }
  return updated;
}

// ─── NATV ───
async function natvChangePassword(
  baseUrl: string,
  apiKey: string,
  username: string,
  newPassword: string,
) {
  const normalized = normalizeBaseUrl(baseUrl);
  const bases = new Set<string>([normalized]);
  if (normalized.endsWith("/api")) bases.add(normalized.replace(/\/api$/, ""));
  else bases.add(`${normalized}/api`);

  const usersBases = [...bases];
  const userUrlCandidates = usersBases.flatMap((b) => [`${b}/users`, `${b}/user`]);

  let targetUser: any = null;
  let targetEndpoint = "";

  for (const url of userUrlCandidates) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const users = Array.isArray(data) ? data : data?.data || data?.users || [];
      const variants = buildUsernameVariants(username).map((v) => v.toLowerCase());
      targetUser = users.find((u: any) => {
        const un = String(u.username || u.login || u.user || u.name || "").toLowerCase();
        return variants.includes(un);
      });
      if (targetUser) {
        targetEndpoint = url;
        break;
      }
    } catch { /* ignore */ }
  }

  if (!targetUser) throw new Error(`Usuário "${username}" não encontrado no painel NATV.`);

  const id = targetUser.id ?? targetUser.user_id ?? targetUser._id;
  if (!id) throw new Error("Painel NATV retornou usuário sem ID.");

  const changeCandidates = usersBases.flatMap((b) => [
    `${b}/users/${id}`,
    `${b}/user/${id}`,
    `${b}/users/${id}/password`,
    `${b}/user/${id}/password`,
    `${b}/users/change-password`,
    `${b}/user/change-password`,
  ]);

  let lastError = "";
  for (const url of changeCandidates) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ password: newPassword, password_confirmation: newPassword, new_password: newPassword }),
      });
      if (res.ok) return { success: true, endpoint: url };
      lastError = await res.text().catch(() => String(res.status));
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`Não foi possível alterar a senha no NATV. Último erro: ${lastError.slice(0, 200)}`);
}

async function natvSyncPasswords(baseUrl: string, apiKey: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const bases = new Set<string>([normalized]);
  if (normalized.endsWith("/api")) bases.add(normalized.replace(/\/api$/, ""));
  else bases.add(`${normalized}/api`);

  const users: any[] = [];
  for (const b of [...bases]) {
    for (const path of ["/users", "/user"]) {
      try {
        const res = await fetch(`${b}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const list = Array.isArray(data) ? data : data?.data || data?.users || [];
        if (list.length) {
          users.push(...list);
          break;
        }
      } catch { /* ignore */ }
    }
    if (users.length) break;
  }
  return users.map((u: any) => ({
    username: String(u.username || u.login || u.user || "").trim(),
    password: String(u.password || u.senha || "").trim(),
  })).filter((u) => u.username && u.password);
}

// ─── RUSH ───
async function rushAuth(baseUrl: string, username: string, password: string, token: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const res = await fetch(`${normalized}/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  return data.access || data.token || token;
}

async function rushListUsers(baseUrl: string, token: string, type: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const all: any[] = [];
  let page = 1;
  while (page < 200) {
    const res = await fetch(`${normalized}/${type}/list?token=${encodeURIComponent(token)}&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    const items = data.items || data.data || data.users || (Array.isArray(data) ? data : []);
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    if (data.last_page && page >= data.last_page) break;
    if (data.total_pages && page >= data.total_pages) break;
    if (items.length < 10) break;
    page++;
  }
  return all;
}

async function rushChangePassword(
  baseUrl: string,
  token: string,
  username: string,
  newPassword: string,
) {
  const normalized = normalizeBaseUrl(baseUrl);
  const variants = buildUsernameVariants(username).map((v) => v.toLowerCase());

  for (const type of ["iptv", "p2p"]) {
    const users = await rushListUsers(normalized, token, type);
    const found = users.find((u: any) => {
      const un = String(u.username || u.login || "").toLowerCase();
      return variants.includes(un);
    });
    if (!found) continue;

    const id = found.id;
    const url = `${normalized}/${type}/user/${id}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) return { success: true, type, endpoint: url };
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`Rush ${type} recusou a troca de senha: ${text.slice(0, 200)}`);
  }

  throw new Error(`Usuário "${username}" não encontrado no painel Rush.`);
}

async function rushSyncPasswords(baseUrl: string, token: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const out: { username: string; password: string }[] = [];
  for (const type of ["iptv", "p2p"]) {
    const users = await rushListUsers(normalized, token, type);
    for (const u of users) {
      const username = String(u.username || u.login || "").trim();
      const password = String(u.password || u.senha || "").trim();
      if (username && password) out.push({ username, password });
    }
  }
  return out;
}

// ─── P2CINE ───
const browserHeaders: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

async function p2cineApiFetch(url: string, init: RequestInit = {}): Promise<{ status: number; body: string; json: any }> {
  const res = await fetch(url, init);
  const body = await res.text().catch(() => "");
  let json: any = null;
  try { json = JSON.parse(body); } catch { /* ignore */ }
  return { status: res.status, body, json };
}

async function p2cineApiLogin(base: string, username: string, apiKey: string): Promise<{ token: string; uid?: string }> {
  const res = await p2cineApiFetch(`${base}/api/login`, {
    method: "POST",
    headers: { ...browserHeaders, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, api_key: apiKey }).toString(),
  });
  if (!res.json) throw new Error("Painel P2Cine não respondeu JSON no login da API.");
  if (String(res.json.result || "").toLowerCase() === "failed") {
    throw new Error(res.json.error_message || res.json.message || "Login recusado pela API do painel.");
  }
  const token = String(res.json.token || res.json.access_token || res.json.data?.token || "").trim();
  const uid = String(res.json.uid ?? res.json.data?.uid ?? "").trim();
  if (!token) throw new Error("Painel autenticou mas não devolveu token da API.");
  return { token, uid };
}

async function p2cineFindClientId(base: string, token: string, login: string, resellerId?: string): Promise<string | null> {
  const wanted = login.toLowerCase().trim();
  const form = new URLSearchParams();
  form.set("draw", "1");
  form.set("start", "0");
  form.set("length", "100");
  form.set("search[value]", "");
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

  const res = await p2cineApiFetch(`${base}/clients/api/?get_clients&token=${token}`, {
    method: "POST",
    headers: {
      ...browserHeaders,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: base,
      Referer: `${base}/clients/?token=${token}`,
    },
    body: form.toString(),
  });

  const rows = Array.isArray(res.json?.data) ? res.json.data : [];
  for (const row of rows) {
    const cells = (row as any[]).map((c) => String(c ?? "").replace(/<[^>]*>/g, "").trim());
    if (cells.slice(0, 3).some((c) => c.toLowerCase() === wanted)) {
      return String(cells[0] || "").trim() || null;
    }
  }
  return null;
}

async function p2cineChangePassword(base: string, token: string, clientId: string, newPassword: string) {
  const editUrl = `${base}/clients/api/?edit_user&token=${token}`;
  const body = new URLSearchParams();
  body.set("id", clientId);
  body.set("password", newPassword);

  const res = await p2cineApiFetch(editUrl, {
    method: "POST",
    headers: {
      ...browserHeaders,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: base,
      Referer: `${base}/clients/?token=${token}`,
    },
    body: body.toString(),
  });

  if (res.status >= 200 && res.status < 300) {
    const result = String(res.json?.result || "").toLowerCase();
    if (result === "success" || result.includes("sucesso")) return { success: true };
  }
  throw new Error(`Painel P2Cine recusou a troca de senha: ${res.body.slice(0, 200)}`);
}

async function p2cineSyncPasswords(base: string, token: string, resellerId?: string) {
  const form = new URLSearchParams();
  form.set("draw", "1");
  form.set("start", "0");
  form.set("length", "10000");
  form.set("search[value]", "");
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

  const res = await p2cineApiFetch(`${base}/clients/api/?get_clients&token=${token}`, {
    method: "POST",
    headers: {
      ...browserHeaders,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: base,
      Referer: `${base}/clients/?token=${token}`,
    },
    body: form.toString(),
  });

  const rows = Array.isArray(res.json?.data) ? res.json.data : [];
  return rows.map((row: any[]) => {
    const cells = row.map((c) => String(c ?? "").replace(/<[^>]*>/g, "").trim());
    return {
      username: String(cells[1] || cells[2] || "").trim(),
      password: String(cells.find((c) => /senha|password|pin/i.test(c)) || "").trim(),
    };
  }).filter((u: any) => u.username && u.password);
}

// ─── VPLAY ───
async function vplayConnection(settings: any) {
  const host = String(settings.vplay_mysql_host || "").trim();
  const user = String(settings.vplay_mysql_user || "").trim();
  const password = String(settings.vplay_mysql_password || "");
  const database = String(settings.vplay_mysql_database || "").trim();
  const port = Number(settings.vplay_mysql_port) || 3306;
  if (!host || !user || !password || !database) return null;
  return await mysql.createConnection({ host, user, password, database, port, connectTimeout: 10000 });
}

async function vplayFindUser(connection: any, username: string) {
  const variants = buildUsernameVariants(username);
  const [tablesResult] = await connection.query("SHOW TABLES");
  const allTables = (tablesResult as any[]).map((row) => Object.values(row)[0] as string);
  const priority = ["lines", "users", "user", "reg_users", "accounts", "subscribers", "clients"];
  const tables = [...priority, ...allTables.filter((t) => !priority.includes(t))];

  for (const tableName of tables) {
    try {
      const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
      const columns = new Set((columnsResult as any[]).map((c) => String(c.Field)));
      const identifierCols = ["username", "user_name", "login", "user", "email", "name"].filter((c) => columns.has(c));
      if (!identifierCols.length || !columns.has("password")) continue;

      for (const variant of variants) {
        const where = identifierCols.map((c) => `TRIM(CAST(\`${c}\` AS CHAR)) = TRIM(?)`).join(" OR ");
        const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\` WHERE ${where} LIMIT 1`, identifierCols.map(() => variant));
        if ((rows as any[]).length) return { table: tableName, row: (rows as any[])[0], columns };
      }
    } catch { /* ignore */ }
  }
  return null;
}

async function vplayChangePassword(connection: any, username: string, newPassword: string) {
  const found = await vplayFindUser(connection, username);
  if (!found) throw new Error(`Usuário "${username}" não encontrado no banco VPlay.`);

  const idCol = found.columns.has("id") ? "id" : found.columns.has("line_id") ? "line_id" : null;
  if (!idCol) throw new Error("Tabela VPlay não tem coluna de ID para atualizar a senha.");

  await connection.execute(
    `UPDATE \`${found.table}\` SET \`password\` = ? WHERE \`${idCol}\` = ?`,
    [newPassword, found.row[idCol]],
  );
  return { success: true, table: found.table };
}

async function vplaySyncPasswords(connection: any) {
  const [tablesResult] = await connection.query("SHOW TABLES");
  const allTables = (tablesResult as any[]).map((row) => Object.values(row)[0] as string);
  const priority = ["lines", "users", "user", "reg_users", "accounts", "subscribers", "clients"];
  const tables = [...priority, ...allTables.filter((t) => !priority.includes(t))];

  const out: { username: string; password: string }[] = [];
  for (const tableName of tables) {
    try {
      const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
      const columns = new Set((columnsResult as any[]).map((c) => String(c.Field)));
      const userCol = ["username", "user_name", "login", "user"].find((c) => columns.has(c));
      if (!userCol || !columns.has("password")) continue;
      const [rows] = await connection.execute(`SELECT \`${userCol}\`, \`password\` FROM \`${tableName}\` WHERE \`${userCol}\` IS NOT NULL`);
      for (const row of rows as any[]) {
        const username = String(row[userCol] || "").trim();
        const password = String(row.password || "").trim();
        if (username && password) out.push({ username, password });
      }
    } catch { /* ignore */ }
  }
  return out;
}

// ─── GET PASSWORD (puxar senha existente) ───
function matchUser(list: { username: string; password: string }[], username: string) {
  const variants = buildUsernameVariants(username).map((v) => v.toLowerCase());
  return list.find((u) => variants.includes(String(u.username || "").toLowerCase()));
}

// ─── MAIN ───
const ChangePasswordSchema = z.object({
  action: z.literal("change-password"),
  username: z.string().min(1),
  new_password: z.string().min(4).max(128),
  panel: z.enum(["natv", "natv2", "rush", "p2cine", "vplay"]),
});

const GetPasswordSchema = z.object({
  action: z.literal("get-password"),
  username: z.string().min(1),
  panel: z.enum(["natv", "natv2", "rush", "p2cine", "vplay"]),
});

const SyncPasswordsSchema = z.object({
  action: z.literal("sync-passwords"),
  owner_id: z.union([z.string().uuid(), z.literal("all")]).optional(),
});


async function isAdmin(client: any) {
  const { data, error } = await client.rpc("is_admin");
  if (error) return false;
  return !!data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const cronSecret = req.headers.get("X-Cron-Secret") || "";
    const expectedCronSecret = Deno.env.get("PANEL_PASSWORD_SYNC_CRON_SECRET") || "";
    const isCron = expectedCronSecret && cronSecret === expectedCronSecret;

    let userId = "";
    if (isCron) {
      userId = "cron";
    } else {
      if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "Não autorizado" }, 401);
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) return json({ success: false, error: "Não autorizado" }, 401);
      userId = user.id;
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const rawBody = await req.json().catch(() => ({}));
    const action = String(rawBody?.action || "");
    const adminNow = isCron ? true : await isAdmin(admin);
    const requestedOwner = String(rawBody?.owner_id || "");
    const ownerId = (requestedOwner && adminNow)
      ? requestedOwner
      : (isCron ? "all" : userId);

    let settings: any = {};
    if (action !== "sync-passwords" || ownerId !== "all") {
      settings = await getResellerSettings(admin, ownerId);
    }

    if (isCron && action !== "sync-passwords") {
      return json({ success: false, error: "Acesso cron limitado à sincronização." }, 403);
    }

    if (action === "change-password") {
      const parsed = ChangePasswordSchema.safeParse(rawBody);
      if (!parsed.success) return json({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
      const { username, new_password: newPassword, panel } = parsed.data;

      let result: any;
      switch (panel) {
        case "natv": {
          const key = settings.natv_api_key || Deno.env.get("NATV_API_KEY") || "";
          const base = settings.natv_base_url || Deno.env.get("NATV_BASE_URL") || "";
          if (!key || !base) return json({ success: false, error: "Credenciais NATV não configuradas." }, 400);
          result = await natvChangePassword(base, key, username, newPassword);
          break;
        }
        case "natv2": {
          const key = settings.natv2_api_key || Deno.env.get("NATV2_API_KEY") || "";
          const base = settings.natv2_base_url || Deno.env.get("NATV2_BASE_URL") || "";
          if (!key || !base) return json({ success: false, error: "Credenciais NATV2 não configuradas." }, 400);
          result = await natvChangePassword(base, key, username, newPassword);
          break;
        }
        case "rush": {
          const rUser = settings.rush_username || "";
          const rPass = settings.rush_password || "";
          const rToken = settings.rush_token || "";
          const rBase = settings.rush_base_url || "";
          if (!rUser || !rPass || !rToken || !rBase) return json({ success: false, error: "Credenciais Rush não configuradas." }, 400);
          const token = await rushAuth(rBase, rUser, rPass, rToken);
          result = await rushChangePassword(rBase, token, username, newPassword);
          break;
        }
        case "p2cine": {
          const pUser = settings.p2cine_username || "";
          const pKey = settings.p2cine_api_key || "";
          const pBase = settings.p2cine_base_url || "";
          if (!pUser || !pKey || !pBase) return json({ success: false, error: "Credenciais P2Cine não configuradas." }, 400);
          const login = await p2cineApiLogin(pBase, pUser, pKey);
          const clientId = await p2cineFindClientId(pBase, login.token, username, login.uid);
          if (!clientId) throw new Error(`Usuário "${username}" não encontrado no painel P2Cine.`);
          result = await p2cineChangePassword(pBase, login.token, clientId, newPassword);
          break;
        }
        case "vplay": {
          const connection = await vplayConnection(settings);
          if (!connection) return json({ success: false, error: "Credenciais MySQL do VPlay não configuradas." }, 400);
          try {
            result = await vplayChangePassword(connection, username, newPassword);
          } finally {
            await connection.end().catch(() => undefined);
          }
          break;
        }
        default:
          return json({ success: false, error: `Painel '${panel}' não suportado para troca de senha.` }, 400);
      }

      const updatedIds = await updateCustomerPassword(admin, ownerId, username, newPassword);
      return json({ success: true, panel, result, updated_customer_ids: updatedIds });
    }

    if (action === "get-password") {
      const parsed = GetPasswordSchema.safeParse(rawBody);
      if (!parsed.success) return json({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
      const { username, panel } = parsed.data;

      let found: { username: string; password: string } | undefined;
      switch (panel) {
        case "natv":
        case "natv2": {
          const prefix = panel === "natv" ? "natv" : "natv2";
          const key = settings[`${prefix}_api_key`] || Deno.env.get(prefix.toUpperCase() + "_API_KEY") || "";
          const base = settings[`${prefix}_base_url`] || Deno.env.get(prefix.toUpperCase() + "_BASE_URL") || "";
          if (!key || !base) return json({ success: false, error: `Credenciais ${prefix.toUpperCase()} não configuradas.` }, 400);
          found = matchUser(await natvSyncPasswords(base, key), username);
          break;
        }
        case "rush": {
          const { rush_username: rUser, rush_password: rPass, rush_token: rToken, rush_base_url: rBase } = settings;
          if (!rUser || !rPass || !rToken || !rBase) return json({ success: false, error: "Credenciais Rush não configuradas." }, 400);
          const token = await rushAuth(rBase, rUser, rPass, rToken);
          found = matchUser(await rushSyncPasswords(rBase, token), username);
          break;
        }
        case "p2cine": {
          const { p2cine_username: pUser, p2cine_api_key: pKey, p2cine_base_url: pBase } = settings;
          if (!pUser || !pKey || !pBase) return json({ success: false, error: "Credenciais P2Cine não configuradas." }, 400);
          const login = await p2cineApiLogin(pBase, pUser, pKey);
          found = matchUser(await p2cineSyncPasswords(pBase, login.token, login.uid), username);
          break;
        }
        case "vplay": {
          const connection = await vplayConnection(settings);
          if (!connection) return json({ success: false, error: "Credenciais MySQL do VPlay não configuradas." }, 400);
          try {
            const row = await vplayFindUser(connection, username);
            if (row) {
              found = { username, password: String(row.row.password ?? "") };
            }
          } finally {
            await connection.end().catch(() => undefined);
          }
          break;
        }
      }

      if (!found || !found.password) {
        return json({ success: false, error: `Senha de "${username}" não encontrada no painel selecionado.` }, 404);
      }

      const updatedIds = await updateCustomerPassword(admin, ownerId, username, found.password);
      return json({ success: true, panel, password: found.password, updated_customer_ids: updatedIds });
    }



    if (action === "sync-passwords") {
      const parsed = SyncPasswordsSchema.safeParse(rawBody);
      if (!parsed.success) return json({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
      if (parsed.data.owner_id === "all" && !adminNow) {
        return json({ success: false, error: "Apenas administradores podem sincronizar todos os revendedores." }, 403);
      }

      const results: Record<string, { total: number; updated: number; error?: string }> = {};
      const owners = ownerId === "all"
        ? (await admin.from("reseller_api_settings").select("user_id")).data?.map((s: any) => s.user_id) || []
        : [ownerId];

      for (const currentOwner of owners) {
        const s = await getResellerSettings(admin, currentOwner);

        // NATV
        if (s.natv_api_key && s.natv_base_url) {
          try {
            const users = await natvSyncPasswords(s.natv_base_url, s.natv_api_key);
            let updated = 0;
            for (const u of users) {
              const ids = await updateCustomerPassword(admin, currentOwner, u.username, u.password);
              updated += ids.length;
            }
            results.natv = { total: users.length, updated };
          } catch (e) {
            results.natv = { total: 0, updated: 0, error: e instanceof Error ? e.message : String(e) };
          }
        }

        // NATV2
        if (s.natv2_api_key && s.natv2_base_url) {
          try {
            const users = await natvSyncPasswords(s.natv2_base_url, s.natv2_api_key);
            let updated = 0;
            for (const u of users) {
              const ids = await updateCustomerPassword(admin, currentOwner, u.username, u.password);
              updated += ids.length;
            }
            results.natv2 = { total: users.length, updated };
          } catch (e) {
            results.natv2 = { total: 0, updated: 0, error: e instanceof Error ? e.message : String(e) };
          }
        }

        // Rush
        if (s.rush_username && s.rush_password && s.rush_token && s.rush_base_url) {
          try {
            const token = await rushAuth(s.rush_base_url, s.rush_username, s.rush_password, s.rush_token);
            const users = await rushSyncPasswords(s.rush_base_url, token);
            let updated = 0;
            for (const u of users) {
              const ids = await updateCustomerPassword(admin, currentOwner, u.username, u.password);
              updated += ids.length;
            }
            results.rush = { total: users.length, updated };
          } catch (e) {
            results.rush = { total: 0, updated: 0, error: e instanceof Error ? e.message : String(e) };
          }
        }

        // P2Cine
        if (s.p2cine_username && s.p2cine_api_key && s.p2cine_base_url) {
          try {
            const login = await p2cineApiLogin(s.p2cine_base_url, s.p2cine_username, s.p2cine_api_key);
            const users = await p2cineSyncPasswords(s.p2cine_base_url, login.token, login.uid);
            let updated = 0;
            for (const u of users) {
              const ids = await updateCustomerPassword(admin, currentOwner, u.username, u.password);
              updated += ids.length;
            }
            results.p2cine = { total: users.length, updated };
          } catch (e) {
            results.p2cine = { total: 0, updated: 0, error: e instanceof Error ? e.message : String(e) };
          }
        }

        // VPlay
        const connection = await vplayConnection(s);
        if (connection) {
          try {
            const users = await vplaySyncPasswords(connection);
            let updated = 0;
            for (const u of users) {
              const ids = await updateCustomerPassword(admin, currentOwner, u.username, u.password);
              updated += ids.length;
            }
            results.vplay = { total: users.length, updated };
          } catch (e) {
            results.vplay = { total: 0, updated: 0, error: e instanceof Error ? e.message : String(e) };
          } finally {
            await connection.end().catch(() => undefined);
          }
        }
      }

      return json({ success: true, results });
    }

    return json({ success: false, error: "Ação inválida. Use 'change-password' ou 'sync-passwords'." }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[panel-password-manager] error:", err);
    return json({ success: false, error: message }, 500);
  }
});
