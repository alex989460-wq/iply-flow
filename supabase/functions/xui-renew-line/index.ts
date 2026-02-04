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
  user_info?: Record<string, unknown>;
  api_key?: string;
}

// Store session cookie for authenticated requests
let sessionCookie: string | null = null;

// Helper to try HTTP with different ports if HTTPS fails due to cert issues
async function fetchWithFallback(url: string, options?: RequestInit): Promise<Response> {
  // Add session cookie to headers if available
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };
  
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }
  
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    redirect: 'manual', // Handle redirects manually to capture cookies
  };
  
  try {
    return await fetch(url, fetchOptions);
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
            const response = await fetch(httpUrl, fetchOptions);
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

// Authenticate with username/password via web login (cookie-based session)
async function authenticateXUI(baseUrl: string, username: string, password: string): Promise<{ success: boolean; apiKey?: string; error?: string }> {
  console.log(`[XUI] Authenticating user: ${username}`);
  
  // Clean base URL
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  
  // Try web-based login (most common for GestorVPlay/SuperGestor)
  const loginUrl = `${cleanBaseUrl}/login`;
  
  console.log(`[XUI] Trying web login: ${loginUrl}`);
  
  try {
    // First, get the login page to capture any CSRF tokens
    const loginPageResponse = await fetch(cleanBaseUrl, { redirect: 'manual' });
    const loginPageCookie = loginPageResponse.headers.get('set-cookie');
    
    if (loginPageCookie) {
      sessionCookie = loginPageCookie.split(';')[0];
      console.log(`[XUI] Got initial session cookie`);
    }
    
    // Perform login
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const loginHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    
    if (sessionCookie) {
      loginHeaders['Cookie'] = sessionCookie;
    }
    
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: loginHeaders,
      body: formData.toString(),
      redirect: 'manual', // Important: capture redirect and cookies
    });
    
    console.log(`[XUI] Login response status: ${loginResponse.status}`);
    
    // Log response body for debugging
    const responseBody = await loginResponse.clone().text();
    console.log(`[XUI] Login response body (first 500 chars): ${responseBody.substring(0, 500)}`);
    
    // Get session cookie from response
    const setCookie = loginResponse.headers.get('set-cookie');
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0];
      console.log(`[XUI] Got session cookie from login`);
    }
    
    // Successful login usually results in redirect (302/303)
    if (loginResponse.status === 302 || loginResponse.status === 303 || loginResponse.status === 301) {
      const location = loginResponse.headers.get('location');
      console.log(`[XUI] Login redirect to: ${location}`);
      
      // Check if redirect is to dashboard (success) or back to login (failure)
      if (location && !location.includes('login') && !location.includes('error')) {
        console.log(`[XUI] Login successful!`);
        return { success: true, apiKey: undefined };
      }
    }
    
    // If 200, check if it's a success page or error page
    if (loginResponse.status === 200) {
      const responseText = await loginResponse.text();
      
      // Check for success indicators
      if (responseText.includes('dashboard') || responseText.includes('Dashboard') || 
          responseText.includes('logout') || responseText.includes('Logout')) {
        console.log(`[XUI] Login successful (dashboard page)`);
        return { success: true, apiKey: undefined };
      }
      
      // Check for error messages
      if (responseText.includes('incorrect') || responseText.includes('invalid') || 
          responseText.includes('erro') || responseText.includes('Erro')) {
        return { success: false, error: 'Usuário ou senha incorretos' };
      }
    }
    
  } catch (error) {
    console.error(`[XUI] Web login error:`, error);
  }
  
  // Try API-based authentication as fallback
  const apiEndpoints = [
    `${cleanBaseUrl}/api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_users&limit=1`,
    `${cleanBaseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  ];

  for (const url of apiEndpoints) {
    try {
      const logUrl = url.replace(new RegExp(password, 'g'), '***');
      console.log(`[XUI] Trying API auth: ${logUrl.substring(0, 100)}...`);
      
      const response = await fetchWithFallback(url);
      const text = await response.text();
      
      if (text.trim().startsWith('<')) continue;
      
      const data: XUIResponse = JSON.parse(text);
      
      if (data.result === false && data.error) continue;
      
      if (data.user_info || data.user_data || data.status === 'STATUS_SUCCESS' || data.result === true) {
        console.log(`[XUI] API Authentication successful!`);
        return { success: true, apiKey: data.api_key };
      }
      
      if (Array.isArray(data.data) || (data.data && typeof data.data === 'object')) {
        console.log(`[XUI] API Authentication successful (got data)!`);
        return { success: true, apiKey: undefined };
      }
      
    } catch {
      continue;
    }
  }
  
  return { success: false, error: 'Não foi possível autenticar. Verifique URL, usuário e senha.' };
}

// Get lines/users from the panel
async function getLines(baseUrl: string, username: string, password: string, apiKey: string | null, offset: number, limit: number): Promise<{ success: boolean; lines?: Array<Record<string, unknown>>; error?: string }> {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  
  // Try different endpoints for getting lines - ordered by most common for reseller panels
  const endpoints = [
    // Username/password auth (most reliable for reseller panels)
    `${cleanBaseUrl}/api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_users&limit=${limit}&offset=${offset}`,
    `${cleanBaseUrl}/api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_lines&limit=${limit}&offset=${offset}`,
    // Panel subpath
    `${cleanBaseUrl}/panel/api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_users&limit=${limit}&offset=${offset}`,
  ];
  
  // Add API key based endpoints if available
  if (apiKey) {
    endpoints.unshift(
      `${cleanBaseUrl}/api.php?api_key=${apiKey}&action=get_users&limit=${limit}&offset=${offset}`,
      `${cleanBaseUrl}/api.php?api_key=${apiKey}&action=get_lines&limit=${limit}&offset=${offset}`,
    );
  }

  for (const url of endpoints) {
    try {
      const logUrl = url.replace(new RegExp(password, 'g'), '***');
      console.log(`[XUI] Trying get_users: ${logUrl.substring(0, 150)}...`);
      
      const response = await fetchWithFallback(url);
      const text = await response.text();
      
      // Skip HTML responses
      if (text.trim().startsWith('<') || text.trim().startsWith('<!')) {
        continue;
      }
      
      let data: XUIResponse;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }
      
      // Log first result structure
      console.log(`[XUI] get_users response status: ${data.status}, result: ${data.result}`);
      
      // Check for success and data
      if (data.status === 'STATUS_SUCCESS' && data.data) {
        const lines = Array.isArray(data.data) ? data.data : Object.values(data.data);
        console.log(`[XUI] Got ${lines.length} users`);
        return { success: true, lines: lines as Array<Record<string, unknown>> };
      }
      
      // Some APIs return the data directly as an array
      if (Array.isArray(data)) {
        console.log(`[XUI] Got ${data.length} users (direct array)`);
        return { success: true, lines: data };
      }
      
      // If data.data is an object (keyed by ID), convert to array
      if (typeof data.data === 'object' && data.data !== null && !Array.isArray(data.data)) {
        const lines = Object.values(data.data) as Array<Record<string, unknown>>;
        console.log(`[XUI] Got ${lines.length} users (object converted)`);
        return { success: true, lines };
      }
      
      if (data.error) {
        console.log(`[XUI] get_users error: ${data.error}`);
        continue;
      }
      
    } catch (error) {
      console.log(`[XUI] get_users endpoint failed`);
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
