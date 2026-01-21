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

interface Department {
  id: string;
  name: string;
  phone?: string;
}

function normalizePhoneDigitsFromChatId(chatId: string): string {
  const raw = (chatId || '').split('@')[0];
  return raw.replace(/\D/g, '');
}

function extractConversationPayload(payload: any): any | null {
  if (!payload) return null;
  if (payload.conversation) return payload.conversation;
  if (payload.data?.conversation) return payload.data.conversation;
  return payload;
}

async function resolveConversationContext(
  apiBaseUrl: string,
  token: string,
  chatId: string
): Promise<{ departmentId?: string; isOfficial?: boolean; origin?: string; conversation?: any }> {
  const phoneDigits = normalizePhoneDigitsFromChatId(chatId);
  if (!phoneDigits) return {};

  const convRes = await buscarConversaPorTelefone(apiBaseUrl, token, phoneDigits, true);
  if (!convRes.success) {
    return {};
  }

  const conversation = extractConversationPayload(convRes.data);
  const departmentId =
    conversation?.departamento_responsavel_atendimento ||
    conversation?.departamento ||
    conversation?.departmentId ||
    conversation?.department_id;

  const origin = conversation?.origem || conversation?.origin;
  const isOfficial =
    origin === 'whatsapp-oficial' ||
    origin === 'whatsapp_official' ||
    Boolean(conversation?.last_created_conversa_whatsapp_oficial) ||
    Boolean(conversation?.lid);

  return { departmentId, isOfficial, origin, conversation };
}

// ===========================================
// API Functions - Lista atendentes
// ===========================================
async function fetchAtendentes(apiBaseUrl: string, token: string): Promise<{ success: boolean; data?: ZapResponderSession[]; error?: string }> {
  try {
    console.log('Fetching Zap Responder atendentes...');
    
    const response = await fetch(`${apiBaseUrl}/atendentes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao conectar com o serviço' };
    }

    const result = await response.json();
    console.log('Atendentes fetched successfully:', result);
    
    const sessions = Array.isArray(result) ? result : (result.data || result.atendentes || []);
    
    return { 
      success: true, 
      data: sessions.map((s: any) => ({
        id: s.id || s._id,
        name: s.name || s.nome || 'Atendente',
        phone: s.phone || s.telefone || s.numero || '',
        status: s.status || 'active',
      }))
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching atendentes:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Lista instâncias/sessões de WhatsApp
// ===========================================
async function fetchInstancias(apiBaseUrl: string, token: string): Promise<{ success: boolean; data?: ZapResponderSession[]; error?: string }> {
  try {
    console.log('Fetching Zap Responder instâncias/sessões WhatsApp...');
    
    const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
    const baseCandidates = Array.from(
      new Set([
        normalizedBase,
        normalizedBase.replace(/\/api$/, ''),
      ].filter(Boolean))
    );

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Endpoints comuns para listar instâncias/sessões de WhatsApp
    const attempts = baseCandidates.flatMap((base) => [
      { label: `instancias [${base}]`, url: `${base}/instancias` },
      { label: `instances [${base}]`, url: `${base}/instances` },
      { label: `sessoes [${base}]`, url: `${base}/sessoes` },
      { label: `sessions/list [${base}]`, url: `${base}/sessions` },
      { label: `whatsapp/sessions [${base}]`, url: `${base}/whatsapp/sessions` },
      { label: `whatsapp/instancias [${base}]`, url: `${base}/whatsapp/instancias` },
      { label: `v2/sessions [${base}]`, url: `${base}/v2/sessions` },
      { label: `v2/instances [${base}]`, url: `${base}/v2/instances` },
      { label: `session/all [${base}]`, url: `${base}/session/all` },
      { label: `session/list [${base}]`, url: `${base}/session/list` },
    ]);

    for (const attempt of attempts) {
      console.log('Trying instances endpoint:', attempt.label);
      
      try {
        const res = await fetch(attempt.url, { method: 'GET', headers });
        
        if (!res.ok) {
          console.log(`Endpoint ${attempt.label} failed: ${res.status}`);
          continue;
        }

        const raw = await res.text();
        let parsed: any;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          console.log(`Endpoint ${attempt.label} returned invalid JSON`);
          continue;
        }

        const instances = Array.isArray(parsed) ? parsed : 
                         (parsed.data || parsed.instances || parsed.instancias || 
                          parsed.sessions || parsed.sessoes || []);

        if (instances.length > 0) {
          console.log('Instâncias fetched successfully:', instances);
          return { 
            success: true, 
            data: instances.map((s: any) => ({
              id: s.id || s._id || s.sessionId || s.session_id,
              name: s.name || s.nome || s.instanceName || s.instance_name || 'Instância',
              phone: s.phone || s.telefone || s.numero || s.number || s.jid?.split('@')[0] || '',
              status: s.status || (s.connected ? 'connected' : 'disconnected'),
            }))
          };
        }
        
      } catch (fetchError) {
        console.error(`Fetch error (${attempt.label}):`, fetchError);
        continue;
      }
    }

    console.log('No instances endpoint found, returning empty list');
    return { success: true, data: [] };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching instâncias:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Listar departamentos
// ===========================================
async function fetchDepartamentos(apiBaseUrl: string, token: string): Promise<{ success: boolean; data?: Department[]; error?: string }> {
  try {
    console.log('Fetching Zap Responder departamentos...');
    
    const response = await fetch(`${apiBaseUrl}/departamento/all`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao conectar com o serviço' };
    }

    const result = await response.json();
    console.log('Departamentos fetched successfully:', result);
    
    const departments = Array.isArray(result) ? result : (result.data || result.departamentos || []);
    
    return { 
      success: true, 
      data: departments.map((d: any) => ({
        id: d.id || d._id,
        name: d.name || d.nome || 'Departamento',
        phone: d.phone || d.telefone || d.numero || '',
      }))
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching departamentos:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Buscar departamento por ID
// ===========================================
async function fetchDepartamento(apiBaseUrl: string, token: string, departmentId: string): Promise<{ success: boolean; data?: Department; error?: string }> {
  try {
    console.log(`Fetching departamento ${departmentId}...`);
    
    const response = await fetch(`${apiBaseUrl}/departamento/${departmentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao conectar com o serviço' };
    }

    const result = await response.json();
    console.log('Departamento fetched successfully:', result);
    
    return { 
      success: true, 
      data: {
        id: result.id || result._id,
        name: result.name || result.nome || 'Departamento',
        phone: result.phone || result.telefone || result.numero || '',
      }
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching departamento:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Criar conversa
// ===========================================
async function criarConversa(
  apiBaseUrl: string, 
  token: string, 
  attendantId: string,
  chatId: string,
  departmentId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('Creating conversa...', { attendantId, chatId, departmentId });
    
    const response = await fetch(`${apiBaseUrl}/conversa`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        attendantId,
        chatId,
        departmentId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao criar conversa' };
    }

    const result = await response.json();
    console.log('Conversa created successfully:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating conversa:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Encerrar conversa
// ===========================================
async function encerrarConversa(
  apiBaseUrl: string, 
  token: string, 
  chatId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('Ending conversa...', { chatId });
    
    const response = await fetch(`${apiBaseUrl}/conversa/encerrar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        chatId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao encerrar conversa' };
    }

    const result = await response.json();
    console.log('Conversa ended successfully:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error ending conversa:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Iniciar bot
// ===========================================
async function iniciarBot(
  apiBaseUrl: string, 
  token: string, 
  chatId: string,
  departamento: string,
  aplicacao: string = 'whatsapp',
  mensagemInicial?: string,
  variaveis?: Record<string, string | number>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const phoneDigits = (chatId || '').split('@')[0].replace(/\D/g, '');
    const candidates = aplicacao === 'whatsapp'
      ? [
          `${phoneDigits}@c.us`,
          `${phoneDigits}@s.whatsapp.net`,
          phoneDigits,
        ]
      : [chatId];

    console.log('Starting bot...', { chatId, departamento, aplicacao, mensagemInicial, candidates });

    let lastStatus: number | null = null;
    let lastBody: string | null = null;

    for (const candidateChatId of candidates) {
      const body: any = {
        chatId: candidateChatId,
        departamento,
        aplicacao,
      };

      if (mensagemInicial) body.mensagemInicial = mensagemInicial;
      if (variaveis) body.variaveis = variaveis;

      console.log('iniciarBot request body:', JSON.stringify(body));

      const response = await fetch(`${apiBaseUrl}/conversa/iniciarBot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      lastStatus = response.status;
      lastBody = responseText;
      console.log('iniciarBot response status:', response.status, 'body:', responseText || '(empty)');

      if (!response.ok) {
        console.error(`Zap Responder API error: ${response.status} - ${responseText}`);
        continue;
      }

      // Se a API retornou alguma coisa, tentamos parsear; senão assumimos OK.
      if (responseText && responseText.trim() !== '') {
        try {
          const result = JSON.parse(responseText);
          console.log('Bot started successfully:', result);
          return { success: true, data: result };
        } catch {
          console.log('Bot started successfully (non-JSON response):', responseText);
          return { success: true, data: { message: responseText } };
        }
      }

      // Resposta vazia: confirmamos se a conversa existe; se não existir, tentamos o próximo formato.
      if (aplicacao === 'whatsapp' && phoneDigits) {
        const check = await buscarConversaPorTelefone(apiBaseUrl, token, phoneDigits, true);
        if (check.success) {
          console.log('Bot started successfully (empty response body, conversation found)');
          return { success: true, data: { message: 'Bot iniciado com sucesso' } };
        }
        console.log('Bot start returned empty body but conversation not found; trying next chatId format', {
          candidateChatId,
          phoneDigits,
          checkError: check.error,
        });
        continue;
      }

      console.log('Bot started successfully (empty response body)');
      return { success: true, data: { message: 'Bot iniciado com sucesso' } };
    }

    return {
      success: false,
      error: lastStatus ? `Falha ao iniciar bot (status ${lastStatus}).` : 'Falha ao iniciar bot.',
      data: lastBody ? { body: lastBody } : undefined,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error starting bot:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Buscar conversa por telefone
// ===========================================
async function buscarConversaPorTelefone(
  apiBaseUrl: string, 
  token: string, 
  phone: string,
  includeClosed: boolean = false
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('Searching conversa by phone...', { phone });
    
    const url = `${apiBaseUrl}/v2/conversations/chatId/${phone}${includeClosed ? '?includeClosed=true' : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao buscar conversa' };
    }

    const result = await response.json();
    console.log('Conversa found:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error searching conversa:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Buscar conversa por ID
// ===========================================
async function buscarConversaPorId(
  apiBaseUrl: string, 
  token: string, 
  conversationId: string,
  includeClosed: boolean = false
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('Searching conversa by ID...', { conversationId });
    
    const url = `${apiBaseUrl}/v2/conversations/${conversationId}${includeClosed ? '?includeClosed=true' : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao buscar conversa' };
    }

    const result = await response.json();
    console.log('Conversa found by ID:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error searching conversa by ID:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Enviar template WhatsApp Oficial
// ===========================================
async function enviarTemplateWhatsApp(
  apiBaseUrl: string, 
  token: string, 
  departmentId: string,
  templateName: string,
  number: string,
  language: string = 'pt_BR',
  variables?: Record<string, string>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('Sending WhatsApp template...', { departmentId, templateName, number });
    
    const body: any = {
      type: 'template',
      template_name: templateName,
      number,
      language,
    };
    
    if (variables) {
      body.variables = variables;
    }
    
    const response = await fetch(`${apiBaseUrl}/whatsapp/message/${departmentId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao enviar template' };
    }

    const result = await response.json();
    console.log('Template sent successfully:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending template:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Criar nova mensagem interna (Agente IA)
// ===========================================
async function criarMensagemInterna(
  apiBaseUrl: string, 
  token: string, 
  chatId: string,
  content: { type: string; text?: string; url?: string },
  generateAssistantResponse: boolean = true,
  conversationId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('Creating internal message...', { chatId, content });
    
    const body: any = {
      chatId,
      content,
      generateAssistantResponse,
    };
    
    if (conversationId) {
      body.conversationId = conversationId;
    }
    
    const response = await fetch(`${apiBaseUrl}/v2/assistants/internal_message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao criar mensagem' };
    }

    const result = await response.json();
    console.log('Internal message created successfully:', result);
    
    return { success: true, data: result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating internal message:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Buscar templates WhatsApp
// ===========================================
async function buscarTemplates(
  apiBaseUrl: string, 
  token: string, 
  departmentId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    console.log('Fetching WhatsApp templates...', { departmentId });
    
    const response = await fetch(`${apiBaseUrl}/whatsapp/templates/${departmentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao buscar templates' };
    }

    const result = await response.json();
    console.log('Templates fetched successfully:', result);
    
    const templates = Array.isArray(result) ? result : (result.data || result.templates || []);
    
    return { success: true, data: templates };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching templates:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Buscar QR Code para conectar sessão WhatsApp
// ===========================================
async function buscarQRCode(
  apiBaseUrl: string,
  token: string,
  sessionId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('Fetching QR Code...', { sessionId, apiBaseUrl });

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
    const baseCandidates = Array.from(
      new Set(
        [
          normalizedBase,
          normalizedBase.replace(/\/api$/, ''),
          normalizedBase.replace(/\/v1$/, ''),
        ].filter(Boolean)
      )
    );

    // Endpoints comuns para QR Code em diferentes APIs de WhatsApp
    const attempts = baseCandidates.flatMap((base) => [
      // Zap Responder specific endpoints
      { label: `qrcode [${base}]`, url: `${base}/qrcode${sessionId ? `/${sessionId}` : ''}` },
      { label: `qr [${base}]`, url: `${base}/qr${sessionId ? `/${sessionId}` : ''}` },
      { label: `session/qrcode [${base}]`, url: `${base}/session/qrcode${sessionId ? `/${sessionId}` : ''}` },
      { label: `session/qr [${base}]`, url: `${base}/session/qr${sessionId ? `/${sessionId}` : ''}` },
      { label: `whatsapp/qrcode [${base}]`, url: `${base}/whatsapp/qrcode${sessionId ? `/${sessionId}` : ''}` },
      { label: `whatsapp/qr [${base}]`, url: `${base}/whatsapp/qr${sessionId ? `/${sessionId}` : ''}` },
      { label: `start-session [${base}]`, url: `${base}/start-session${sessionId ? `/${sessionId}` : ''}` },
      { label: `connect [${base}]`, url: `${base}/connect${sessionId ? `/${sessionId}` : ''}` },
      // v2 endpoints
      { label: `v2/session/qrcode [${base}]`, url: `${base}/v2/session/qrcode${sessionId ? `?sessionId=${sessionId}` : ''}` },
      { label: `v2/whatsapp/qrcode [${base}]`, url: `${base}/v2/whatsapp/qrcode${sessionId ? `?sessionId=${sessionId}` : ''}` },
    ]);

    let lastError: string | null = null;

    for (const attempt of attempts) {
      console.log('Trying QR endpoint...', attempt);
      
      try {
        const res = await fetch(attempt.url, { method: 'GET', headers });
        const contentType = res.headers.get('content-type') || '';
        
        // Se for imagem, retornar base64
        if (contentType.includes('image')) {
          const arrayBuffer = await res.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          const mimeType = contentType.split(';')[0];
          return { 
            success: true, 
            data: { 
              qrCode: `data:${mimeType};base64,${base64}`,
              status: 'NEED_SCAN'
            } 
          };
        }

        const raw = await res.text();

        if (!res.ok) {
          console.error(`QR API error (${attempt.label}): ${res.status} - ${raw}`);
          lastError = `${attempt.label}: ${res.status} - ${raw}`;
          continue;
        }

        let parsed: any;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          lastError = `${attempt.label}: invalid JSON response`;
          continue;
        }

        // Procurar o QR code na resposta
        const qrCode = parsed?.qrCode || parsed?.qr || parsed?.qr_code || 
                       parsed?.data?.qrCode || parsed?.data?.qr || parsed?.data?.qr_code ||
                       parsed?.qrcode || parsed?.QRCode || parsed?.base64 ||
                       parsed?.data?.base64 || parsed?.image || parsed?.data?.image;
        
        const status = parsed?.status || parsed?.data?.status || 'unknown';

        if (qrCode) {
          console.log('QR Code fetched successfully:', { label: attempt.label, status });
          return { 
            success: true, 
            data: { 
              qrCode: qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`,
              status 
            } 
          };
        }

        // Pode ser que a sessão já esteja conectada
        if (status === 'CONNECTED' || status === 'connected' || status === 'ready' || parsed?.connected === true) {
          console.log('Session already connected:', { label: attempt.label, status });
          return { 
            success: true, 
            data: { 
              connected: true,
              status: 'CONNECTED',
              message: 'Sessão já está conectada'
            } 
          };
        }

        console.log('No QR code in response; trying next endpoint', { label: attempt.label });
        lastError = `${attempt.label}: response OK but no QR code found`;
        
      } catch (fetchError) {
        console.error(`Fetch error (${attempt.label}):`, fetchError);
        lastError = `${attempt.label}: fetch error`;
        continue;
      }
    }

    return {
      success: false,
      error: lastError ? `Não foi possível obter o QR Code. ${lastError}` : 'Não foi possível obter o QR Code.',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching QR code:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Verificar status da sessão WhatsApp
// ===========================================
async function verificarStatusSessao(
  apiBaseUrl: string,
  token: string,
  sessionId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('Checking session status...', { sessionId, apiBaseUrl });

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
    const baseCandidates = Array.from(
      new Set([
        normalizedBase,
        normalizedBase.replace(/\/api$/, ''),
      ].filter(Boolean))
    );

    const attempts = baseCandidates.flatMap((base) => [
      { label: `status [${base}]`, url: `${base}/status${sessionId ? `/${sessionId}` : ''}` },
      { label: `session/status [${base}]`, url: `${base}/session/status${sessionId ? `/${sessionId}` : ''}` },
      { label: `whatsapp/status [${base}]`, url: `${base}/whatsapp/status${sessionId ? `/${sessionId}` : ''}` },
      { label: `v2/session/status [${base}]`, url: `${base}/v2/session/status${sessionId ? `?sessionId=${sessionId}` : ''}` },
      { label: `me [${base}]`, url: `${base}/me${sessionId ? `?sessionId=${sessionId}` : ''}` },
    ]);

    for (const attempt of attempts) {
      console.log('Trying status endpoint...', attempt);
      
      try {
        const res = await fetch(attempt.url, { method: 'GET', headers });
        
        if (!res.ok) continue;

        const parsed = await res.json();
        
        const connected = parsed?.connected || parsed?.status === 'CONNECTED' || 
                         parsed?.status === 'connected' || parsed?.status === 'ready' ||
                         parsed?.data?.connected || parsed?.data?.status === 'CONNECTED';

        return { 
          success: true, 
          data: { 
            connected,
            status: parsed?.status || parsed?.data?.status || (connected ? 'CONNECTED' : 'DISCONNECTED'),
            phone: parsed?.phone || parsed?.data?.phone || parsed?.me?.phone,
            name: parsed?.name || parsed?.data?.name || parsed?.me?.pushName,
          } 
        };
        
      } catch {
        continue;
      }
    }

    return { success: false, error: 'Não foi possível verificar o status da sessão.' };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error checking session status:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Listar todas conversas
// ===========================================
async function listarConversas(
  apiBaseUrl: string,
  token: string,
  status?: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    console.log('=== FETCHING ALL CONVERSATIONS ===');
    console.log('Params:', { status, limit, offset, apiBaseUrl });

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
    const baseCandidates = Array.from(
      new Set(
        [
          normalizedBase,
          normalizedBase.replace(/\/api$/, ''),
          normalizedBase.replace(/\/v1$/, ''),
        ].filter(Boolean)
      )
    );

    const attempts = baseCandidates.flatMap((base) => {
      const qsBase = `limit=${limit}&offset=${offset}`;
      const statusQs = status && status !== 'all' ? `&status=${encodeURIComponent(status)}` : '';

      return [
        // Primary v2 endpoints
        {
          label: `v2 conversations open [${base}]`,
          url: `${base}/v2/conversations?${qsBase}&includeClosed=false`,
        },
        {
          label: `v2 conversations (base) [${base}]`,
          url: `${base}/v2/conversations?${qsBase}${statusQs}`,
        },
        {
          label: `v2 conversations (includeClosed) [${base}]`,
          url: `${base}/v2/conversations?${qsBase}${statusQs}&includeClosed=true`,
        },
        // Atendimento endpoints (common in Zap Responder)
        {
          label: `atendimentos [${base}]`,
          url: `${base}/atendimento?${qsBase}`,
        },
        {
          label: `atendimentos all [${base}]`,
          url: `${base}/atendimento/all?${qsBase}`,
        },
        {
          label: `atendimentos list [${base}]`,
          url: `${base}/atendimentos?${qsBase}`,
        },
        // Fila endpoints (queue)
        {
          label: `fila [${base}]`,
          url: `${base}/fila?${qsBase}`,
        },
        {
          label: `fila atendimento [${base}]`,
          url: `${base}/fila/atendimento?${qsBase}`,
        },
        // Legacy conversa endpoints
        {
          label: `legacy conversa [${base}]`,
          url: `${base}/conversa?${qsBase}${statusQs}`,
        },
        {
          label: `legacy conversas [${base}]`,
          url: `${base}/conversas?${qsBase}${statusQs}`,
        },
        {
          label: `conversa all [${base}]`,
          url: `${base}/conversa/all?${qsBase}`,
        },
        // Chat endpoints
        {
          label: `chats [${base}]`,
          url: `${base}/chats?${qsBase}`,
        },
        {
          label: `chat list [${base}]`,
          url: `${base}/chat?${qsBase}`,
        },
      ];
    });

    let lastError: string | null = null;

    for (const attempt of attempts) {
      console.log('Trying conversations endpoint:', attempt.label);
      
      try {
        const res = await fetch(attempt.url, { method: 'GET', headers });
        const raw = await res.text();

        if (!res.ok) {
          console.log(`Endpoint ${attempt.label} failed: ${res.status}`);
          lastError = `${attempt.label}: ${res.status}`;
          continue;
        }

        let parsed: any;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          console.log(`Endpoint ${attempt.label} returned invalid JSON`);
          lastError = `${attempt.label}: invalid JSON response`;
          continue;
        }

        const candidates = [
          parsed,
          parsed?.data,
          parsed?.conversations,
          parsed?.conversas,
          parsed?.items,
          parsed?.atendimentos,
          parsed?.fila,
          parsed?.chats,
          parsed?.data?.conversations,
          parsed?.data?.conversas,
          parsed?.data?.items,
          parsed?.data?.atendimentos,
        ];

        const conversations = candidates.find((c) => Array.isArray(c)) as any[] | undefined;

        if (!conversations) {
          console.log(`Endpoint ${attempt.label} returned no array. Keys:`, 
            parsed && typeof parsed === 'object' ? Object.keys(parsed) : typeof parsed
          );
          lastError = `${attempt.label}: response OK but no conversations array`;
          continue;
        }

        console.log('SUCCESS! Conversations fetched from:', attempt.label, 'Count:', conversations.length);
        return { success: true, data: conversations };
      } catch (fetchErr) {
        console.error(`Fetch error for ${attempt.label}:`, fetchErr);
        lastError = `${attempt.label}: fetch error`;
        continue;
      }
    }

    console.error('All conversation endpoints failed. Last error:', lastError);
    return {
      success: false,
      error: lastError ? `Não foi possível listar conversas. ${lastError}` : 'Não foi possível listar conversas.',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching conversations:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Buscar mensagens da conversa
// ===========================================
async function buscarMensagens(
  apiBaseUrl: string,
  token: string,
  conversationId: string,
  limit: number = 100,
  chatId?: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    console.log('Fetching messages...', { conversationId, chatId, limit, apiBaseUrl });

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
    const baseCandidates = Array.from(
      new Set(
        [
          normalizedBase,
          // Alguns clientes salvam com /api; tentamos também sem esse sufixo
          normalizedBase.replace(/\/api$/, ''),
          // Alguns ambientes usam /v1
          normalizedBase.replace(/\/v1$/, ''),
        ].filter(Boolean)
      )
    );

    const attempts: Array<{ label: string; url: string; method: 'GET' | 'POST'; body?: unknown }> = baseCandidates.flatMap(
      (base) => {
        const v2ConversationByIdWithLimit = `${base}/v2/conversations/${conversationId}?limit=${limit}`;
        const v2ConversationByIdWithOffset = `${base}/v2/conversations/${conversationId}?offset=0&limit=${limit}`;

        return [
          // Muitas vezes o endpoint de conversa já retorna as mensagens quando passamos limit/offset
          ...(chatId
            ? [
                {
                  label: `v2 conversation chatId (limit) [${base}]`,
                  url: `${base}/v2/conversations/chatId/${chatId}?limit=${limit}`,
                  method: 'GET' as const,
                },
                {
                  label: `v2 conversation chatId (offset) [${base}]`,
                  url: `${base}/v2/conversations/chatId/${chatId}?offset=0&limit=${limit}`,
                  method: 'GET' as const,
                },
              ]
            : []),

          {
            label: `v2 conversation by id (limit) [${base}]`,
            url: v2ConversationByIdWithLimit,
            method: 'GET',
          },
          {
            label: `v2 conversation by id (offset) [${base}]`,
            url: v2ConversationByIdWithOffset,
            method: 'GET',
          },

          // Endpoints dedicados a mensagens (nem todas contas/versões têm)
          ...(chatId
            ? [
                {
                  label: `v2 conversations chatId messages [${base}]`,
                  url: `${base}/v2/conversations/chatId/${chatId}/messages?limit=${limit}`,
                  method: 'GET' as const,
                },
                {
                  label: `v2 conversations chatId messages (offset) [${base}]`,
                  url: `${base}/v2/conversations/chatId/${chatId}/messages?offset=0&limit=${limit}`,
                  method: 'GET' as const,
                },
              ]
            : []),
          {
            label: `v2 conversations messages (limit) [${base}]`,
            url: `${base}/v2/conversations/${conversationId}/messages?limit=${limit}`,
            method: 'GET',
          },
          {
            label: `v2 conversations messages (offset) [${base}]`,
            url: `${base}/v2/conversations/${conversationId}/messages?offset=0&limit=${limit}`,
            method: 'GET',
          },
          {
            label: `v2 messages conversation [${base}]`,
            url: `${base}/v2/messages/conversation/${conversationId}?limit=${limit}`,
            method: 'GET',
          },

          // legacy / fallback endpoints
          // IMPORTANT: alguns endpoints antigos usam chatId (telefone) e não o Mongo _id
          {
            label: `conversa/mensagens GET [${base}]`,
            url: `${base}/conversa/mensagens/${chatId || conversationId}?limit=${limit}`,
            method: 'GET',
          },
          {
            label: `conversa/mensagens POST [${base}]`,
            url: `${base}/conversa/mensagens/${chatId || conversationId}`,
            method: 'POST',
            body: { limit },
          },
          {
            label: `mensagem/conversa GET [${base}]`,
            url: `${base}/mensagem/conversa/${chatId || conversationId}?limit=${limit}`,
            method: 'GET',
          },
          {
            label: `mensagem/conversa POST [${base}]`,
            url: `${base}/mensagem/conversa/${chatId || conversationId}`,
            method: 'POST',
            body: { limit },
          },
        ];
      }
    );

    let lastError: string | null = null;

    for (const attempt of attempts) {
      console.log('Trying messages endpoint...', { label: attempt.label, url: attempt.url, method: attempt.method });

      const res = await fetch(attempt.url, {
        method: attempt.method,
        headers,
        ...(attempt.body ? { body: JSON.stringify(attempt.body) } : {}),
      });

      const raw = await res.text();

      if (!res.ok) {
        console.error(`Zap Responder API error (${attempt.label}): ${res.status} - ${raw}`);
        lastError = `${attempt.label}: ${res.status} - ${raw}`;
        continue;
      }

      let parsed: any;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        console.error(`Invalid JSON response (${attempt.label}):`, raw);
        lastError = `${attempt.label}: invalid JSON response`;
        continue;
      }

      const candidates = [
        parsed,
        parsed?.data,
        parsed?.messages,
        parsed?.mensagens,
        parsed?.items,
        parsed?.conversation?.messages,
        parsed?.conversation?.mensagens,
        parsed?.conversation?.items,
        parsed?.data?.messages,
        parsed?.data?.mensagens,
        parsed?.data?.items,
      ];

      const messages = candidates.find((c) => Array.isArray(c)) as any[] | undefined;

      if (!messages) {
        // Endpoint retornou 200 mas não veio array de mensagens; tentamos o próximo
        console.log('No messages array in payload; trying next endpoint', {
          label: attempt.label,
          keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : typeof parsed,
        });
        lastError = `${attempt.label}: response OK but no messages array`;
        continue;
      }

      console.log('Messages fetched successfully:', { label: attempt.label, count: messages.length });
      return { success: true, data: messages };
    }

    return {
      success: false,
      error: lastError ? `Não foi possível buscar mensagens. ${lastError}` : 'Não foi possível buscar mensagens.',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching messages:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// API Functions - Enviar mensagem de texto
// ===========================================
async function enviarMensagemTexto(
  apiBaseUrl: string, 
  token: string, 
  departmentId: string,
  number: string,
  text: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('=== SENDING TEXT MESSAGE ===');
    console.log('Params:', { departmentId, number, text });
    
    // Format phone number - ensure it's in correct format
    const formattedNumber = number.replace(/\D/g, '');
    // Try both formats - @c.us (unofficial API) and @s.whatsapp.net (official API)
    const chatIdCus = `${formattedNumber}@c.us`;
    const chatIdNet = `${formattedNumber}@s.whatsapp.net`;
    
    // List of endpoints to try in order (with both chatId formats)
    const endpoints = [
      // 1. Direct message endpoint with @c.us (unofficial WhatsApp)
      {
        url: `${apiBaseUrl}/mensagem/enviar`,
        body: { chatId: chatIdCus, departamento: departmentId, content: { type: 'text', text } },
        name: 'mensagem/enviar (@c.us)'
      },
      // 2. Direct message endpoint with @s.whatsapp.net
      {
        url: `${apiBaseUrl}/mensagem/enviar`,
        body: { chatId: chatIdNet, departamento: departmentId, content: { type: 'text', text } },
        name: 'mensagem/enviar (@s.whatsapp.net)'
      },
      // 3. Send message with department @c.us
      {
        url: `${apiBaseUrl}/mensagem`,
        body: { chatId: chatIdCus, departamento: departmentId, tipo: 'text', texto: text },
        name: 'mensagem (@c.us)'
      },
      // 4. Department message endpoint @c.us
      {
        url: `${apiBaseUrl}/departamento/${departmentId}/mensagem`,
        body: { chatId: chatIdCus, content: text, type: 'text' },
        name: 'departamento/mensagem (@c.us)'
      },
      // 5. Send text endpoint (numero simples)
      {
        url: `${apiBaseUrl}/enviar-texto`,
        body: { numero: formattedNumber, mensagem: text, departamento: departmentId },
        name: 'enviar-texto'
      },
      // 6. Chat send endpoint @c.us
      {
        url: `${apiBaseUrl}/chat/send`,
        body: { to: chatIdCus, message: text, departmentId },
        name: 'chat/send (@c.us)'
      },
      // 7. WhatsApp Cloud API-style payload
      {
        url: `${apiBaseUrl}/whatsapp/message/${departmentId}`,
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedNumber,
          type: 'text',
          text: { body: text },
        },
        name: 'whatsapp/message (cloud-api)'
      },
      // 8. WhatsApp message (simple body format)
      {
        url: `${apiBaseUrl}/whatsapp/message/${departmentId}`,
        body: { type: 'text', number: formattedNumber, body: text },
        name: 'whatsapp/message (body)'
      },
      // 9. WhatsApp message (text object format)
      {
        url: `${apiBaseUrl}/whatsapp/message/${departmentId}`,
        body: { type: 'text', number: formattedNumber, text: { body: text } },
        name: 'whatsapp/message (text.body)'
      },
    ];
    
    for (const endpoint of endpoints) {
      console.log(`Trying endpoint: ${endpoint.name}`);
      console.log(`URL: ${endpoint.url}`);
      console.log(`Body: ${JSON.stringify(endpoint.body)}`);
      
      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(endpoint.body),
        });
        
        const responseText = await response.text();
        console.log(`Response status: ${response.status}`);
        console.log(`Response body: ${responseText}`);
        
        if (response.ok) {
          let result;
          try {
            result = JSON.parse(responseText);
          } catch {
            result = { raw: responseText };
          }
          console.log(`SUCCESS with endpoint: ${endpoint.name}`);
          return { success: true, data: result };
        }
        
        // If we get a clear error about the endpoint not existing, continue to next
        if (response.status === 404) {
          console.log(`Endpoint ${endpoint.name} not found, trying next...`);
          continue;
        }
        
        // If we get an error about the format, continue to next
        if (response.status === 400) {
          console.log(`Endpoint ${endpoint.name} rejected format, trying next...`);
          continue;
        }
        
      } catch (fetchError) {
        console.error(`Error with endpoint ${endpoint.name}:`, fetchError);
        continue;
      }
    }
    
    // All endpoints failed
    return { 
      success: false, 
      error: 'Nenhum endpoint conseguiu enviar a mensagem. Verifique os logs para mais detalhes.' 
    };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending message:', error);
    return { success: false, error: errorMessage };
  }
}

// ===========================================
// Main Handler
// ===========================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract user_id from JWT token
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      } catch (e) {
        console.log('Could not extract user from token:', e);
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário não autenticado.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: adminRows } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .limit(1);
    const isAdminUser = (adminRows?.length ?? 0) > 0;

    // Load settings for current user
    const { data: userSettings } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let settings: any = userSettings;

    // Admin-only fallback to global settings (backwards compatibility)
    if (!settings && isAdminUser) {
      const { data } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .is('user_id', null)
        .limit(1)
        .maybeSingle();
      settings = data;
    }

    // Token MUST be user-configured for non-admin users
    const zapToken = settings?.zap_api_token || (isAdminUser ? Deno.env.get('ZAP_RESPONDER_TOKEN') : null);
    if (!zapToken) {
      console.error('API token not configured for user:', userId);
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração incompleta. Verifique suas configurações.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiBaseUrl = settings?.api_base_url || 'https://api.zapresponder.com.br/api';

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'sessions';

    console.log(`Zap Responder action: ${action}`, body);

    switch (action) {
      // Lista instâncias/sessões de WhatsApp (com telefones)
      case 'instancias':
      case 'whatsapp-sessions': {
        const result = await fetchInstancias(apiBaseUrl, zapToken);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Lista atendentes/sessões
      case 'sessions':
      case 'atendentes': {
        const result = await fetchAtendentes(apiBaseUrl, zapToken);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Listar departamentos
      case 'departamentos': {
        const result = await fetchDepartamentos(apiBaseUrl, zapToken);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar departamento por ID
      case 'departamento': {
        const { department_id } = body;
        if (!department_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'department_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await fetchDepartamento(apiBaseUrl, zapToken, department_id);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Criar conversa
      case 'criar-conversa': {
        const { attendant_id, chat_id, department_id } = body;
        if (!attendant_id || !chat_id || !department_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'attendant_id, chat_id, and department_id are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await criarConversa(apiBaseUrl, zapToken, attendant_id, chat_id, department_id);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Encerrar conversa
      case 'encerrar-conversa': {
        const { chat_id } = body;
        if (!chat_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'chat_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await encerrarConversa(apiBaseUrl, zapToken, chat_id);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Iniciar bot
      case 'iniciar-bot': {
        const { chat_id, departamento, aplicacao, mensagem_inicial, variaveis } = body;
        if (!chat_id || !departamento) {
          return new Response(
            JSON.stringify({ success: false, error: 'chat_id and departamento are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Tenta usar o departamento real da conversa (principalmente p/ whatsapp-oficial)
        const ctx = await resolveConversationContext(apiBaseUrl, zapToken, chat_id);
        const resolvedDepartment = ctx.departmentId || departamento;
        if (ctx.departmentId && ctx.departmentId !== departamento) {
          console.log('[iniciar-bot] Overriding departamento from request with conversation departamento', {
            requestDepartamento: departamento,
            resolvedDepartment,
            origin: ctx.origin,
          });
        }

        const resultBot = await iniciarBot(
          apiBaseUrl,
          zapToken,
          chat_id,
          resolvedDepartment,
          aplicacao,
          mensagem_inicial,
          variaveis
        );

        // Para WhatsApp Oficial, iniciarBot pode "abrir" o fluxo mas não necessariamente entregar a 1ª mensagem.
        // Então garantimos o envio da mensagem inicial via endpoints de envio de texto.
        if (resultBot.success && mensagem_inicial && ctx.isOfficial) {
          const phoneDigits = normalizePhoneDigitsFromChatId(chat_id);
          console.log('[iniciar-bot] WhatsApp Oficial detectado; enviando mensagem inicial via enviarMensagemTexto', {
            phoneDigits,
            resolvedDepartment,
          });

          const sendRes = await enviarMensagemTexto(apiBaseUrl, zapToken, resolvedDepartment, phoneDigits, mensagem_inicial);
          if (!sendRes.success) {
            const merged = {
              success: false,
              error: sendRes.error || 'Falha ao enviar mensagem inicial no WhatsApp Oficial',
              data: {
                bot: resultBot.data,
                send: sendRes,
                resolved_department_id: resolvedDepartment,
                origin: ctx.origin,
              },
            };
            return new Response(
              JSON.stringify(merged),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const merged = {
            success: true,
            data: {
              bot: resultBot.data,
              send: sendRes.data,
              resolved_department_id: resolvedDepartment,
              origin: ctx.origin,
            },
          };
          return new Response(
            JSON.stringify(merged),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const result = {
          ...resultBot,
          data: {
            ...(resultBot.data ?? {}),
            resolved_department_id: resolvedDepartment,
            origin: ctx.origin,
          },
        };
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar conversa por telefone
      case 'buscar-conversa-telefone': {
        const { phone, include_closed } = body;
        if (!phone) {
          return new Response(
            JSON.stringify({ success: false, error: 'phone is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await buscarConversaPorTelefone(apiBaseUrl, zapToken, phone, include_closed);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar conversa por ID
      case 'buscar-conversa-id': {
        const { conversation_id, include_closed } = body;
        if (!conversation_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'conversation_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await buscarConversaPorId(apiBaseUrl, zapToken, conversation_id, include_closed);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enviar template WhatsApp
      case 'enviar-template': {
        const { department_id, template_name, number, language, variables } = body;
        if (!department_id || !template_name || !number) {
          return new Response(
            JSON.stringify({ success: false, error: 'department_id, template_name, and number are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await enviarTemplateWhatsApp(apiBaseUrl, zapToken, department_id, template_name, number, language, variables);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar templates
      case 'buscar-templates': {
        const { department_id } = body;
        if (!department_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'department_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await buscarTemplates(apiBaseUrl, zapToken, department_id);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Criar mensagem interna (Agente IA)
      case 'mensagem-interna': {
        const { chat_id, content, generate_response, conversation_id } = body;
        if (!chat_id || !content) {
          return new Response(
            JSON.stringify({ success: false, error: 'chat_id and content are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await criarMensagemInterna(apiBaseUrl, zapToken, chat_id, content, generate_response !== false, conversation_id);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Selecionar sessão
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
            JSON.stringify({ error: 'Não foi possível salvar as configurações' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Session selected successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Selecionar departamento padrão
      case 'select-department':
      case 'selecionar-departamento': {
        const { department_id, department_name } = body;
        
        if (!department_id) {
          return new Response(
            JSON.stringify({ error: 'department_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateError } = await supabase
          .from('zap_responder_settings')
          .update({
            selected_department_id: department_id,
            selected_department_name: department_name || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settings?.id);

        if (updateError) {
          console.error('Error updating department settings:', updateError);
          return new Response(
            JSON.stringify({ error: 'Não foi possível salvar as configurações' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Department selected successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Obter configurações
      case 'get-settings': {
        return new Response(
          JSON.stringify({ success: true, data: settings }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Listar todas as conversas
      case 'listar-conversas': {
        const { status: convStatus, limit, offset } = body;
        const result = await listarConversas(apiBaseUrl, zapToken, convStatus, limit || 50, offset || 0);
        // Não retornar 500 (evita runtime error no frontend)
        return new Response(
          JSON.stringify(result),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar mensagens de uma conversa
      case 'buscar-mensagens': {
        const { conversation_id, chat_id, limit } = body;
        if (!conversation_id && !chat_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'conversation_id or chat_id is required' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await buscarMensagens(apiBaseUrl, zapToken, conversation_id || chat_id, limit || 100, chat_id);
        return new Response(
          JSON.stringify(result),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enviar mensagem de texto
      case 'enviar-mensagem': {
        const { department_id, number, text } = body;
        if (!department_id || !number || !text) {
          return new Response(
            JSON.stringify({ success: false, error: 'department_id, number, and text are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const result = await enviarMensagemTexto(apiBaseUrl, zapToken, department_id, number, text);
        return new Response(
          JSON.stringify(result),
          { status: result.success ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Buscar QR Code para conectar sessão WhatsApp
      case 'buscar-qrcode': {
        const { session_id } = body;
        const result = await buscarQRCode(apiBaseUrl, zapToken, session_id);
        return new Response(
          JSON.stringify(result),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verificar status da sessão WhatsApp
      case 'verificar-status': {
        const { session_id } = body;
        const result = await verificarStatusSessao(apiBaseUrl, zapToken, session_id);
        return new Response(
          JSON.stringify(result),
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
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Não foi possível processar a solicitação' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
