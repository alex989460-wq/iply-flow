import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify Token - usado na verificação do webhook do Facebook
const VERIFY_TOKEN = 'supergestor_webhook_2024';

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
  meta_access_token?: string;
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

async function sendMetaMessage(
  accessToken: string,
  phoneNumberId: string,
  recipientPhone: string,
  message: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Meta Webhook] Error sending message:', errorText);
      return false;
    }

    console.log('[Meta Webhook] Message sent successfully to:', recipientPhone);
    return true;
  } catch (error) {
    console.error('[Meta Webhook] Error sending message:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================
  // VERIFICAÇÃO DO WEBHOOK (GET request)
  // Facebook envia um GET para verificar o webhook
  // ========================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[Meta Webhook] Verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[Meta Webhook] Webhook verified successfully!');
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      console.log('[Meta Webhook] Verification failed - token mismatch');
      return new Response('Forbidden', { status: 403 });
    }
  }

  // ========================================
  // RECEBER MENSAGENS (POST request)
  // ========================================
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log('[Meta Webhook] Received payload:', JSON.stringify(payload, null, 2));

    // Estrutura do payload do WhatsApp Cloud API
    // {
    //   "object": "whatsapp_business_account",
    //   "entry": [{
    //     "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    //     "changes": [{
    //       "value": {
    //         "messaging_product": "whatsapp",
    //         "metadata": { "phone_number_id": "...", "display_phone_number": "..." },
    //         "messages": [{ "from": "...", "text": { "body": "..." } }]
    //       }
    //     }]
    //   }]
    // }

    if (payload.object !== 'whatsapp_business_account') {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Processar cada entrada
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        
        if (!value || value.messaging_product !== 'whatsapp') continue;

        const metadata = value.metadata;
        const phoneNumberId = metadata?.phone_number_id;
        const displayPhoneNumber = metadata?.display_phone_number;

        // Processar mensagens recebidas
        for (const message of value.messages || []) {
          // Ignorar status updates
          if (!message.text?.body) continue;

          const messageContent = message.text.body;
          const phoneFrom = message.from;
          const messageId = message.id;

          console.log('[Meta Webhook] Processing message:', messageContent, 'from:', phoneFrom);

          // Buscar configurações do usuário pelo phone_number_id ou display_phone_number
          const { data: settingsData } = await supabase
            .from('zap_responder_settings')
            .select('*')
            .eq('api_type', 'meta_cloud')
            .or(`instance_name.eq.${phoneNumberId},selected_session_phone.eq.${displayPhoneNumber}`);

          if (!settingsData || settingsData.length === 0) {
            console.log('[Meta Webhook] No settings found for phone:', displayPhoneNumber);
            
            // Log anyway
            await supabase.from('webhook_logs').insert({
              event_type: 'meta.messages',
              phone_from: phoneFrom,
              phone_to: displayPhoneNumber,
              message_content: messageContent,
              raw_payload: payload,
              processed: false,
            });
            continue;
          }

          const settings = settingsData[0] as ZapSettings;
          const userId = settings.user_id;

          // Log da mensagem
          const { data: logData } = await supabase.from('webhook_logs').insert({
            user_id: userId,
            event_type: 'meta.messages',
            phone_from: phoneFrom,
            phone_to: displayPhoneNumber,
            message_content: messageContent,
            raw_payload: payload,
            processed: true,
          }).select().single();

          // Buscar auto-replies
          const { data: autoReplies } = await supabase
            .from('auto_replies')
            .select('*')
            .eq('user_id', userId)
            .eq('is_enabled', true)
            .order('priority', { ascending: false });

          if (!autoReplies || autoReplies.length === 0) {
            console.log('[Meta Webhook] No auto replies for user:', userId);
            continue;
          }

          // Encontrar resposta correspondente
          let matchingReply: AutoReply | null = null;
          for (const reply of autoReplies) {
            if (matchesKeyword(messageContent, reply.trigger_keyword, reply.match_type)) {
              matchingReply = reply;
              break;
            }
          }

          if (!matchingReply) {
            console.log('[Meta Webhook] No matching keyword');
            continue;
          }

          console.log('[Meta Webhook] Found matching reply:', matchingReply.trigger_keyword);

          // Usar o token Meta salvo no banco, não o zap_api_token
          const accessToken = settings.meta_access_token || settings.zap_api_token;
          
          // Enviar resposta via Meta Cloud API
          const sent = await sendMetaMessage(
            accessToken,
            phoneNumberId,
            phoneFrom,
            matchingReply.reply_message
          );

          // Atualizar log
          if (logData) {
            await supabase.from('webhook_logs').update({
              auto_reply_sent: sent,
            }).eq('id', logData.id);
          }
        }
      }
    }

    // Facebook espera 200 OK rápido
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Meta Webhook] Error:', error);
    // Ainda retorna 200 para não causar retry do Facebook
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
