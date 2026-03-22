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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: any = {};
    try { body = await req.json(); } catch {}

    // RESTORE action
    if (body?.action === 'restore' && body?.backup_id) {
      // Fetch backup
      const { data: backup, error: bErr } = await supabaseAdmin
        .from('customer_backups')
        .select('backup_data, total_customers')
        .eq('id', body.backup_id)
        .single();

      if (bErr || !backup) {
        return new Response(JSON.stringify({ error: 'Backup não encontrado' }), { status: 404, headers: jsonHeaders });
      }

      const customers = backup.backup_data as any[];

      // Safety backup first
      const allCustomers: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabaseAdmin
          .from('customers')
          .select('id, name, phone, username, server_id, plan_id, due_date, status, screens, custom_price, notes, extra_months, created_by, start_date, created_at, password')
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        allCustomers.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      await supabaseAdmin.from('customer_backups').insert({
        backup_data: allCustomers,
        total_customers: allCustomers.length,
        backup_type: 'pre_restore',
      });

      // Delete all current customers
      // We need to delete in batches by fetching IDs
      const idsToDelete: string[] = [];
      from = 0;
      while (true) {
        const { data } = await supabaseAdmin.from('customers').select('id').range(from, from + 999);
        if (!data || data.length === 0) break;
        idsToDelete.push(...data.map(d => d.id));
        if (data.length < 1000) break;
        from += 1000;
      }

      // Delete in batches of 500
      for (let i = 0; i < idsToDelete.length; i += 500) {
        const batch = idsToDelete.slice(i, i + 500);
        await supabaseAdmin.from('customers').delete().in('id', batch);
      }

      // Re-insert from backup in batches
      let inserted = 0;
      for (let i = 0; i < customers.length; i += 100) {
        const batch = customers.slice(i, i + 100).map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          username: c.username || null,
          password: c.password || null,
          server_id: c.server_id || null,
          plan_id: c.plan_id || null,
          due_date: c.due_date,
          status: c.status || 'ativa',
          screens: c.screens || 1,
          custom_price: c.custom_price || null,
          notes: c.notes || null,
          extra_months: c.extra_months || 0,
          created_by: c.created_by || null,
          start_date: c.start_date || c.due_date,
          created_at: c.created_at || new Date().toISOString(),
        }));

        const { error: insErr } = await supabaseAdmin.from('customers').insert(batch);
        if (insErr) {
          console.error(`[Restore] Batch ${i} error:`, insErr);
        } else {
          inserted += batch.length;
        }
      }

      console.log(`[Restore] ${inserted}/${customers.length} clientes restaurados`);
      return new Response(JSON.stringify({
        success: true,
        restored: inserted,
        total: customers.length,
      }), { headers: jsonHeaders });
    }

    // DEFAULT: Create backup
    const allCustomers: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabaseAdmin
        .from('customers')
        .select('id, name, phone, username, server_id, plan_id, due_date, status, screens, custom_price, notes, extra_months, created_by, start_date, created_at, password')
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      allCustomers.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const { error } = await supabaseAdmin
      .from('customer_backups')
      .insert({
        backup_data: allCustomers,
        total_customers: allCustomers.length,
        backup_type: body?.backup_type || 'auto',
      });

    if (error) {
      console.error('[Backup] Erro ao salvar:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: jsonHeaders });
    }

    console.log(`[Backup] ${allCustomers.length} clientes salvos`);
    return new Response(JSON.stringify({ 
      success: true, 
      total_customers: allCustomers.length,
      timestamp: new Date().toISOString(),
    }), { headers: jsonHeaders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[Backup] Erro:', error);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
