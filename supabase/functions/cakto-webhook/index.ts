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

  const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 12000): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

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

    // ── Activation App Detection ──
    // Extract product/offer name from Cakto payload
    const productName = caktoData?.product_name || caktoData?.productName || caktoData?.offer_name || 
      caktoData?.offerName || caktoData?.product?.name || caktoData?.offer?.name || 
      body?.product_name || body?.product?.name || '';
    const productDescription = caktoData?.product_description || caktoData?.product?.description || 
      caktoData?.offer?.description || body?.product_description || '';
    
    // Extract custom fields that may contain MAC, email
    // Cakto may send custom fields as object, array, or nested anywhere in payload
    const customFields = caktoData?.custom_fields || caktoData?.customFields || 
      caktoData?.checkout_fields || caktoData?.fields || body?.custom_fields || 
      caktoData?.checkout?.custom_fields || {};
    
    // Deep search for MAC address anywhere in payload
    const findInPayload = (obj: any, keys: string[]): string => {
      if (!obj || typeof obj !== 'object') return '';
      // Check direct keys
      for (const key of keys) {
        if (obj[key] && typeof obj[key] === 'string') return obj[key];
      }
      // Check array format [{name: "mac", value: "XX:XX"}]
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item?.name && item?.value) {
            const nameL = String(item.name).toLowerCase();
            if (keys.some(k => nameL.includes(k.toLowerCase()))) return String(item.value);
          }
          // Also check label/answer format
          if (item?.label && item?.answer) {
            const labelL = String(item.label).toLowerCase();
            if (keys.some(k => labelL.includes(k.toLowerCase()))) return String(item.answer);
          }
        }
      }
      // Recurse into nested objects
      for (const val of Object.values(obj)) {
        if (val && typeof val === 'object') {
          const found = findInPayload(val, keys);
          if (found) return found;
        }
      }
      return '';
    };
    
    const macAddress = findInPayload(customFields, ['mac', 'mac_address', 'MAC', 'endereco_mac', 'Endereço MAC']) 
      || findInPayload(caktoData, ['mac', 'mac_address', 'MAC', 'endereco_mac', 'macAddress'])
      || findInPayload(body, ['mac', 'mac_address', 'MAC', 'endereco_mac', 'macAddress']);
    const activationEmail = findInPayload(customFields, ['email', 'Email']) || customer?.email || '';
    
    console.log(`[Cakto] Custom fields extraídos - MAC: "${macAddress}", Email: "${activationEmail}"`);
    const customerName = customer?.name || customer?.full_name || customer?.nome || caktoData?.name || '';
    
    const activationPaymentAmount = caktoData?.amount || caktoData?.baseAmount || body?.sale?.amount || body?.amount || 0;
    const activationAmountNum = Number(String(activationPaymentAmount).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    const activationPaymentMethod = (caktoData?.payment_method || caktoData?.paymentMethod || caktoData?.method || body?.payment_method || '').toString().toLowerCase();

    // ── Activation Detection: Check pending_activation_data FIRST, then fallback to product name ──
    {
      const supabaseActivation = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      // Look up pre-saved activation data from the external site by phone
      const phoneDigitsAct = String(phone).replace(/\D/g, '');
      const actSearchVariants = new Set<string>();
      actSearchVariants.add(phoneDigitsAct);
      if (phoneDigitsAct.startsWith('55')) actSearchVariants.add(phoneDigitsAct.slice(2));
      else actSearchVariants.add('55' + phoneDigitsAct);
      const withoutCCAct = phoneDigitsAct.startsWith('55') ? phoneDigitsAct.slice(2) : phoneDigitsAct;
      if (withoutCCAct.length === 11 && withoutCCAct[2] === '9') {
        actSearchVariants.add('55' + withoutCCAct.slice(0, 2) + withoutCCAct.slice(3));
        actSearchVariants.add(withoutCCAct.slice(0, 2) + withoutCCAct.slice(3));
      } else if (withoutCCAct.length === 10) {
        actSearchVariants.add('55' + withoutCCAct.slice(0, 2) + '9' + withoutCCAct.slice(2));
        actSearchVariants.add(withoutCCAct.slice(0, 2) + '9' + withoutCCAct.slice(2));
      }

      const { data: pendingActData } = await supabaseActivation
        .from('pending_activation_data')
        .select('*')
        .in('phone_normalized', [...actSearchVariants])
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get all enabled activation apps
      const { data: activationApps } = await supabaseActivation
        .from('activation_apps')
        .select('*')
        .eq('is_enabled', true);

      // Try to match: 1) by pending_activation_data.app_name  2) by Cakto product name  3) generic activation keywords
      let matchedApp: any = null;
      let isGenericActivation = false;
      if (activationApps && activationApps.length > 0) {
        if (pendingActData?.app_name) {
          const pendingNameUpper = pendingActData.app_name.toUpperCase();
          matchedApp = activationApps.find((app: any) =>
            pendingNameUpper.includes(app.app_name.toUpperCase()) ||
            app.app_name.toUpperCase().includes(pendingNameUpper)
          );
          if (matchedApp) console.log(`[Cakto] ✅ App identificado via pending_activation_data: ${matchedApp.app_name}`);
        }
        if (!matchedApp && productName) {
          const productNameUpper = productName.toUpperCase();
          matchedApp = activationApps.find((app: any) =>
            productNameUpper.includes(app.app_name.toUpperCase())
          );
          if (matchedApp) console.log(`[Cakto] ✅ App identificado via nome do produto Cakto: ${matchedApp.app_name}`);
        }
        // 3) If product name contains activation keywords, treat as generic activation
        if (!matchedApp && productName) {
          const productNameUpper = productName.toUpperCase();
          const activationKeywords = ['ATIVAÇÃO', 'ATIVACAO', 'ACTIVATION', 'LICENCA', 'LICENÇA'];
          const isActivationProduct = activationKeywords.some(kw => productNameUpper.includes(kw));
          if (isActivationProduct) {
            // Use the first enabled activation app as fallback owner
            matchedApp = activationApps[0];
            isGenericActivation = true;
            console.log(`[Cakto] ✅ Produto genérico de ativação detectado: "${productName}" → usando owner de ${matchedApp.app_name}`);
          }
        }
      }

      if (matchedApp) {
        console.log(`[Cakto] ✅ Ativação detectada! App: ${isGenericActivation ? productName : matchedApp.app_name}`);
        const appOwnerId = matchedApp.user_id;

        // Use pre-saved data if available, fallback to Cakto payload
        const finalMac = pendingActData?.mac_address || macAddress || '';
        const finalEmail = pendingActData?.email || activationEmail || '';
        const finalName = pendingActData?.customer_name || customerName || 'Desconhecido';
        const finalAppName = pendingActData?.app_name || (isGenericActivation ? productName : matchedApp.app_name);

        console.log(`[Cakto] Dados de ativação - App: "${finalAppName}", MAC: "${finalMac}", Email: "${finalEmail}", Nome: "${finalName}" (fonte: ${pendingActData ? 'site externo' : 'payload Cakto'})`);

        // Mark pending data as used
        if (pendingActData) {
          await supabaseActivation.from('pending_activation_data').update({ used: true }).eq('id', pendingActData.id);
        }

        // Save activation request
        await supabaseActivation.from('activation_requests').insert({
          user_id: appOwnerId,
          app_name: finalAppName,
          customer_name: finalName,
          customer_phone: phone,
          mac_address: finalMac,
          email: finalEmail,
          payment_method: activationPaymentMethod.includes('credit') || activationPaymentMethod.includes('cart') ? 'Cartão' : 'PIX',
          amount: activationAmountNum,
          status: 'pending',
          cakto_payload: body,
        });

        console.log(`[Cakto] Solicitação de ativação salva para ${finalAppName}`);

        // Send WhatsApp notifications
        const { data: ownerZapSettings } = await supabaseActivation
          .from('zap_responder_settings')
          .select('selected_department_id')
          .eq('user_id', appOwnerId)
          .maybeSingle();

        const { data: ownerBillingSettings } = await supabaseActivation
          .from('billing_settings')
          .select('notification_phone, meta_template_name')
          .eq('user_id', appOwnerId)
          .maybeSingle();

        const ownerNotifPhone = ownerBillingSettings?.notification_phone;

        if (ownerZapSettings?.selected_department_id && ownerNotifPhone) {
          let customerPhone = String(phone).replace(/\D/g, '');
          if (!customerPhone.startsWith('55')) customerPhone = '55' + customerPhone;

          const customerMsg = `📥 *PEDIDO DE ATIVAÇÃO RECEBIDO*\n\nRecebemos sua solicitação de ativação do aplicativo.\nNossa equipe já está processando o pedido e em breve seu acesso será liberado.\n\n📱 Aplicativo: *${finalAppName}*\n👤 Cliente: *${finalName || '-'}*\n${finalMac ? `🖥 MAC: *${finalMac}*\n` : ''}${finalEmail ? `📧 E-mail: *${finalEmail}*\n` : ''}\n⏳ Assim que a ativação for concluída, você receberá uma nova mensagem confirmando.\n\nObrigado pela preferência! 😊`;

          try {
            const custResp = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({
                  action: 'enviar-mensagem',
                  department_id: ownerZapSettings.selected_department_id,
                  number: customerPhone,
                  text: customerMsg,
                  user_id: appOwnerId,
                }),
              },
            );
            console.log(`[Cakto] Msg "pedido recebido" para cliente ${customerPhone}: ok=${custResp.ok}`);

            if (!custResp.ok) {
              const tplName = ownerBillingSettings?.meta_template_name || 'pedido_aprovado';
              await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  },
                  body: JSON.stringify({
                    action: 'enviar-template',
                    department_id: ownerZapSettings.selected_department_id,
                    template_name: tplName,
                    number: customerPhone,
                    language: 'pt_BR',
                    user_id: appOwnerId,
                  }),
                },
              );
            }
          } catch (custErr) {
            console.error('[Cakto] Erro ao enviar msg cliente ativação:', custErr);
          }

          const activationMsg = `📱 *Nova Solicitação de Ativação*\n\n📦 App: *${finalAppName}*\n👤 Cliente: *${finalName || '-'}*\n📞 Tel: *${customerPhone}*\n${finalMac ? `🔗 MAC: *${finalMac}*\n` : ''}${finalEmail ? `📧 Email: *${finalEmail}*\n` : ''}💰 Valor: *R$ ${activationAmountNum.toFixed(2)}*\n💳 Pagamento: *${activationPaymentMethod.includes('credit') || activationPaymentMethod.includes('cart') ? 'Cartão' : 'PIX'}*\n\n⏳ Status: Pendente de ativação`;

          try {
            const notifResp = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({
                  action: 'enviar-mensagem',
                  department_id: ownerZapSettings.selected_department_id,
                  number: ownerNotifPhone,
                  text: activationMsg,
                  user_id: appOwnerId,
                }),
              },
            );
            console.log(`[Cakto] Notificação ativação para admin ${ownerNotifPhone}: ok=${notifResp.ok}`);

            if (!notifResp.ok) {
              const tplName = ownerBillingSettings?.meta_template_name || 'pedido_aprovado';
              await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  },
                  body: JSON.stringify({
                    action: 'enviar-template',
                    department_id: ownerZapSettings.selected_department_id,
                    template_name: tplName,
                    number: ownerNotifPhone,
                    language: 'pt_BR',
                    user_id: appOwnerId,
                  }),
                },
              );
            }
          } catch (notifErr) {
            console.error('[Cakto] Erro ao notificar admin ativação:', notifErr);
          }
        } else {
          console.warn(`[Cakto] Sem configuração de WhatsApp para notificar ativação (owner: ${appOwnerId})`);
        }

        return new Response(JSON.stringify({
          success: true,
          type: 'activation',
          app: finalAppName,
          message: `Solicitação de ativação de ${finalAppName} registrada`,
        }), { headers: jsonHeaders });
      }
    }

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
        .select('id, name, phone, username, server_id, plan_id, due_date, created_by, status, created_at, custom_price, screens, notes, start_date, extra_months')
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

    // ── Determine payment amount and method early ──
    const paymentAmount = caktoData?.amount || caktoData?.baseAmount || body?.sale?.amount || body?.amount || 0;
    const amountNumeric = Number(String(paymentAmount).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

    // Detect payment method from Cakto payload
    const rawMethod = (caktoData?.payment_method || caktoData?.paymentMethod || caktoData?.method || body?.payment_method || '').toString().toLowerCase();
    const isCreditCard = rawMethod.includes('credit') || rawMethod.includes('cartao') || rawMethod.includes('cartão') || rawMethod.includes('card');
    const paymentMethodDb = isCreditCard ? 'cartao_credito' : 'pix';

    if (allMatchedCustomers.length === 0) {
      console.warn(`[Cakto] Nenhum cliente encontrado para telefone: ${phone}`);
      // Log not found
      await supabaseAdmin.from('message_logs').insert({
        customer_phone: phoneDigits,
        message_type: 'confirmation',
        source: 'cakto',
        status: 'not_found',
        error_message: `Nenhum cliente encontrado. Variantes: ${[...searchVariants].join(', ')}`,
        metadata: { phone_original: phone, searched_variants: [...searchVariants], amount: amountNumeric },
      });
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Nenhum cliente encontrado com telefone ${phone}`,
        searched_variants: [...searchVariants],
      }), { status: 404, headers: jsonHeaders });
    }

    // ── Check for pending renewal selections (from external payment site) ──
    let pendingSelectionIds: string[] = [];
    let preSelectedMultiRenewal = false;
    {
      const { data: pendingSelections } = await supabaseAdmin
        .from('pending_renewal_selections')
        .select('customer_id')
        .in('phone_normalized', [...searchVariants])
        .eq('used', false)
        .gt('expires_at', new Date().toISOString());

      if (pendingSelections && pendingSelections.length > 0) {
        pendingSelectionIds = pendingSelections.map((s: any) => s.customer_id);
        console.log(`[Cakto] Seleção pendente encontrada: ${pendingSelectionIds.length} cliente(s) pré-selecionado(s)`);

        // Filter allMatchedCustomers to only those selected
        const selectedCustomers = allMatchedCustomers.filter((c: any) => pendingSelectionIds.includes(c.id));
        if (selectedCustomers.length > 0) {
          allMatchedCustomers = selectedCustomers;
          if (selectedCustomers.length > 1) {
            preSelectedMultiRenewal = true;
          }
          console.log(`[Cakto] Usando ${selectedCustomers.length} cliente(s) pré-selecionado(s) do site externo`);
        }

        // Mark selections as used
        await supabaseAdmin
          .from('pending_renewal_selections')
          .update({ used: true })
          .in('phone_normalized', [...searchVariants])
          .eq('used', false);
      }
    }

    // ── Detect multi-screen: same person with multiple records (same name) ──
    const primaryName = allMatchedCustomers[0]?.name?.trim().toUpperCase() || '';
    const samePersonCustomers = allMatchedCustomers.filter((c: any) => 
      c.name?.trim().toUpperCase() === primaryName
    );
    
    // Validate if paid amount covers ALL screens before batch-renewing
    let isMultiScreen = samePersonCustomers.length > 1 && samePersonCustomers.length === allMatchedCustomers.length;
    
    if (isMultiScreen && amountNumeric > 0) {
      // Load price for each screen to calculate expected total
      let singlePrice = 0;
      const first = samePersonCustomers[0];
      if (first.custom_price) {
        singlePrice = Number(first.custom_price);
      } else if (first.plan_id) {
        const { data: firstPlan } = await supabaseAdmin.from('plans').select('price').eq('id', first.plan_id).maybeSingle();
        if (firstPlan) singlePrice = Number(firstPlan.price);
      }
      
      const expectedMultiTotal = singlePrice * samePersonCustomers.length;
      const singleTolerance = singlePrice * 0.15;
      const multiTolerance = expectedMultiTotal * 0.15;
      
      const paidForSingle = singlePrice > 0 && Math.abs(amountNumeric - singlePrice) <= singleTolerance;
      const paidForAll = expectedMultiTotal > 0 && Math.abs(amountNumeric - expectedMultiTotal) <= multiTolerance;
      
      if (paidForAll) {
        console.log(`[Cakto] 🖥️ Multi-tela: valor pago R$ ${amountNumeric.toFixed(2)} ≈ total R$ ${expectedMultiTotal.toFixed(2)} (${samePersonCustomers.length} telas). Renovando TODOS.`);
      } else if (paidForSingle) {
        isMultiScreen = false;
        console.log(`[Cakto] 🖥️ Multi-tela detectado MAS valor pago R$ ${amountNumeric.toFixed(2)} ≈ individual R$ ${singlePrice.toFixed(2)}. Renovando apenas 1 (mais urgente).`);
      } else {
        isMultiScreen = false;
        console.log(`[Cakto] 🖥️ Multi-tela detectado MAS valor pago R$ ${amountNumeric.toFixed(2)} não corresponde a individual R$ ${singlePrice.toFixed(2)} nem total R$ ${expectedMultiTotal.toFixed(2)}. Renovando apenas 1 (segurança).`);
      }
    }
    
    // If all matched customers are the same person (multi-screen) AND amount covers all, renew ALL
    const customersToRenew = isMultiScreen ? samePersonCustomers : [allMatchedCustomers[0]];
    const matchedCustomer = allMatchedCustomers[0];
    
    if (isMultiScreen) {
      console.log(`[Cakto] 🖥️ Multi-tela confirmado: ${samePersonCustomers.length} registros para "${primaryName}". Renovando TODOS.`);
    }

    // ── Duplicate protection: only block near-instant retries with same amount ──
    if (caktoId && amountNumeric > 0) {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const amountMin = Number((amountNumeric - 0.01).toFixed(2));
      const amountMax = Number((amountNumeric + 0.01).toFixed(2));

      const { data: existingPayment } = await supabaseAdmin
        .from('payments')
        .select('id, amount, created_at')
        .eq('customer_id', matchedCustomer.id)
        .eq('method', paymentMethodDb)
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
          // Check if current plan's own price matches the paid amount (±1%)
          const currentPlanPriceMatches = Math.abs(currentPlan.price - amountNumeric) <= currentPlan.price * 0.01;
          // Check if custom_price matches the paid amount (±15%)
          const isCustomMatch = customerPrice && Math.abs(customerPrice - amountNumeric) <= customerPrice * 0.15;
          // Check if another plan matches the amount exactly (±1%)
          const exactOtherPlan = allPlans.find((p: any) => p.id !== currentPlan.id && Math.abs(p.price - amountNumeric) <= p.price * 0.01);
          
          if (currentPlanPriceMatches) {
            // Current plan price matches paid amount - keep it
            bestMatch = currentPlan;
            console.log(`[Cakto] Mantendo plano atual: ${currentPlan.plan_name} (R$ ${currentPlan.price}) | Valor pago: R$ ${amountNumeric.toFixed(2)} (preço do plano bate)`);
          } else if (exactOtherPlan) {
            // Another plan matches exactly - switch to it
            bestMatch = exactOtherPlan;
            console.log(`[Cakto] Trocando para plano: ${exactOtherPlan.plan_name} (R$ ${exactOtherPlan.price}) | Valor pago: R$ ${amountNumeric.toFixed(2)} (match exato com outro plano)`);
          } else if (isCustomMatch) {
            // custom_price matches and no exact plan match - keep current plan
            bestMatch = currentPlan;
            console.log(`[Cakto] Mantendo plano atual: ${currentPlan.plan_name} (R$ ${currentPlan.price}) | Valor pago: R$ ${amountNumeric.toFixed(2)} (custom_price match R$ ${customerPrice})`);
          }
          // If nothing matches, do NOT default to current plan - let step 2 find the right one
        }
      }

      // 2) If no match yet, try matching total amount against all plans (±10%)
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
        if (bestMatch) {
          console.log(`[Cakto] Match por proximidade (±10%): ${bestMatch.plan_name} (R$ ${bestMatch.price}) | Valor pago: R$ ${amountNumeric.toFixed(2)}`);
        }
      }

      // 3) custom_price fallback - if still no match and customer has custom_price
      if (!bestMatch && matchedCustomer.custom_price) {
        const customerPrice = Number(matchedCustomer.custom_price);
        if (Math.abs(customerPrice - amountNumeric) <= customerPrice * 0.1) {
          if (matchedCustomer.plan_id) {
            const currentPlanFallback = allPlans.find((p: any) => p.id === matchedCustomer.plan_id);
            if (currentPlanFallback) {
              bestMatch = currentPlanFallback;
              console.log(`[Cakto] Fallback custom_price: ${currentPlanFallback.plan_name} (R$ ${customerPrice} custom) | Valor pago: R$ ${amountNumeric.toFixed(2)}`);
            }
          }
        }
      }

      // 4) SAFETY: If still no match, log warning - do NOT silently use current plan
      if (!bestMatch) {
        console.warn(`[Cakto] ⚠️ NENHUM plano encontrado para valor R$ ${amountNumeric.toFixed(2)}. Usando duração padrão de 30 dias (Mensal).`);
        // Try to at least find the Mensal plan as safe default
        const mensalPlan = allPlans.find((p: any) => p.duration_days === 30 && p.plan_name.toLowerCase().includes('mensal') && !p.plan_name.toLowerCase().includes('tela') && !p.plan_name.toLowerCase().includes('cartão'));
        if (mensalPlan) {
          bestMatch = mensalPlan;
          console.log(`[Cakto] Usando Mensal como fallback seguro: ${mensalPlan.plan_name}`);
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

    let multiRenewalCompleted = false;

    // ── Pre-selected multi-customer renewal (from external payment site) ──
    if (preSelectedMultiRenewal && allMatchedCustomers.length > 1) {
      console.log(`[Cakto] Multi-renovação pré-selecionada: ${allMatchedCustomers.length} clientes`);

      // Validate amount: sum of individual prices must match paid amount (±15% tolerance)
      const loadPrices = await Promise.all(allMatchedCustomers.map(async (c: any) => {
        if (c.custom_price) return Number(c.custom_price);
        if (c.plan_id) {
          const { data: p } = await supabaseAdmin.from('plans').select('price').eq('id', c.plan_id).maybeSingle();
          return p ? Number(p.price) : 0;
        }
        return 0;
      }));
      const expectedTotal = loadPrices.reduce((s, p) => s + p, 0);
      const tolerance = expectedTotal * 0.15;

      if (expectedTotal > 0 && Math.abs(amountNumeric - expectedTotal) > tolerance) {
        console.warn(`[Cakto] Valor pago R$ ${amountNumeric.toFixed(2)} não corresponde ao total esperado R$ ${expectedTotal.toFixed(2)} para ${allMatchedCustomers.length} clientes. Ignorando pré-seleção.`);
        // Fall through to single-customer logic below
      } else {
        console.log(`[Cakto] Valor validado: pago R$ ${amountNumeric.toFixed(2)} ≈ esperado R$ ${expectedTotal.toFixed(2)}`);
        const todayStr = today.toISOString().split('T')[0];
        const amountPerCustomer = allMatchedCustomers.length > 0 ? amountNumeric / allMatchedCustomers.length : amountNumeric;

        for (const cust of allMatchedCustomers) {
          const custCurrentDue = cust.due_date ? new Date(cust.due_date + 'T00:00:00') : today;
          const custBase = new Date(custCurrentDue > today ? custCurrentDue : today);

          if (monthsToAdd) {
            const origDay = custBase.getDate();
            custBase.setMonth(custBase.getMonth() + monthsToAdd);
            if (custBase.getDate() !== origDay) custBase.setDate(0);
          } else {
            custBase.setDate(custBase.getDate() + durationDays);
          }
          const custNewDue = custBase.toISOString().split('T')[0];

          const custUpdate: Record<string, unknown> = { due_date: custNewDue, status: 'ativa' };
          if (bestMatch && bestMatch.id !== cust.plan_id) {
            custUpdate.plan_id = bestMatch.id;
            custUpdate.custom_price = null;
          }
          await supabaseAdmin.from('customers').update(custUpdate).eq('id', cust.id);

          if (amountNumeric > 0) {
            await supabaseAdmin.from('payments').insert({
              customer_id: cust.id,
              amount: amountPerCustomer,
              payment_date: todayStr,
              method: paymentMethodDb,
              confirmed: true,
              source: 'cakto',
            });
          }

          console.log(`[Cakto] Multi-renovação: ${cust.name} (${cust.username || '-'}) → ${custNewDue}`);
        }

        // Save confirmation for the primary customer
        const primaryNewDue = (() => {
          const d = matchedCustomer.due_date ? new Date(matchedCustomer.due_date + 'T00:00:00') : today;
          const b = new Date(d > today ? d : today);
          if (monthsToAdd) { const o = b.getDate(); b.setMonth(b.getMonth() + monthsToAdd); if (b.getDate() !== o) b.setDate(0); }
          else b.setDate(b.getDate() + durationDays);
          return b.toISOString().split('T')[0];
        })();

        await supabaseAdmin.from('payment_confirmations').insert({
          customer_id: matchedCustomer.id,
          customer_name: allMatchedCustomers.map((c: any) => c.name).join(', '),
          customer_phone: matchedCustomer.phone,
          amount: amountNumeric,
          plan_name: matchedPlanName || null,
          duration_days: durationDays,
          new_due_date: primaryNewDue,
          status: 'approved',
        });

        // Log
        await supabaseAdmin.from('message_logs').insert({
          user_id: matchedCustomer.created_by,
          customer_id: matchedCustomer.id,
          customer_name: allMatchedCustomers.map((c: any) => c.name).join(', '),
          customer_phone: phoneDigits,
          message_type: 'confirmation',
          source: 'cakto',
          status: 'success',
          metadata: {
            multi_renewal: true,
            customers_renewed: allMatchedCustomers.length,
            amount: amountNumeric,
            plan: matchedPlanName,
          },
        });

        // Mark multi-renewal as completed - skip single-customer processing but continue to server renewal
        multiRenewalCompleted = true;
        // Set customersToRenew to all matched customers so server renewal processes all usernames
        customersToRenew.length = 0;
        allMatchedCustomers.forEach((c: any) => customersToRenew.push(c));
        console.log(`[Cakto] Multi-renovação concluída no gestor. Prosseguindo para renovação no painel do servidor...`);
      }
    }

    // ── Conflict detection: multiple customers with same due_date (skip if multi-screen) ──
    if (allMatchedCustomers.length > 1 && !isMultiScreen && !multiRenewalCompleted) {
      const todayStr = today.toISOString().split('T')[0];
      // Check if 2+ customers share the same due_date (or both expired)
      const sameDueCustomers = allMatchedCustomers.filter((c: any) => {
        const d = c.due_date || '';
        return d === matchedCustomer.due_date || (d < todayStr && (matchedCustomer.due_date || '') < todayStr);
      });

      if (sameDueCustomers.length > 1) {
        console.log(`[Cakto] CONFLITO: ${sameDueCustomers.length} clientes com mesmo vencimento (${matchedCustomer.due_date}). Notificando admin.`);

        // Register payment without confirming (so money isn't lost)
        let conflictPaymentId = '';
        if (amountNumeric > 0) {
          const { data: insertedPayment } = await supabaseAdmin.from('payments').insert({
            customer_id: matchedCustomer.id,
            amount: amountNumeric,
            payment_date: todayStr,
            method: paymentMethodDb,
            confirmed: false,
            source: 'cakto',
          }).select('id').single();
          if (insertedPayment) conflictPaymentId = insertedPayment.id;
          console.log(`[Cakto] Pagamento registrado SEM confirmação para decisão do admin (id: ${conflictPaymentId})`);
        }

        // Notify reseller via WhatsApp with clickable links
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
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const customerList = sameDueCustomers.map((c: any) =>
              `  • ${c.name} (${c.username || '-'}) - Venc: ${c.due_date}`
            ).join('\n');

            const buttonsToSend = sameDueCustomers.slice(0, 3).map((c: any) => ({
              id: `renew_${conflictPaymentId}_${c.id}`,
              title: (c.username || c.name).substring(0, 20),
            }));

            const interactiveText = `⚠️ *Pagamento requer decisão*\n\n📞 Telefone: ${phoneDigits}\n💰 Valor: *R$ ${amountNumeric.toFixed(2)}*\n📦 Plano: *${matchedPlanName || '-'}*\n\n👥 *${sameDueCustomers.length} clientes:*\n${customerList}\n\n👇 Escolha qual renovar:`;

            let buttonsSent = false;
            try {
              const interactiveRes = await fetch(
                `${supabaseUrl}/functions/v1/zap-responder`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  },
                  body: JSON.stringify({
                    action: 'enviar-interativo',
                    department_id: zapSettings.selected_department_id,
                    number: conflictPhone,
                    text: interactiveText,
                    buttons: buttonsToSend,
                    user_id: matchedCustomer.created_by,
                  }),
                },
              );
              const interactiveBody = await interactiveRes.json().catch(() => ({}));
              buttonsSent = interactiveBody?.success === true;
              console.log(`[Cakto] Botões interativos: ${buttonsSent ? 'ENVIADOS' : 'FALHOU'}`);
            } catch (e) {
              console.error('[Cakto] Erro ao enviar botões interativos:', e);
            }

            if (!buttonsSent) {
              const appUrl = 'https://iply-flow.lovable.app';
              const customerLinks = sameDueCustomers.map((c: any) => {
                const link = `${appUrl}/confirmar-renovacao?payment_id=${conflictPaymentId}&customer_id=${c.id}`;
                return `👤 *${c.name}* (${c.username || '-'})\n🔗 ${link}`;
              }).join('\n\n');

              const adminMsg = `⚠️ *Atenção: Pagamento requer decisão manual*\n\n📞 Telefone: ${phoneDigits}\n💰 Valor: *R$ ${amountNumeric.toFixed(2)}*\n📦 Plano: *${matchedPlanName || '-'}*\n\n👥 *${sameDueCustomers.length} clientes com mesmo vencimento:*\n\n${customerLinks}\n\n👆 *Clique no link do cliente que deseja renovar*\n⏳ Pagamento registrado mas *NÃO confirmado*.`;

              await fetch(
                `${supabaseUrl}/functions/v1/zap-responder`,
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
              console.log('[Cakto] Fallback: notificação com links individuais enviada para:', conflictPhone);
            }
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

    // Renew ALL customers in customersToRenew (supports multi-screen) — skip if multi-renewal already handled
    if (!multiRenewalCompleted) {
    for (const cust of customersToRenew) {
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

      // Register payment (split amount for multi-screen, full for single)
      if (amountNumeric > 0) {
        const payAmount = isMultiScreen ? amountNumeric / customersToRenew.length : amountNumeric;
        await supabaseAdmin.from('payments').insert({
          customer_id: cust.id,
          amount: payAmount,
          payment_date: today.toISOString().split('T')[0],
          method: paymentMethodDb,
          confirmed: true,
          source: 'cakto',
        });
        console.log(`[Cakto] Pagamento registrado para ${cust.name} (${cust.username || '-'}): R$ ${payAmount.toFixed(2)}`);
      }
    }
    } // end if (!multiRenewalCompleted)

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

    // ── Save payment confirmation for the dynamic page (skip if multi-renewal already saved) ──
    let confirmationId = '';
    if (!multiRenewalCompleted) {
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
    } // end if (!multiRenewalCompleted) for confirmation

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
        .select('notification_phone, renewal_message_template, renewal_image_url, meta_template_name')
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

        const displayUsername = isMultiScreen 
          ? customersToRenew.map((c: any) => c.username || '-').join(', ')
          : (matchedCustomer.username || '-');

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

        // Send with retry (up to 2 attempts) to handle transient failures
        let msgSuccess = false;
        let lastError = '';
        let lastResponse: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const msgResp = await fetchWithTimeout(
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
              12000,
            );
            const msgResult = await msgResp.json();
            lastResponse = msgResult;
            console.log(`[Cakto] Mensagem WhatsApp (tentativa ${attempt}): status=${msgResp.status}`, JSON.stringify(msgResult));
            
            if (msgResp.ok && msgResult?.success !== false) {
              msgSuccess = true;
              break;
            }
            lastError = msgResult?.message || msgResult?.error || `HTTP ${msgResp.status}`;
            console.warn(`[Cakto] Tentativa ${attempt} falhou para cliente ${metaPhone}. ${attempt < 2 ? 'Tentando novamente em 3s...' : 'Sem mais tentativas.'}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
          } catch (retryErr) {
            lastError = String(retryErr);
            console.error(`[Cakto] Erro tentativa ${attempt} para ${metaPhone}:`, retryErr);
            if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
          }
        }
        
        // Log message attempt to database
        await supabaseAdmin.from('message_logs').insert({
          user_id: matchedCustomer.created_by,
          customer_id: matchedCustomer.id,
          customer_name: matchedCustomer.name,
          customer_phone: metaPhone,
          message_type: 'confirmation',
          source: 'cakto',
          status: msgSuccess ? 'success' : 'error',
          error_message: msgSuccess ? null : lastError,
          whatsapp_response: lastResponse,
          metadata: { amount: amountNumeric, plan: matchedPlanName, server: serverName },
        });

        if (!msgSuccess) {
          console.error(`[Cakto] FALHA texto plano para ${matchedCustomer.name} (${metaPhone}). Tentando fallback via template...`);
          
          // Fallback: try sending via approved Meta template (works outside 24h window)
          const templateName = billingSettings?.meta_template_name || 'pedido_aprovado';
          try {
            const templateResp = await fetchWithTimeout(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({
                  action: 'enviar-template',
                  department_id: zapSettings.selected_department_id,
                  template_name: templateName,
                  number: metaPhone,
                  language: 'pt_BR',
                  user_id: matchedCustomer.created_by,
                }),
              },
              10000,
            );
            const templateResult = await templateResp.json();
            console.log(`[Cakto] Template fallback (${templateName}): status=${templateResp.status}`, JSON.stringify(templateResult));
            
            if (templateResp.ok && templateResult?.success !== false) {
              msgSuccess = true;
              lastResponse = templateResult;
              lastError = '';
              console.log(`[Cakto] Template enviado com sucesso para ${matchedCustomer.name} (${metaPhone})`);
              
              // Update log to reflect template success
              await supabaseAdmin.from('message_logs').update({
                status: 'success',
                error_message: null,
                whatsapp_response: { ...templateResult, fallback: 'template', template_name: templateName },
              }).eq('customer_id', matchedCustomer.id).eq('source', 'cakto').eq('status', 'error').order('created_at', { ascending: false }).limit(1);
            } else {
              console.error(`[Cakto] Template fallback também falhou para ${matchedCustomer.name}:`, templateResult?.error || templateResult);
            }
          } catch (templateErr) {
            console.error(`[Cakto] Erro ao enviar template fallback:`, templateErr);
          }
          
          if (!msgSuccess) {
            console.error(`[Cakto] FALHA TOTAL: Mensagem NÃO enviada para cliente ${matchedCustomer.name} (${metaPhone}) - texto e template falharam`);
          }
        }
      } else {
        console.log('[Cakto] Nenhum departamento configurado. Mensagem não enviada.');
        // Log skipped
        await supabaseAdmin.from('message_logs').insert({
          user_id: matchedCustomer.created_by,
          customer_id: matchedCustomer.id,
          customer_name: matchedCustomer.name,
          customer_phone: matchedCustomer.phone,
          message_type: 'confirmation',
          source: 'cakto',
          status: 'skipped',
          error_message: 'Nenhum departamento configurado',
        });
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
          const allUsernamesDisplay = isMultiScreen 
            ? customersToRenew.map((c: any) => c.username || '-').join(', ')
            : (matchedCustomer.username || '-');
          const adminMsg = `🔔 *Renovação Automática (Cakto)*\n\n👤 Cliente: *${matchedCustomer.name}*\n📞 Tel: ${adminMetaPhone}\n👤 Usuário(s): *${allUsernamesDisplay}*\n🖥️ Telas: *${customersToRenew.length}*\n💰 Valor: *R$ ${amountNumeric.toFixed(2)}*\n📦 Plano: *${matchedPlanName || '-'}*\n🖥️ Servidor: *${adminServerName}*\n📅 Novo vencimento: *${fmtDue}*\n✅ Status: Renovado`;

          const adminResp = await fetchWithTimeout(
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
            10000,
          );
          const adminResult = await adminResp.json();
          let adminSent = adminResp.ok && adminResult?.success !== false;
          console.log(`[Cakto] Notificação texto para admin ${notificationPhone}: ok=${adminSent}`);

          // Fallback: if plain text failed, try template (works outside 24h window)
          if (!adminSent) {
            console.warn(`[Cakto] Texto admin falhou para ${notificationPhone}. Tentando template fallback...`);
            const adminTemplateName = billingSettings?.meta_template_name || 'pedido_aprovado';
            try {
              const adminTemplateResp = await fetchWithTimeout(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  },
                  body: JSON.stringify({
                    action: 'enviar-template',
                    department_id: zapSettings.selected_department_id,
                    template_name: adminTemplateName,
                    number: notificationPhone,
                    language: 'pt_BR',
                    user_id: matchedCustomer.created_by,
                  }),
                },
                10000,
              );
              const adminTemplateResult = await adminTemplateResp.json();
              if (adminTemplateResp.ok && adminTemplateResult?.success !== false) {
                adminSent = true;
                console.log(`[Cakto] Template admin enviado com sucesso para ${notificationPhone}`);
              } else {
                console.error(`[Cakto] Template admin também falhou para ${notificationPhone}:`, adminTemplateResult?.error || adminTemplateResult);
              }
            } catch (tplErr) {
              console.error(`[Cakto] Erro template admin fallback:`, tplErr);
            }
          }

          if (adminSent) {
            console.log('[Cakto] Notificação enviada para:', notificationPhone);
          } else {
            console.error(`[Cakto] FALHA TOTAL notificação admin para ${notificationPhone}`);
          }
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

    // ── Trigger server renewals for ALL customersToRenew usernames ──
    const allUsernames: string[] = [];
    for (const cust of customersToRenew) {
      if (cust.username?.trim()) {
        const parts = cust.username.split(',').map((u: string) => u.trim()).filter((u: string) => u.length > 0);
        for (const u of parts) {
          if (!allUsernames.includes(u)) allUsernames.push(u);
        }
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

      // ── Retry failed server renewals once before giving up ──
      let failedRenewals = renewResults.filter(r => !r.success);
      if (failedRenewals.length > 0) {
        console.warn(`[Cakto] ⚠️ ${failedRenewals.length} renovação(ões) falharam. Tentando retry em 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));

        for (const failed of failedRenewals) {
          try {
            const retryPanel = failed.panel;
            const retryUsername = failed.username;
            console.log(`[Cakto] 🔄 Retry: ${retryPanel} / ${retryUsername}`);

            let retryResp: Response | null = null;
            if (retryPanel === 'natv') {
              retryResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/natv-renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-cakto-webhook-secret': Deno.env.get('CAKTO_WEBHOOK_SECRET') || '' },
                body: JSON.stringify({ username: retryUsername, duration_days: durationDays, customer_id: matchedCustomer.id }),
              });
            } else if (retryPanel === 'vplay') {
              retryResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/vplay-renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-cakto-webhook-secret': Deno.env.get('CAKTO_WEBHOOK_SECRET') || '' },
                body: JSON.stringify({ username: retryUsername, new_due_date: newDueDate, customer_id: matchedCustomer.id }),
              });
            } else if (retryPanel === 'the-best') {
              retryResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/the-best-renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-cakto-webhook-secret': Deno.env.get('CAKTO_WEBHOOK_SECRET') || '' },
                body: JSON.stringify({ username: retryUsername, months: renewMonths, customer_id: matchedCustomer.id }),
              });
            } else if (retryPanel === 'rush') {
              retryResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/rush-renew`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-cakto-webhook-secret': Deno.env.get('CAKTO_WEBHOOK_SECRET') || '' },
                body: JSON.stringify({ username: retryUsername, months: renewMonths, customer_id: matchedCustomer.id }),
              });
            }

            if (retryResp && retryResp.ok) {
              const retryResult = await retryResp.json();
              if (retryResult?.success !== false) {
                console.log(`[Cakto] ✅ Retry bem-sucedido: ${retryPanel}/${retryUsername}`);
                failed.success = true;
                failed.retried = true;
              }
            }
          } catch (retryErr) {
            console.error(`[Cakto] Retry falhou para ${failed.panel}/${failed.username}:`, retryErr);
          }
        }

        // Re-check after retry
        failedRenewals = renewResults.filter(r => !r.success);
      }

      if (failedRenewals.length > 0) {
        console.error(`[Cakto] ❌ FALHA DEFINITIVA NA RENOVAÇÃO DO SERVIDOR para ${matchedCustomer.name}:`, JSON.stringify(failedRenewals));
        try {
          await supabaseAdmin.from('message_logs').insert({
            user_id: matchedCustomer.created_by,
            customer_id: matchedCustomer.id,
            customer_name: matchedCustomer.name,
            customer_phone: matchedCustomer.phone,
            message_type: 'server_renewal_failed',
            source: 'cakto',
            status: 'error',
            error_message: `Falha ao renovar no servidor ${serverName} (após retry): ${JSON.stringify(failedRenewals)}`,
            metadata: { server_name: serverName, server_host: serverHost, renewals: failedRenewals, usernames: allUsernames },
          });
        } catch (logErr) {
          console.error('[Cakto] Erro ao registrar falha no message_logs:', logErr);
        }

      // ── Send WhatsApp alert to admin about the failure ──
        // Re-fetch settings since zapSettings/billingSettings may be out of scope
        let failZapDeptId = '';
        let failNotifPhone = '';
        try {
          const { data: failZapSettings } = await supabaseAdmin
            .from('zap_responder_settings')
            .select('selected_department_id')
            .eq('user_id', matchedCustomer.created_by)
            .maybeSingle();
          const { data: failBillingSettings } = await supabaseAdmin
            .from('billing_settings')
            .select('notification_phone')
            .eq('user_id', matchedCustomer.created_by)
            .maybeSingle();
          failZapDeptId = failZapSettings?.selected_department_id || '';
          failNotifPhone = failBillingSettings?.notification_phone || '';
        } catch (settingsErr) {
          console.error('[Cakto] Erro ao buscar settings para alerta de falha:', settingsErr);
        }
        if (failZapDeptId && failNotifPhone) {
          try {
            const failedUsernames = failedRenewals.map(r => r.username).join(', ');
            const alertMsg = `🚨 *ALERTA: Falha na Renovação do Servidor*\n\n👤 Cliente: *${matchedCustomer.name}*\n📞 Tel: ${matchedCustomer.phone}\n👤 Usuário(s): *${failedUsernames}*\n🖥️ Servidor: *${serverName}*\n📦 Plano: *${matchedPlanName || '-'}*\n📅 Vencimento atualizado: *${newDueDate}*\n\n⚠️ O vencimento foi atualizado no gestor, mas a renovação NO PAINEL DO SERVIDOR falhou mesmo após retry.\n\n🔧 Ação necessária: Renovar manualmente no painel.`;

            await fetchWithTimeout(`${Deno.env.get('SUPABASE_URL')}/functions/v1/zap-responder`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                action: 'enviar-mensagem',
                department_id: failZapDeptId,
                number: failNotifPhone,
                text: alertMsg,
                user_id: matchedCustomer.created_by,
              }),
            });
            console.log(`[Cakto] 🚨 Alerta de falha enviado para admin: ${failNotifPhone}`);
          } catch (alertErr) {
            console.error('[Cakto] Erro ao enviar alerta de falha para admin:', alertErr);
          }
        }
      } else if (renewResults.length > 0) {
        console.log(`[Cakto] ✅ Todas as renovações no servidor concluídas com sucesso: ${renewResults.map(r => `${r.panel}:${r.username}`).join(', ')}`);
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
