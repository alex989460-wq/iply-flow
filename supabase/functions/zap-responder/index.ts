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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
    console.log('Starting bot...', { chatId, departamento, aplicacao });
    
    const body: any = {
      chatId,
      departamento,
      aplicacao,
    };
    
    if (mensagemInicial) {
      body.mensagemInicial = mensagemInicial;
    }
    
    if (variaveis) {
      body.variaveis = variaveis;
    }
    
    const response = await fetch(`${apiBaseUrl}/conversa/iniciarBot`, {
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
    }

    const result = await response.json();
    console.log('Bot started successfully:', result);
    
    return { success: true, data: result };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
    console.log('Fetching all conversations...', { status, limit, offset });
    
    // Try the conversa endpoint (common endpoint for Zap Responder)
    let url = `${apiBaseUrl}/conversa?limit=${limit}&offset=${offset}`;
    if (status && status !== 'all') {
      url += `&status=${status}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // Try alternative endpoint
      console.log('Trying alternative conversations endpoint...');
      const altUrl = `${apiBaseUrl}/conversas?limit=${limit}&offset=${offset}${status && status !== 'all' ? `&status=${status}` : ''}`;
      const altResponse = await fetch(altUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
      
      if (!altResponse.ok) {
        const errorText = await altResponse.text();
        console.error(`Zap Responder API error: ${altResponse.status} - ${errorText}`);
        return { success: false, error: `API error: ${altResponse.status} - ${errorText}` };
      }
      
      const altResult = await altResponse.json();
      console.log('Conversations fetched from alt endpoint:', altResult);
      const altConversations = Array.isArray(altResult) ? altResult : (altResult.data || altResult.conversas || altResult.conversations || []);
      return { success: true, data: altConversations };
    }

    const result = await response.json();
    console.log('Conversations fetched successfully:', result);
    
    const conversations = Array.isArray(result) ? result : (result.data || result.conversas || result.conversations || []);
    
    return { success: true, data: conversations };
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
          {
            label: `conversa/mensagens GET [${base}]`,
            url: `${base}/conversa/mensagens/${conversationId}?limit=${limit}`,
            method: 'GET',
          },
          {
            label: `conversa/mensagens POST [${base}]`,
            url: `${base}/conversa/mensagens/${conversationId}`,
            method: 'POST',
            body: { limit },
          },
          {
            label: `mensagem/conversa GET [${base}]`,
            url: `${base}/mensagem/conversa/${conversationId}?limit=${limit}`,
            method: 'GET',
          },
          {
            label: `mensagem/conversa POST [${base}]`,
            url: `${base}/mensagem/conversa/${conversationId}`,
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
    console.log('Sending text message...', { departmentId, number, text });
    
    // Format phone number - ensure it's in correct format
    const formattedNumber = number.replace(/\D/g, '');
    const chatId = `${formattedNumber}@s.whatsapp.net`;
    
    // STRATEGY 1: Try to find active conversation and send via conversation endpoint
    console.log('Trying to find active conversation for:', chatId);
    
    const conversaResult = await buscarConversaPorTelefone(apiBaseUrl, token, formattedNumber, false);
    
    if (conversaResult.success && conversaResult.data) {
      // The API returns { conversation: {...} } or direct conversation object
      const rawData = conversaResult.data;
      const conversa = rawData.conversation || rawData;
      const conversationId = conversa._id || conversa.id || conversa.conversationId;
      const conversaChatId = conversa.chatId;
      
      console.log('Found conversation data:', { conversationId, conversaChatId, isFechado: conversa.isFechado });
      
      if (conversationId && !conversa.isFechado) {
        console.log('Found active conversation, sending via conversation endpoint:', conversationId);
        
        // Try sending via conversation message endpoint
        const msgBody = {
          content: {
            type: 'text',
            text: text,
          },
        };
        
        const msgResponse = await fetch(`${apiBaseUrl}/mensagem/conversa/${conversationId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(msgBody),
        });
        
        if (msgResponse.ok) {
          const msgResult = await msgResponse.json();
          console.log('Message sent via conversation endpoint:', msgResult);
          return { success: true, data: msgResult };
        }
        
        console.log('Conversation endpoint failed, trying v2 endpoint...');
        
        // Try v2 conversations messages endpoint
        const v2Body = {
          type: 'text',
          text: text,
        };
        
        const v2Response = await fetch(`${apiBaseUrl}/v2/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(v2Body),
        });
        
        if (v2Response.ok) {
          const v2Result = await v2Response.json();
          console.log('Message sent via v2 conversation endpoint:', v2Result);
          return { success: true, data: v2Result };
        }
        
        console.log('V2 endpoint also failed, falling back to WhatsApp endpoint');
      }
    }
    
    // STRATEGY 2: Try WhatsApp official API endpoint (works for templates or within 24h window)
    console.log('Trying WhatsApp official API endpoint...');
    
    const body = {
      type: 'text',
      number: formattedNumber,
      text: {
        body: String(text),
      },
    };

    console.log('Sending text message payload to Zap Responder:', JSON.stringify(body));
    
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
      
      // Check if error is about 24h window - suggest using template
      if (errorText.includes('text') && errorText.includes('body')) {
        return { 
          success: false, 
          error: 'Não é possível enviar mensagem de texto livre. O cliente precisa ter respondido nas últimas 24h ou você deve usar um template aprovado.' 
        };
      }
      
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
    }

    const result = await response.json();
    console.log('Message sent successfully:', result);
    
    return { success: true, data: result };
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
    const zapToken = Deno.env.get('ZAP_RESPONDER_TOKEN');
    if (!zapToken) {
      console.error('ZAP_RESPONDER_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'ZAP_RESPONDER_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settings } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .limit(1)
      .single();

    const apiBaseUrl = settings?.api_base_url || 'https://api.zapresponder.com.br/api';

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'sessions';

    console.log(`Zap Responder action: ${action}`, body);

    switch (action) {
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
        const result = await iniciarBot(apiBaseUrl, zapToken, chat_id, departamento, aplicacao, mensagem_inicial, variaveis);
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
            JSON.stringify({ error: 'Failed to update settings', details: updateError }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Session selected successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Selecionar departamento padrão
      case 'select-department': {
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
            JSON.stringify({ error: 'Failed to update department settings', details: updateError }),
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
