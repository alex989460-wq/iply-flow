import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // Auth
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

    const { server_type, action } = await req.json();
    // action = 'probe' => test one user to see fields
    // action = 'sync' => sync all customers for that server type

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get reseller API settings
    const { data: apiSettings } = await supabaseAdmin
      .from('reseller_api_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (server_type === 'the_best') {
      return await handleTheBest(supabaseAdmin, apiSettings, action, userId, jsonHeaders);
    } else if (server_type === 'rush') {
      return await handleRush(supabaseAdmin, apiSettings, action, userId, jsonHeaders);
    }

    return new Response(JSON.stringify({ error: 'server_type inválido' }), { status: 400, headers: jsonHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[SyncDates] Erro:', error);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});

// ============ THE BEST ============
async function handleTheBest(supabaseAdmin: any, apiSettings: any, action: string, userId: string, jsonHeaders: any) {
  const tbUsername = apiSettings?.the_best_username;
  const tbPassword = apiSettings?.the_best_password;
  const tbBaseUrl = (apiSettings?.the_best_base_url || '').replace(/\/+$/, '') || 'https://api.painel.best';

  if (!tbUsername || !tbPassword) {
    return new Response(JSON.stringify({ error: 'Credenciais The Best não configuradas' }), { status: 400, headers: jsonHeaders });
  }

  // Login
  const loginResp = await fetch(`${tbBaseUrl}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: tbUsername, password: tbPassword }),
  });
  if (!loginResp.ok) {
    const err = await loginResp.text();
    return new Response(JSON.stringify({ error: `Login The Best falhou: ${err}` }), { status: 400, headers: jsonHeaders });
  }
  const loginData = await loginResp.json();
  const token = loginData.access || loginData.token || loginData.access_token;

  if (action === 'probe') {
    // Fetch first page to see available fields
    const resp = await fetch(`${tbBaseUrl}/lines/?per_page=3`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    const data = await resp.json();
    const results = data.results || data.data || data;
    const sample = Array.isArray(results) ? results.slice(0, 3) : [];
    return new Response(JSON.stringify({ sample, keys: sample.length ? Object.keys(sample[0]) : [] }), { headers: jsonHeaders });
  }

  // action === 'sync' — fetch ALL lines with pagination
  console.log('[TheBest] Iniciando sync de datas...');
  let allLines: any[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const resp = await fetch(`${tbBaseUrl}/lines/?per_page=${perPage}&page=${page}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!resp.ok) { const t = await resp.text(); console.error(`[TheBest] Erro page ${page}: ${t}`); break; }
    const data = await resp.json();
    const results = data.results || data.data || data;
    const lines = Array.isArray(results) ? results : [];
    if (lines.length === 0) break;
    allLines = allLines.concat(lines);
    console.log(`[TheBest] Page ${page}: ${lines.length} lines (total: ${allLines.length})`);
    if (lines.length < perPage) break;
    page++;
  }

  // Get THE BEST server IDs
  const { data: theBestServers } = await supabaseAdmin
    .from('servers')
    .select('id, server_name')
    .or('server_name.ilike.%best%,host.ilike.%best%');
  const theBestServerIds = (theBestServers || []).map((s: any) => s.id);

  if (theBestServerIds.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum servidor The Best encontrado' }), { status: 400, headers: jsonHeaders });
  }

  // Get customers from THE BEST servers
  const { data: customers } = await supabaseAdmin
    .from('customers')
    .select('id, username, due_date, server_id')
    .in('server_id', theBestServerIds);

  // Build username -> line map
  const lineMap = new Map<string, any>();
  for (const line of allLines) {
    const uname = String(line.username || '').trim().toLowerCase();
    if (uname) lineMap.set(uname, line);
  }

  // Match and update
  let updated = 0;
  let notFound = 0;
  let unchanged = 0;
  const updates: string[] = [];

  for (const cust of (customers || [])) {
    const uname = String(cust.username || '').trim().toLowerCase();
    if (!uname) continue;
    const line = lineMap.get(uname);
    if (!line) { notFound++; continue; }

    // Try to find expiration date field
    const expDate = line.exp_date || line.expiration || line.expire_date || line.expiry || line.due_date || line.end_date || line.expired_at;
    if (!expDate) continue;

    let newDue: string;
    // Handle unix timestamp
    if (typeof expDate === 'number' || /^\d{10,13}$/.test(String(expDate))) {
      const ts = Number(expDate);
      newDue = new Date(ts > 1e11 ? ts : ts * 1000).toISOString().split('T')[0];
    } else {
      // Try parse date string
      const parsed = new Date(expDate);
      if (isNaN(parsed.getTime())) continue;
      newDue = parsed.toISOString().split('T')[0];
    }

    if (newDue === cust.due_date) { unchanged++; continue; }

    const newStatus = new Date(newDue) >= new Date(new Date().toISOString().split('T')[0]) ? 'ativa' : 'inativa';
    const { error } = await supabaseAdmin
      .from('customers')
      .update({ due_date: newDue, status: newStatus })
      .eq('id', cust.id);
    if (!error) {
      updated++;
      if (updated <= 10) updates.push(`${cust.username}: ${cust.due_date} -> ${newDue}`);
    }
  }

  console.log(`[TheBest] Sync completo: ${updated} atualizados, ${unchanged} iguais, ${notFound} não encontrados`);
  return new Response(JSON.stringify({
    success: true,
    total_lines: allLines.length,
    total_customers: (customers || []).length,
    updated,
    unchanged,
    not_found: notFound,
    sample_updates: updates,
  }), { headers: jsonHeaders });
}

// ============ RUSH ============
async function handleRush(supabaseAdmin: any, apiSettings: any, action: string, userId: string, jsonHeaders: any) {
  const rUsername = apiSettings?.rush_username;
  const rPassword = apiSettings?.rush_password;
  const rToken = apiSettings?.rush_token;
  const rBaseUrl = (apiSettings?.rush_base_url || '').replace(/\/+$/, '') || 'https://api-new.painel.ai';

  if (!rUsername || !rPassword || !rToken) {
    return new Response(JSON.stringify({ error: 'Credenciais Rush não configuradas' }), { status: 400, headers: jsonHeaders });
  }

  const authParams = `username=${encodeURIComponent(rUsername)}&password=${encodeURIComponent(rPassword)}&token=${encodeURIComponent(rToken)}`;

  if (action === 'probe') {
    // Probe IPTV and P2P
    const samples: any = {};
    for (const type of ['iptv', 'p2p']) {
      const resp = await fetch(`${rBaseUrl}/${type}/list?${authParams}&per_page=3`, {
        headers: { 'Accept': 'application/json' },
      });
      if (resp.ok) {
        const data = await resp.json();
        const items = data.items || data.data || (Array.isArray(data) ? data : []);
        samples[type] = { sample: items.slice(0, 3), keys: items.length ? Object.keys(items[0]) : [] };
      } else {
        const t = await resp.text();
        samples[type] = { error: `${resp.status}: ${t}` };
      }
    }
    return new Response(JSON.stringify(samples), { headers: jsonHeaders });
  }

  // action === 'sync' — fetch ALL users from IPTV and P2P
  console.log('[Rush] Iniciando sync de datas...');
  const allUsers: any[] = [];

  for (const type of ['iptv', 'p2p']) {
    let page = 1;
    while (true) {
      const url = `${rBaseUrl}/${type}/list?${authParams}&per_page=100&page=${page}`;
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!resp.ok) { const t = await resp.text(); console.error(`[Rush] Erro ${type} page ${page}: ${t}`); break; }
      const data = await resp.json();
      const items = data.items || data.data || (Array.isArray(data) ? data : []);
      if (items.length === 0) break;
      for (const item of items) { item._rush_type = type; }
      allUsers.push(...items);
      console.log(`[Rush] ${type} page ${page}: ${items.length} (total: ${allUsers.length})`);
      if (items.length < 100) break;
      page++;
    }
  }

  // Get Rush server IDs
  const { data: rushServers } = await supabaseAdmin
    .from('servers')
    .select('id, server_name')
    .or('server_name.ilike.%rush%,server_name.ilike.%p2c%,host.ilike.%rush%,host.ilike.%painel.ai%');
  const rushServerIds = (rushServers || []).map((s: any) => s.id);

  if (rushServerIds.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum servidor Rush encontrado' }), { status: 400, headers: jsonHeaders });
  }

  // Get customers
  const { data: customers } = await supabaseAdmin
    .from('customers')
    .select('id, username, due_date, server_id')
    .in('server_id', rushServerIds);

  // Build username map
  const userMap = new Map<string, any>();
  for (const u of allUsers) {
    const uname = String(u.username || '').trim().toLowerCase();
    if (uname) userMap.set(uname, u);
  }

  let updated = 0;
  let notFound = 0;
  let unchanged = 0;
  const updates: string[] = [];

  for (const cust of (customers || [])) {
    const uname = String(cust.username || '').trim().toLowerCase();
    if (!uname) continue;
    const user = userMap.get(uname);
    if (!user) { notFound++; continue; }

    const expDate = user.exp_date || user.expiration || user.expire_date || user.expiry || user.due_date || user.end_date || user.expired_at;
    if (!expDate) continue;

    let newDue: string;
    if (typeof expDate === 'number' || /^\d{10,13}$/.test(String(expDate))) {
      const ts = Number(expDate);
      newDue = new Date(ts > 1e11 ? ts : ts * 1000).toISOString().split('T')[0];
    } else {
      const parsed = new Date(expDate);
      if (isNaN(parsed.getTime())) continue;
      newDue = parsed.toISOString().split('T')[0];
    }

    if (newDue === cust.due_date) { unchanged++; continue; }

    const newStatus = new Date(newDue) >= new Date(new Date().toISOString().split('T')[0]) ? 'ativa' : 'inativa';
    const { error } = await supabaseAdmin
      .from('customers')
      .update({ due_date: newDue, status: newStatus })
      .eq('id', cust.id);
    if (!error) {
      updated++;
      if (updated <= 10) updates.push(`${cust.username}: ${cust.due_date} -> ${newDue}`);
    }
  }

  console.log(`[Rush] Sync completo: ${updated} atualizados, ${unchanged} iguais, ${notFound} não encontrados`);
  return new Response(JSON.stringify({
    success: true,
    total_api_users: allUsers.length,
    total_customers: (customers || []).length,
    updated,
    unchanged,
    not_found: notFound,
    sample_updates: updates,
  }), { headers: jsonHeaders });
}
