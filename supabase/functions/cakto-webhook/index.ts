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
    // Validate webhook secret - check global first, then per-reseller
    const globalWebhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET');
    const receivedSecret = req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret');
    
    const body = await req.json();
    console.log('[Cakto] Payload recebido:', JSON.stringify(body));

    const payloadSecret = body?.secret || body?.webhook_secret;
    const secretToValidate = receivedSecret || payloadSecret;

    // First try global secret
    let secretValid = false;
    if (globalWebhookSecret && secretToValidate === globalWebhookSecret) {
      secretValid = true;
    }

    // If global didn't match, try all reseller secrets
    if (!secretValid && secretToValidate) {
      const supabaseCheck = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data: matchingReseller } = await supabaseCheck
        .from('reseller_api_settings')
        .select('user_id')
        .eq('cakto_webhook_secret', secretToValidate)
        .limit(1)
        .maybeSingle();

      if (matchingReseller) {
        secretValid = true;
        console.log(`[Cakto] Secret validado via revendedor: ${matchingReseller.user_id}`);
      }
    }

    if (!secretValid) {
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

    // Search ALL customers by phone variants (supports multi-screen / multi-customer)
    let allMatchedCustomers: any[] = [];
    for (const variant of searchVariants) {
      const { data: candidates } = await supabaseAdmin
        .from('customers')
        .select('id, name, phone, username, server_id, plan_id, due_date, created_by, status, created_at, custom_price, screens')
        .ilike('phone', `%${variant}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (candidates && candidates.length > 0) {
        // Deduplicate by id
        for (const c of candidates) {
          if (!allMatchedCustomers.find((m: any) => m.id === c.id)) {
            allMatchedCustomers.push(c);
          }
        }
      }
    }

    // Sort by due_date ascending (closest to expiration / already expired first)
    // This ensures each payment renews the most urgent customer
    allMatchedCustomers.sort((a: any, b: any) => {
      const dateA = a.due_date ? new Date(a.due_date + 'T00:00:00').getTime() : 0;
      const dateB = b.due_date ? new Date(b.due_date + 'T00:00:00').getTime() : 0;
      if (dateA !== dateB) return dateA - dateB; // expired/closer first
      // Tiebreaker: prefer customers with username and server configured
      const score = (c: any) =>
        (c.username?.trim() ? 2 : 0) +
        (c.server_id ? 2 : 0) +
        (c.plan_id ? 1 : 0);
      return score(b) - score(a);
    });

    if (allMatchedCustomers.length === 0) {
      console.warn(`[Cakto] Nenhum cliente encontrado para telefone: ${phone}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Nenhum cliente encontrado com telefone ${phone}`,
        searched_variants: [...searchVariants],
      }), { status: 404, headers: jsonHeaders });
    }

    // Pick only the FIRST customer (closest to expiration) for this payment
    const matchedCustomer = allMatchedCustomers[0];
    console.log(`[Cakto] ${allMatchedCustomers.length} cliente(s) encontrado(s) para telefone ${phone}. Renovando apenas: ${matchedCustomer.name} (${matchedCustomer.username || '-'}) due=${matchedCustomer.due_date}`);
    for (const c of allMatchedCustomers) {
      console.log(`  - ${c.name} (${c.username || '-'}) id=${c.id} status=${c.status} due=${c.due_date}`);
    }

    // ── Determine payment amount early (used for duplicate protection) ──
    const paymentAmount = caktoData?.amount || caktoData?.baseAmount || body?.sale?.amount || body?.amount || 0;
    const amountNumeric = Number(String(paymentAmount).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

    // ── Duplicate protection: only block near-instant retries with same amount ──
    if (caktoId && amountNumeric > 0) {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const amountMin = Number((amountNumeric - 0.01).toFixed(2));
      const amountMax = Number((amountNumeric + 0.01).toFixed(2));

      const { data: existingPayment } = await supabaseAdmin
        .from('payments')
        .select('id, amount, created_at')
        .eq('customer_id', matchedCustomer.id)
        .eq('method', 'pix')
        .gte('created_at', twoMinutesAgo)
        .gte('amount', amountMin)
        .lte('amount', amountMax)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPayment) {
        console.warn(
          `[Cakto] Retry duplicado detectado para ${matchedCustomer.name} (caktoId: ${caktoId}, paymentId: ${existingPayment.id}). Ignorando.`,
        );
        return new Response(JSON.stringify({
          success: true,
          message: `Pagamento já processado para ${matchedCustomer.name}`,
          duplicate: true,
        }), { headers: jsonHeaders });
      }
    }

    // ── Determine duration from paid amount by matching against plans ──

    // Load all plans for this owner to find the best match by price
    const { data: allPlans } = await supabaseAdmin
      .from('plans')
      .select('id, plan_name, duration_days, price')
      .eq('created_by', matchedCustomer.created_by)
      .order('price', { ascending: true });

    let durationDays = 30;
    let matchedPlanName = '';
    let bestMatch: any = null;

    if (amountNumeric > 0 && allPlans && allPlans.length > 0) {
      // 1) If customer already has a plan, prioritize keeping it
      //    Only switch if paid amount EXACTLY matches a DIFFERENT plan
      if (matchedCustomer.plan_id) {
        const currentPlan = allPlans.find((p: any) => p.id === matchedCustomer.plan_id);
        if (currentPlan) {
          const customerPrice = matchedCustomer.custom_price ? Number(matchedCustomer.custom_price) : null;
          const isCustomMatch = customerPrice && Math.abs(customerPrice - amountNumeric) <= customerPrice * 0.15;
          // Check if another plan matches the amount exactly (±1%)
          const exactOtherPlan = allPlans.find((p: any) => p.id !== currentPlan.id && Math.abs(p.price - amountNumeric) <= p.price * 0.01);
          
          if (isCustomMatch || !exactOtherPlan) {
            bestMatch = currentPlan;
            console.log(`[Cakto] Mantendo plano atual: ${currentPlan.plan_name} (R$ ${currentPlan.price}) | Valor pago: R$ ${amountNumeric.toFixed(2)}${isCustomMatch ? ' (custom_price)' : ' (sem match exato com outro plano)'}`);
          }
        }
      }

      // 2) If no match yet, try matching total amount against plans (±10%)
      if (!bestMatch) {
        let bestDiff = Infinity;
        for (const plan of allPlans) {
          const diff = Math.abs(plan.price - amountNumeric);
          const tolerance = plan.price * 0.1;
          if (diff <= tolerance && diff < bestDiff) {
            bestDiff = diff;
            bestMatch = plan;
          }
        }
      }

      // 3) custom_price fallback
      if (!bestMatch && matchedCustomer.custom_price) {
        const customerPrice = Number(matchedCustomer.custom_price);
        if (Math.abs(customerPrice - amountNumeric) <= customerPrice * 0.1) {
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

    // Prepare calendar month mapping
    const today = new Date();
    const daysToMonths: Record<number, number> = { 30: 1, 90: 3, 180: 6, 365: 12 };
    const monthsToAdd = daysToMonths[durationDays];

    console.log(`[Cakto] ${allMatchedCustomers.length} cliente(s) (duração: ${durationDays} dias, meses: ${monthsToAdd || 'N/A'})`);

    // ── Conflict detection: multiple customers with same due_date ──
    if (allMatchedCustomers.length > 1) {
      const todayStr = today.toISOString().split('T')[0];
      // Check if 2+ customers share the same due_date (or both expired)
      const sameDueCustomers = allMatchedCustomers.filter((c: any) => {
        const d = c.due_date || '';
        return d === matchedCustomer.due_date || (d < todayStr && (matchedCustomer.due_date || '') < todayStr);
      });

      if (sameDueCustomers.length > 1) {
        console.log(`[Cakto] CONFLITO: ${sameDueCustomers.length} clientes com mesmo vencimento (${matchedCustomer.due_date}). Notificando admin.`);

        // Register payment without confirming (so money isn't lost)
        if (amountNumeric > 0) {
          await supabaseAdmin.from('payments').insert({
            customer_id: matchedCustomer.id,
            amount: amountNumeric,
            payment_date: todayStr,
            method: 'pix',
            confirmed: false, // NOT confirmed - admin must decide
            source: 'cakto',
          });
          console.log(`[Cakto] Pagamento registrado SEM confirmação para decisão do admin`);
        }

        // Notify reseller via WhatsApp
        try {
          const { data: zapSettings } = await supabaseAdmin
            .from('zap_responder_settings')
            .select('selected_department_id')
            .eq('user_id', matchedCustomer.created_by)
            .maybeSingle();

          const { data: bSettings } = await supabaseAdmin
            .from('billing_settings')
            .select('notification_phone')
            .eq('user_id', matchedCustomer.created_by)
            .maybeSingle();

          const conflictPhone = bSettings?.notification_phone;

          if (zapSettings?.selected_department_id && conflictPhone) {
            const customerList = sameDueCustomers.map((c: any) =>
              `  • ${c.name} (${c.username || '-'}) - Venc: ${c.due_date}`
            ).join('\n');

            const adminMsg = `⚠️ *Atenção: Pagamento requer decisão manual*\n\n📞 Telefone: ${phoneDigits}\n💰 Valor: *R$ ${amountNumeric.toFixed(2)}*\n📦 Plano: *${matchedPlanName || '-'}*\n\n👥 *${sameDueCustomers.length} clientes com mesmo vencimento:*\n${customerList}\n\n⏳ Pagamento registrado mas *NÃO confirmado*. Confirme manualmente qual cliente renovar.`;

            await fetch(
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
                  number: conflictPhone,
                  text: adminMsg,
                  user_id: matchedCustomer.created_by,
                }),
              },
            );
            console.log('[Cakto] Notificação de conflito enviada para:', conflictPhone);
          }
        } catch (e) {
          console.error('[Cakto] Erro ao notificar sobre conflito:', e);
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Conflito: ${sameDueCustomers.length} clientes com mesmo vencimento. Pagamento registrado sem confirmação. Admin notificado.`,
          conflict: true,
          customers: sameDueCustomers.map((c: any) => ({ name: c.name, username: c.username, due_date: c.due_date })),
        }), { headers: jsonHeaders });
      }
    }

    // Renew ONLY the single selected customer (closest to expiration)
    {
      const cust = matchedCustomer;
      const custCurrentDue = cust.due_date ? new Date(cust.due_date + 'T00:00:00') : today;
      const custBase = new Date(custCurrentDue > today ? custCurrentDue : today);

      if (monthsToAdd) {
        const origDay = custBase.getDate();
        custBase.setMonth(custBase.getMonth() + monthsToAdd);
        if (custBase.getDate() !== origDay) {
          custBase.setDate(0);
        }
      } else {
        custBase.setDate(custBase.getDate() + durationDays);
      }
      const custNewDue = custBase.toISOString().split('T')[0];

      // Build update payload
      const custUpdate: Record<string, unknown> = { due_date: custNewDue, status: 'ativa' };
      if (bestMatch && bestMatch.id !== cust.plan_id) {
        custUpdate.plan_id = bestMatch.id;
        custUpdate.custom_price = null;
      }
      await supabaseAdmin
        .from('customers')
        .update(custUpdate)
        .eq('id', cust.id);

      console.log(`[Cakto] Cliente ${cust.name} (${cust.username || '-'}) atualizado: due_date=${custNewDue}`);

      // Register payment for this single customer
      if (amountNumeric > 0) {
        await supabaseAdmin.from('payments').insert({
          customer_id: cust.id,
          amount: amountNumeric,
          payment_date: today.toISOString().split('T')[0],
          method: 'pix',
          confirmed: true,
          source: 'cakto',
        });
        console.log(`[Cakto] Pagamento registrado para ${cust.name}: R$ ${amountNumeric.toFixed(2)}`);
      }
    }

    // Use the primary customer's new due date for notifications
    const primaryCurrentDue = matchedCustomer.due_date ? new Date(matchedCustomer.due_date + 'T00:00:00') : today;
    const primaryBase = new Date(primaryCurrentDue > today ? primaryCurrentDue : today);
    if (monthsToAdd) {
      const origDay = primaryBase.getDate();
      primaryBase.setMonth(primaryBase.getMonth() + monthsToAdd);
      if (primaryBase.getDate() !== origDay) primaryBase.setDate(0);
    } else {
      primaryBase.setDate(primaryBase.getDate() + durationDays);
    }
    const newDueDate = primaryBase.toISOString().split('T')[0];

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

    // ── Send WhatsApp plain text message via zap-responder edge function ──
    try {
      const { data: zapSettings } = await supabaseAdmin
        .from('zap_responder_settings')
        .select('selected_department_id')
        .eq('user_id', matchedCustomer.created_by)
        .maybeSingle();

      // Fetch billing settings for custom message template and notification phone
      const { data: billingSettings } = await supabaseAdmin
        .from('billing_settings')
        .select('notification_phone, renewal_message_template, renewal_image_url')
        .eq('user_id', matchedCustomer.created_by)
        .maybeSingle();

      if (zapSettings?.selected_department_id) {
        // Get server name
        let serverName = '-';
        if (matchedCustomer.server_id) {
          const { data: serverData } = await supabaseAdmin
            .from('servers')
            .select('server_name')
            .eq('id', matchedCustomer.server_id)
            .maybeSingle();
          if (serverData) serverName = serverData.server_name;
        }

        // Format due date and time
        const dueParts = newDueDate.split('-');
        const formattedDueDate = `${dueParts[2]}/${dueParts[1]}/${dueParts[0]}`;
        const now = new Date();
        const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // Format phone with country code
        let metaPhone = phoneDigits;
        if (!metaPhone.startsWith('55')) metaPhone = '55' + metaPhone;

        const displayUsername = matchedCustomer.username || '-';

        const defaultTemplate = `✅ Olá, *{{nome}}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:\n\n==========================\n📅 Próx. Vencimento: *{{vencimento}} - {{hora}} hrs*\n💰 Valor: *{{valor}}*\n👤 Usuário: *{{usuario}}*\n📦 Plano: *{{plano}}*\n🔌 Status: *Ativo*\n💎 Obs: -\n⚡: *{{servidor}}*\n==========================`;
        const template = billingSettings?.renewal_message_template || defaultTemplate;
        const whatsappMessage = template
          .replace(/\{\{nome\}\}/g, matchedCustomer.name)
          .replace(/\{\{vencimento\}\}/g, formattedDueDate)
          .replace(/\{\{hora\}\}/g, formattedTime)
          .replace(/\{\{valor\}\}/g, amountNumeric.toFixed(2))
          .replace(/\{\{usuario\}\}/g, displayUsername)
          .replace(/\{\{plano\}\}/g, matchedPlanName || '-')
          .replace(/\{\{servidor\}\}/g, serverName)
          .replace(/\{\{obs\}\}/g, matchedCustomer.notes || '-')
          .replace(/\{\{telas\}\}/g, String(matchedCustomer.screens || 1))
          .replace(/\{\{telefone\}\}/g, matchedCustomer.phone || '-')
          .replace(/\{\{inicio\}\}/g, matchedCustomer.start_date ? new Date(matchedCustomer.start_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-')
          .replace(/\{\{status\}\}/g, matchedCustomer.status || '-');

        console.log(`[Cakto] Enviando mensagem texto plano para ${metaPhone}`);

        const msgResp = await fetch(
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
              number: metaPhone,
              text: whatsappMessage,
              user_id: matchedCustomer.created_by,
              image_url: billingSettings?.renewal_image_url || undefined,
            }),
          },
        );
        const msgResult = await msgResp.json();
        console.log(`[Cakto] Mensagem WhatsApp: status=${msgResp.status}`, JSON.stringify(msgResult));
      } else {
        console.log('[Cakto] Nenhum departamento configurado. Mensagem não enviada.');
      }

      // Send notification to reseller/admin phone
      const notificationPhone = billingSettings?.notification_phone;
      if (zapSettings?.selected_department_id && notificationPhone) {
        try {
          const dueParts2 = newDueDate.split('-');
          const fmtDue = `${dueParts2[2]}/${dueParts2[1]}/${dueParts2[0]}`;
          let adminMetaPhone = phoneDigits;
          if (!adminMetaPhone.startsWith('55')) adminMetaPhone = '55' + adminMetaPhone;
          let adminServerName = '-';
          if (matchedCustomer.server_id) {
            const { data: srvData } = await supabaseAdmin
              .from('servers')
              .select('server_name')
              .eq('id', matchedCustomer.server_id)
              .maybeSingle();
            if (srvData) adminServerName = srvData.server_name;
          }
          const adminMsg = `🔔 *Renovação Automática (Cakto)*\n\n👤 Cliente: *${matchedCustomer.name}*\n📞 Tel: ${adminMetaPhone}\n👤 Usuário: *${matchedCustomer.username || '-'}*\n💰 Valor: *R$ ${amountNumeric.toFixed(2)}*\n📦 Plano: *${matchedPlanName || '-'}*\n🖥️ Servidor: *${adminServerName}*\n📅 Novo vencimento: *${fmtDue}*\n✅ Status: Renovado`;

          await fetch(
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
                number: notificationPhone,
                text: adminMsg,
                user_id: matchedCustomer.created_by,
              }),
            },
          );
          console.log('[Cakto] Notificação enviada para:', notificationPhone);
        } catch (adminErr) {
          console.error('[Cakto] Erro ao notificar:', adminErr);
        }
      }
    } catch (e) {
      console.error('[Cakto] Erro ao enviar mensagem WhatsApp:', e);
    }

    // ── Check for extra_months: if customer has extra months, skip server renewal and deduct ──
    const customerExtraMonths = matchedCustomer.extra_months || 0;
    const renewMonths = monthsToAdd || Math.max(1, Math.round(durationDays / 30));
    let skipServerRenewal = false;

    if (customerExtraMonths > 0) {
      const newExtraMonths = Math.max(0, customerExtraMonths - renewMonths);
      await supabaseAdmin
        .from('customers')
        .update({ extra_months: newExtraMonths })
        .eq('id', matchedCustomer.id);
      console.log(`[Cakto] Cliente tem ${customerExtraMonths} mês(es) extra. Abatendo ${renewMonths} → restam ${newExtraMonths}. Servidor JÁ possui o tempo, pulando renovação no painel.`);
      skipServerRenewal = true;
    }

    // ── Trigger server renewals for ALL matched customers' usernames ──
    // Only renew server for the SINGLE selected customer's usernames
    const allUsernames: string[] = [];
    if (matchedCustomer.username?.trim()) {
      const parts = matchedCustomer.username.split(',').map((u: string) => u.trim()).filter((u: string) => u.length > 0);
      for (const u of parts) {
        if (!allUsernames.includes(u)) allUsernames.push(u);
      }
    }

    const renewResults: any[] = [];

    if (allUsernames.length > 0 && !skipServerRenewal) {
      console.log(`[Cakto] Usernames para renovar: ${allUsernames.join(', ')} (${allUsernames.length} conexões)`);

      // ── Detect server type to only renew on the CORRECT panel ──
      let serverName = '';
      let serverHost = '';
      let autoRenew = false;

      if (matchedCustomer.server_id) {
        const { data: serverData } = await supabaseAdmin
          .from('servers')
          .select('server_name, host, auto_renew')
          .eq('id', matchedCustomer.server_id)
          .maybeSingle();

        serverName = serverData?.server_name || '';
        serverHost = serverData?.host || '';
        autoRenew = serverData?.auto_renew ?? false;
      }

      const sNameLower = serverName.toLowerCase();
      const sHostLower = serverHost.toLowerCase();
      const isVplay = sNameLower.includes('vplay') || sHostLower.includes('vplay');
      const isRush = sNameLower.includes('rush') || sHostLower.includes('rush');
      const isTheBest = sNameLower.includes('best') || sHostLower.includes('best');
      const isNatv = sNameLower.includes('natv') || sHostLower.includes('natv');

      console.log(`[Cakto] Servidor: "${serverName}" (host: "${serverHost}") | auto_renew: ${autoRenew} | Tipo: ${isVplay ? 'VPlay' : isRush ? 'Rush' : isTheBest ? 'The Best' : isNatv ? 'NATV' : 'desconhecido'}`);

      if (!matchedCustomer.server_id) {
        console.log(`[Cakto] Cliente sem servidor configurado. Pulando renovação no painel.`);
      } else if (!autoRenew) {
        console.log(`[Cakto] Servidor "${serverName}" não está habilitado para renovação automática. Pulando.`);
      } else {
        const { data: resellerApiSettings } = await supabaseAdmin
          .from('reseller_api_settings')
          .select('natv_api_key, natv_base_url, the_best_username, the_best_password, the_best_base_url, rush_username, rush_password, rush_token, rush_base_url')
          .eq('user_id', matchedCustomer.created_by)
          .maybeSingle();

        // ── VPlay renewal ──
        if (isVplay) {
          for (const username of allUsernames) {
            try {
              console.log(`[Cakto] Renovando VPlay via MySQL: ${username}, nova data: ${newDueDate}`);
              const vplayResp = await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/vplay-renew`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                    'x-cakto-webhook-secret': globalWebhookSecret || '',
                  },
                  body: JSON.stringify({ username, new_due_date: newDueDate, customer_id: matchedCustomer.id }),
                },
              );
              const vplayResult = await vplayResp.json();
              renewResults.push({ panel: 'vplay', username, success: vplayResult?.success ?? false, result: vplayResult });
              console.log(`[Cakto] VPlay renew ${username}:`, JSON.stringify(vplayResult));
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : 'Erro desconhecido';
              renewResults.push({ panel: 'vplay', username, success: false, error: errMsg });
              console.error(`[Cakto] Erro renovando VPlay ${username}:`, e);
            }
          }
        }

        // ── NATV renewal ──
        if (isNatv) {
          let natvApiKey = '';
          let natvBaseUrl = '';
          if (resellerApiSettings?.natv_api_key && resellerApiSettings?.natv_base_url) {
            natvApiKey = resellerApiSettings.natv_api_key;
            natvBaseUrl = resellerApiSettings.natv_base_url.replace(/\/+$/, '');
            console.log(`[Cakto] Usando chaves NATV do revendedor`);
          } else {
            natvApiKey = Deno.env.get('NATV_API_KEY') || '';
            natvBaseUrl = (Deno.env.get('NATV_BASE_URL') || '').replace(/\/+$/, '');
            if (natvApiKey && natvBaseUrl) console.log(`[Cakto] Usando chaves NATV globais (fallback)`);
          }
          if (natvApiKey && natvBaseUrl) {
            const daysToMonths: Record<number, number> = { 30: 1, 60: 2, 90: 3, 120: 4, 150: 5, 180: 6, 360: 12, 365: 12 };
            const months = daysToMonths[durationDays] || Math.max(1, Math.round(durationDays / 30));
            const validMonths = [1, 2, 3, 4, 5, 6, 12];
            const natvMonths = validMonths.includes(months) ? months : validMonths.reduce((prev, curr) =>
              Math.abs(curr - months) < Math.abs(prev - months) ? curr : prev
            );
            for (const username of allUsernames) {
              try {
                console.log(`[Cakto] Renovando NATV: ${username} por ${natvMonths} meses`);
                const natvResp = await fetch(`${natvBaseUrl}/user/activation`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${natvApiKey}` },
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
            console.log(`[Cakto] NATV não configurado`);
          }
        }

        // ── The Best renewal ──
        if (isTheBest) {
          const tbUsername = resellerApiSettings?.the_best_username || '';
          const tbPassword = resellerApiSettings?.the_best_password || '';
          const theBestBaseUrl = (resellerApiSettings?.the_best_base_url || '').replace(/\/+$/, '') || 'https://api.painel.best';
          if (tbUsername && tbPassword) {
            console.log(`[Cakto] Usando credenciais The Best do revendedor`);
            const tbDaysToMonths: Record<number, number> = { 30: 1, 60: 2, 90: 3, 120: 4, 150: 5, 180: 6, 360: 12, 365: 12 };
            const tbMonths = tbDaysToMonths[durationDays] || Math.max(1, Math.round(durationDays / 30));
            let tbToken = '';
            try {
              const loginResp = await fetch(`${theBestBaseUrl}/auth/token/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: tbUsername, password: tbPassword }),
              });
              if (!loginResp.ok) {
                console.error(`[Cakto] The Best login falhou: ${loginResp.status}`);
              } else {
                const loginData = await loginResp.json();
                tbToken = loginData.access || loginData.token || loginData.access_token || '';
                if (tbToken) console.log(`[Cakto] The Best: token JWT obtido`);
              }
            } catch (loginErr) {
              console.error(`[Cakto] The Best login erro:`, loginErr);
            }
            if (tbToken) {
              for (const username of allUsernames) {
                try {
                  console.log(`[Cakto] Renovando The Best: ${username} por ${tbMonths} meses`);
                  const searchUrl = `${theBestBaseUrl}/lines/?search=${encodeURIComponent(username.trim())}&per_page=10`;
                  const searchResponse = await fetch(searchUrl, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${tbToken}`, 'Accept': 'application/json' },
                  });
                  if (!searchResponse.ok) {
                    renewResults.push({ panel: 'the_best', username, success: false, error: `Busca falhou: ${searchResponse.status}` });
                    continue;
                  }
                  const searchData = await searchResponse.json();
                  const results = searchData.results || searchData.data || searchData;
                  const lines = Array.isArray(results) ? results : [];
                  const matchedLine = lines.find((line: any) =>
                    String(line.username || '').trim().toLowerCase() === username.trim().toLowerCase()
                  );
                  if (!matchedLine) {
                    console.log(`[Cakto] The Best: usuário "${username}" não encontrado`);
                    renewResults.push({ panel: 'the_best', username, success: false, error: 'Usuário não encontrado' });
                    continue;
                  }
                  const renewUrl = `${theBestBaseUrl}/lines/${matchedLine.id}/renew/`;
                  const renewResponse = await fetch(renewUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${tbToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ months: tbMonths }),
                  });
                  if (!renewResponse.ok) {
                    renewResults.push({ panel: 'the_best', username, success: false, error: `Renovação falhou: ${renewResponse.status}` });
                    continue;
                  }
                  const renewData = await renewResponse.json();
                  console.log(`[Cakto] The Best renew ${username}: OK`, JSON.stringify(renewData));
                  renewResults.push({ panel: 'the_best', username, success: true, result: renewData });
                } catch (e) {
                  const errMsg = e instanceof Error ? e.message : 'Erro desconhecido';
                  renewResults.push({ panel: 'the_best', username, success: false, error: errMsg });
                  console.error(`[Cakto] Erro renovando The Best ${username}:`, e);
                }
              }
            }
          } else {
            console.log(`[Cakto] The Best não configurado`);
          }
        }

        // ── Rush renewal ──
        if (isRush) {
          const rushUsername = resellerApiSettings?.rush_username || '';
          const rushPassword = resellerApiSettings?.rush_password || '';
          const rushToken = resellerApiSettings?.rush_token || '';
          const rushBaseUrl = (resellerApiSettings?.rush_base_url || '').replace(/\/+$/, '') || 'https://api-new.painel.ai';
          if (rushUsername && rushPassword && rushToken) {
            console.log(`[Cakto] Usando credenciais Rush do revendedor`);
            const rushDaysToMonths: Record<number, number> = { 30: 1, 60: 2, 90: 3, 120: 4, 150: 5, 180: 6, 360: 12, 365: 12 };
            const rushMonths = rushDaysToMonths[durationDays] || Math.max(1, Math.round(durationDays / 30));
            for (const username of allUsernames) {
              try {
                console.log(`[Cakto] Renovando Rush: ${username} por ${rushMonths} meses`);
                const rushResp = await fetch(
                  `${Deno.env.get('SUPABASE_URL')}/functions/v1/rush-renew`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                      'x-cakto-webhook-secret': globalWebhookSecret || '',
                    },
                    body: JSON.stringify({
                      username, months: rushMonths, customer_id: matchedCustomer.id,
                      rush_username: rushUsername, rush_password: rushPassword, rush_token: rushToken,
                      rush_base_url: rushBaseUrl, screens: matchedCustomer.screens || 1,
                    }),
                  },
                );
                const rushResult = await rushResp.json();
                renewResults.push({ panel: 'rush', username, success: rushResult?.success ?? false, result: rushResult });
                console.log(`[Cakto] Rush renew ${username}:`, JSON.stringify(rushResult));
              } catch (e) {
                const errMsg = e instanceof Error ? e.message : 'Erro desconhecido';
                renewResults.push({ panel: 'rush', username, success: false, error: errMsg });
                console.error(`[Cakto] Erro renovando Rush ${username}:`, e);
              }
            }
          } else {
            console.log(`[Cakto] Rush não configurado`);
          }
        }

        if (!isVplay && !isNatv && !isTheBest && !isRush) {
          console.log(`[Cakto] Tipo de servidor não reconhecido: "${serverName}". Nenhuma renovação externa. Apenas due_date atualizado.`);
        }
      }

      if (renewResults.length === 0) {
        console.log(`[Cakto] Nenhuma renovação no painel externo realizada. Apenas due_date atualizado.`);
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
