import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !claims?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claims.user.id;

    // Get user's Meta settings
    const { data: settings } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('api_type', 'meta_cloud')
      .maybeSingle();

    if (!settings?.meta_access_token || !settings?.meta_phone_number_id) {
      return new Response(JSON.stringify({ error: 'Meta not configured. Connect your Facebook account first.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check token expiration
    if (settings.meta_token_expires_at && new Date(settings.meta_token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Meta token expired. Please reconnect your Facebook account.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { to, message, template_name, template_params } = body;

    if (!to) {
      return new Response(JSON.stringify({ error: 'Missing "to" phone number' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clean phone number (remove non-digits, ensure country code)
    let phoneNumber = to.replace(/\D/g, '');
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '55' + phoneNumber.substring(1);
    }
    if (!phoneNumber.startsWith('55') && phoneNumber.length === 11) {
      phoneNumber = '55' + phoneNumber;
    }

    const accessToken = settings.meta_access_token;
    const phoneNumberId = settings.meta_phone_number_id;

    let requestBody: any;

    // If template_name is provided, send a template message
    if (template_name) {
      requestBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'template',
        template: {
          name: template_name,
          language: { code: 'pt_BR' },
          components: template_params || [],
        },
      };
    } else if (message) {
      // Send regular text message (only works within 24h window)
      requestBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      };
    } else {
      return new Response(JSON.stringify({ error: 'Missing "message" or "template_name"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[Meta Send] Sending message to:', phoneNumber);
    console.log('[Meta Send] Request body:', JSON.stringify(requestBody));

    // Send via Meta Graph API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[Meta Send] Error:', responseData);
      return new Response(JSON.stringify({ 
        error: 'Failed to send message',
        details: responseData.error?.message || 'Unknown error',
        error_code: responseData.error?.code,
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[Meta Send] Message sent successfully:', responseData);

    return new Response(JSON.stringify({ 
      success: true,
      message_id: responseData.messages?.[0]?.id,
      to: phoneNumber,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Meta Send] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
