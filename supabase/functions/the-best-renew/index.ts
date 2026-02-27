import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const THE_BEST_API_URL = 'https://api.painel.best';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const internalSecret = req.headers.get('x-cakto-webhook-secret');
    const configuredWebhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET');
    const isInternalWebhookCall =
      !!configuredWebhookSecret && internalSecret === configuredWebhookSecret;

    if (!isInternalWebhookCall) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log('[TheBest] Chamada interna autorizada pelo webhook da Cakto');
    }

    const apiKey = Deno.env.get('THE_BEST_API_KEY')?.trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'THE_BEST_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const fetchWithAuthFallback = async (url: string, method: 'GET' | 'POST', body?: string): Promise<Response> => {
      const authVariants: Array<Record<string, string>> = [
        { 'Api-Key': apiKey },
        { 'X-API-Key': apiKey },
        { 'Authorization': `Token ${apiKey}` },
        { 'Authorization': `Bearer ${apiKey}` },
      ];

      let lastResponse: Response | null = null;

      for (const authHeaders of authVariants) {
        const headers: Record<string, string> = {
          ...authHeaders,
          'Accept': 'application/json',
        };

        if (body) {
          headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
          method,
          headers,
          ...(body ? { body } : {}),
        });

        if (response.ok || response.status !== 401) {
          return response;
        }

        console.warn(
          `[TheBest] Auth variant falhou (${Object.keys(authHeaders)[0]}): ${await response.clone().text()}`,
        );
        lastResponse = response;
      }

      return lastResponse ?? new Response(JSON.stringify({ error: 'Falha de autenticação na API The Best' }), {
        status: 401,
      });
    };

    const { username, months, customer_id } = await req.json();

    if (!username) {
      return new Response(
        JSON.stringify({ error: 'Username é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const renewMonths = months || 1;
    console.log(`[TheBest] Renovando usuário: ${username}, meses: ${renewMonths}`);

    // Step 1: Search for the user by username to get the line ID
    const searchUrl = `${THE_BEST_API_URL}/lines/?search=${encodeURIComponent(username.trim())}&per_page=10`;
    console.log(`[TheBest] Buscando usuário: ${searchUrl}`);

    const searchResponse = await fetchWithAuthFallback(searchUrl, 'GET');

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error(`[TheBest] Erro na busca: ${searchResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Erro ao buscar usuário na API The Best: ${searchResponse.status}` }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const searchData = await searchResponse.json();
    const results = searchData.results || searchData.data || searchData;
    const lines = Array.isArray(results) ? results : [];

    // Find exact match by username
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const lineId = matchedLine.id;
    console.log(`[TheBest] Usuário encontrado: id=${lineId}, username=${matchedLine.username}`);

    // Step 2: Renew the user
    const renewUrl = `${THE_BEST_API_URL}/lines/${lineId}/renew/`;
    console.log(`[TheBest] Renovando: ${renewUrl} com ${renewMonths} meses`);

    const renewResponse = await fetchWithAuthFallback(
      renewUrl,
      'POST',
      JSON.stringify({ months: renewMonths }),
    );

    if (!renewResponse.ok) {
      const errorText = await renewResponse.text();
      console.error(`[TheBest] Erro na renovação: ${renewResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Erro ao renovar na API The Best: ${renewResponse.status} - ${errorText}` }),
        { status: renewResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const renewData = await renewResponse.json();
    console.log(`[TheBest] Renovação bem sucedida:`, JSON.stringify(renewData));

    // Credit deduction in backend (if applicable)
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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[TheBest] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar na The Best: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
