import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface XUIResponse {
  status?: string;
  result?: boolean;
  error?: string;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
  user_data?: Record<string, unknown>;
  api_key?: string;
}

// Helper to try HTTP with different ports if HTTPS fails due to cert issues
async function fetchWithFallback(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error instanceof TypeError && 
        (error.message.includes('certificate') || error.message.includes('ssl') || error.message.includes('tls'))) {
      if (url.startsWith('https://')) {
        const urlObj = new URL(url);
        const basePath = urlObj.pathname + urlObj.search;
        const httpPorts = [25461, 25500, 8080, 80];
        
        for (const port of httpPorts) {
          const httpUrl = `http://${urlObj.hostname}:${port}${basePath}`;
          console.log(`[XUI] SSL error, trying HTTP fallback on port ${port}`);
          try {
            const response = await fetch(httpUrl, options);
            return response;
          } catch (portError) {
            console.log(`[XUI] Port ${port} failed`);
            continue;
          }
        }
        throw new Error(`Não foi possível conectar ao servidor XUI One.`);
      }
    }
    throw error;
  }
}

// Authenticate with username/password and get session
async function authenticateXUI(baseUrl: string, username: string, password: string): Promise<{ success: boolean; apiKey?: string; error?: string }> {
  console.log(`[XUI] Authenticating user: ${username}`);
  
  // Try different authentication endpoints
  const authEndpoints = [
    { url: `${baseUrl}/api.php`, method: 'POST', body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=login` },
    { url: `${baseUrl}/api.php?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, method: 'GET', body: null },
    { url: `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, method: 'GET', body: null },
  ];

  for (const endpoint of authEndpoints) {
    try {
      console.log(`[XUI] Trying auth endpoint: ${endpoint.url.replace(password, '***')}`);
      
      const options: RequestInit = {
        method: endpoint.method,
        headers: endpoint.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
        body: endpoint.body || undefined,
      };
      
      const response = await fetchWithFallback(endpoint.url, options);
      const text = await response.text();
      
      console.log(`[XUI] Auth response (${response.status}): ${text.substring(0, 300)}`);
      
      if (!response.ok && response.status !== 200) {
        continue;
      }
      
      let data: XUIResponse;
      try {
        data = JSON.parse(text);
      } catch {
        // If not JSON, might be HTML login page - try next endpoint
        continue;
      }
      
      // Check for successful authentication
      if (data.status === 'STATUS_SUCCESS' || data.result === true || data.user_data || data.api_key) {
        const apiKey = data.api_key || data.user_data?.api_key as string || '';
        console.log(`[XUI] Authentication successful! API Key: ${apiKey ? 'obtained' : 'not provided'}`);
        return { success: true, apiKey };
      }
      
      // Check for authentication error
      if (data.error) {
        return { success: false, error: data.error };
      }
      
    } catch (error) {
      console.log(`[XUI] Auth endpoint failed:`, error);
      continue;
    }
  }
  
  return { success: false, error: 'Não foi possível autenticar. Verifique usuário e senha.' };
}

// Get lines/users from the panel
async function getLines(baseUrl: string, username: string, password: string, apiKey: string | null, offset: number, limit: number): Promise<{ success: boolean; lines?: Array<Record<string, unknown>>; error?: string }> {
  // Try different endpoints for getting lines
  const endpoints = [];
  
  // If we have an API key, try API key based endpoints first
  if (apiKey) {
    endpoints.push(
      `${baseUrl}/api.php?api_key=${apiKey}&action=get_lines&limit=${limit}&offset=${offset}`,
      `${baseUrl}/api.php?api_key=${apiKey}&action=get_users&limit=${limit}&offset=${offset}`,
    );
  }
  
  // Try username/password based endpoints
  endpoints.push(
    `${baseUrl}/api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_lines&limit=${limit}&offset=${offset}`,
    `${baseUrl}/api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_users&limit=${limit}&offset=${offset}`,
    `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`,
  );

  for (const url of endpoints) {
    try {
      const response = await fetchWithFallback(url);
      const text = await response.text();
      
      let data: XUIResponse;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }
      
      // Check for success and data
      if (data.status === 'STATUS_SUCCESS' && data.data) {
        const lines = Array.isArray(data.data) ? data.data : Object.values(data.data);
        return { success: true, lines: lines as Array<Record<string, unknown>> };
      }
      
      // Some APIs return the data directly as an array
      if (Array.isArray(data)) {
        return { success: true, lines: data };
      }
      
      if (data.error) {
        return { success: false, error: data.error };
      }
      
    } catch (error) {
      continue;
    }
  }
  
  return { success: false, error: 'Não foi possível obter lista de usuários' };
}

// Edit/renew a line
async function editLine(baseUrl: string, username: string, password: string, apiKey: string | null, lineId: string, newExpTimestamp: number): Promise<{ success: boolean; error?: string }> {
  const endpoints = [];
  
  // Build form data for POST requests
  const formData = new URLSearchParams();
  formData.append('id', lineId);
  formData.append('exp_date', newExpTimestamp.toString());
  formData.append('enabled', '1');
  
  // If we have an API key, try API key based endpoints first
  if (apiKey) {
    endpoints.push({
      url: `${baseUrl}/api.php?api_key=${apiKey}&action=edit_line`,
      method: 'POST',
      body: formData.toString()
    });
  }
  
  // Try username/password based endpoints
  endpoints.push({
    url: `${baseUrl}/api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=edit_line`,
    method: 'POST',
    body: formData.toString()
  });

  for (const endpoint of endpoints) {
    try {
      console.log(`[XUI] Trying edit endpoint: ${endpoint.url.replace(password, '***')}`);
      
      const response = await fetchWithFallback(endpoint.url, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: endpoint.body,
      });
      
      const text = await response.text();
      console.log(`[XUI] Edit response: ${text.substring(0, 200)}`);
      
      let data: XUIResponse;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }
      
      if (data.status === 'STATUS_SUCCESS' || data.result === true) {
        return { success: true };
      }
      
      if (data.error) {
        return { success: false, error: data.error };
      }
      
    } catch (error) {
      continue;
    }
  }
  
  return { success: false, error: 'Não foi possível renovar o usuário' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[XUI] Request from user: ${user.id}`);

    const { username: targetUsername, daysToAdd, action = 'renew' } = await req.json();

    if (!targetUsername) {
      return new Response(
        JSON.stringify({ error: 'Username do cliente não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's XUI One credentials from database
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: xuiSettings, error: settingsError } = await supabaseAdmin
      .from('xui_one_settings')
      .select('base_url, api_key, access_code, is_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      console.error('[XUI] Error fetching user settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar configurações do XUI One' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!xuiSettings || !xuiSettings.is_enabled) {
      return new Response(
        JSON.stringify({ error: 'Integração XUI One não está configurada ou habilitada. Configure em Configurações.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fields mapping: base_url = panel URL, access_code = username, api_key = password
    const { base_url: baseUrl, access_code: panelUsername, api_key: panelPassword } = xuiSettings;

    if (!baseUrl || !panelUsername || !panelPassword) {
      return new Response(
        JSON.stringify({ error: 'Credenciais do XUI One incompletas. Configure URL, Usuário e Senha em Configurações.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[XUI] Panel URL: ${baseUrl}`);
    console.log(`[XUI] Panel username: ${panelUsername}`);
    console.log(`[XUI] Searching for client: "${targetUsername}"`);

    // First, authenticate to get API key (if available)
    const authResult = await authenticateXUI(baseUrl, panelUsername, panelPassword);
    
    if (!authResult.success) {
      console.error(`[XUI] Authentication failed: ${authResult.error}`);
      return new Response(
        JSON.stringify({ error: authResult.error || 'Falha na autenticação. Verifique usuário e senha.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = authResult.apiKey || null;
    console.log(`[XUI] Authenticated successfully. API Key: ${apiKey ? 'yes' : 'no'}`);

    // For test action, just verify connection works
    if (action === 'test') {
      return new Response(
        JSON.stringify({ success: true, message: 'Conexão testada com sucesso!' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search for the target user
    let line: Record<string, unknown> | null = null;
    let offset = 0;
    const limit = 100;
    const maxPages = 50;
    let pageCount = 0;
    let totalSearched = 0;
    
    while (!line && pageCount < maxPages) {
      console.log(`[XUI] Fetching page ${pageCount + 1} (offset: ${offset})...`);
      
      const linesResult = await getLines(baseUrl, panelUsername, panelPassword, apiKey, offset, limit);
      
      if (!linesResult.success) {
        console.error(`[XUI] Failed to get lines: ${linesResult.error}`);
        return new Response(
          JSON.stringify({ error: linesResult.error || 'Erro ao buscar usuários do painel' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const lines = linesResult.lines || [];
      const resultCount = lines.length;
      totalSearched += resultCount;
      
      console.log(`[XUI] Page ${pageCount + 1}: ${resultCount} results (total: ${totalSearched})`);
      
      // Log first user structure on first page
      if (pageCount === 0 && lines.length > 0) {
        const sampleUser = lines[0];
        const fields = Object.keys(sampleUser).join(', ');
        console.log(`[XUI] User fields available: ${fields}`);
        const sampleUsername = sampleUser.username || sampleUser.user || sampleUser.login || sampleUser.name;
        console.log(`[XUI] Sample username: ${sampleUsername}`);
      }
      
      if (resultCount === 0) break;
      
      // Search for the target user
      for (const l of lines) {
        const possibleUsernameFields = ['username', 'user', 'login', 'name', 'user_name', 'client', 'account'];
        
        for (const field of possibleUsernameFields) {
          if (l[field] && String(l[field]).toLowerCase() === targetUsername.toLowerCase()) {
            console.log(`[XUI] Found user "${targetUsername}" via field "${field}"`);
            line = l;
            break;
          }
        }
        
        if (line) break;
      }
      
      if (!line) {
        offset += resultCount;
        pageCount++;
      }
    }

    if (!line) {
      console.error(`[XUI] User not found: ${targetUsername} (searched ${totalSearched})`);
      return new Response(
        JSON.stringify({ error: `Usuário "${targetUsername}" não encontrado no seu painel.` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lineId = String(line.id);
    const lineExpDate = line.exp_date ? String(line.exp_date) : null;
    
    console.log(`[XUI] Found line: ID=${lineId}, exp_date=${lineExpDate}`);

    // Calculate new expiration
    const currentExpDate = lineExpDate ? new Date(parseInt(lineExpDate) * 1000) : new Date();
    const now = new Date();
    const baseDate = currentExpDate > now ? currentExpDate : now;
    
    const days = daysToAdd || 30;
    const newExpDate = new Date(baseDate);
    newExpDate.setDate(newExpDate.getDate() + days);
    
    const newExpTimestamp = Math.floor(newExpDate.getTime() / 1000);

    console.log(`[XUI] Renewing: ${baseDate.toISOString()} -> ${newExpDate.toISOString()}`);

    // Edit/renew the line
    const editResult = await editLine(baseUrl, panelUsername, panelPassword, apiKey, lineId, newExpTimestamp);
    
    if (!editResult.success) {
      console.error(`[XUI] Edit failed: ${editResult.error}`);
      return new Response(
        JSON.stringify({ error: editResult.error || 'Erro ao renovar usuário' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[XUI] Success! Renewed ${targetUsername}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${targetUsername} renovado com sucesso!`,
        data: {
          lineId: line.id,
          username: targetUsername,
          previousExpDate: currentExpDate.toISOString(),
          newExpDate: newExpDate.toISOString(),
          daysAdded: days,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    console.error('[XUI] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
