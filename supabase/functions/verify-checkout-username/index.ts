import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mysql from "npm:mysql2@3.9.7/promise";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function checkVplay(username: string): Promise<{ found: boolean; table?: string }> {
  const host = Deno.env.get('VPLAY_MYSQL_HOST');
  const user = Deno.env.get('VPLAY_MYSQL_USER');
  const password = Deno.env.get('VPLAY_MYSQL_PASSWORD');
  const database = (Deno.env.get('VPLAY_MYSQL_DATABASE') || '').trim();
  const port = Number.parseInt((Deno.env.get('VPLAY_MYSQL_PORT') || '3306').trim(), 10);

  if (!host || !user || !password || !database) return { found: false };

  let connection: any = null;
  try {
    connection = await mysql.createConnection({
      host, user, password, database,
      port: Number.isFinite(port) ? port : 3306,
      connectTimeout: 8000,
    });

    const priorityTables = ['lines', 'users', 'user', 'reg_users', 'line', 'accounts', 'subscribers', 'clients', 'members', 'streams'];
    let allDbTables: string[] = [];
    try {
      const [tablesResult] = await connection.query('SHOW TABLES');
      allDbTables = (tablesResult as any[]).map((row) => Object.values(row)[0] as string);
    } catch { /* ignore */ }

    const targetTables = [...priorityTables];
    for (const t of allDbTables) {
      if (!targetTables.includes(t)) targetTables.push(t);
    }

    for (const tableName of targetTables) {
      try {
        const [columnsResult] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
        const tableColumns = new Set((columnsResult as any[]).map((col) => String(col.Field)));

        const hasExpiry = ['exp_date', 'expiration', 'expiration_date', 'expire_date', 'expiry_date', 'expires_at', 'expire_at']
          .some((c) => tableColumns.has(c));
        const identifierColumns = ['username', 'user_name', 'login', 'user', 'email', 'name']
          .filter((c) => tableColumns.has(c));
        if (!hasExpiry || identifierColumns.length === 0) continue;

        const whereClauses = identifierColumns.map(c => `TRIM(CAST(\`${c}\` AS CHAR)) = TRIM(?)`);
        const params = identifierColumns.map(() => username);

        const [rows] = await connection.execute(
          `SELECT 1 FROM \`${tableName}\` WHERE ${whereClauses.join(' OR ')} LIMIT 1`,
          params,
        );
        if ((rows as any[]).length > 0) {
          return { found: true, table: tableName };
        }
      } catch { /* table missing, continue */ }
    }
    return { found: false };
  } catch (e) {
    console.error('[verify] Vplay check error:', e);
    return { found: false };
  } finally {
    try { if (connection) await connection.end(); } catch { /* ignore */ }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
}

async function checkNatv(username: string, apiKey: string, baseUrl: string): Promise<boolean> {
  if (!apiKey || !baseUrl) return false;

  const target = username.trim().toLowerCase();
  const base = baseUrl.trim().replace(/\/+$/, '');
  const roots = new Set<string>([base]);
  if (base.endsWith('/api')) roots.add(base.replace(/\/api$/, ''));
  else roots.add(`${base}/api`);

  const extractUsers = (value: any): any[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of ['data', 'users', 'items', 'results', 'records']) {
      const nested = extractUsers(value[key]);
      if (nested.length) return nested;
    }
    return [value];
  };

  const isMatch = (item: any): boolean => {
    if (!item || typeof item !== 'object') return false;
    const direct = [item.username, item.login, item.user, item.name, item.email]
      .map((v) => String(v || '').trim().toLowerCase())
      .some((v) => v === target);
    if (direct) return true;
    return Object.values(item).some((v) => v && typeof v === 'object' && isMatch(v));
  };

  const buildRequests = () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const seen = new Set<string>();
    const encoded = encodeURIComponent(username.trim());
    for (const root of roots) {
      const clean = root.replace(/\/+$/, '');
      for (const path of ['/user/search', '/users/search']) {
        const url = `${clean}${path}`;
        const key = `POST ${url}`;
        if (!seen.has(key)) {
          seen.add(key);
          requests.push({
            url,
            init: { method: 'POST', body: JSON.stringify({ username: username.trim() }) },
          });
        }
      }
      for (const path of ['/users', '/user']) {
        for (const url of [`${clean}${path}?search=${encoded}`, `${clean}${path}?username=${encoded}`, `${clean}${path}?login=${encoded}`]) {
          const key = `GET ${url}`;
          if (!seen.has(key)) {
            seen.add(key);
            requests.push({ url, init: { method: 'GET' } });
          }
        }
        for (let page = 1; page <= 10; page++) {
          const url = `${clean}${path}?page=${page}&per_page=100&limit=100`;
          const key = `GET ${url}`;
          if (!seen.has(key)) {
            seen.add(key);
            requests.push({ url, init: { method: 'GET' } });
          }
        }
        const url = `${clean}${path}`;
        const key = `GET ${url}`;
        if (!seen.has(key)) {
          seen.add(key);
          requests.push({ url, init: { method: 'GET' } });
        }
      }
    }
    return requests;
  };

  for (const request of buildRequests()) {
    try {
      const res = await fetch(request.url, {
        ...request.init,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const safeUrl = new URL(request.url);
      console.log(`[verify] NATV ${request.init.method || 'GET'} ${safeUrl.pathname}${safeUrl.search} -> ${res.status}`);
      if (!res.ok) continue;
      const data = await res.json();
      const users = extractUsers(data);
      console.log(`[verify] NATV users checked: ${users.length}`);
      if (users.some(isMatch)) return true;
    } catch (e) {
      console.error('[verify] NATV check error:', e);
    }
  }
  return false;
}

  try {
    const url = new URL(req.url);
    const ownerId = url.searchParams.get('owner_id');
    const usernameRaw = url.searchParams.get('username') || '';
    const username = usernameRaw.trim();

    if (!ownerId || !username) {
      return new Response(JSON.stringify({ error: 'owner_id and username required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1) Search existing customers for this owner
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, username, due_date, status')
      .eq('created_by', ownerId)
      .ilike('username', `%${username}%`)
      .limit(20);

    if (error) throw error;

    const u = username.toLowerCase();
    const match = (data || []).find((c: any) => {
      const list = String(c.username || '')
        .split(',')
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean);
      return list.includes(u);
    });

    if (match) {
      return new Response(JSON.stringify({
        found: true,
        source: 'customer',
        customer: {
          name: match.name,
          username: match.username,
          due_date: match.due_date,
          status: match.status,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helper: resolve owner's server_id matching a host keyword (e.g. 'vplay', 'natv')
    const resolveServerId = async (keyword: string): Promise<string | null> => {
      const { data: ownerServers } = await supabase
        .from('servers')
        .select('id, host')
        .eq('created_by', ownerId);
      if (!ownerServers) return null;
      const k = keyword.toLowerCase();
      const hit = ownerServers.find((s: any) =>
        String(s.host || '').toLowerCase().includes(k)
      );
      return hit?.id || null;
    };

    // 2) Fallback: check on Vplay panel (new test users not yet in customers)
    const vplay = await checkVplay(username);
    if (vplay.found) {
      const server_id = await resolveServerId('vplay');
      return new Response(JSON.stringify({
        found: true,
        source: 'vplay',
        server_id,
        customer: {
          name: 'Novo cliente (teste Vplay)',
          username,
          due_date: null,
          status: 'novo',
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3) Fallback: check on NATV panel (per owner's reseller_api_settings, with global fallback)
    const { data: ownerSettings } = await supabase
      .from('reseller_api_settings')
      .select('natv_api_key, natv_base_url, natv2_api_key, natv2_base_url')
      .eq('user_id', ownerId)
      .maybeSingle();

    const natvKey = ownerSettings?.natv_api_key || Deno.env.get('NATV_API_KEY') || '';
    const natvBase = ownerSettings?.natv_base_url || Deno.env.get('NATV_BASE_URL') || '';
    if (await checkNatv(username, natvKey, natvBase)) {
      const server_id = await resolveServerId('natv');
      return new Response(JSON.stringify({
        found: true,
        source: 'natv',
        server_id,
        customer: { name: 'Novo cliente (teste NATV)', username, due_date: null, status: 'novo' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const natv2Key = ownerSettings?.natv2_api_key || '';
    const natv2Base = ownerSettings?.natv2_base_url || '';
    if (await checkNatv(username, natv2Key, natv2Base)) {
      const server_id = await resolveServerId('natv');
      return new Response(JSON.stringify({
        found: true,
        source: 'natv2',
        server_id,
        customer: { name: 'Novo cliente (teste NATV)', username, due_date: null, status: 'novo' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


    return new Response(JSON.stringify({ found: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[verify] error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
