import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoReply {
  id: string;
  user_id: string;
  trigger_keyword: string;
  reply_message: string;
  match_type: 'exact' | 'contains' | 'starts_with';
  is_enabled: boolean;
  priority: number;
}

interface ZapSettings {
  user_id: string;
  api_type: string;
  api_base_url: string;
  zap_api_token: string;
  instance_name: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^55/, '');
}

function matchesKeyword(message: string, keyword: string, matchType: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  const lowerKeyword = keyword.toLowerCase().trim();

  switch (matchType) {
    case 'exact':
      return lowerMessage === lowerKeyword;
    case 'starts_with':
      return lowerMessage.startsWith(lowerKeyword);
    case 'contains':
    default:
      return lowerMessage.includes(lowerKeyword);
  }
}

async function sendEvolutionMessage(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  phone: string,
  message: string
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Evolution Webhook] Error sending message:', errorText);
      return false;
    }

    console.log('[Evolution Webhook] Message sent successfully to:', phone);
    return true;
  } catch (error) {
    console.error('[Evolution Webhook] Error sending message:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log('[Evolution Webhook] Received payload:', JSON.stringify(payload, null, 2));

    // Extract message info from Evolution API payload
    // Evolution API v2 format varies, handle multiple structures
    let messageContent: string | null = null;
    let phoneFrom: string | null = null;
    let phoneTo: string | null = null;
    let instanceName: string | null = null;
    let isFromMe = false;

    // Try different payload structures
    if (payload.data) {
      // Standard Evolution v2 format
      const data = payload.data;
      messageContent = data.message?.conversation || 
                       data.message?.extendedTextMessage?.text ||
                       data.message?.text ||
                       null;
      phoneFrom = data.key?.remoteJid?.replace('@s.whatsapp.net', '').replace('@c.us', '');
      isFromMe = data.key?.fromMe || false;
      instanceName = payload.instance || data.instance;
    } else if (payload.message) {
      // Alternative format
      messageContent = payload.message?.conversation || 
                       payload.message?.text ||
                       null;
      phoneFrom = payload.key?.remoteJid?.replace('@s.whatsapp.net', '').replace('@c.us', '');
      isFromMe = payload.key?.fromMe || false;
      instanceName = payload.instance;
    }

    // Skip if message is from us or no content
    if (isFromMe || !messageContent || !phoneFrom) {
      console.log('[Evolution Webhook] Skipping - isFromMe:', isFromMe, 'hasContent:', !!messageContent, 'hasPhone:', !!phoneFrom);
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[Evolution Webhook] Processing message:', messageContent, 'from:', phoneFrom);

    // Find user settings by instance name
    const { data: settingsData, error: settingsError } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('api_type', 'evolution')
      .eq('instance_name', instanceName);

    if (settingsError || !settingsData || settingsData.length === 0) {
      console.log('[Evolution Webhook] No settings found for instance:', instanceName);
      
      // Log the webhook anyway
      await supabase.from('webhook_logs').insert({
        event_type: 'messages.upsert',
        phone_from: phoneFrom,
        message_content: messageContent,
        raw_payload: payload,
        processed: false,
      });

      return new Response(JSON.stringify({ success: true, message: 'No matching instance' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const settings = settingsData[0] as ZapSettings;
    const userId = settings.user_id;

    // Log the incoming webhook
    const { data: logData } = await supabase.from('webhook_logs').insert({
      user_id: userId,
      event_type: 'messages.upsert',
      phone_from: phoneFrom,
      message_content: messageContent,
      raw_payload: payload,
      processed: true,
    }).select().single();

    // Find matching auto-reply
    const { data: autoReplies, error: repliesError } = await supabase
      .from('auto_replies')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .order('priority', { ascending: false });

    if (repliesError || !autoReplies || autoReplies.length === 0) {
      console.log('[Evolution Webhook] No auto replies configured for user:', userId);
      return new Response(JSON.stringify({ success: true, message: 'No auto replies' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find first matching reply
    let matchingReply: AutoReply | null = null;
    for (const reply of autoReplies) {
      if (matchesKeyword(messageContent, reply.trigger_keyword, reply.match_type)) {
        matchingReply = reply;
        break;
      }
    }

    if (!matchingReply) {
      console.log('[Evolution Webhook] No matching keyword found');
      return new Response(JSON.stringify({ success: true, message: 'No keyword match' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[Evolution Webhook] Found matching reply:', matchingReply.trigger_keyword);

    // Send auto-reply
    const sent = await sendEvolutionMessage(
      settings.api_base_url,
      settings.zap_api_token,
      settings.instance_name,
      phoneFrom,
      matchingReply.reply_message
    );

    // Update log
    if (logData) {
      await supabase.from('webhook_logs').update({
        auto_reply_sent: sent,
      }).eq('id', logData.id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      auto_reply_sent: sent,
      matched_keyword: matchingReply.trigger_keyword,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Evolution Webhook] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
