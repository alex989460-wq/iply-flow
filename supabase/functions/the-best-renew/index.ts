import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_BASE_URL = 'https://api.painel.best';

function authHeaders(token: string | null, apiKey: string | null): Record<string, string> {
  if (apiKey) return { 'Api-Key': apiKey, 'Accept': 'application/json' };
  return { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
}

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

function buildUsernameVariants(rawUsername: string): string[] {
  const base = String(rawUsername || '').trim();
  const variants = new Set<string>();
  if (!base) return [];

  variants.add(base);

  const digits = base.replace(/\D/g, '');
  if (digits) {
    variants.add(digits);
    if (digits.startsWith('55') && digits.length >= 12) {
      const withoutCountry = digits.slice(2);
      variants.add(withoutCountry);
      if (withoutCountry.length === 11 && withoutCountry[2] === '9') {
        variants.add(withoutCountry.slice(0, 2) + withoutCountry.slice(3));
        variants.add('55' + withoutCountry.slice(0, 2) + withoutCountry.slice(3));
      } else if (withoutCountry.length === 10) {
        variants.add(withoutCountry.slice(0, 2) + '9' + withoutCountry.slice(2));
        variants.add('55' + withoutCountry.slice(0, 2) + '9' + withoutCountry.slice(2));
      }
    } else if (digits.length >= 10) {
      variants.add('55' + digits);
    }
  }

  return [...variants].filter(Boolean);
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

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: jsonHeaders,
        });
      }
      callerUserId = user.id;
    } else {
      console.log('[TheBest] Chamada interna autorizada pelo webhook da Cakto');
    }

    const { action, username, months, customer_id, the_best_username, the_best_password, the_best_base_url, the_best_api_key } = await req.json();

    const isTest = action === 'test';

    if (!isTest && !username) {
      return new Response(
        JSON.stringify({ error: 'Username é obrigatório' }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const renewMonths = months || 1;
    if (!isTest) console.log(`[TheBest] Renovando usuário: ${username}, meses: ${renewMonths}`);

    // Determine credentials: passed directly (from webhook) or from reseller settings or global
    let tbUsername = the_best_username || '';
    let tbPassword = the_best_password || '';
    let tbApiKey = the_best_api_key || '';
    let tbBaseUrl = (the_best_base_url || '').replace(/\/+$/, '') || DEFAULT_BASE_URL;

    // If not passed, try to load from reseller settings (dono do cliente ou o próprio chamador)
    if (!tbUsername && !tbApiKey && (customer_id || callerUserId)) {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (serviceRoleKey) {
        const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        let ownerId: string | null = callerUserId;
        if (customer_id) {
          const { data: customerData } = await supabaseAdmin
            .from('customers')
            .select('created_by')
            .eq('id', customer_id)
            .maybeSingle();
          ownerId = customerData?.created_by || callerUserId;
        }

        if (ownerId) {
          const candidates = [ownerId, callerUserId].filter(
            (v, i, arr): v is string => !!v && arr.indexOf(v) === i,
          );
          for (const uid of candidates) {
            const { data: apiSettings } = await supabaseAdmin
              .from('reseller_api_settings')
              .select('the_best_username, the_best_password, the_best_base_url, the_best_api_key')
              .eq('user_id', uid)
              .maybeSingle();

            if (apiSettings?.the_best_api_key || (apiSettings?.the_best_username && apiSettings?.the_best_password)) {
              tbApiKey = apiSettings.the_best_api_key || '';
              tbUsername = apiSettings.the_best_username || '';
              tbPassword = apiSettings.the_best_password || '';
              tbBaseUrl = (apiSettings.the_best_base_url || '').replace(/\/+$/, '') || DEFAULT_BASE_URL;
              console.log('[TheBest] Usando credenciais do revendedor');
              break;
            }
          }
        }
      }
    }

    if (!tbApiKey && (!tbUsername || !tbPassword)) {
      return new Response(
        JSON.stringify({ error: 'Credenciais do The Best não configuradas. Informe a Chave de API (Api-Key) ou usuário e senha nas configurações.' }),
        { status: 400, headers: jsonHeaders },
      );
    }

    if (isTest) {
      try {
        if (tbApiKey) {
          const r = await fetch(`${tbBaseUrl}/user/`, { headers: authHeaders(null, tbApiKey) });
          const body = await r.text();
          if (r.ok) {
            let who = '';
            try { who = JSON.parse(body)?.username || ''; } catch { /* ignore */ }
            return new Response(
              JSON.stringify({ success: true, message: `Chave de API válida${who ? ` (${who})` : ''}` }),
              { headers: jsonHeaders },
            );
          }
          if (!(tbUsername && tbPassword)) {
            throw new Error(`Chave de API rejeitada (${r.status}): ${body.slice(0, 200)}`);
          }
          console.log('[TheBest] Chave rejeitada, tentando login com usuário/senha');
        }
        await getTheBestToken(tbBaseUrl, tbUsername, tbPassword);
        return new Response(
          JSON.stringify({ success: true, message: `Login OK como ${tbUsername}${tbApiKey ? ' (chave de API inválida, usando usuário/senha)' : ''}` }),
          { headers: jsonHeaders },
        );
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: e?.message || 'Falha no login do painel The Best' }),
          { status: 200, headers: jsonHeaders },
        );
      }
    }


    // Step 1: authenticate (Api-Key header when available, otherwise JWT login)
    let token: string | null = null;
    if (tbApiKey) {
      // Valida a chave; se rejeitada e houver usuário/senha, cai para login JWT
      try {
        const probe = await fetch(`${tbBaseUrl}/user/`, { headers: authHeaders(null, tbApiKey) });
        if (!probe.ok && tbUsername && tbPassword) {
          console.log(`[TheBest] Chave de API rejeitada (${probe.status}); usando login usuário/senha`);
          tbApiKey = '';
          token = await getTheBestToken(tbBaseUrl, tbUsername, tbPassword);
        } else {
          console.log('[TheBest] Usando Chave de API (header Api-Key)');
        }
      } catch (_e) {
        if (tbUsername && tbPassword) {
          tbApiKey = '';
          token = await getTheBestToken(tbBaseUrl, tbUsername, tbPassword);
        }
      }
    } else {
      console.log(`[TheBest] Fazendo login como: ${tbUsername}`);
      token = await getTheBestToken(tbBaseUrl, tbUsername, tbPassword);
      console.log(`[TheBest] Token obtido com sucesso`);
    }

    // Step 2: Search for the user by username (with fallback variants)
    const usernameCandidates = buildUsernameVariants(username);
    const normalizedOriginal = username.trim().toLowerCase();
    let matchedLine: any = null;
    let usedSearchTerm = username.trim();
    let lastSearchErrorStatus = 0;
    let lastSearchErrorText = '';
    let lastSearchedUsernames: string[] = [];

    for (const candidate of usernameCandidates) {
      const searchUrl = `${tbBaseUrl}/lines/?search=${encodeURIComponent(candidate)}&per_page=10`;
      console.log(`[TheBest] Buscando usuário com termo: ${candidate}`);

      const searchResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: authHeaders(token, tbApiKey),
      });

      if (!searchResponse.ok) {
        lastSearchErrorStatus = searchResponse.status;
        lastSearchErrorText = await searchResponse.text();
        console.error(`[TheBest] Erro na busca (${candidate}): ${searchResponse.status} - ${lastSearchErrorText}`);
        continue;
      }

      const searchData = await searchResponse.json();
      const results = searchData.results || searchData.data || searchData;
      const lines = Array.isArray(results) ? results : [];
      lastSearchedUsernames = lines.map((l: any) => String(l.username || '').trim());

      const normalizedCandidate = candidate.trim().toLowerCase();
      matchedLine = lines.find((line: any) => {
        const lineUsername = String(line.username || '').trim().toLowerCase();
        return lineUsername === normalizedCandidate || lineUsername === normalizedOriginal;
      });

      if (matchedLine) {
        usedSearchTerm = candidate;
        break;
      }
    }

    if (!matchedLine && lastSearchErrorStatus >= 400 && lastSearchErrorStatus !== 404 && lastSearchedUsernames.length === 0) {
      return new Response(
        JSON.stringify({ error: `Erro ao buscar usuário na API The Best: ${lastSearchErrorStatus} - ${lastSearchErrorText}` }),
        { status: lastSearchErrorStatus, headers: jsonHeaders },
      );
    }

    if (!matchedLine) {
      console.log(`[TheBest] Usuário não encontrado: ${username}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Usuário "${username}" não encontrado na API The Best`,
          searched: lastSearchedUsernames,
          tried: usernameCandidates,
        }),
        { headers: jsonHeaders },
      );
    }

    const lineId = matchedLine.id;
    console.log(`[TheBest] Usuário encontrado: id=${lineId}, username=${matchedLine.username}, termo=${usedSearchTerm}`);

    // Step 3: Renew the user
    const renewUrl = `${tbBaseUrl}/lines/${lineId}/renew/`;
    console.log(`[TheBest] Renovando: ${renewUrl} com ${renewMonths} meses`);

    const renewResponse = await fetch(renewUrl, {
      method: 'POST',
      headers: { ...authHeaders(token, tbApiKey), 'Content-Type': 'application/json' },
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
          .select('id, created_by, plan_id, screens')
          .eq('id', customer_id)
          .maybeSingle();

        if (customerData?.created_by) {
          const extraScreens = Math.max(0, (Number(customerData?.screens) || 1) - 1);
          let creditsToDeduct = renewMonths + extraScreens * 0.5 * renewMonths;

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
