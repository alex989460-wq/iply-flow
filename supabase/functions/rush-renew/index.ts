import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cakto-webhook-secret',
};

const DEFAULT_BASE_URL = 'https://api-new.painel.ai';

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
      console.log('[Rush] Chamada interna autorizada pelo webhook da Cakto');
    }

    const {
      username,
      months,
      customer_id,
      rush_username,
      rush_password,
      rush_token,
      rush_base_url,
      rush_type, // 'p2p' or 'iptv'
      type_user_id, // 1 for P2P Alt, 2 for P2P Original
      screens,
      action, // 'list' to list users for debugging
    } = await req.json();

    if (!username && action !== 'list') {
      return new Response(
        JSON.stringify({ error: 'Username é obrigatório' }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const renewMonths = months || 1;
    const requestedType = rush_type || '';
    console.log(`[Rush] Renovando usuário: ${username}, tipo solicitado: ${requestedType || 'auto'}, meses: ${renewMonths}`);

    // Determine credentials
    let rUsername = rush_username || '';
    let rPassword = rush_password || '';
    let rToken = rush_token || '';
    let rBaseUrl = (rush_base_url || '').replace(/\/+$/, '') || DEFAULT_BASE_URL;

    // If not passed, try to load from reseller settings
    if (!rUsername && customer_id) {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (serviceRoleKey) {
        const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: customerData } = await supabaseAdmin
          .from('customers')
          .select('created_by')
          .eq('id', customer_id)
          .maybeSingle();

        const ownerId = customerData?.created_by || callerUserId;
        if (ownerId) {
          const { data: apiSettings } = await supabaseAdmin
            .from('reseller_api_settings')
            .select('rush_username, rush_password, rush_token, rush_base_url')
            .eq('user_id', ownerId)
            .maybeSingle();

          if (apiSettings?.rush_username && apiSettings?.rush_password && apiSettings?.rush_token) {
            rUsername = apiSettings.rush_username;
            rPassword = apiSettings.rush_password;
            rToken = apiSettings.rush_token;
            rBaseUrl = (apiSettings.rush_base_url || '').replace(/\/+$/, '') || DEFAULT_BASE_URL;
            console.log('[Rush] Usando credenciais do revendedor');
          }
        }
      }
    }

    if (!rUsername || !rPassword || !rToken) {
      return new Response(
        JSON.stringify({ error: 'Credenciais do Rush não configuradas. Configure usuário, senha e token nas configurações.' }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const authParams = `username=${encodeURIComponent(rUsername)}&password=${encodeURIComponent(rPassword)}&token=${encodeURIComponent(rToken)}`;

    // Step 1: Find user's internal numeric ID via /list endpoint
    const userId = (username || '').trim();
    const typesToTry = requestedType ? [requestedType] : ['iptv', 'p2p'];
    console.log(`[Rush] Buscando ID interno para username: ${userId}, tipos a tentar: ${typesToTry.join(', ')}`);

    let internalId = '';
    let userType = '';
    for (const tryType of typesToTry) {
      // First try with search parameter to avoid pagination issues
      const searchUrl = `${rBaseUrl}/${tryType}/list?${authParams}&search=${encodeURIComponent(userId)}`;
      console.log(`[Rush] Buscando em ${tryType} com search=${userId}`);
      const listResp = await fetch(searchUrl, { headers: { 'Accept': 'application/json' } });

      if (listResp.ok) {
        const listData = await listResp.json();
        const items = listData.items || listData.data || (Array.isArray(listData) ? listData : []);
        console.log(`[Rush] ${tryType} retornou ${items.length} resultado(s) para busca "${userId}"`);
        const normalizedUsername = userId.toLowerCase();
        const matchedUser = items.find((u: any) => {
          const uName = String(u.username || '').trim().toLowerCase();
          return uName === normalizedUsername;
        });

        if (matchedUser) {
          internalId = String(matchedUser.id);
          userType = tryType;
          console.log(`[Rush] Usuário encontrado em ${tryType}: username=${matchedUser.username}, id=${internalId}`);
          break;
        } else {
          console.log(`[Rush] Username "${userId}" não encontrado em ${tryType} (${items.length} resultados)`);
        }
      } else {
        const errText = await listResp.text();
        console.error(`[Rush] Falha ao buscar ${tryType}: ${listResp.status} - ${errText}`);
      }
    }

    if (!internalId) {
      return new Response(
        JSON.stringify({ success: false, error: `Username "${userId}" não encontrado em nenhum tipo (${typesToTry.join(', ')})` }),
        { headers: jsonHeaders },
      );
    }

    // Step 2: Extend the user using internal numeric ID
    const extendUrl = `${rBaseUrl}/${userType}/extend/${internalId}/?${authParams}`;
    console.log(`[Rush] Renovando: ${extendUrl} com ${renewMonths} meses`);

    const extendBody: Record<string, unknown> = { month: renewMonths };
    if (userType === 'p2p') {
      extendBody.typeUserId = type_user_id || 2; // default P2P Original
    } else {
      extendBody.screen = screens || 1;
    }

    const renewResponse = await fetch(extendUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(extendBody),
    });

    if (!renewResponse.ok) {
      const errorText = await renewResponse.text();
      console.error(`[Rush] Erro na renovação: ${renewResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Erro ao renovar na API Rush: ${renewResponse.status} - ${errorText}` }),
        { status: renewResponse.status, headers: jsonHeaders },
      );
    }

    const renewData = await renewResponse.json();
    console.log(`[Rush] Renovação bem sucedida:`, JSON.stringify(renewData));

    // Credit deduction
    if (customer_id) {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (serviceRoleKey) {
        const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: customerData } = await supabaseAdmin
          .from('customers')
          .select('id, created_by')
          .eq('id', customer_id)
          .maybeSingle();

        if (customerData?.created_by) {
          const { data: ownerAccess } = await supabaseAdmin
            .from('reseller_access')
            .select('id, credits')
            .eq('user_id', customerData.created_by)
            .maybeSingle();

          if (ownerAccess && (ownerAccess.credits ?? 0) >= renewMonths) {
            const newCredits = ownerAccess.credits - renewMonths;
            await supabaseAdmin
              .from('reseller_access')
              .update({ credits: newCredits })
              .eq('id', ownerAccess.id);
            console.log(`[Rush] ${renewMonths} crédito(s) descontado(s). Saldo: ${newCredits}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${username} renovado por ${renewMonths} mês(es) na Rush (${userType})`,
        user_id: userId,
        renew_data: renewData,
      }),
      { headers: jsonHeaders },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[Rush] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar na Rush: ${errorMessage}` }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
