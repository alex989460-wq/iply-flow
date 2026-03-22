import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch all customers for given server IDs, paginating past 1000 limit
async function fetchAllCustomers(admin: any, serverIds: string[]) {
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data } = await admin
      .from('customers')
      .select('id, username, due_date, server_id')
      .in('server_id', serverIds)
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function parseDateField(expDate: any): string | null {
  if (!expDate) return null;
  if (typeof expDate === 'number' || /^\d{10,13}$/.test(String(expDate))) {
    const ts = Number(expDate);
    return new Date(ts > 1e11 ? ts : ts * 1000).toISOString().split('T')[0];
  }
  const parsed = new Date(expDate);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: jsonHeaders });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: jsonHeaders });
    }
    const userId = claimsData.claims.sub as string;

    const { server_type, action, rush_sub_type } = await req.json();

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: apiSettings } = await supabaseAdmin
      .from('reseller_api_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (server_type === 'the_best') {
      return await handleTheBest(supabaseAdmin, apiSettings, action, jsonHeaders);
    } else if (server_type === 'rush') {
      return await handleRush(supabaseAdmin, apiSettings, action, jsonHeaders, rush_sub_type);
    }
    return new Response(JSON.stringify({ error: 'server_type inválido' }), { status: 400, headers: jsonHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[SyncDates] Erro:', error);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});

async function syncCustomers(supabaseAdmin: any, customers: any[], apiUserMap: Map<string, any>, serverName: string) {
  let updated = 0, notFound = 0, unchanged = 0, noDate = 0;
  const sampleUpdates: string[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  for (const cust of customers) {
    const uname = String(cust.username || '').trim().toLowerCase();
    if (!uname) continue;
    const apiUser = apiUserMap.get(uname);
    if (!apiUser) { notFound++; continue; }

    const expDate = apiUser.exp_date || apiUser.expiration || apiUser.expire_date || apiUser.expiry || apiUser.due_date || apiUser.end_date;
    const newDue = parseDateField(expDate);
    if (!newDue) { noDate++; continue; }
    if (newDue === cust.due_date) { unchanged++; continue; }

    const newStatus = newDue >= todayStr ? 'ativa' : 'inativa';
    const { error } = await supabaseAdmin
      .from('customers')
      .update({ due_date: newDue, status: newStatus })
      .eq('id', cust.id);
    if (!error) {
      updated++;
      if (sampleUpdates.length < 15) sampleUpdates.push(`${cust.username}: ${cust.due_date} -> ${newDue}`);
    }
  }

  console.log(`[${serverName}] Sync: ${updated} atualizados, ${unchanged} iguais, ${notFound} não encontrados, ${noDate} sem data`);
  return { updated, unchanged, not_found: notFound, no_date: noDate, sample_updates: sampleUpdates };
}

// ============ THE BEST ============
async function handleTheBest(supabaseAdmin: any, apiSettings: any, action: string, jsonHeaders: any) {
  const tbUser = apiSettings?.the_best_username;
  const tbPass = apiSettings?.the_best_password;
  const tbBase = (apiSettings?.the_best_base_url || '').replace(/\/+$/, '') || 'https://api.painel.best';

  if (!tbUser || !tbPass) {
    return new Response(JSON.stringify({ error: 'Credenciais The Best não configuradas' }), { status: 400, headers: jsonHeaders });
  }

  const loginResp = await fetch(`${tbBase}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: tbUser, password: tbPass }),
  });
  if (!loginResp.ok) return new Response(JSON.stringify({ error: `Login falhou: ${await loginResp.text()}` }), { status: 400, headers: jsonHeaders });
  const loginData = await loginResp.json();
  const token = loginData.access || loginData.token || loginData.access_token;

  if (action === 'probe') {
    const resp = await fetch(`${tbBase}/lines/?per_page=3`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
    const data = await resp.json();
    const results = Array.isArray(data.results || data.data || data) ? (data.results || data.data || data) : [];
    return new Response(JSON.stringify({ sample: results.slice(0, 3), keys: results.length ? Object.keys(results[0]) : [] }), { headers: jsonHeaders });
  }

  // Fetch ALL lines
  console.log('[TheBest] Iniciando sync...');
  const allLines: any[] = [];
  let page = 1;
  while (true) {
    const resp = await fetch(`${tbBase}/lines/?per_page=100&page=${page}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!resp.ok) { await resp.text(); break; }
    const data = await resp.json();
    const lines = Array.isArray(data.results || data.data || data) ? (data.results || data.data || data) : [];
    if (lines.length === 0) break;
    allLines.push(...lines);
    console.log(`[TheBest] Page ${page}: ${lines.length} (total: ${allLines.length})`);
    if (lines.length < 100) break;
    page++;
  }

  const { data: servers } = await supabaseAdmin.from('servers').select('id').or('server_name.ilike.%best%,host.ilike.%best%');
  const serverIds = (servers || []).map((s: any) => s.id);
  if (!serverIds.length) return new Response(JSON.stringify({ error: 'Nenhum servidor The Best' }), { status: 400, headers: jsonHeaders });

  const customers = await fetchAllCustomers(supabaseAdmin, serverIds);

  const lineMap = new Map<string, any>();
  for (const l of allLines) { const u = String(l.username || '').trim().toLowerCase(); if (u) lineMap.set(u, l); }

  const result = await syncCustomers(supabaseAdmin, customers, lineMap, 'TheBest');
  return new Response(JSON.stringify({ success: true, total_lines: allLines.length, total_customers: customers.length, ...result }), { headers: jsonHeaders });
}

// ============ RUSH ============
async function handleRush(supabaseAdmin: any, apiSettings: any, action: string, jsonHeaders: any, rushSubType?: string) {
  const rUser = apiSettings?.rush_username;
  const rPass = apiSettings?.rush_password;
  const rToken = apiSettings?.rush_token;
  const rBase = (apiSettings?.rush_base_url || '').replace(/\/+$/, '') || 'https://api-new.painel.ai';

  if (!rUser || !rPass || !rToken) {
    return new Response(JSON.stringify({ error: 'Credenciais Rush não configuradas' }), { status: 400, headers: jsonHeaders });
  }

  const authParams = `username=${encodeURIComponent(rUser)}&password=${encodeURIComponent(rPass)}&token=${encodeURIComponent(rToken)}`;

  if (action === 'probe') {
    const samples: any = {};
    for (const type of ['iptv', 'p2p']) {
      const resp = await fetch(`${rBase}/${type}/list?${authParams}`, { headers: { 'Accept': 'application/json' } });
      if (resp.ok) {
        const data = await resp.json();
        const items = data.items || data.data || (Array.isArray(data) ? data : []);
        samples[type] = { count: items.length, sample: items.slice(0, 3), keys: items.length ? Object.keys(items[0]) : [] };
      } else {
        samples[type] = { error: `${resp.status}: ${await resp.text()}` };
      }
    }
    return new Response(JSON.stringify(samples), { headers: jsonHeaders });
  }

  // Fetch ALL users from Rush - try pagination with page param, also try without per_page limit
  console.log('[Rush] Iniciando sync...');
  const allUsers: any[] = [];

  for (const type of ['iptv', 'p2p']) {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      // Rush may use different pagination - try both page and offset
      const url = `${rBase}/${type}/list?${authParams}&page=${page}`;
      console.log(`[Rush] Fetching ${type} page ${page}`);
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!resp.ok) { await resp.text(); break; }
      const data = await resp.json();
      
      // Rush may return { items: [...] } or { data: [...] } or just [...]
      const items = data.items || data.data || (Array.isArray(data) ? data : []);
      const totalPages = data.total_pages || data.totalPages || data.pages || 0;
      const totalItems = data.total || data.totalItems || data.count || 0;
      
      console.log(`[Rush] ${type} page ${page}: ${items.length} items, total: ${totalItems}, totalPages: ${totalPages}`);
      
      if (items.length === 0) break;
      for (const item of items) { item._rush_type = type; }
      allUsers.push(...items);
      
      // Check if more pages
      if (totalPages && page >= totalPages) break;
      if (items.length < 10) break; // Less than a page = last page
      page++;
      
      // Safety limit
      if (page > 200) break;
    }
  }

  console.log(`[Rush] Total usuários da API: ${allUsers.length}`);

  const { data: servers } = await supabaseAdmin.from('servers').select('id')
    .or('server_name.ilike.%rush%,server_name.ilike.%p2c%,host.ilike.%rush%,host.ilike.%painel.ai%');
  const serverIds = (servers || []).map((s: any) => s.id);
  if (!serverIds.length) return new Response(JSON.stringify({ error: 'Nenhum servidor Rush' }), { status: 400, headers: jsonHeaders });

  const customers = await fetchAllCustomers(supabaseAdmin, serverIds);

  const userMap = new Map<string, any>();
  for (const u of allUsers) { const n = String(u.username || '').trim().toLowerCase(); if (n) userMap.set(n, u); }

  const result = await syncCustomers(supabaseAdmin, customers, userMap, 'Rush');
  return new Response(JSON.stringify({ success: true, total_api_users: allUsers.length, total_customers: customers.length, ...result }), { headers: jsonHeaders });
}
