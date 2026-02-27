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

    // Get plan info for duration
    let durationDays = 30;
    if (matchedCustomer.plan_id) {
      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('duration_days, price')
        .eq('id', matchedCustomer.plan_id)
        .maybeSingle();
      if (plan?.duration_days) durationDays = plan.duration_days;
    }

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

    // Register payment - Cakto sends amount in BRL (not cents)
    const paymentAmount = caktoData?.amount || caktoData?.baseAmount || body?.sale?.amount || body?.amount || 0;
    const amountNumeric = Number(String(paymentAmount).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

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

    // Trigger VPlay server renewal only (if username exists)
    let renewResult: any = null;
    if (matchedCustomer.username?.trim() && matchedCustomer.server_id) {
      try {
        // Look for VPlay server config for this customer's owner
        const { data: vplayServer } = await supabaseAdmin
          .from('vplay_servers')
          .select('integration_url, key_message')
          .eq('user_id', matchedCustomer.created_by)
          .eq('is_default', true)
          .maybeSingle();

        if (vplayServer?.integration_url) {
          const vplayUrl = vplayServer.integration_url.replace(/\/+$/, '');
          const keyMessage = vplayServer.key_message || 'XCLOUD';
          const username = matchedCustomer.username.trim();

          console.log(`[Cakto] Renovando VPlay: ${username} via ${vplayUrl}`);

          const vplayResp = await fetch(`${vplayUrl}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: keyMessage,
              action: 'renew',
              username,
              duration: durationDays,
            }),
          });

          renewResult = await vplayResp.json().catch(() => ({ raw: await vplayResp.text() }));
          console.log(`[Cakto] VPlay renew result:`, JSON.stringify(renewResult));
        } else {
          // Fallback: check billing_settings for vplay_integration_url
          const { data: billingSettings } = await supabaseAdmin
            .from('billing_settings')
            .select('vplay_integration_url, vplay_key_message')
            .eq('user_id', matchedCustomer.created_by)
            .maybeSingle();

          if (billingSettings?.vplay_integration_url) {
            const vplayUrl = billingSettings.vplay_integration_url.replace(/\/+$/, '');
            const keyMessage = billingSettings.vplay_key_message || 'XCLOUD';
            const username = matchedCustomer.username.trim();

            console.log(`[Cakto] Renovando VPlay (billing_settings): ${username} via ${vplayUrl}`);

            const vplayResp = await fetch(`${vplayUrl}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                key: keyMessage,
                action: 'renew',
                username,
                duration: durationDays,
              }),
            });

            renewResult = await vplayResp.json().catch(() => ({ raw: await vplayResp.text() }));
            console.log(`[Cakto] VPlay renew result:`, JSON.stringify(renewResult));
          } else {
            console.log(`[Cakto] Nenhum servidor VPlay configurado para o owner ${matchedCustomer.created_by}. Apenas due_date atualizado.`);
          }
        }
      } catch (renewError) {
        console.error(`[Cakto] Erro ao renovar no VPlay:`, renewError);
        renewResult = { error: renewError instanceof Error ? renewError.message : 'Erro desconhecido' };
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Cliente ${matchedCustomer.name} renovado até ${newDueDate}`,
      customer_id: matchedCustomer.id,
      customer_name: matchedCustomer.name,
      new_due_date: newDueDate,
      payment_registered: amountNumeric > 0,
      server_renewal: renewResult,
    }), { headers: jsonHeaders });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[Cakto] Erro:', error);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: jsonHeaders });
  }
});
