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

    // 2) Fallback: check on Vplay panel (new test users not yet in customers)
    const vplay = await checkVplay(username);
    if (vplay.found) {
      return new Response(JSON.stringify({
        found: true,
        source: 'vplay',
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
