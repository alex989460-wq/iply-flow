import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const results: Record<string, any> = {};

  // 1. THE BEST - get passwords from API
  try {
    const tbBase = Deno.env.get('THE_BEST_API_KEY') ? '' : '';
    const { data: apiSettings } = await supabaseAdmin
      .from('reseller_api_settings')
      .select('the_best_base_url, the_best_username, the_best_password')
      .limit(1)
      .single();

    if (apiSettings?.the_best_base_url && apiSettings?.the_best_username) {
      // Auth
      const authRes = await fetch(`${apiSettings.the_best_base_url}/auth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: apiSettings.the_best_username, password: apiSettings.the_best_password })
      });
      const authData = await authRes.json();
      const token = authData.access || authData.token;

      if (token) {
        // Fetch all lines with pagination
        let allLines: any[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const res = await fetch(`${apiSettings.the_best_base_url}/lines/?page=${page}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          const lines = data.results || data;
          if (Array.isArray(lines) && lines.length > 0) {
            allLines = allLines.concat(lines);
            page++;
            hasMore = !!data.next;
          } else {
            hasMore = false;
          }
        }

        // Update customers with passwords and dates
        let updated = 0;
        const batchSize = 50;
        for (let i = 0; i < allLines.length; i += batchSize) {
          const batch = allLines.slice(i, i + batchSize);
          for (const line of batch) {
            const username = String(line.username || line.login || '').trim();
            const password = String(line.password || line.senha || '').trim();
            const expDate = line.exp_date || line.expiration_date || line.vencimento;
            if (!username || !password) continue;

            let dueDate: string | null = null;
            if (expDate) {
              const ts = parseInt(expDate);
              if (!isNaN(ts) && ts > 1000000000) {
                dueDate = new Date(ts * 1000).toISOString().split('T')[0];
              } else if (typeof expDate === 'string' && expDate.includes('-')) {
                dueDate = expDate.split('T')[0];
              }
            }

            const updateData: any = { password };
            if (dueDate) updateData.due_date = dueDate;

            const { error } = await supabaseAdmin
              .from('customers')
              .update(updateData)
              .eq('username', username)
              .eq('server_id', '810fdf89-d03c-4757-b2bf-88640174c6a7');
            if (!error) updated++;
          }
        }
        results.the_best = { total_lines: allLines.length, updated };
      }
    }
  } catch (e) {
    results.the_best = { error: String(e) };
  }

  // 2. RUSH - get passwords from API
  try {
    const { data: apiSettings } = await supabaseAdmin
      .from('reseller_api_settings')
      .select('rush_base_url, rush_username, rush_password, rush_token')
      .limit(1)
      .single();

    if (apiSettings?.rush_base_url && apiSettings?.rush_token) {
      const rBase = apiSettings.rush_base_url;
      const authParams = `token=${apiSettings.rush_token}`;
      let updated = 0;

      for (const type of ['iptv', 'p2p']) {
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const res = await fetch(`${rBase}/${type}/list?${authParams}&page=${page}`);
          const data = await res.json();
          const users = data.data || data.users || data;
          if (!Array.isArray(users) || users.length === 0) { hasMore = false; break; }

          for (const u of users) {
            const username = String(u.username || u.login || '').trim();
            const password = String(u.password || u.senha || '').trim();
            const expDate = u.exp_date || u.expiration_date;
            if (!username || !password) continue;

            let dueDate: string | null = null;
            if (expDate) {
              const ts = parseInt(expDate);
              if (!isNaN(ts) && ts > 1000000000) {
                dueDate = new Date(ts * 1000).toISOString().split('T')[0];
              } else if (typeof expDate === 'string' && expDate.includes('-')) {
                dueDate = expDate.split('T')[0];
              }
            }

            const updateData: any = { password };
            if (dueDate) updateData.due_date = dueDate;

            const { error } = await supabaseAdmin
              .from('customers')
              .update(updateData)
              .eq('username', username)
              .eq('server_id', 'c5f4595d-1976-4e4c-80fc-19a1a2329f3a');
            if (!error) updated++;
          }
          page++;
          if (data.last_page && page > data.last_page) hasMore = false;
          if (data.total_pages && page > data.total_pages) hasMore = false;
          if (users.length < 10) hasMore = false;
        }
      }
      results.rush = { updated };
    }
  } catch (e) {
    results.rush = { error: String(e) };
  }

  // 3. NATV - get passwords from API
  try {
    const { data: apiSettings } = await supabaseAdmin
      .from('reseller_api_settings')
      .select('natv_api_key, natv_base_url')
      .limit(1)
      .single();

    const natvKey = apiSettings?.natv_api_key || Deno.env.get('NATV_API_KEY');
    const natvBase = apiSettings?.natv_base_url || Deno.env.get('NATV_BASE_URL');

    if (natvKey && natvBase) {
      const res = await fetch(`${natvBase}/api/users`, {
        headers: { 'Authorization': `Bearer ${natvKey}` }
      });
      const data = await res.json();
      const users = Array.isArray(data) ? data : (data.data || data.users || []);
      
      let updated = 0;
      for (const u of users) {
        const username = String(u.username || u.login || '').trim();
        const password = String(u.password || u.senha || '').trim();
        if (!username || !password) continue;

        const { error } = await supabaseAdmin
          .from('customers')
          .update({ password })
          .eq('username', username)
          .in('server_id', ['35e6242e-b2b5-419d-909c-c4f8757f3098', 'cda63d68-cdab-4ccf-88dd-aabba17a4af2']);
        if (!error) updated++;
      }
      results.natv = { total_users: users.length, updated };
    }
  } catch (e) {
    results.natv = { error: String(e) };
  }

  // 4. VPLAY - get passwords from MySQL
  try {
    const mysqlHost = Deno.env.get('VPLAY_MYSQL_HOST');
    const mysqlUser = Deno.env.get('VPLAY_MYSQL_USER');
    const mysqlPass = Deno.env.get('VPLAY_MYSQL_PASSWORD');
    const mysqlDb = Deno.env.get('VPLAY_MYSQL_DATABASE');
    const mysqlPort = Deno.env.get('VPLAY_MYSQL_PORT') || '3306';

    if (mysqlHost && mysqlUser && mysqlPass && mysqlDb) {
      // Use a MySQL proxy or direct connection approach
      // Since Deno doesn't have native MySQL, we'll use the mysql module
      const { Client } = await import('https://deno.land/x/mysql@v2.12.1/mod.ts');
      
      const client = await new Client().connect({
        hostname: mysqlHost,
        username: mysqlUser,
        password: mysqlPass,
        db: mysqlDb,
        port: parseInt(mysqlPort),
      });

      const rows = await client.query('SELECT username, password, exp_date FROM lines WHERE username IS NOT NULL');
      
      let updated = 0;
      for (const row of rows) {
        const username = String(row.username || '').trim();
        const password = String(row.password || '').trim();
        if (!username || !password) continue;

        let dueDate: string | null = null;
        if (row.exp_date) {
          const ts = parseInt(String(row.exp_date));
          if (!isNaN(ts) && ts > 1000000000) {
            dueDate = new Date(ts * 1000).toISOString().split('T')[0];
          }
        }

        const updateData: any = { password };
        if (dueDate) updateData.due_date = dueDate;

        const { error } = await supabaseAdmin
          .from('customers')
          .update(updateData)
          .eq('username', username)
          .in('server_id', ['6de9cecc-6f4e-47ab-9c2d-c9a4c6cfb715', '7b031292-86a8-4834-9240-884896595b23']);
        if (!error) updated++;
      }
      
      await client.close();
      results.vplay = { total_rows: rows.length, updated };
    }
  } catch (e) {
    results.vplay = { error: String(e) };
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
