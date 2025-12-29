import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ZapResponderSession {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface ZapResponderChat {
  id: string;
  contact_name: string;
  contact_phone: string;
  last_message: string;
  unread_count: number;
  updated_at: string;
}

// Fetch sessions/phones connected to Zap Responder
async function fetchSessions(apiBaseUrl: string, token: string): Promise<{ success: boolean; data?: ZapResponderSession[]; error?: string }> {
  try {
    console.log('Fetching Zap Responder sessions...');
    
    const response = await fetch(`${apiBaseUrl}/sessions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
    }

    const result = await response.json();
    console.log('Sessions fetched successfully:', result);
    
    // Normalize the response - adapt based on actual API response structure
    const sessions = Array.isArray(result) ? result : (result.data || result.sessions || []);
    
    return { 
      success: true, 
      data: sessions.map((s: any) => ({
        id: s.id || s.session_id,
        name: s.name || s.session_name || 'Sessão',
        phone: s.phone || s.phone_number || s.number || '',
        status: s.status || 'unknown',
      }))
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching sessions:', error);
    return { success: false, error: errorMessage };
  }
}

// Fetch chats from Zap Responder
async function fetchChats(apiBaseUrl: string, token: string, sessionId?: string): Promise<{ success: boolean; data?: ZapResponderChat[]; error?: string }> {
  try {
    console.log('Fetching Zap Responder chats...');
    
    const url = sessionId 
      ? `${apiBaseUrl}/chats?session_id=${sessionId}`
      : `${apiBaseUrl}/chats`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
    }

    const result = await response.json();
    console.log('Chats fetched successfully:', result);
    
    // Normalize the response
    const chats = Array.isArray(result) ? result : (result.data || result.chats || []);
    
    return { 
      success: true, 
      data: chats.map((c: any) => ({
        id: c.id || c.chat_id,
        contact_name: c.contact_name || c.name || c.pushname || 'Desconhecido',
        contact_phone: c.contact_phone || c.phone || c.number || '',
        last_message: c.last_message || c.lastMessage || '',
        unread_count: c.unread_count || c.unreadCount || 0,
        updated_at: c.updated_at || c.updatedAt || new Date().toISOString(),
      }))
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching chats:', error);
    return { success: false, error: errorMessage };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const zapToken = Deno.env.get('ZAP_RESPONDER_TOKEN');
    if (!zapToken) {
      console.error('ZAP_RESPONDER_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'ZAP_RESPONDER_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get settings
    const { data: settings } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .limit(1)
      .single();

    const apiBaseUrl = settings?.api_base_url || 'https://api.zapresponder.com.br/v1';

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'sessions';

    console.log(`Zap Responder action: ${action}`);

    switch (action) {
      case 'sessions': {
        const result = await fetchSessions(apiBaseUrl, zapToken);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'chats': {
        const sessionId = body.session_id || settings?.selected_session_id;
        const result = await fetchChats(apiBaseUrl, zapToken, sessionId);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'select-session': {
        const { session_id, session_name, session_phone } = body;
        
        if (!session_id) {
          return new Response(
            JSON.stringify({ error: 'session_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateError } = await supabase
          .from('zap_responder_settings')
          .update({
            selected_session_id: session_id,
            selected_session_name: session_name || null,
            selected_session_phone: session_phone || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settings?.id);

        if (updateError) {
          console.error('Error updating settings:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update settings', details: updateError }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Session selected successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-settings': {
        return new Response(
          JSON.stringify({ success: true, data: settings }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
