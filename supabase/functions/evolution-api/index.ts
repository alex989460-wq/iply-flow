import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EvolutionInstance {
  id: string;
  name: string;
  phone: string;
  status: string;
  profilePictureUrl?: string;
}

// ===========================================
// Evolution API v2 - Fetch instances
// ===========================================
async function fetchInstances(apiBaseUrl: string, apiKey: string): Promise<{ success: boolean; data?: EvolutionInstance[]; error?: string }> {
  try {
    console.log('Fetching Evolution API instances...');
    
    const response = await fetch(`${apiBaseUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('Instances fetched successfully:', result);
    
    const instances = Array.isArray(result) ? result : (result.data || result.instances || []);
    
    return { 
      success: true, 
      data: instances.map((i: any) => ({
        id: i.instance?.instanceId || i.instanceId || i.id || i.name,
        name: i.instance?.instanceName || i.instanceName || i.name || 'Instância',
        phone: i.instance?.owner || i.owner || i.number || '',
        status: i.instance?.status || i.status || 'unknown',
        profilePictureUrl: i.instance?.profilePictureUrl || i.profilePictureUrl || '',
      }))
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching instances:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Get instance connection state
// ===========================================
async function getConnectionState(apiBaseUrl: string, apiKey: string, instanceName: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`Getting connection state for instance: ${instanceName}`);
    
    const response = await fetch(`${apiBaseUrl}/instance/connectionState/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}` };
    }

    const result = await response.json();
    console.log('Connection state:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error getting connection state:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Get QR Code
// ===========================================
async function getQRCode(apiBaseUrl: string, apiKey: string, instanceName: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`Getting QR code for instance: ${instanceName}`);
    
    const response = await fetch(`${apiBaseUrl}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('QR code result:', result);
    
    // Evolution API returns base64 QR code or connection state
    return { 
      success: true, 
      data: {
        qrcode: result.base64 || result.qrcode?.base64 || result.code,
        pairingCode: result.pairingCode || result.code,
        state: result.instance?.state || result.state || 'connecting',
      }
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error getting QR code:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Create instance
// ===========================================
async function createInstance(apiBaseUrl: string, apiKey: string, instanceName: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`Creating instance: ${instanceName}`);
    
    const response = await fetch(`${apiBaseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceName: instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('Instance created:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating instance:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Logout instance
// ===========================================
async function logoutInstance(apiBaseUrl: string, apiKey: string, instanceName: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Logging out instance: ${instanceName}`);
    
    const response = await fetch(`${apiBaseUrl}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}` };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error logging out instance:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Delete instance
// ===========================================
async function deleteInstance(apiBaseUrl: string, apiKey: string, instanceName: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Deleting instance: ${instanceName}`);
    
    const response = await fetch(`${apiBaseUrl}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}` };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error deleting instance:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Send text message
// ===========================================
async function sendTextMessage(
  apiBaseUrl: string, 
  apiKey: string, 
  instanceName: string, 
  number: string, 
  text: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`Sending text message to ${number} via ${instanceName}`);
    
    // Format phone number (remove non-digits and add @s.whatsapp.net if needed)
    const formattedNumber = number.replace(/\D/g, '');
    
    const response = await fetch(`${apiBaseUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: formattedNumber,
        text: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('Message sent:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending message:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Fetch messages
// ===========================================
async function fetchMessages(
  apiBaseUrl: string, 
  apiKey: string, 
  instanceName: string, 
  remoteJid: string,
  limit: number = 50
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    console.log(`Fetching messages from ${remoteJid} via ${instanceName}`);
    
    const response = await fetch(`${apiBaseUrl}/chat/findMessages/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        where: {
          key: {
            remoteJid: remoteJid.includes('@') ? remoteJid : `${remoteJid}@s.whatsapp.net`,
          }
        },
        limit: limit,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}` };
    }

    const result = await response.json();
    console.log('Messages fetched:', result);
    
    const messages = Array.isArray(result) ? result : (result.messages || result.data || []);
    
    return { success: true, data: messages };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching messages:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Fetch chats
// ===========================================
async function fetchChats(
  apiBaseUrl: string, 
  apiKey: string, 
  instanceName: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    console.log(`Fetching chats for instance: ${instanceName}`);
    
    const response = await fetch(`${apiBaseUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}` };
    }

    const result = await response.json();
    console.log('Chats fetched:', result);
    
    const chats = Array.isArray(result) ? result : (result.chats || result.data || []);
    
    return { success: true, data: chats };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching chats:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Send media message
// ===========================================
async function sendMediaMessage(
  apiBaseUrl: string, 
  apiKey: string, 
  instanceName: string, 
  number: string, 
  mediaType: 'image' | 'audio' | 'video' | 'document',
  mediaUrl: string,
  caption?: string,
  fileName?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`Sending ${mediaType} to ${number} via ${instanceName}`);
    
    const formattedNumber = number.replace(/\D/g, '');
    
    const body: any = {
      number: formattedNumber,
      mediatype: mediaType,
      media: mediaUrl,
    };
    
    if (caption) body.caption = caption;
    if (fileName) body.fileName = fileName;
    
    const response = await fetch(`${apiBaseUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('Media sent:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending media:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Evolution API v2 - Check number on WhatsApp
// ===========================================
async function checkNumber(
  apiBaseUrl: string, 
  apiKey: string, 
  instanceName: string, 
  numbers: string[]
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    console.log(`Checking numbers on WhatsApp: ${numbers.join(', ')}`);
    
    const formattedNumbers = numbers.map(n => n.replace(/\D/g, ''));
    
    const response = await fetch(`${apiBaseUrl}/chat/whatsappNumbers/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        numbers: formattedNumbers,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}` };
    }

    const result = await response.json();
    console.log('Numbers checked:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error checking numbers:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Main handler
// ===========================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action, userId } = body;
    const targetUserId = userId || user.id;

    console.log(`Evolution API action: ${action}, userId: ${targetUserId}`);

    // Load user settings
    const { data: userSettings, error: settingsError } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (settingsError) {
      console.error('Error loading user settings:', settingsError);
    }

    const apiBaseUrl = userSettings?.api_base_url || body.apiBaseUrl;
    const apiKey = userSettings?.zap_api_token || body.apiKey;
    const instanceName = body.instanceName || userSettings?.instance_name;

    if (!apiBaseUrl || !apiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Configurações da Evolution API não encontradas. Configure na página de Configurações.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: any;

    switch (action) {
      case 'fetch-instances':
        result = await fetchInstances(apiBaseUrl, apiKey);
        break;

      case 'connection-state':
        if (!instanceName) {
          return new Response(
            JSON.stringify({ success: false, error: 'Nome da instância é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await getConnectionState(apiBaseUrl, apiKey, instanceName);
        break;

      case 'get-qrcode':
        if (!instanceName) {
          return new Response(
            JSON.stringify({ success: false, error: 'Nome da instância é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await getQRCode(apiBaseUrl, apiKey, instanceName);
        break;

      case 'create-instance':
        const newInstanceName = body.newInstanceName || body.instanceName;
        if (!newInstanceName) {
          return new Response(
            JSON.stringify({ success: false, error: 'Nome da nova instância é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await createInstance(apiBaseUrl, apiKey, newInstanceName);
        break;

      case 'logout-instance':
        if (!instanceName) {
          return new Response(
            JSON.stringify({ success: false, error: 'Nome da instância é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await logoutInstance(apiBaseUrl, apiKey, instanceName);
        break;

      case 'delete-instance':
        if (!instanceName) {
          return new Response(
            JSON.stringify({ success: false, error: 'Nome da instância é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await deleteInstance(apiBaseUrl, apiKey, instanceName);
        break;

      case 'send-text':
        const { number, text } = body;
        if (!instanceName || !number || !text) {
          return new Response(
            JSON.stringify({ success: false, error: 'instanceName, number e text são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await sendTextMessage(apiBaseUrl, apiKey, instanceName, number, text);
        break;

      case 'send-media':
        const { number: mediaNumber, mediaType, mediaUrl, caption, fileName } = body;
        if (!instanceName || !mediaNumber || !mediaType || !mediaUrl) {
          return new Response(
            JSON.stringify({ success: false, error: 'instanceName, number, mediaType e mediaUrl são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await sendMediaMessage(apiBaseUrl, apiKey, instanceName, mediaNumber, mediaType, mediaUrl, caption, fileName);
        break;

      case 'fetch-messages':
        const { remoteJid, limit } = body;
        if (!instanceName || !remoteJid) {
          return new Response(
            JSON.stringify({ success: false, error: 'instanceName e remoteJid são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await fetchMessages(apiBaseUrl, apiKey, instanceName, remoteJid, limit || 50);
        break;

      case 'fetch-chats':
        if (!instanceName) {
          return new Response(
            JSON.stringify({ success: false, error: 'Nome da instância é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await fetchChats(apiBaseUrl, apiKey, instanceName);
        break;

      case 'check-numbers':
        const { numbers } = body;
        if (!instanceName || !numbers || !Array.isArray(numbers)) {
          return new Response(
            JSON.stringify({ success: false, error: 'instanceName e numbers (array) são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await checkNumber(apiBaseUrl, apiKey, instanceName, numbers);
        break;

      case 'select-instance':
        // Save selected instance to user settings
        const { instanceId, instancePhone } = body;
        const { error: updateError } = await supabase
          .from('zap_responder_settings')
          .upsert({
            user_id: targetUserId,
            instance_name: instanceName,
            selected_session_id: instanceId,
            selected_session_phone: instancePhone,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (updateError) {
          console.error('Error updating settings:', updateError);
          result = { success: false, error: 'Erro ao salvar instância' };
        } else {
          result = { success: true };
        }
        break;

      case 'get-settings':
        result = { 
          success: true, 
          data: {
            apiBaseUrl: userSettings?.api_base_url,
            instanceName: userSettings?.instance_name,
            selectedSessionId: userSettings?.selected_session_id,
            selectedSessionPhone: userSettings?.selected_session_phone,
            apiType: userSettings?.api_type || 'zap_responder',
          }
        };
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Evolution API error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
