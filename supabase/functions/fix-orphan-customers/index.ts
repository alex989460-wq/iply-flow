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

    // Get all servers
    const { data: servers } = await supabaseAdmin.from('servers').select('id, server_name, host');

    // Get customers without server
    const orphans: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabaseAdmin
        .from('customers')
        .select('id, username, phone, name')
        .is('server_id', null)
        .not('username', 'is', null)
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      orphans.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }

    console.log(`[FixOrphans] ${orphans.length} clientes sem servidor`);

    // Build API user maps for each server type
    const serverMap: Record<string, string> = {};
    for (const s of (servers || [])) {
      const name = s.server_name.toLowerCase();
      const host = (s.host || '').toLowerCase();
      if (name.includes('the best') || host.includes('best')) serverMap[s.id] = 'the_best';
      else if (name.includes('natv') || host.includes('natv') || host.includes('pixbot')) serverMap[s.id] = 'natv';
      else if (name.includes('vplay') || host.includes('vplay')) serverMap[s.id] = 'vplay';
      else if (name.includes('rush') || name.includes('p2c') || host.includes('painel.ai')) serverMap[s.id] = 'rush';
    }

    // Fetch users from The Best API
    const theBestUsers = new Map<string, string>(); // username -> server_id
    const tbUser = apiSettings?.the_best_username;
    const tbPass = apiSettings?.the_best_password;
    const tbBase = (apiSettings?.the_best_base_url || '').replace(/\/+$/, '') || 'https://api.painel.best';
    
    if (tbUser && tbPass) {
      try {
        const loginResp = await fetch(`${tbBase}/auth/token/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: tbUser, password: tbPass }),
        });
        if (loginResp.ok) {
          const loginData = await loginResp.json();
          const tbToken = loginData.access || loginData.token || loginData.access_token;
          
          let page = 1;
          while (true) {
            const resp = await fetch(`${tbBase}/lines/?per_page=100&page=${page}`, {
              headers: { 'Authorization': `Bearer ${tbToken}`, 'Accept': 'application/json' },
            });
            if (!resp.ok) break;
            const data = await resp.json();
            const lines = Array.isArray(data.results || data.data || data) ? (data.results || data.data || data) : [];
            if (lines.length === 0) break;
            for (const l of lines) {
              const u = String(l.username || '').trim().toLowerCase();
              if (u) theBestUsers.set(u, 'the_best');
            }
            if (lines.length < 100) break;
            page++;
          }
          console.log(`[FixOrphans] The Best: ${theBestUsers.size} users`);
        }
      } catch (e) { console.error('[FixOrphans] The Best error:', e); }
    }

    // Fetch users from Rush API
    const rushUsers = new Map<string, string>();
    const rUser = apiSettings?.rush_username;
    const rPass = apiSettings?.rush_password;
    const rToken = apiSettings?.rush_token;
    const rBase = (apiSettings?.rush_base_url || '').replace(/\/+$/, '') || 'https://api-new.painel.ai';
    
    if (rUser && rPass && rToken) {
      const authParams = `username=${encodeURIComponent(rUser)}&password=${encodeURIComponent(rPass)}&token=${encodeURIComponent(rToken)}`;
      for (const type of ['iptv', 'p2p']) {
        try {
          const firstResp = await fetch(`${rBase}/${type}/list?${authParams}&page=1`, { headers: { 'Accept': 'application/json' } });
          if (!firstResp.ok) continue;
          const firstData = await firstResp.json();
          const firstItems = firstData.items || firstData.data || (Array.isArray(firstData) ? firstData : []);
          const totalPages = firstData.total_pages || firstData.totalPages || 1;
          
          for (const item of firstItems) {
            const u = String(item.username || '').trim().toLowerCase();
            if (u) rushUsers.set(u, 'rush');
          }
          
          // Parallel fetch remaining pages
          for (let batchStart = 2; batchStart <= totalPages; batchStart += 10) {
            const batchEnd = Math.min(batchStart + 9, totalPages);
            const promises = [];
            for (let p = batchStart; p <= batchEnd; p++) {
              promises.push(
                fetch(`${rBase}/${type}/list?${authParams}&page=${p}`, { headers: { 'Accept': 'application/json' } })
                  .then(async (r) => {
                    if (!r.ok) { await r.text(); return []; }
                    const d = await r.json();
                    return d.items || d.data || (Array.isArray(d) ? d : []);
                  }).catch(() => [])
              );
            }
            const results = await Promise.all(promises);
            for (const items of results) {
              for (const item of items) {
                const u = String(item.username || '').trim().toLowerCase();
                if (u) rushUsers.set(u, 'rush');
              }
            }
          }
        } catch (e) { console.error(`[FixOrphans] Rush ${type} error:`, e); }
      }
      console.log(`[FixOrphans] Rush: ${rushUsers.size} users`);
    }

    // Now match orphans to servers
    const serverIdsByType: Record<string, string> = {};
    for (const [sid, stype] of Object.entries(serverMap)) {
      if (!serverIdsByType[stype]) serverIdsByType[stype] = sid;
    }

    // Also check NATV API
    const natvUsers = new Map<string, string>();
    const natvKey = apiSettings?.natv_api_key;
    const natvBase = (apiSettings?.natv_base_url || '').replace(/\/+$/, '') || 'https://api.pixbot.cloud';
    
    if (natvKey) {
      try {
        // NATV may have multiple servers - get the first NATV server
        const natvServerId = Object.entries(serverMap).find(([_, t]) => t === 'natv')?.[0];
        if (natvServerId) {
          // NATV API doesn't have a list endpoint that returns all users easily
          // We'll skip NATV for now and focus on The Best and Rush
          console.log('[FixOrphans] NATV: skipping (no bulk list endpoint)');
        }
      } catch (e) { console.error('[FixOrphans] NATV error:', e); }
    }

    let fixed = 0;
    const fixedDetails: string[] = [];

    for (const orphan of orphans) {
      const uname = String(orphan.username || '').trim().toLowerCase();
      if (!uname) continue;

      let matchedType: string | null = null;
      if (theBestUsers.has(uname)) matchedType = 'the_best';
      else if (rushUsers.has(uname)) matchedType = 'rush';

      if (matchedType) {
        // Find server IDs for this type
        const matchedServerIds = Object.entries(serverMap)
          .filter(([_, t]) => t === matchedType)
          .map(([id]) => id);

        if (matchedServerIds.length > 0) {
          // Use the first matching server
          const { error } = await supabaseAdmin
            .from('customers')
            .update({ server_id: matchedServerIds[0] })
            .eq('id', orphan.id);
          
          if (!error) {
            fixed++;
            if (fixedDetails.length < 20) {
              const serverName = servers?.find(s => s.id === matchedServerIds[0])?.server_name || matchedType;
              fixedDetails.push(`${orphan.username} -> ${serverName}`);
            }
          }
        }
      }
    }

    console.log(`[FixOrphans] Corrigidos: ${fixed}/${orphans.length}`);
    return new Response(JSON.stringify({
      success: true,
      total_orphans: orphans.length,
      fixed,
      remaining: orphans.length - fixed,
      sample_fixes: fixedDetails,
    }), { headers: jsonHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[FixOrphans] Erro:', error);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
