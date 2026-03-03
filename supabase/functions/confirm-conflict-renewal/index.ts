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

  const htmlResponse = (title: string, message: string, success: boolean) => {
    const color = success ? '#22c55e' : '#ef4444';
    const icon = success ? '✅' : '❌';
    return new Response(
      `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { background: #1e293b; border-radius: 16px; padding: 40px; max-width: 420px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5); border: 1px solid #334155; }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { color: ${color}; font-size: 22px; margin: 0 0 16px; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0; }
    .detail { background: #0f172a; border-radius: 8px; padding: 12px 16px; margin-top: 16px; text-align: left; font-size: 14px; }
    .detail span { color: #64748b; }
    .detail strong { color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`,
      { status: success ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );
  };

  try {
    const url = new URL(req.url);
    const paymentId = url.searchParams.get('payment_id');
    const customerId = url.searchParams.get('customer_id');
    const action = url.searchParams.get('action');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── LIST action: return conflict data as JSON for the app page ──
    if (action === 'list' && paymentId) {
      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .select('*, customers!payments_customer_id_fkey(phone, created_by)')
        .eq('id', paymentId)
        .maybeSingle();

      if (payErr || !payment) {
        return new Response(JSON.stringify({ error: 'Pagamento não encontrado.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (payment.confirmed) {
        return new Response(JSON.stringify({ error: 'Este pagamento já foi confirmado.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Find all customers with the same phone
      const customerPhone = (payment.customers as any)?.phone || '';
      const createdBy = (payment.customers as any)?.created_by || '';
      const phoneDigits = customerPhone.replace(/\D/g, '');

      if (!phoneDigits) {
        return new Response(JSON.stringify({ error: 'Telefone do cliente não encontrado.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const searchVariants = new Set<string>();
      searchVariants.add(phoneDigits);
      if (phoneDigits.startsWith('55') && phoneDigits.length >= 12) searchVariants.add(phoneDigits.slice(2));
      else searchVariants.add('55' + phoneDigits);
      const withoutCC = phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits;
      if (withoutCC.length === 11 && withoutCC[2] === '9') {
        searchVariants.add('55' + withoutCC.slice(0, 2) + withoutCC.slice(3));
        searchVariants.add(withoutCC.slice(0, 2) + withoutCC.slice(3));
      } else if (withoutCC.length === 10) {
        searchVariants.add('55' + withoutCC.slice(0, 2) + '9' + withoutCC.slice(2));
        searchVariants.add(withoutCC.slice(0, 2) + '9' + withoutCC.slice(2));
      }

      let allCustomers: any[] = [];
      for (const variant of searchVariants) {
        const { data: candidates } = await supabase
          .from('customers')
          .select('id, name, username, due_date, server_id, plan_id')
          .ilike('phone', `%${variant}%`)
          .order('due_date', { ascending: true })
          .limit(20);
        if (candidates) {
          for (const c of candidates) {
            if (!allCustomers.find((m: any) => m.id === c.id)) allCustomers.push(c);
          }
        }
      }

      // Enrich with server/plan names
      const enriched = await Promise.all(allCustomers.map(async (c: any) => {
        let serverName: string | null = null;
        let planName: string | null = null;
        if (c.server_id) {
          const { data: srv } = await supabase.from('servers').select('server_name').eq('id', c.server_id).maybeSingle();
          if (srv) serverName = srv.server_name;
        }
        if (c.plan_id) {
          const { data: pl } = await supabase.from('plans').select('plan_name').eq('id', c.plan_id).maybeSingle();
          if (pl) planName = pl.plan_name;
        }
        return { id: c.id, name: c.name, username: c.username, due_date: c.due_date, server_name: serverName, plan_name: planName };
      }));

      // Detect plan from amount
      let detectedPlan = '';
      const amt = Number(payment.amount) || 0;
      if (amt > 0 && createdBy) {
        const { data: plans } = await supabase.from('plans').select('plan_name, price').eq('created_by', createdBy).order('price');
        if (plans) {
          let bestDiff = Infinity;
          for (const p of plans) {
            const diff = Math.abs(p.price - amt);
            if (diff <= p.price * 0.1 && diff < bestDiff) { bestDiff = diff; detectedPlan = p.plan_name; }
          }
        }
      }

      return new Response(JSON.stringify({
        payment_id: paymentId,
        amount: Number(payment.amount) || 0,
        plan_name: detectedPlan,
        customers: enriched,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── CONFIRM action (original flow) ──
    if (!paymentId || !customerId) {
      return htmlResponse('Parâmetros inválidos', 'payment_id e customer_id são obrigatórios.', false);
    }

    // 1. Find the unconfirmed payment
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();

    if (payErr || !payment) {
      return htmlResponse('Pagamento não encontrado', 'Este pagamento não existe ou já foi removido.', false);
    }

    if (payment.confirmed) {
      return htmlResponse('Pagamento já confirmado', 'Este pagamento já foi confirmado anteriormente. Nenhuma ação necessária.', false);
    }

    // 2. Find the chosen customer
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, name, phone, username, server_id, plan_id, due_date, created_by, status, custom_price, screens, notes, start_date, extra_months')
      .eq('id', customerId)
      .maybeSingle();

    if (custErr || !customer) {
      return htmlResponse('Cliente não encontrado', 'O cliente selecionado não foi encontrado.', false);
    }

    // 3. Get plan info
    let durationDays = 30;
    let matchedPlanName = '';
    let monthsToAdd: number | undefined;
    const amountNumeric = Number(payment.amount) || 0;

    if (customer.plan_id) {
      const { data: plan } = await supabase
        .from('plans')
        .select('duration_days, plan_name, price')
        .eq('id', customer.plan_id)
        .maybeSingle();
      if (plan) {
        durationDays = plan.duration_days;
        matchedPlanName = plan.plan_name;
      }
    }

    // Try to match by amount if no plan
    if (!matchedPlanName && amountNumeric > 0) {
      const { data: allPlans } = await supabase
        .from('plans')
        .select('id, plan_name, duration_days, price')
        .eq('created_by', customer.created_by)
        .order('price', { ascending: true });

      if (allPlans) {
        let bestDiff = Infinity;
        for (const plan of allPlans) {
          const diff = Math.abs(plan.price - amountNumeric);
          const tolerance = plan.price * 0.1;
          if (diff <= tolerance && diff < bestDiff) {
            bestDiff = diff;
            durationDays = plan.duration_days;
            matchedPlanName = plan.plan_name;
          }
        }
      }
    }

    const daysToMonths: Record<number, number> = { 30: 1, 90: 3, 180: 6, 365: 12 };
    monthsToAdd = daysToMonths[durationDays];

    // 4. Calculate new due date
    const today = new Date();
    const custCurrentDue = customer.due_date ? new Date(customer.due_date + 'T00:00:00') : today;
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
    const newDueDate = custBase.toISOString().split('T')[0];

    // 5. Update customer due_date
    await supabase
      .from('customers')
      .update({ due_date: newDueDate, status: 'ativa' })
      .eq('id', customer.id);

    // 6. Update payment: reassign to chosen customer and confirm
    await supabase
      .from('payments')
      .update({ customer_id: customer.id, confirmed: true })
      .eq('id', paymentId);

    console.log(`[ConfirmConflict] Pagamento ${paymentId} confirmado para ${customer.name} (${customer.id}). Novo vencimento: ${newDueDate}`);

    // 7. Save payment confirmation record
    let confirmationId = '';
    try {
      const { data: confirmation } = await supabase
        .from('payment_confirmations')
        .insert({
          customer_id: customer.id,
          customer_name: customer.name,
          customer_phone: customer.phone,
          amount: amountNumeric,
          plan_name: matchedPlanName || null,
          duration_days: durationDays,
          new_due_date: newDueDate,
          status: 'approved',
        })
        .select('id')
        .single();
      if (confirmation) confirmationId = confirmation.id;
    } catch (e) {
      console.error('[ConfirmConflict] Erro ao salvar confirmação:', e);
    }

    // 8. Send WhatsApp confirmation to customer
    try {
      const { data: zapSettings } = await supabase
        .from('zap_responder_settings')
        .select('selected_department_id')
        .eq('user_id', customer.created_by)
        .maybeSingle();

      const { data: billingSettings } = await supabase
        .from('billing_settings')
        .select('notification_phone, renewal_message_template, renewal_image_url')
        .eq('user_id', customer.created_by)
        .maybeSingle();

      if (zapSettings?.selected_department_id) {
        let serverName = '-';
        if (customer.server_id) {
          const { data: srvData } = await supabase
            .from('servers')
            .select('server_name')
            .eq('id', customer.server_id)
            .maybeSingle();
          if (srvData) serverName = srvData.server_name;
        }

        const dueParts = newDueDate.split('-');
        const formattedDueDate = `${dueParts[2]}/${dueParts[1]}/${dueParts[0]}`;
        const now = new Date();
        const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        let metaPhone = (customer.phone || '').replace(/\D/g, '');
        if (!metaPhone.startsWith('55')) metaPhone = '55' + metaPhone;

        const defaultTemplate = `✅ Olá, *{{nome}}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:\n\n==========================\n📅 Próx. Vencimento: *{{vencimento}} - {{hora}} hrs*\n💰 Valor: *{{valor}}*\n👤 Usuário: *{{usuario}}*\n📦 Plano: *{{plano}}*\n🔌 Status: *Ativo*\n💎 Obs: -\n⚡: *{{servidor}}*\n==========================`;
        const template = billingSettings?.renewal_message_template || defaultTemplate;
        const whatsappMessage = template
          .replace(/\{\{nome\}\}/g, customer.name)
          .replace(/\{\{vencimento\}\}/g, formattedDueDate)
          .replace(/\{\{hora\}\}/g, formattedTime)
          .replace(/\{\{valor\}\}/g, amountNumeric.toFixed(2))
          .replace(/\{\{usuario\}\}/g, customer.username || '-')
          .replace(/\{\{plano\}\}/g, matchedPlanName || '-')
          .replace(/\{\{servidor\}\}/g, serverName)
          .replace(/\{\{obs\}\}/g, customer.notes || '-')
          .replace(/\{\{telas\}\}/g, String(customer.screens || 1))
          .replace(/\{\{telefone\}\}/g, customer.phone || '-')
          .replace(/\{\{status\}\}/g, customer.status || '-');

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
              number: metaPhone,
              text: whatsappMessage,
              user_id: customer.created_by,
              image_url: billingSettings?.renewal_image_url || undefined,
            }),
          },
        );
        console.log(`[ConfirmConflict] Mensagem de confirmação enviada para ${customer.name} (${metaPhone})`);

        // Send admin notification
        const notificationPhone = billingSettings?.notification_phone;
        if (notificationPhone) {
          const fmtDue = `${dueParts[2]}/${dueParts[1]}/${dueParts[0]}`;
          const adminMsg = `✅ *Conflito Resolvido*\n\n👤 Cliente: *${customer.name}*\n👤 Usuário: *${customer.username || '-'}*\n💰 Valor: *R$ ${amountNumeric.toFixed(2)}*\n📦 Plano: *${matchedPlanName || '-'}*\n🖥️ Servidor: *${serverName}*\n📅 Novo vencimento: *${fmtDue}*\n✅ Renovado com sucesso`;

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
                user_id: customer.created_by,
              }),
            },
          );
        }
      }
    } catch (e) {
      console.error('[ConfirmConflict] Erro ao enviar WhatsApp:', e);
    }

    // 9. Handle extra_months
    const customerExtraMonths = customer.extra_months || 0;
    const renewMonths = monthsToAdd || Math.max(1, Math.round(durationDays / 30));
    let skipServerRenewal = false;

    if (customerExtraMonths > 0) {
      const newExtraMonths = Math.max(0, customerExtraMonths - renewMonths);
      await supabase
        .from('customers')
        .update({ extra_months: newExtraMonths })
        .eq('id', customer.id);
      skipServerRenewal = true;
      console.log(`[ConfirmConflict] Extra months: ${customerExtraMonths} → ${newExtraMonths}. Pulando renovação servidor.`);
    }

    // 10. Server renewal
    if (!skipServerRenewal && customer.server_id && customer.username?.trim()) {
      const allUsernames = customer.username.split(',').map((u: string) => u.trim()).filter((u: string) => u.length > 0);

      const { data: serverData } = await supabase
        .from('servers')
        .select('server_name, host, auto_renew')
        .eq('id', customer.server_id)
        .maybeSingle();

      if (serverData?.auto_renew) {
        const sNameLower = (serverData.server_name || '').toLowerCase();
        const sHostLower = (serverData.host || '').toLowerCase();
        const isVplay = sNameLower.includes('vplay') || sHostLower.includes('vplay');
        const isRush = sNameLower.includes('rush') || sHostLower.includes('rush');
        const isTheBest = sNameLower.includes('best') || sHostLower.includes('best');
        const isNatv = sNameLower.includes('natv') || sHostLower.includes('natv');

        const { data: resellerApiSettings } = await supabase
          .from('reseller_api_settings')
          .select('natv_api_key, natv_base_url, the_best_username, the_best_password, the_best_base_url, rush_username, rush_password, rush_token, rush_base_url')
          .eq('user_id', customer.created_by)
          .maybeSingle();

        const globalWebhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET') || '';

        // VPlay
        if (isVplay) {
          for (const username of allUsernames) {
            try {
              await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/vplay-renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`, 'x-cakto-webhook-secret': globalWebhookSecret },
                body: JSON.stringify({ username, new_due_date: newDueDate, customer_id: customer.id }),
              });
              console.log(`[ConfirmConflict] VPlay renew ${username}: OK`);
            } catch (e) { console.error(`[ConfirmConflict] VPlay ${username} erro:`, e); }
          }
        }

        // NATV
        if (isNatv) {
          let natvApiKey = resellerApiSettings?.natv_api_key || Deno.env.get('NATV_API_KEY') || '';
          let natvBaseUrl = (resellerApiSettings?.natv_base_url || Deno.env.get('NATV_BASE_URL') || '').replace(/\/+$/, '');
          if (natvApiKey && natvBaseUrl) {
            const validMonths = [1, 2, 3, 4, 5, 6, 12];
            const natvMonths = validMonths.includes(renewMonths) ? renewMonths : validMonths.reduce((prev, curr) => Math.abs(curr - renewMonths) < Math.abs(prev - renewMonths) ? curr : prev);
            for (const username of allUsernames) {
              try {
                await fetch(`${natvBaseUrl}/user/activation`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${natvApiKey}` },
                  body: JSON.stringify({ username, months: natvMonths }),
                });
                console.log(`[ConfirmConflict] NATV renew ${username}: OK`);
              } catch (e) { console.error(`[ConfirmConflict] NATV ${username} erro:`, e); }
            }
          }
        }

        // The Best
        if (isTheBest) {
          const tbUsername = resellerApiSettings?.the_best_username || '';
          const tbPassword = resellerApiSettings?.the_best_password || '';
          const theBestBaseUrl = (resellerApiSettings?.the_best_base_url || '').replace(/\/+$/, '') || 'https://api.painel.best';
          if (tbUsername && tbPassword) {
            try {
              const loginResp = await fetch(`${theBestBaseUrl}/auth/token/`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: tbUsername, password: tbPassword }),
              });
              if (loginResp.ok) {
                const loginData = await loginResp.json();
                const tbToken = loginData.access || loginData.token || loginData.access_token || '';
                if (tbToken) {
                  for (const username of allUsernames) {
                    try {
                      const searchResp = await fetch(`${theBestBaseUrl}/lines/?search=${encodeURIComponent(username.trim())}&per_page=10`, {
                        method: 'GET', headers: { 'Authorization': `Bearer ${tbToken}`, 'Accept': 'application/json' },
                      });
                      if (searchResp.ok) {
                        const searchData = await searchResp.json();
                        const lines = Array.isArray(searchData.results || searchData.data || searchData) ? (searchData.results || searchData.data || searchData) : [];
                        const matchedLine = lines.find((l: any) => String(l.username || '').trim().toLowerCase() === username.trim().toLowerCase());
                        if (matchedLine) {
                          await fetch(`${theBestBaseUrl}/lines/${matchedLine.id}/renew/`, {
                            method: 'POST', headers: { 'Authorization': `Bearer ${tbToken}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ months: renewMonths }),
                          });
                          console.log(`[ConfirmConflict] The Best renew ${username}: OK`);
                        }
                      }
                    } catch (e) { console.error(`[ConfirmConflict] The Best ${username} erro:`, e); }
                  }
                }
              }
            } catch (e) { console.error('[ConfirmConflict] The Best login erro:', e); }
          }
        }

        // Rush
        if (isRush) {
          const rushUsername = resellerApiSettings?.rush_username || '';
          const rushPassword = resellerApiSettings?.rush_password || '';
          const rushToken = resellerApiSettings?.rush_token || '';
          const rushBaseUrl = (resellerApiSettings?.rush_base_url || '').replace(/\/+$/, '') || 'https://api-new.painel.ai';
          if (rushUsername && rushPassword && rushToken) {
            for (const username of allUsernames) {
              try {
                await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/rush-renew`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`, 'x-cakto-webhook-secret': globalWebhookSecret },
                  body: JSON.stringify({ username, months: renewMonths, customer_id: customer.id, rush_username: rushUsername, rush_password: rushPassword, rush_token: rushToken, rush_base_url: rushBaseUrl, screens: customer.screens || 1 }),
                });
                console.log(`[ConfirmConflict] Rush renew ${username}: OK`);
              } catch (e) { console.error(`[ConfirmConflict] Rush ${username} erro:`, e); }
            }
          }
        }
      }
    }

    // Log message
    await supabase.from('message_logs').insert({
      user_id: customer.created_by,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      message_type: 'conflict_resolution',
      source: 'confirm-conflict',
      status: 'success',
      metadata: { payment_id: paymentId, amount: amountNumeric, plan: matchedPlanName, new_due_date: newDueDate },
    });

    const dueParts = newDueDate.split('-');
    const fmtDue = `${dueParts[2]}/${dueParts[1]}/${dueParts[0]}`;

    return htmlResponse(
      'Renovação Confirmada!',
      `<strong>${customer.name}</strong> (${customer.username || '-'}) foi renovado com sucesso.<br><br><div class="detail"><span>📦 Plano:</span> <strong>${matchedPlanName || '-'}</strong><br><span>💰 Valor:</span> <strong>R$ ${amountNumeric.toFixed(2)}</strong><br><span>📅 Novo vencimento:</span> <strong>${fmtDue}</strong></div>`,
      true
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[ConfirmConflict] Erro:', error);
    return htmlResponse('Erro', `Ocorreu um erro ao processar: ${errorMessage}`, false);
  }
});
