import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get today's date in São Paulo timezone
    const now = new Date();
    const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStr = `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, '0')}-${String(spNow.getDate()).padStart(2, '0')}`;
    const monthStart = `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, '0')}-01`;

    const todayFmt = `${String(spNow.getDate()).padStart(2, '0')}/${String(spNow.getMonth() + 1).padStart(2, '0')}/${spNow.getFullYear()}`;

    console.log(`[DailyReport] Generating report for ${todayStr}`);

    // 1. Today's revenue and payment count
    const { data: todayPayments, error: payErr } = await supabaseAdmin
      .from('payments')
      .select('amount, customer_id')
      .eq('payment_date', todayStr);

    if (payErr) throw payErr;

    const todayRevenue = todayPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const todayCount = todayPayments?.length || 0;

    // 2. Monthly revenue
    const { data: monthPayments, error: monthErr } = await supabaseAdmin
      .from('payments')
      .select('amount')
      .gte('payment_date', monthStart)
      .lte('payment_date', todayStr);

    if (monthErr) throw monthErr;

    const monthRevenue = monthPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

    // 3. Get renewed customer IDs (those who had payments today) with server info
    const renewedCustomerIds = [...new Set(todayPayments?.map(p => p.customer_id) || [])];
    
    // 4. Server distribution of renewed customers
    const serverCounts: Record<string, number> = {};
    
    if (renewedCustomerIds.length > 0) {
      const { data: customers, error: custErr } = await supabaseAdmin
        .from('customers')
        .select('id, server_id')
        .in('id', renewedCustomerIds);

      if (custErr) throw custErr;

      const serverIds = [...new Set((customers || []).map(c => c.server_id).filter(Boolean))];
      
      let serverMap: Record<string, string> = {};
      if (serverIds.length > 0) {
        const { data: servers } = await supabaseAdmin
          .from('servers')
          .select('id, server_name')
          .in('id', serverIds);
        
        servers?.forEach(s => { serverMap[s.id] = s.server_name; });
      }

      customers?.forEach(c => {
        const name = c.server_id ? (serverMap[c.server_id] || 'Desconhecido') : 'Sem servidor';
        serverCounts[name] = (serverCounts[name] || 0) + 1;
      });
    }

    // Build server breakdown text
    let serverText = '';
    const serverEntries = Object.entries(serverCounts).sort((a, b) => b[1] - a[1]);
    if (serverEntries.length > 0) {
      serverText = serverEntries.map(([name, count]) => `   🖥️ ${name}: *${count}*`).join('\n');
    } else {
      serverText = '   Nenhuma renovação hoje';
    }

    // Build the report message
    const reportMsg = `📊 *Relatório Diário - ${todayFmt}*\n\n` +
      `💰 *Faturamento Hoje:* R$ ${todayRevenue.toFixed(2)}\n` +
      `💰 *Faturamento Mensal:* R$ ${monthRevenue.toFixed(2)}\n\n` +
      `👥 *Clientes Renovados Hoje:* ${todayCount}\n` +
      `🔄 *Clientes Únicos:* ${renewedCustomerIds.length}\n\n` +
      `📦 *Renovações por Servidor:*\n${serverText}`;

    console.log(`[DailyReport] Report:`, reportMsg);

    // Find admin's zap settings to send via WhatsApp
    // Get admin user
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    if (!adminRole) {
      console.log('[DailyReport] No admin found');
      return new Response(JSON.stringify({ error: 'No admin found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const { data: zapSettings } = await supabaseAdmin
      .from('zap_responder_settings')
      .select('selected_department_id')
      .eq('user_id', adminRole.user_id)
      .maybeSingle();

    if (!zapSettings?.selected_department_id) {
      console.log('[DailyReport] No department configured');
      return new Response(JSON.stringify({ error: 'No department configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const adminPhone = '5541991758392';

    const sendResp = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          action: 'enviar-mensagem',
          department_id: zapSettings.selected_department_id,
          number: adminPhone,
          text: reportMsg,
          user_id: adminRole.user_id,
        }),
      },
    );

    const sendResult = await sendResp.json();
    console.log(`[DailyReport] WhatsApp send result:`, JSON.stringify(sendResult));

    return new Response(JSON.stringify({ success: true, report: reportMsg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[DailyReport] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
