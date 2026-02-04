import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface XUIResponse {
  status: string;
  error?: string;
  data?: Record<string, unknown>;
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

    const { username, daysToAdd, action = 'renew' } = await req.json();

    if (!username) {
      return new Response(
        JSON.stringify({ error: 'Username do cliente não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get global XUI One credentials from environment (master reseller)
    const xuiBaseUrl = Deno.env.get('XUI_ONE_BASE_URL');
    const xuiApiKey = Deno.env.get('XUI_ONE_API_KEY');
    const xuiMasterAccessCode = Deno.env.get('XUI_ONE_ACCESS_CODE'); // vplayXui! - master com acesso à API

    if (!xuiBaseUrl || !xuiApiKey || !xuiMasterAccessCode) {
      console.error('[XUI] Missing global XUI One configuration');
      return new Response(
        JSON.stringify({ error: 'Configuração do XUI One não encontrada no sistema.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's reseller code from database (to filter clients by reseller)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: xuiSettings, error: settingsError } = await supabaseAdmin
      .from('xui_one_settings')
      .select('access_code, is_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      console.error('[XUI] Error fetching user settings:', settingsError);
    }

    // Reseller filter: if user has configured their code, filter by it
    // If not configured, show all clients (admin mode)
    let resellerFilter: string | null = null;

    if (xuiSettings && xuiSettings.is_enabled && xuiSettings.access_code) {
      resellerFilter = xuiSettings.access_code;
      console.log(`[XUI] Filtering clients by reseller: ${resellerFilter}`);
    } else {
      console.log('[XUI] No reseller filter (admin mode - sees all clients)');
    }

    // Clean base URL (remove trailing slash)
    const baseUrl = xuiBaseUrl.replace(/\/$/, '');
    
    // URL format: {baseUrl}/{accessCode}/?api_key={apiKey}&action=xxx
    // Example: https://panel22.gestorvplay.com/supergestor/?api_key=XXX&action=get_lines
    console.log(`[XUI] Base URL: ${baseUrl}`);
    console.log(`[XUI] Master access code: ${xuiMasterAccessCode}`);
    console.log(`[XUI] Searching for user "${username}"${resellerFilter ? ` (reseller: ${resellerFilter})` : ''}`);

    // Search with pagination using master access code
    let line: Record<string, unknown> | null = null;
    let offset = 0;
    const limit = 100;
    const maxPages = 50;
    let pageCount = 0;
    let totalSearched = 0;
    
    while (!line && pageCount < maxPages) {
      const getLineUrl = `${baseUrl}/${xuiMasterAccessCode}/?api_key=${xuiApiKey}&action=get_lines&limit=${limit}&offset=${offset}`;
      
      console.log(`[XUI] Fetching page ${pageCount + 1} (offset: ${offset})...`);
      
      const linesResponse = await fetchWithFallback(getLineUrl);
      const linesText = await linesResponse.text();
      
      let linesData: XUIResponse;
      try {
        linesData = JSON.parse(linesText);
      } catch {
        console.error('[XUI] Failed to parse response:', linesText.substring(0, 200));
        return new Response(
          JSON.stringify({ error: 'Erro ao conectar com o XUI One. Verifique as credenciais.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (linesData.status !== 'STATUS_SUCCESS') {
        console.error('[XUI] API error:', linesData.error);
        return new Response(
          JSON.stringify({ error: linesData.error || 'Erro ao buscar linhas no XUI One' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const lines = linesData.data as unknown as Array<Record<string, unknown>>;
      const resultCount = lines?.length || 0;
      totalSearched += resultCount;
      
      console.log(`[XUI] Page ${pageCount + 1}: ${resultCount} results (total: ${totalSearched})`);
      
      if (resultCount === 0) break;
      
      if (lines && lines.length > 0) {
        line = lines.find(l => {
          // Check if username matches
          const possibleFields = ['username', 'user', 'login', 'name'];
          let usernameMatch = false;
          for (const field of possibleFields) {
            if (l[field] && String(l[field]).toLowerCase() === username.toLowerCase()) {
              usernameMatch = true;
              break;
            }
          }
          
          if (!usernameMatch) return false;
          
          // If reseller filter is set, check if client belongs to this reseller
          if (resellerFilter) {
            const clientReseller = l.reseller || l.created_by || l.owner;
            if (clientReseller && String(clientReseller).toLowerCase() === resellerFilter.toLowerCase()) {
              console.log(`[XUI] Found user "${username}" belonging to reseller "${resellerFilter}"`);
              return true;
            }
            // Username matches but wrong reseller
            console.log(`[XUI] User "${username}" found but belongs to reseller "${clientReseller}", not "${resellerFilter}"`);
            return false;
          }
          
          // No filter = admin mode, accept any match
          console.log(`[XUI] Found user "${username}" (admin mode)`);
          return true;
        }) || null;
      }
      
      if (!line) {
        offset += resultCount;
        pageCount++;
      }
    }

    if (!line) {
      console.error(`[XUI] User not found: ${username} (searched ${totalSearched})`);
      return new Response(
        JSON.stringify({ error: `Usuário "${username}" não encontrado. Verifique se o usuário pertence ao seu painel.` }),
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

    // Edit line
    const editLineUrl = `${baseUrl}/${xuiMasterAccessCode}/?api_key=${xuiApiKey}&action=edit_line`;
    
    const formData = new URLSearchParams();
    formData.append('id', lineId);
    formData.append('exp_date', newExpTimestamp.toString());
    
    if (action === 'renew' || action === 'enable') {
      formData.append('enabled', '1');
    }

    const editResponse = await fetchWithFallback(editLineUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const editText = await editResponse.text();
    
    let editData: XUIResponse;
    try {
      editData = JSON.parse(editText);
    } catch {
      console.error('[XUI] Failed to parse edit response');
      return new Response(
        JSON.stringify({ error: 'Erro na resposta do XUI One' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (editData.status !== 'STATUS_SUCCESS') {
      console.error('[XUI] Edit failed:', editData.error);
      return new Response(
        JSON.stringify({ error: editData.error || 'Erro ao renovar linha' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[XUI] Success! Renewed ${username}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${username} renovado com sucesso!`,
        data: {
          lineId: line.id,
          username,
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
