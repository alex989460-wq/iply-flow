import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_APP_SECRET = Deno.env.get('META_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GRAPH_API_VERSION = 'v21.0';

async function generateAppSecretProof(accessToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(META_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(accessToken));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;
    const body = await req.json();
    const { action } = body;

    console.log(`[meta-chat] Action: ${action}, User: ${userId}`);

    // Get Meta settings
    const { data: settings } = await supabase
      .from('zap_responder_settings')
      .select('meta_access_token, meta_phone_number_id, meta_business_id, meta_display_phone')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings?.meta_access_token || !settings?.meta_phone_number_id) {
      return new Response(JSON.stringify({
        error: 'Conta Meta não conectada ou número não selecionado. Vá em Configurações > WhatsApp Oficial.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { meta_access_token: accessToken, meta_phone_number_id: phoneNumberId } = settings;
    const appSecretProof = await generateAppSecretProof(accessToken);

    // ── SEND TEXT MESSAGE ──
    if (action === 'send-message') {
      const { to, text } = body;

      if (!to || !text) {
        return new Response(JSON.stringify({ error: 'Campos "to" e "text" obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const phone = normalizePhone(to);

      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: text },
          access_token: accessToken,
          appsecret_proof: appSecretProof,
        }),
      });

      const data = await response.json();
      console.log('[meta-chat] Send message response:', JSON.stringify(data));

      if (data.error) {
        return new Response(JSON.stringify({
          error: data.error.message || 'Erro ao enviar mensagem',
          meta_error: data.error,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message_id: data.messages?.[0]?.id,
        to: phone,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── SEND TEMPLATE MESSAGE ──
    if (action === 'send-template') {
      const { to, template_name, language = 'pt_BR', components } = body;

      if (!to || !template_name) {
        return new Response(JSON.stringify({ error: 'Campos "to" e "template_name" obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const phone = normalizePhone(to);

      const templatePayload: any = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: template_name,
          language: { code: language },
        },
        access_token: accessToken,
        appsecret_proof: appSecretProof,
      };

      if (components) {
        templatePayload.template.components = components;
      }

      const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templatePayload),
      });

      const data = await response.json();
      console.log('[meta-chat] Send template response:', JSON.stringify(data));

      if (data.error) {
        return new Response(JSON.stringify({
          error: data.error.message || 'Erro ao enviar template',
          meta_error: data.error,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message_id: data.messages?.[0]?.id,
        to: phone,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── GET PHONE INFO ──
    if (action === 'get-info') {
      return new Response(JSON.stringify({
        success: true,
        phone_number_id: phoneNumberId,
        display_phone: settings.meta_display_phone,
        waba_id: settings.meta_business_id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[meta-chat] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
