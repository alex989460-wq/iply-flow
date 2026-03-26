import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const normalizeBaseUrl = (rawUrl: string) => rawUrl.trim().replace(/\/+$/, '');

const buildUsernameVariants = (rawUsername: string): string[] => {
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
      if (digits.length === 11 && digits[2] === '9') {
        variants.add(digits.slice(0, 2) + digits.slice(3));
      } else if (digits.length === 10) {
        variants.add(digits.slice(0, 2) + '9' + digits.slice(2));
      }
    }
  }

  return [...variants].filter(Boolean);
};

const buildNatvEndpointCandidates = (baseUrl: string): string[] => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const bases = new Set<string>([normalizedBase]);

  if (normalizedBase.endsWith('/api')) {
    bases.add(normalizedBase.replace(/\/api$/, ''));
  } else {
    bases.add(`${normalizedBase}/api`);
  }

  const paths = ['/user/activation', '/users/activation'];
  const urls = new Set<string>();
  for (const b of bases) {
    const cleanBase = normalizeBaseUrl(b);
    for (const path of paths) {
      urls.add(`${cleanBase}${path}`);
    }
  }

  return [...urls];
};

const shouldTryNextNatvAttempt = (status: number, result: any) => {
  if (status === 404 || status === 405) return true;
  const detail = JSON.stringify(result || {}).toLowerCase();
  return (
    detail.includes('not found') ||
    detail.includes('não encontrado') ||
    detail.includes('nao encontrado') ||
    detail.includes('usuário não encontrado') ||
    detail.includes('usuario nao encontrado')
  );
};

async function callNatvActivation(baseUrl: string, apiKey: string, username: string, months: number) {
  const endpointCandidates = buildNatvEndpointCandidates(baseUrl);
  const usernameCandidates = buildUsernameVariants(username);

  const attempts: Array<{ endpoint: string; username: string; status: number; result: any }> = [];
  let lastFailure: { endpoint: string; username: string; status: number; result: any } | null = null;

  for (const endpoint of endpointCandidates) {
    for (const usernameCandidate of usernameCandidates) {
      try {
        const natvResp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ username: usernameCandidate, months }),
        });

        const natvText = await natvResp.text();
        let result: any;
        try { result = JSON.parse(natvText); } catch { result = { raw: natvText }; }

        const attempt = { endpoint, username: usernameCandidate, status: natvResp.status, result };
        attempts.push(attempt);

        if (natvResp.ok) {
          return { success: true, ...attempt, attempts };
        }

        lastFailure = attempt;
        if (!shouldTryNextNatvAttempt(natvResp.status, result)) {
          return { success: false, ...attempt, attempts };
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        const attempt = { endpoint, username: usernameCandidate, status: 500, result: { error: message } };
        attempts.push(attempt);
        lastFailure = attempt;
      }
    }
  }

  const fallback = lastFailure || {
    endpoint: endpointCandidates[0] || `${normalizeBaseUrl(baseUrl)}/user/activation`,
    username: usernameCandidates[0] || username,
    status: 500,
    result: { error: 'Falha em todas as tentativas de renovação NATV' },
  };

  return { success: false, ...fallback, attempts };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const internalSecret = req.headers.get('x-cakto-webhook-secret');
    const configuredWebhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET');
    const isInternalCall = !!configuredWebhookSecret && internalSecret === configuredWebhookSecret;

    if (!isInternalCall) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );

      const token = authHeader.replace('Bearer ', '');
      const { error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { username, months, duration_days, customer_id, panel } = await req.json();
    const isNatv2 = panel === 'natv2';

    // Try per-reseller settings first, then fall back to global env vars
    let natvApiKey = '';
    let natvBaseUrl = '';

    const serviceRoleKeyForLookup = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (serviceRoleKeyForLookup && customer_id) {
      const supabaseAdminLookup = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKeyForLookup, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: customerOwner } = await supabaseAdminLookup
        .from('customers')
        .select('created_by')
        .eq('id', customer_id)
        .maybeSingle();

      if (customerOwner?.created_by) {
        const { data: resellerSettings } = await supabaseAdminLookup
          .from('reseller_api_settings')
          .select('natv_api_key, natv_base_url, natv2_api_key, natv2_base_url')
          .eq('user_id', customerOwner.created_by)
          .maybeSingle();

        if (isNatv2 && resellerSettings?.natv2_api_key && resellerSettings?.natv2_base_url) {
          natvApiKey = resellerSettings.natv2_api_key;
          natvBaseUrl = normalizeBaseUrl(resellerSettings.natv2_base_url);
          console.log(`[NATV2] Usando chaves do revendedor`);
        } else if (!isNatv2 && resellerSettings?.natv_api_key && resellerSettings?.natv_base_url) {
          natvApiKey = resellerSettings.natv_api_key;
          natvBaseUrl = normalizeBaseUrl(resellerSettings.natv_base_url);
          console.log(`[NATV] Usando chaves do revendedor`);
        }
      }
    }

    // Fallback to global env vars
    if (!natvApiKey || !natvBaseUrl) {
      natvApiKey = Deno.env.get(isNatv2 ? 'NATV2_API_KEY' : 'NATV_API_KEY') || '';
      natvBaseUrl = normalizeBaseUrl(Deno.env.get(isNatv2 ? 'NATV2_BASE_URL' : 'NATV_BASE_URL') || '');
      if (natvApiKey && natvBaseUrl) {
        console.log(`[${isNatv2 ? 'NATV2' : 'NATV'}] Usando chaves globais (fallback)`);
      }
    }

    const panelLabel = isNatv2 ? 'NATV2' : 'NATV';

    if (!natvApiKey || !natvBaseUrl) {
      return new Response(
        JSON.stringify({ error: `${panelLabel}_API_KEY ou ${panelLabel}_BASE_URL não configurados` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!username) {
      return new Response(
        JSON.stringify({ error: 'Username é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Calculate months from duration_days if provided
    let renewMonths = months;
    if (!renewMonths && duration_days) {
      const daysToMonths: Record<number, number> = { 30: 1, 60: 2, 90: 3, 120: 4, 150: 5, 180: 6, 360: 12, 365: 12 };
      renewMonths = daysToMonths[duration_days] || Math.max(1, Math.round(duration_days / 30));
    }
    renewMonths = renewMonths || 1;

    // Validate months
    const validMonths = [1, 2, 3, 4, 5, 6, 12];
    const finalMonths = validMonths.includes(renewMonths) ? renewMonths : validMonths.reduce((prev, curr) =>
      Math.abs(curr - renewMonths) < Math.abs(prev - renewMonths) ? curr : prev
    );

    console.log(`[${panelLabel}] Renovando usuário: ${username}, meses: ${finalMonths}`);

    const natvResult = await callNatvActivation(natvBaseUrl, natvApiKey, username.trim(), finalMonths);
    console.log(
      `[${panelLabel}] Resposta final: status=${natvResult.status}, endpoint=${natvResult.endpoint}, username=${natvResult.username}`,
      JSON.stringify(natvResult.result),
    );

    if (!natvResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Erro ${panelLabel}: ${natvResult.status}`,
          result: natvResult.result,
          endpoint: natvResult.endpoint,
          username: natvResult.username,
          attempts: natvResult.attempts,
        }),
        { status: natvResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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

          if (ownerAccess && (ownerAccess.credits ?? 0) >= finalMonths) {
            const newCredits = ownerAccess.credits - finalMonths;
            await supabaseAdmin
              .from('reseller_access')
              .update({ credits: newCredits })
              .eq('id', ownerAccess.id);
            console.log(`[${panelLabel}] ${finalMonths} crédito(s) descontado(s). Saldo: ${newCredits}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${natvResult.username} renovado por ${finalMonths} mês(es) no ${panelLabel}`,
        result: natvResult.result,
        endpoint: natvResult.endpoint,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[NATV] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar no painel: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
