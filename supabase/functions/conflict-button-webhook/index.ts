import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

/**
 * Webhook handler for WhatsApp interactive button replies.
 * When admin clicks a conflict resolution button, ZapResponder sends the reply here.
 * Button ID format: "renew_{paymentId}_{customerIndex}"
 * The payment_id maps to an unconfirmed payment, customerIndex maps to the stored conflict data.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const body = await req.json();
    console.log('[ConflictButton] Webhook received:', JSON.stringify(body));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Extract button reply from various webhook formats
    let buttonId = '';
    let buttonTitle = '';

    // ZapResponder format
    if (body?.interactive?.button_reply) {
      buttonId = body.interactive.button_reply.id || '';
      buttonTitle = body.interactive.button_reply.title || '';
    }
    // Meta Cloud API format
    else if (body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.button_reply) {
      const msg = body.entry[0].changes[0].value.messages[0];
      buttonId = msg.interactive.button_reply.id || '';
      buttonTitle = msg.interactive.button_reply.title || '';
    }
    // Direct format (from ZapResponder webhook)
    else if (body?.button_reply) {
      buttonId = body.button_reply.id || body.button_reply.payload || '';
      buttonTitle = body.button_reply.title || body.button_reply.text || '';
    }
    // Check message content for button payload
    else if (body?.message?.interactive?.button_reply) {
      buttonId = body.message.interactive.button_reply.id || '';
      buttonTitle = body.message.interactive.button_reply.title || '';
    }
    // Generic payload
    else if (body?.payload && typeof body.payload === 'string' && body.payload.startsWith('renew_')) {
      buttonId = body.payload;
    }
    // Text content that matches button pattern
    else if (body?.content && typeof body.content === 'string' && body.content.startsWith('renew_')) {
      buttonId = body.content;
    }
    // Also check tipo/type for button reply events
    else if ((body?.tipo === 'button_reply' || body?.type === 'button_reply' || body?.event_type === 'button_reply') && body?.id) {
      buttonId = body.id;
      buttonTitle = body.title || body.text || '';
    }

    if (!buttonId || !buttonId.startsWith('renew_')) {
      console.log('[ConflictButton] Not a conflict button reply, ignoring. buttonId:', buttonId);
      return new Response(JSON.stringify({ success: true, message: 'Ignored - not a conflict button' }), { headers: jsonHeaders });
    }

    console.log(`[ConflictButton] Processing button: id=${buttonId}, title=${buttonTitle}`);

    // Parse button ID: "renew_{paymentId}_{customerId}"
    const parts = buttonId.split('_');
    if (parts.length < 3) {
      console.error('[ConflictButton] Invalid button ID format:', buttonId);
      return new Response(JSON.stringify({ error: 'Formato de botão inválido' }), { status: 400, headers: jsonHeaders });
    }

    const paymentId = parts[1];
    const customerId = parts.slice(2).join('_'); // In case customer ID has underscores

    console.log(`[ConflictButton] paymentId=${paymentId}, customerId=${customerId}`);

    // Call the confirm-conflict-renewal function to process the renewal
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const confirmUrl = `${supabaseUrl}/functions/v1/confirm-conflict-renewal?payment_id=${paymentId}&customer_id=${customerId}`;

    console.log(`[ConflictButton] Calling confirm-conflict-renewal: ${confirmUrl}`);

    const confirmRes = await fetch(confirmUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
    });

    const confirmText = await confirmRes.text();
    console.log(`[ConflictButton] Confirm response: status=${confirmRes.status}, body=${confirmText.substring(0, 500)}`);

    return new Response(JSON.stringify({
      success: confirmRes.ok,
      message: confirmRes.ok
        ? `Renovação confirmada para ${buttonTitle || customerId}`
        : 'Erro ao confirmar renovação',
    }), { headers: jsonHeaders });

  } catch (error) {
    console.error('[ConflictButton] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
