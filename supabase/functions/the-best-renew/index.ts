import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_BASE_URL = 'https://api.painel.best';

async function getTheBestToken(baseUrl: string, username: string, password: string): Promise<string> {
  const resp = await fetch(`${baseUrl}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Login The Best falhou (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const token = data.access || data.token || data.access_token;
  if (!token) throw new Error('Token não encontrado na resposta de login');
  return token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const internalSecret = req.headers.get('x-cakto-webhook-secret');
    const configuredWebhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET');
    const isInternalWebhookCall =
      !!configuredWebhookSecret && internalSecret === configuredWebhookSecret;

    let callerUserId: string | null = null;

    if (!isInternalWebhookCall) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: jsonHeaders,
        });
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: jsonHeaders,
        });
      }
      callerUserId = claimsData.claims.sub as string;
    } else {
      console.log('[TheBest] Chamada interna autorizada pelo webhook da Cakto');
    }

    const { username, months, customer_id, the_best_username, the_best_password, the_best_base_url } = await req.json();

    if (!username) {
      return new Response(
        JSON.stringify({ error: 'Username é obrigatório' }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const renewMonths = months || 1;
    console.log(`[TheBest] Renovando usuário: ${username}, meses: ${renewMonths}`);

    // Determine credentials: passed directly (from webhook) or from reseller settings or global
    let tbUsername = the_best_username || '';
    let tbPassword = the_best_password || '';
    let tbBaseUrl = (the_best_base_url || '').replace(/\/+$/, '') || DEFAULT_BASE_URL;

    // If not passed, try to load from reseller settings
    if (!tbUsername && customer_id) {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (serviceRoleKey) {
        const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Get customer owner
        const { data: customerData } = await supabaseAdmin
          .from('customers')
          .select('created_by')
          .eq('id', customer_id)
          .maybeSingle();

        const ownerId = customerData?.created_by || callerUserId;
        if (ownerId) {
          const { data: apiSettings } = await supabaseAdmin
            .from('reseller_api_settings')
            .select('the_best_username, the_best_password, the_best_base_url')
            .eq('user_id', ownerId)
            .maybeSingle();

          if (apiSettings?.the_best_username && apiSettings?.the_best_password) {
            tbUsername = apiSettings.the_best_username;
            tbPassword = apiSettings.the_best_password;
            tbBaseUrl = (apiSettings.the_best_base_url || '').replace(/\/+$/, '') || DEFAULT_BASE_URL;
            console.log('[TheBest] Usando credenciais do revendedor');
          }
        }
      }
    }

    if (!tbUsername || !tbPassword) {
      return new Response(
        JSON.stringify({ error: 'Credenciais do The Best não configuradas. Configure usuário e senha nas configurações.' }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Step 1: Login to get JWT token
    console.log(`[TheBest] Fazendo login como: ${tbUsername}`);
    const token = await getTheBestToken(tbBaseUrl, tbUsername, tbPassword);
    console.log(`[TheBest] Token obtido com sucesso`);

    // Step 2: Search for the user by username
    const searchUrl = `${tbBaseUrl}/lines/?search=${encodeURIComponent(username.trim())}&per_page=10`;
    console.log(`[TheBest] Buscando usuário: ${searchUrl}`);

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error(`[TheBest] Erro na busca: ${searchResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Erro ao buscar usuário na API The Best: ${searchResponse.status}` }),
        { status: searchResponse.status, headers: jsonHeaders },
      );
    }

    const searchData = await searchResponse.json();
    const results = searchData.results || searchData.data || searchData;
    const lines = Array.isArray(results) ? results : [];

    const normalizedUsername = username.trim().toLowerCase();
    const matchedLine = lines.find((line: any) =>
      String(line.username || '').trim().toLowerCase() === normalizedUsername
    );

    if (!matchedLine) {
      console.log(`[TheBest] Usuário não encontrado: ${username}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Usuário "${username}" não encontrado na API The Best`,
          searched: lines.map((l: any) => l.username),
        }),
        { headers: jsonHeaders },
      );
    }

    const lineId = matchedLine.id;
    console.log(`[TheBest] Usuário encontrado: id=${lineId}, username=${matchedLine.username}`);

    // Step 3: Renew the user
    const renewUrl = `${tbBaseUrl}/lines/${lineId}/renew/`;
    console.log(`[TheBest] Renovando: ${renewUrl} com ${renewMonths} meses`);

    const renewResponse = await fetch(renewUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ months: renewMonths }),
    });

    if (!renewResponse.ok) {
      const errorText = await renewResponse.text();
      console.error(`[TheBest] Erro na renovação: ${renewResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Erro ao renovar na API The Best: ${renewResponse.status} - ${errorText}` }),
        { status: renewResponse.status, headers: jsonHeaders },
      );
    }

    const renewData = await renewResponse.json();
    console.log(`[TheBest] Renovação bem sucedida:`, JSON.stringify(renewData));

    // Credit deduction (if applicable)
    if (customer_id) {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (serviceRoleKey) {
        const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: customerData } = await supabaseAdmin
          .from('customers')
          .select('id, created_by, plan_id')
          .eq('id', customer_id)
          .maybeSingle();

        if (customerData?.created_by) {
          let creditsToDeduct = renewMonths;
          const { data: ownerAccess } = await supabaseAdmin
            .from('reseller_access')
            .select('id, credits')
            .eq('user_id', customerData.created_by)
            .maybeSingle();

          if (ownerAccess && (ownerAccess.credits ?? 0) >= creditsToDeduct) {
            const newCredits = ownerAccess.credits - creditsToDeduct;
            await supabaseAdmin
              .from('reseller_access')
              .update({ credits: newCredits })
              .eq('id', ownerAccess.id);
            console.log(`[TheBest] ${creditsToDeduct} crédito(s) descontado(s). Saldo: ${newCredits}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${username} renovado por ${renewMonths} mês(es) na The Best`,
        line_id: lineId,
        renew_data: renewData,
      }),
      { headers: jsonHeaders },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[TheBest] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar na The Best: ${errorMessage}` }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
