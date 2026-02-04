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

// Helper to try HTTP if HTTPS fails due to cert issues
async function fetchWithFallback(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    // If it's a certificate error and URL is HTTPS, try HTTP
    if (error instanceof TypeError && 
        (error.message.includes('certificate') || error.message.includes('ssl') || error.message.includes('tls'))) {
      if (url.startsWith('https://')) {
        const httpUrl = url.replace('https://', 'http://').replace(':443', '').replace(':9000', ':8000');
        console.log(`[XUI] SSL certificate error, trying HTTP fallback: ${httpUrl}`);
        return await fetch(httpUrl, options);
      }
    }
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[XUI] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client to validate user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[XUI] User validation failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[XUI] Request from user: ${user.id}`);

    // Parse request body
    const { username, daysToAdd, action = 'renew' } = await req.json();

    if (!username) {
      console.error('[XUI] Missing username');
      return new Response(
        JSON.stringify({ error: 'Username do cliente não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get XUI One credentials from environment
    const xuiBaseUrl = Deno.env.get('XUI_ONE_BASE_URL');
    const xuiAccessCode = Deno.env.get('XUI_ONE_ACCESS_CODE');
    const xuiApiKey = Deno.env.get('XUI_ONE_API_KEY');

    if (!xuiBaseUrl || !xuiAccessCode || !xuiApiKey) {
      console.error('[XUI] Missing XUI One configuration');
      return new Response(
        JSON.stringify({ error: 'Configuração do XUI One não encontrada. Configure nas secrets do projeto.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build XUI One API URL
    const baseUrl = xuiBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    // First, get the line info to find the line ID
    const getLineUrl = `${baseUrl}/${xuiAccessCode}/?api_key=${xuiApiKey}&action=get_lines`;
    
    console.log(`[XUI] Fetching lines from XUI One...`);
    
    const linesResponse = await fetchWithFallback(getLineUrl);
    const linesText = await linesResponse.text();
    
    let linesData: XUIResponse;
    try {
      linesData = JSON.parse(linesText);
    } catch {
      console.error('[XUI] Failed to parse lines response:', linesText);
      return new Response(
        JSON.stringify({ error: 'Erro ao conectar com o servidor XUI One. Verifique a URL e credenciais. Se estiver usando HTTPS, tente usar HTTP.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (linesData.status !== 'STATUS_SUCCESS') {
      console.error('[XUI] Failed to get lines:', linesData.error);
      return new Response(
        JSON.stringify({ error: linesData.error || 'Erro ao buscar linhas no XUI One' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the line by username
    const lines = linesData.data as unknown as Array<{ id: number; username: string; exp_date: string; enabled: number }>;
    const line = lines?.find(l => l.username?.toLowerCase() === username.toLowerCase());

    if (!line) {
      console.error(`[XUI] Line not found for username: ${username}`);
      return new Response(
        JSON.stringify({ error: `Usuário "${username}" não encontrado no XUI One` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[XUI] Found line: ID=${line.id}, current exp_date=${line.exp_date}`);

    // Calculate new expiration date
    const currentExpDate = line.exp_date ? new Date(parseInt(line.exp_date) * 1000) : new Date();
    const now = new Date();
    const baseDate = currentExpDate > now ? currentExpDate : now;
    
    // Add days (default 30 days = 1 month)
    const days = daysToAdd || 30;
    const newExpDate = new Date(baseDate);
    newExpDate.setDate(newExpDate.getDate() + days);
    
    // Convert to Unix timestamp (seconds)
    const newExpTimestamp = Math.floor(newExpDate.getTime() / 1000);

    console.log(`[XUI] Renewing: from ${baseDate.toISOString()} to ${newExpDate.toISOString()}`);

    // Build edit URL with form data
    const editLineUrl = `${baseUrl}/${xuiAccessCode}/?api_key=${xuiApiKey}&action=edit_line`;
    
    const formData = new URLSearchParams();
    formData.append('id', line.id.toString());
    formData.append('exp_date', newExpTimestamp.toString());
    
    // Also enable the line if it was disabled
    if (action === 'renew' || action === 'enable') {
      formData.append('enabled', '1');
    }

    console.log(`[XUI] Sending edit request...`);
    
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
      console.error('[XUI] Failed to parse edit response:', editText);
      return new Response(
        JSON.stringify({ error: 'Erro na resposta do servidor XUI One' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (editData.status !== 'STATUS_SUCCESS') {
      console.error('[XUI] Failed to edit line:', editData.error);
      return new Response(
        JSON.stringify({ error: editData.error || 'Erro ao renovar linha no XUI One' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[XUI] Successfully renewed line ${line.id} for user ${username}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${username} renovado com sucesso no XUI One`,
        data: {
          lineId: line.id,
          username: username,
          previousExpDate: currentExpDate.toISOString(),
          newExpDate: newExpDate.toISOString(),
          daysAdded: days,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    console.error('[XUI] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
