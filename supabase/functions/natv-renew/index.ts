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

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { username, months, duration_days, customer_id, panel } = await req.json();
    const isNatv2 = panel === 'natv2';
    const panelLabel = isNatv2 ? 'NATV2' : 'NATV';
    const DEFAULT_NATV_BASE = 'https://revenda.pixbot.link/api';

    // Credenciais candidatas: painel preferido do revendedor -> outro painel NATV do revendedor -> globais
    const credentials: Array<{ label: string; apiKey: string; baseUrl: string }> = [];
    const pushCred = (label: string, apiKey?: string | null, baseUrl?: string | null) => {
      const key = String(apiKey || '').trim();
      if (!key) return;
      const base = normalizeBaseUrl(String(baseUrl || '').trim() || DEFAULT_NATV_BASE);
      if (credentials.some((c) => c.apiKey === key && c.baseUrl === base)) return;
      credentials.push({ label, apiKey: key, baseUrl: base });
    };

    let resellerHasCredentials = false;
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

        if (isNatv2) {
          pushCred('revendedor NATV2', resellerSettings?.natv2_api_key, resellerSettings?.natv2_base_url);
          pushCred('revendedor NATV', resellerSettings?.natv_api_key, resellerSettings?.natv_base_url);
        } else {
          pushCred('revendedor NATV', resellerSettings?.natv_api_key, resellerSettings?.natv_base_url);
          pushCred('revendedor NATV2', resellerSettings?.natv2_api_key, resellerSettings?.natv2_base_url);
        }
        resellerHasCredentials = credentials.length > 0;
      }
    }

    pushCred('global NATV', Deno.env.get(isNatv2 ? 'NATV2_API_KEY' : 'NATV_API_KEY'), Deno.env.get(isNatv2 ? 'NATV2_BASE_URL' : 'NATV_BASE_URL'));
    pushCred('global NATV alt', Deno.env.get(isNatv2 ? 'NATV_API_KEY' : 'NATV2_API_KEY'), Deno.env.get(isNatv2 ? 'NATV_BASE_URL' : 'NATV2_BASE_URL'));

    if (credentials.length === 0) {
      return new Response(
        JSON.stringify({
          error: `Chave do painel ${panelLabel} não cadastrada. Acesse Configurações > APIs e informe a chave e o endereço (ex.: ${DEFAULT_NATV_BASE}).`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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

    console.log(`[${panelLabel}] Renovando usuário: ${username}, meses: ${finalMonths}, credenciais: ${credentials.map((c) => c.label).join(' -> ')}`);

    let natvResult = await callNatvActivation(credentials[0].baseUrl, credentials[0].apiKey, username.trim(), finalMonths);
    let usedCredential = credentials[0].label;
    for (let i = 1; i < credentials.length && !natvResult.success; i++) {
      console.log(`[${panelLabel}] Falhou com ${usedCredential} (status ${natvResult.status}); tentando ${credentials[i].label}`);
      natvResult = await callNatvActivation(credentials[i].baseUrl, credentials[i].apiKey, username.trim(), finalMonths);
      usedCredential = credentials[i].label;
    }
    if (natvResult.success) console.log(`[${panelLabel}] Renovado com credencial: ${usedCredential}`);
    console.log(
      `[${panelLabel}] Resposta final: status=${natvResult.status}, endpoint=${natvResult.endpoint}, username=${natvResult.username}`,
      JSON.stringify(natvResult.result),
    );

    if (!natvResult.success) {
      const notFound = shouldTryNextNatvAttempt(natvResult.status, natvResult.result);
      const hint = notFound
        ? (resellerHasCredentials
          ? `Usuário "${username}" não existe no painel ${panelLabel} desta revenda. Confirme o usuário ou a chave cadastrada em Configurações > APIs.`
          : `Chave do painel ${panelLabel} não cadastrada nesta revenda — a renovação tentou o painel padrão e o usuário "${username}" não existe nele. Cadastre a chave em Configurações > APIs.`)
        : null;
      return new Response(
        JSON.stringify({
          success: false,
          error: hint || `Erro ${panelLabel}: ${natvResult.status}`,
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
          .select('id, created_by, screens')
          .eq('id', customer_id)
          .maybeSingle();

        if (customerData?.created_by) {
          const extraScreens = Math.max(0, (Number(customerData?.screens) || 1) - 1);
          const creditsToDeduct = finalMonths + extraScreens * 0.5 * finalMonths;
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
            console.log(`[${panelLabel}] ${creditsToDeduct} crédito(s) descontado(s). Saldo: ${newCredits}`);
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
