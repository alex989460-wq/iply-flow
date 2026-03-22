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

    // Fetch all customers with pagination
    const allCustomers: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabaseAdmin
        .from('customers')
        .select('id, name, phone, username, server_id, plan_id, due_date, status, screens, custom_price, notes, extra_months, created_by, start_date, created_at')
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      allCustomers.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Store backup
    const { error } = await supabaseAdmin
      .from('customer_backups')
      .insert({
        backup_data: allCustomers,
        total_customers: allCustomers.length,
        backup_type: 'auto',
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
