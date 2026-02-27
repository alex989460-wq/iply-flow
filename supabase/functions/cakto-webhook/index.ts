import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // Validate webhook secret
    const webhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('[Cakto] CAKTO_WEBHOOK_SECRET não configurado');
      return new Response(JSON.stringify({ error: 'Webhook secret não configurado' }), { status: 500, headers: jsonHeaders });
    }

    const receivedSecret = req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret');
    
    const body = await req.json();
    console.log('[Cakto] Payload recebido:', JSON.stringify(body));

    // Cakto pode enviar o secret no header ou no body
    const payloadSecret = body?.secret || body?.webhook_secret;
    const secretToValidate = receivedSecret || payloadSecret;

    if (secretToValidate !== webhookSecret) {
      console.warn('[Cakto] Secret inválido');
      return new Response(JSON.stringify({ error: 'Secret inválido' }), { status: 401, headers: jsonHeaders });
    }

    // Check event type - only process purchase_approved
    const event = body?.event || body?.type || body?.status;
    const dataStatus = body?.data?.status;
    // Accept purchase_approved event OR paid status inside data
    if (event !== 'purchase_approved' && event !== 'approved' && dataStatus !== 'paid') {
      console.log(`[Cakto] Evento ignorado: ${event} (data.status: ${dataStatus})`);
      return new Response(JSON.stringify({ success: true, message: `Evento ${event} ignorado` }), { headers: jsonHeaders });
    }

    // Extract customer data - Cakto wraps everything inside body.data
    const caktoData = body?.data || body;
    const caktoId = caktoData?.id || caktoData?.refId || '';
    const customer = caktoData?.customer || caktoData?.buyer || body?.customer || body;
    const phone = customer?.phone || customer?.phone_number || customer?.cellphone || caktoData?.phone || body?.phone;
    
    if (!phone) {
      console.warn('[Cakto] Telefone não encontrado no payload');
      return new Response(JSON.stringify({ error: 'Telefone não encontrado no payload' }), { status: 400, headers: jsonHeaders });
    }

    console.log(`[Cakto] Compra aprovada - Telefone: ${phone}`);

    // Normalize phone: remove non-digits
    const phoneDigits = String(phone).replace(/\D/g, '');
    // Build search variants (with/without country code, with/without 9)
    const searchVariants = new Set<string>();
    searchVariants.add(phoneDigits);
    if (phoneDigits.startsWith('55') && phoneDigits.length >= 12) {
      searchVariants.add(phoneDigits.slice(2)); // without country code
    } else {
      searchVariants.add('55' + phoneDigits); // with country code
    }
    // Handle 9th digit variations for Brazilian numbers
    const withoutCC = phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits;
    if (withoutCC.length === 11 && withoutCC[2] === '9') {
      // Has 9th digit - add variant without it
      searchVariants.add('55' + withoutCC.slice(0, 2) + withoutCC.slice(3));
      searchVariants.add(withoutCC.slice(0, 2) + withoutCC.slice(3));
    } else if (withoutCC.length === 10) {
      // Missing 9th digit - add variant with it
      searchVariants.add('55' + withoutCC.slice(0, 2) + '9' + withoutCC.slice(2));
      searchVariants.add(withoutCC.slice(0, 2) + '9' + withoutCC.slice(2));
    }

    console.log(`[Cakto] Variantes de busca: ${[...searchVariants].join(', ')}`);

    // Use service role to search across all customers
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Search customer by phone variants
    let matchedCustomer: any = null;
    for (const variant of searchVariants) {
      const { data: candidates } = await supabaseAdmin
        .from('customers')
        .select('id, name, phone, username, server_id, plan_id, due_date, created_by, status, created_at')
        .ilike('phone', `%${variant}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (candidates && candidates.length > 0) {
        const scored = [...candidates].sort((a: any, b: any) => {
          const score = (c: any) =>
            (c.username?.trim() ? 2 : 0) +
            (c.server_id ? 2 : 0) +
            (c.plan_id ? 1 : 0) +
            (c.status === 'ativa' ? 1 : 0);

          const scoreDiff = score(b) - score(a);
          if (scoreDiff !== 0) return scoreDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        matchedCustomer = scored[0];
        console.log(
          `[Cakto] Cliente encontrado: ${matchedCustomer.name} (${matchedCustomer.phone}) via variante ${variant} | id=${matchedCustomer.id} | created_at=${matchedCustomer.created_at}`,
        );
        break;
      }
    }

    if (!matchedCustomer) {
      console.warn(`[Cakto] Nenhum cliente encontrado para telefone: ${phone}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Nenhum cliente encontrado com telefone ${phone}`,
        searched_variants: [...searchVariants],
      }), { status: 404, headers: jsonHeaders });
    }

    // ── Duplicate protection: check if this Cakto transaction was already processed ──
    if (caktoId) {
      const { data: existingPayment } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('customer_id', matchedCustomer.id)
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // last 1h
        .limit(1)
        .maybeSingle();

      if (existingPayment) {
        console.warn(`[Cakto] Pagamento duplicado detectado para ${matchedCustomer.name} (caktoId: ${caktoId}). Ignorando.`);
        return new Response(JSON.stringify({
          success: true,
          message: `Pagamento já processado para ${matchedCustomer.name}`,
          duplicate: true,
        }), { headers: jsonHeaders });
      }
    }

    // ── Determine duration from paid amount by matching against plans ──
    const paymentAmount = caktoData?.amount || caktoData?.baseAmount || body?.sale?.amount || body?.amount || 0;
    const amountNumeric = Number(String(paymentAmount).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

    // Load all plans for this owner to find the best match by price
    const { data: allPlans } = await supabaseAdmin
      .from('plans')
      .select('id, plan_name, duration_days, price')
      .eq('created_by', matchedCustomer.created_by)
      .order('price', { ascending: true });

    let durationDays = 30;
    let matchedPlanName = '';

    if (amountNumeric > 0 && allPlans && allPlans.length > 0) {
      // Account for multiple screens: effective price per screen
      const screens = matchedCustomer.screens || 1;
      const pricePerScreen = amountNumeric / screens;

      // Find closest plan by price (tolerance ±10%)
      let bestMatch: any = null;
      let bestDiff = Infinity;
      for (const plan of allPlans) {
        const diff = Math.abs(plan.price - pricePerScreen);
        const tolerance = plan.price * 0.1;
        if (diff <= tolerance && diff < bestDiff) {
          bestDiff = diff;
          bestMatch = plan;
        }
      }

      // Also try matching total amount directly (for custom_price customers)
      if (!bestMatch) {
        for (const plan of allPlans) {
          const diff = Math.abs(plan.price - amountNumeric);
          const tolerance = plan.price * 0.1;
          if (diff <= tolerance && diff < bestDiff) {
            bestDiff = diff;
            bestMatch = plan;
          }
        }
      }

      // Also check custom_price
      if (!bestMatch && matchedCustomer.custom_price) {
        const customerPrice = Number(matchedCustomer.custom_price);
        if (Math.abs(customerPrice - amountNumeric) <= customerPrice * 0.1) {
          // Use the customer's plan duration
          if (matchedCustomer.plan_id) {
            const { data: plan } = await supabaseAdmin
              .from('plans')
              .select('duration_days, plan_name')
              .eq('id', matchedCustomer.plan_id)
              .maybeSingle();
            if (plan) {
              durationDays = plan.duration_days;
              matchedPlanName = plan.plan_name;
            }
          }
        }
      }

      if (bestMatch) {
        durationDays = bestMatch.duration_days;
        matchedPlanName = bestMatch.plan_name;
      }
    } else if (matchedCustomer.plan_id) {
      // Fallback to customer's current plan
      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('duration_days, plan_name')
        .eq('id', matchedCustomer.plan_id)
        .maybeSingle();
      if (plan) {
        durationDays = plan.duration_days;
        matchedPlanName = plan.plan_name;
      }
    }

    console.log(`[Cakto] Plano detectado: ${matchedPlanName || 'padrão'} (${durationDays} dias) | Valor pago: R$ ${amountNumeric.toFixed(2)} | Telas: ${matchedCustomer.screens || 1}`);

    // Calculate new due date
    const today = new Date();
    const currentDueDate = matchedCustomer.due_date ? new Date(matchedCustomer.due_date + 'T00:00:00') : today;
    const baseDate = currentDueDate > today ? currentDueDate : today;
    baseDate.setDate(baseDate.getDate() + durationDays);
    const newDueDate = baseDate.toISOString().split('T')[0];

    console.log(`[Cakto] Nova data de vencimento: ${newDueDate} (duração: ${durationDays} dias)`);

    // Update customer due_date and status
    await supabaseAdmin
      .from('customers')
      .update({ due_date: newDueDate, status: 'ativa' })
      .eq('id', matchedCustomer.id);

    // Register payment
    if (amountNumeric > 0) {
      await supabaseAdmin.from('payments').insert({
        customer_id: matchedCustomer.id,
        amount: amountNumeric,
        payment_date: today.toISOString().split('T')[0],
        method: 'pix',
        confirmed: true,
      });
      console.log(`[Cakto] Pagamento registrado: R$ ${amountNumeric.toFixed(2)}`);
    }

    // ── Save payment confirmation for the dynamic page ──
    let confirmationId = '';
    try {
      const { data: confirmation } = await supabaseAdmin
        .from('payment_confirmations')
        .insert({
          customer_id: matchedCustomer.id,
          customer_name: matchedCustomer.name,
          customer_phone: matchedCustomer.phone,
          amount: amountNumeric,
          plan_name: matchedPlanName || null,
          duration_days: durationDays,
          new_due_date: newDueDate,
          status: 'approved',
        })
        .select('id')
        .single();
      
      if (confirmation) {
        confirmationId = confirmation.id;
        console.log(`[Cakto] Confirmação salva: ${confirmationId}`);
      }
    } catch (e) {
      console.error('[Cakto] Erro ao salvar confirmação:', e);
    }

    // ── Send Meta WhatsApp template (pedido_aprovado) ──
    if (confirmationId) {
      try {
        // Get the owner's Meta settings
        const { data: zapSettings } = await supabaseAdmin
          .from('zap_responder_settings')
          .select('meta_access_token, meta_phone_number_id, api_type')
          .eq('user_id', matchedCustomer.created_by)
          .eq('api_type', 'meta_cloud')
          .maybeSingle();

        if (zapSettings?.meta_access_token && zapSettings?.meta_phone_number_id) {
          // Format phone for Meta API (must have country code, no +)
          let metaPhone = phoneDigits;
          if (!metaPhone.startsWith('55')) metaPhone = '55' + metaPhone;

          const siteUrl = 'https://iply-flow.lovable.app';
          const confirmationUrl = `${siteUrl}/pedido/${confirmationId}`;

          const templatePayload = {
            messaging_product: 'whatsapp',
            to: metaPhone,
            type: 'template',
            template: {
              name: 'pedido_aprovado',
              language: { code: 'pt_BR' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: matchedCustomer.name },
                    { type: 'text', text: `R$ ${amountNumeric.toFixed(2).replace('.', ',')}` },
                    { type: 'text', text: matchedPlanName || `${durationDays} dias` },
                  ],
                },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [
                    { type: 'text', text: confirmationId },
                  ],
                },
              ],
            },
          };

          const metaResp = await fetch(
            `https://graph.facebook.com/v21.0/${zapSettings.meta_phone_number_id}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${zapSettings.meta_access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(templatePayload),
            },
          );
          const metaResult = await metaResp.json();
          console.log(`[Cakto] Meta template enviado: status=${metaResp.status}`, JSON.stringify(metaResult));
        } else {
          console.log('[Cakto] Meta Cloud API não configurada para este usuário. Template não enviado.');
        }
      } catch (e) {
        console.error('[Cakto] Erro ao enviar template Meta:', e);
      }
    }

    // ── Trigger server renewals for each username (supports comma-separated) ──
    const renewResults: any[] = [];
    if (matchedCustomer.username?.trim()) {
      const usernames = matchedCustomer.username
        .split(',')
        .map((u: string) => u.trim())
        .filter((u: string) => u.length > 0);

      console.log(`[Cakto] Usernames para renovar: ${usernames.join(', ')} (${usernames.length} conexões)`);

      // ── VPlay renewal ──
      if (matchedCustomer.server_id) {
        let vplayUrl = '';
        let keyMessage = 'XCLOUD';

        const { data: vplayServer } = await supabaseAdmin
          .from('vplay_servers')
          .select('integration_url, key_message')
          .eq('user_id', matchedCustomer.created_by)
          .eq('is_default', true)
          .maybeSingle();

        if (vplayServer?.integration_url) {
          vplayUrl = vplayServer.integration_url.replace(/\/+$/, '');
          keyMessage = vplayServer.key_message || 'XCLOUD';
        } else {
          const { data: billingSettings } = await supabaseAdmin
            .from('billing_settings')
            .select('vplay_integration_url, vplay_key_message')
            .eq('user_id', matchedCustomer.created_by)
            .maybeSingle();

          if (billingSettings?.vplay_integration_url) {
            vplayUrl = billingSettings.vplay_integration_url.replace(/\/+$/, '');
            keyMessage = billingSettings.vplay_key_message || 'XCLOUD';
          }
        }

        if (vplayUrl) {
          for (const username of usernames) {
            try {
              console.log(`[Cakto] Renovando VPlay: ${username} por ${durationDays} dias`);
              const vplayResp = await fetch(vplayUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  key: keyMessage,
                  action: 'renew',
                  username,
                  duration: durationDays,
                }),
              });
              const vplayText = await vplayResp.text();
              let result: any;
              try { result = JSON.parse(vplayText); } catch { result = { raw: vplayText }; }
              renewResults.push({ panel: 'vplay', username, success: vplayResp.ok, result });
              console.log(`[Cakto] VPlay renew ${username}:`, JSON.stringify(result));
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : 'Erro desconhecido';
              renewResults.push({ panel: 'vplay', username, success: false, error: errMsg });
              console.error(`[Cakto] Erro renovando VPlay ${username}:`, e);
            }
          }
        }
      }

      // ── NATV renewal ──
      // Try per-reseller settings first, then fall back to global env vars
      let natvApiKey = '';
      let natvBaseUrl = '';

      const { data: resellerApiSettings } = await supabaseAdmin
        .from('reseller_api_settings')
        .select('natv_api_key, natv_base_url')
        .eq('user_id', matchedCustomer.created_by)
        .maybeSingle();

      if (resellerApiSettings?.natv_api_key && resellerApiSettings?.natv_base_url) {
        natvApiKey = resellerApiSettings.natv_api_key;
        natvBaseUrl = resellerApiSettings.natv_base_url.replace(/\/+$/, '');
        console.log(`[Cakto] Usando chaves NATV do revendedor`);
      } else {
        natvApiKey = Deno.env.get('NATV_API_KEY') || '';
        natvBaseUrl = (Deno.env.get('NATV_BASE_URL') || '').replace(/\/+$/, '');
        if (natvApiKey && natvBaseUrl) {
          console.log(`[Cakto] Usando chaves NATV globais (fallback)`);
        }
      }

      if (natvApiKey && natvBaseUrl) {
        const daysToMonths: Record<number, number> = { 30: 1, 60: 2, 90: 3, 120: 4, 150: 5, 180: 6, 360: 12, 365: 12 };
        const months = daysToMonths[durationDays] || Math.max(1, Math.round(durationDays / 30));
        const validMonths = [1, 2, 3, 4, 5, 6, 12];
        const natvMonths = validMonths.includes(months) ? months : validMonths.reduce((prev, curr) =>
          Math.abs(curr - months) < Math.abs(prev - months) ? curr : prev
        );

        for (const username of usernames) {
          try {
            console.log(`[Cakto] Renovando NATV: ${username} por ${natvMonths} meses`);
            const natvResp = await fetch(`${natvBaseUrl}/user/activation`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${natvApiKey}`,
              },
              body: JSON.stringify({ username, months: natvMonths }),
            });
            const natvText = await natvResp.text();
            let result: any;
            try { result = JSON.parse(natvText); } catch { result = { raw: natvText }; }
            renewResults.push({ panel: 'natv', username, success: natvResp.ok, result });
            console.log(`[Cakto] NATV renew ${username}: status=${natvResp.status}`, JSON.stringify(result));
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : 'Erro desconhecido';
            renewResults.push({ panel: 'natv', username, success: false, error: errMsg });
            console.error(`[Cakto] Erro renovando NATV ${username}:`, e);
          }
        }
      } else {
        console.log(`[Cakto] NATV não configurado (API_KEY: ${natvApiKey ? 'sim' : 'não'}, BASE_URL: ${natvBaseUrl ? 'sim' : 'não'})`);
      }

      if (renewResults.length === 0) {
        console.log(`[Cakto] Nenhum painel configurado para renovação. Apenas due_date atualizado.`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Cliente ${matchedCustomer.name} renovado até ${newDueDate}`,
      customer_id: matchedCustomer.id,
      customer_name: matchedCustomer.name,
      new_due_date: newDueDate,
      duration_days: durationDays,
      matched_plan: matchedPlanName || null,
      payment_registered: amountNumeric > 0,
      payment_amount: amountNumeric,
      confirmation_id: confirmationId || null,
      usernames_renewed: renewResults.length,
      server_renewals: renewResults,
    }), { headers: jsonHeaders });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[Cakto] Erro:', error);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: jsonHeaders });
  }
});
