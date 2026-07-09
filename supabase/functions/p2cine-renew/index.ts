import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cakto-webhook-secret',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

function buildDataTablesBody(search: string): string {
  const params = new URLSearchParams();
  params.set('draw', '1');
  for (let i = 0; i < 10; i++) {
    params.set(`columns[${i}][data]`, String(i));
    params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true');
    params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, '');
    params.set(`columns[${i}][search][regex]`, 'false');
  }
  params.set('order[0][column]', '0');
  params.set('order[0][dir]', 'desc');
  params.set('start', '0');
  params.set('length', '10');
  params.set('search[value]', search);
  params.set('search[regex]', 'false');
  params.set('filter_value', '#');
  params.set('reseller_id', '-1');
  return params.toString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const internalSecret = req.headers.get('x-cakto-webhook-secret');
    const isInternal = !!Deno.env.get('CAKTO_WEBHOOK_SECRET') &&
      internalSecret === Deno.env.get('CAKTO_WEBHOOK_SECRET');

    let callerUserId: string | null = null;
    if (!isInternal) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: jsonHeaders });
      }
      const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await supa.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: jsonHeaders });
      }
      callerUserId = user.id;
    }

    const { username, months, customer_id, user_id: bodyUserId } = await req.json();
    if (!username) {
      return new Response(JSON.stringify({ error: 'username é obrigatório' }), { status: 400, headers: jsonHeaders });
    }
    const renewMonths = Number(months) || 1;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve owner
    let ownerId = callerUserId || bodyUserId || null;
    if (customer_id && !ownerId) {
      const { data: c } = await admin.from('customers').select('created_by').eq('id', customer_id).maybeSingle();
      ownerId = c?.created_by || null;
    }
    if (!ownerId) {
      return new Response(JSON.stringify({ error: 'Não foi possível resolver o revendedor' }), { status: 400, headers: jsonHeaders });
    }

    // Load creds
    const { data: cred } = await admin
      .from('activation_panel_credentials')
      .select('username, password, is_enabled')
      .eq('user_id', ownerId)
      .eq('panel_type', 'p2cine')
      .maybeSingle();

    if (!cred || !cred.is_enabled) {
      return new Response(JSON.stringify({ error: 'P2Cine não configurado ou desabilitado' }), { status: 400, headers: jsonHeaders });
    }

    const baseUrl = String(cred.username || '').replace(/\/+$/, '');
    const rawPass = String(cred.password || '').trim();
    // Aceita: token puro, JSON de cookie exportado, ou "PHPSESSID=xxx"
    let phpsessid = rawPass;
    try {
      const parsed = JSON.parse(rawPass);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const found = arr.find((c: any) => String(c?.name).toUpperCase() === 'PHPSESSID');
      if (found?.value) phpsessid = String(found.value);
    } catch { /* not JSON */ }
    const m = phpsessid.match(/PHPSESSID\s*=\s*([A-Za-z0-9]+)/i);
    if (m) phpsessid = m[1];
    phpsessid = phpsessid.trim();
    if (!baseUrl || !phpsessid) {
      return new Response(JSON.stringify({ error: 'URL do painel ou PHPSESSID vazios' }), { status: 400, headers: jsonHeaders });
    }


    const commonHeaders = {
      'User-Agent': UA,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': baseUrl,
      'Referer': `${baseUrl}/clients/`,
      'Cookie': `PHPSESSID=${phpsessid}`,
    };

    // Step 1: search by username to find client_id
    const searchResp = await fetch(`${baseUrl}/clients/api/?get_clients`, {
      method: 'POST',
      headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: buildDataTablesBody(String(username).trim()),
    });

    if (searchResp.status === 401 || searchResp.status === 403 ||
        searchResp.headers.get('content-type')?.includes('text/html')) {
      return new Response(JSON.stringify({
        error: 'Sessão P2Cine expirada. Faça login no painel e atualize o PHPSESSID nas configurações.',
        status: searchResp.status,
      }), { status: 401, headers: jsonHeaders });
    }

    if (!searchResp.ok) {
      const t = await searchResp.text();
      return new Response(JSON.stringify({ error: `Erro na busca: ${searchResp.status}`, detail: t.slice(0, 300) }), { status: 502, headers: jsonHeaders });
    }

    const searchData = await searchResp.json();
    const rows = searchData?.data || [];
    console.log(`[P2Cine] Busca "${username}" retornou ${rows.length} resultado(s)`);

    // Each row is an array; client_id usually in a data-id attribute embedded in one of the HTML columns.
    // Try to find any numeric id via regex over the whole row.
    let clientId: string | null = null;
    for (const row of rows) {
      const raw = Array.isArray(row) ? row.join(' ') : JSON.stringify(row);
      const matchExact = new RegExp(`>\\s*${String(username).trim()}\\s*<`, 'i').test(raw);
      const idMatch = raw.match(/client_id=(\d+)/) || raw.match(/data-id=["'](\d+)["']/) || raw.match(/\/clients\/(\d+)/);
      if (idMatch && (matchExact || rows.length === 1)) {
        clientId = idMatch[1];
        break;
      }
    }

    if (!clientId) {
      return new Response(JSON.stringify({
        success: false,
        error: `Usuário "${username}" não encontrado no P2Cine`,
      }), { headers: jsonHeaders });
    }

    console.log(`[P2Cine] Renovando client_id=${clientId} por ${renewMonths} mês(es)`);

    // Step 2: renew
    const renewUrl = `${baseUrl}/clients/api/?renew_client_plus&client_id=${clientId}&months=${renewMonths}`;
    const renewResp = await fetch(renewUrl, { method: 'POST', headers: commonHeaders });

    if (!renewResp.ok) {
      const t = await renewResp.text();
      return new Response(JSON.stringify({ error: `Erro na renovação: ${renewResp.status}`, detail: t.slice(0, 300) }), { status: 502, headers: jsonHeaders });
    }

    const renewData = await renewResp.json().catch(() => ({}));
    console.log('[P2Cine] Resposta:', JSON.stringify(renewData));

    return new Response(JSON.stringify({
      success: true,
      message: `Usuário ${username} renovado por ${renewMonths} mês(es) no P2Cine`,
      client_id: clientId,
      renew_data: renewData,
    }), { headers: jsonHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[P2Cine] Erro:', err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
