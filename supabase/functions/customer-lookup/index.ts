import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const normalizePhoneVariants = (phone: string) => {
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  const variants = new Set<string>();

  if (!phoneDigits) return { phoneDigits: '', canonicalPhone: '', variants: [] as string[] };

  variants.add(phoneDigits);

  if (phoneDigits.startsWith('55') && phoneDigits.length >= 12) {
    variants.add(phoneDigits.slice(2));
  } else {
    variants.add(`55${phoneDigits}`);
  }

  const withoutCC = phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits;

  if (withoutCC.length === 11 && withoutCC[2] === '9') {
    variants.add(`55${withoutCC.slice(0, 2)}${withoutCC.slice(3)}`);
    variants.add(`${withoutCC.slice(0, 2)}${withoutCC.slice(3)}`);
  } else if (withoutCC.length === 10) {
    variants.add(`55${withoutCC.slice(0, 2)}9${withoutCC.slice(2)}`);
    variants.add(`${withoutCC.slice(0, 2)}9${withoutCC.slice(2)}`);
  }

  const canonicalPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
  variants.add(canonicalPhone);

  return { phoneDigits, canonicalPhone, variants: [...variants] };
};

const parseCustomerIds = (body: any): string[] => {
  const fromArrayLike =
    body?.customer_ids ??
    body?.customerIds ??
    body?.selected_customer_ids ??
    body?.selectedCustomerIds;

  const fromSingle = body?.customer_id ?? body?.customerId ?? body?.selected_customer_id ?? body?.selectedCustomerId;

  let rawIds: unknown[] = [];

  if (Array.isArray(fromArrayLike)) {
    rawIds = fromArrayLike;
  } else if (typeof fromArrayLike === 'string') {
    rawIds = fromArrayLike.split(',');
  } else if (fromSingle) {
    rawIds = [fromSingle];
  }

  return [...new Set(rawIds.map((v) => String(v || '').trim()).filter(Boolean))];
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
      const { phoneDigits, variants } = normalizePhoneVariants(phone);

      if (!phoneDigits || phoneDigits.length < 10) {
        return new Response(JSON.stringify({ error: 'Telefone inválido. Informe pelo menos 10 dígitos.' }), { status: 400, headers: jsonHeaders });
      }

      console.log(`[CustomerLookup] lookup iniciado | phone=${phoneDigits} | variants=${variants.join(',')}`);

      // Search customers
      const allCustomers: any[] = [];
      for (const variant of variants) {
        const { data: candidates } = await supabase
          .from('customers')
          .select(`
            id, name, username, phone, due_date, status, screens, custom_price,
            plan_id, server_id,
            plans:plan_id (plan_name, price, duration_days),
            servers:server_id (server_name)
          `)
          .ilike('phone', `%${variant}%`)
          .in('status', ['ativa', 'inativa'])
          .order('due_date', { ascending: true })
          .limit(20);

        if (candidates) {
          for (const c of candidates) {
            if (!allCustomers.find((m) => m.id === c.id)) {
              allCustomers.push(c);
            }
          }
        }
      }

      if (allCustomers.length === 0) {
        console.log(`[CustomerLookup] lookup sem resultados | phone=${phoneDigits}`);
        return new Response(JSON.stringify({ error: 'Nenhum cliente ativo encontrado com esse telefone.' }), { status: 404, headers: jsonHeaders });
      }

      // Return sanitized data (no internal IDs exposed beyond customer id)
      const result = allCustomers.map((c) => {
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
      const body = await req.json().catch(() => ({}));
      const phone = body?.phone || body?.customer_phone || body?.customerPhone || '';
      const customerIds = parseCustomerIds(body);

      const { phoneDigits, canonicalPhone, variants } = normalizePhoneVariants(phone);

      if (!phoneDigits || phoneDigits.length < 10 || customerIds.length === 0) {
        return new Response(
          JSON.stringify({
            error: 'phone e customer_ids são obrigatórios.',
            hint: 'Aceito: customer_ids (array), customerIds (array/string), customer_id (string).',
          }),
          { status: 400, headers: jsonHeaders },
        );
      }

      // Validate customer IDs against provided phone (prevents wrong/forged mapping)
      const { data: existingCustomers, error: existingError } = await supabase
        .from('customers')
        .select('id, phone, status')
        .in('id', customerIds)
        .eq('status', 'ativa');

      if (existingError) {
        console.error('[CustomerLookup] Erro ao validar customer_ids:', existingError);
        return new Response(JSON.stringify({ error: 'Erro ao validar clientes selecionados.' }), { status: 500, headers: jsonHeaders });
      }

      const validCustomerIds = (existingCustomers || [])
        .filter((c: any) => {
          const customerPhoneDigits = String(c.phone || '').replace(/\D/g, '');
          return variants.some((v) => customerPhoneDigits.includes(v) || v.includes(customerPhoneDigits));
        })
        .map((c: any) => c.id);

      if (validCustomerIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Nenhum customer_id válido encontrado para este telefone.' }),
          { status: 400, headers: jsonHeaders },
        );
      }

      if (validCustomerIds.length !== customerIds.length) {
        console.log(`[CustomerLookup] select parcial | recebidos=${customerIds.length} válidos=${validCustomerIds.length} phone=${canonicalPhone}`);
      }

      // Clear previous pending selections for all phone variants (unused only)
      await supabase
        .from('pending_renewal_selections')
        .delete()
        .in('phone_normalized', variants)
        .eq('used', false);

      // Insert new selections (save with canonical phone to keep deterministic matching)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const inserts = validCustomerIds.map((cid: string) => ({
        phone_normalized: canonicalPhone,
        customer_id: cid,
        expires_at: expiresAt,
      }));

      const { error: insertError } = await supabase
        .from('pending_renewal_selections')
        .insert(inserts);

      if (insertError) {
        console.error('[CustomerLookup] Erro ao salvar seleção:', insertError);
        return new Response(JSON.stringify({ error: 'Erro ao salvar seleção.' }), { status: 500, headers: jsonHeaders });
      }

      console.log(`[CustomerLookup] select salvo | phone=${canonicalPhone} | clientes=${validCustomerIds.join(',')} | expira=${expiresAt}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: `${validCustomerIds.length} cliente(s) selecionado(s) para renovação.`,
          selected_count: validCustomerIds.length,
          expires_at: expiresAt,
          phone_normalized: canonicalPhone,
        }),
        { headers: jsonHeaders },
      );
    }

    return new Response(JSON.stringify({ error: 'Ação inválida. Use action=lookup ou action=select.' }), { status: 400, headers: jsonHeaders });

  } catch (err) {
    console.error('[CustomerLookup] Erro:', err);
    return new Response(JSON.stringify({ error: 'Erro interno.' }), { status: 500, headers: jsonHeaders });
  }
});
