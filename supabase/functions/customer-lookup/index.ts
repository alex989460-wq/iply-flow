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
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── ACTION: lookup - Search customers by phone ──
    if (action === 'lookup') {
      const phone = url.searchParams.get('phone') || '';
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        return new Response(JSON.stringify({ error: 'Telefone inválido. Informe pelo menos 10 dígitos.' }), { status: 400, headers: jsonHeaders });
      }

      const phoneDigits = phone.replace(/\D/g, '');

      // Build search variants
      const searchVariants = new Set<string>();
      searchVariants.add(phoneDigits);
      if (phoneDigits.startsWith('55') && phoneDigits.length >= 12) {
        searchVariants.add(phoneDigits.slice(2));
      } else {
        searchVariants.add('55' + phoneDigits);
      }
      const withoutCC = phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits;
      if (withoutCC.length === 11 && withoutCC[2] === '9') {
        searchVariants.add('55' + withoutCC.slice(0, 2) + withoutCC.slice(3));
        searchVariants.add(withoutCC.slice(0, 2) + withoutCC.slice(3));
      } else if (withoutCC.length === 10) {
        searchVariants.add('55' + withoutCC.slice(0, 2) + '9' + withoutCC.slice(2));
        searchVariants.add(withoutCC.slice(0, 2) + '9' + withoutCC.slice(2));
      }

      // Search customers
      const allCustomers: any[] = [];
      for (const variant of searchVariants) {
        const { data: candidates } = await supabase
          .from('customers')
          .select(`
            id, name, username, phone, due_date, status, screens, custom_price,
            plan_id, server_id,
            plans:plan_id (plan_name, price, duration_days),
            servers:server_id (server_name)
          `)
          .ilike('phone', `%${variant}%`)
          .eq('status', 'ativa')
          .order('due_date', { ascending: true })
          .limit(20);

        if (candidates) {
          for (const c of candidates) {
            if (!allCustomers.find(m => m.id === c.id)) {
              allCustomers.push(c);
            }
          }
        }
      }

      if (allCustomers.length === 0) {
        return new Response(JSON.stringify({ error: 'Nenhum cliente ativo encontrado com esse telefone.' }), { status: 404, headers: jsonHeaders });
      }

      // Return sanitized data (no internal IDs exposed beyond customer id)
      const result = allCustomers.map(c => {
        const unitPrice = c.custom_price || (c.plans as any)?.price || 0;
        return {
          id: c.id,
          name: c.name,
          username: c.username || null,
          due_date: c.due_date,
          screens: c.screens || 1,
          plan_name: (c.plans as any)?.plan_name || null,
          plan_price: Number(unitPrice),
          server_name: (c.servers as any)?.server_name || null,
        };
      });

      // Calculate total if all selected
      const totalPrice = result.reduce((sum, c) => sum + c.plan_price, 0);

      return new Response(JSON.stringify({ customers: result, total_price: totalPrice }), { headers: jsonHeaders });
    }

    // ── ACTION: select - Store pre-payment selection ──
    if (action === 'select') {
      const body = await req.json();
      const { phone, customer_ids } = body;

      if (!phone || !customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
        return new Response(JSON.stringify({ error: 'phone e customer_ids são obrigatórios.' }), { status: 400, headers: jsonHeaders });
      }

      const phoneDigits = phone.replace(/\D/g, '');

      // Clear previous pending selections for this phone
      await supabase
        .from('pending_renewal_selections')
        .delete()
        .eq('phone_normalized', phoneDigits)
        .eq('used', false);

      // Insert new selections
      const inserts = customer_ids.map((cid: string) => ({
        phone_normalized: phoneDigits,
        customer_id: cid,
      }));

      const { error: insertError } = await supabase
        .from('pending_renewal_selections')
        .insert(inserts);

      if (insertError) {
        console.error('[CustomerLookup] Erro ao salvar seleção:', insertError);
        return new Response(JSON.stringify({ error: 'Erro ao salvar seleção.' }), { status: 500, headers: jsonHeaders });
      }

      return new Response(JSON.stringify({ success: true, message: `${customer_ids.length} cliente(s) selecionado(s) para renovação.` }), { headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida. Use action=lookup ou action=select.' }), { status: 400, headers: jsonHeaders });

  } catch (err) {
    console.error('[CustomerLookup] Erro:', err);
    return new Response(JSON.stringify({ error: 'Erro interno.' }), { status: 500, headers: jsonHeaders });
  }
});
