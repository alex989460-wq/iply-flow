import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const natvApiKey = Deno.env.get('NATV_API_KEY');
    const natvBaseUrl = (Deno.env.get('NATV_BASE_URL') || '').replace(/\/+$/, '');

    if (!natvApiKey || !natvBaseUrl) {
      return new Response(
        JSON.stringify({ error: 'NATV_API_KEY ou NATV_BASE_URL não configurados' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { username, months, duration_days, customer_id } = await req.json();

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

    console.log(`[NATV] Renovando usuário: ${username}, meses: ${finalMonths}`);

    const natvResp = await fetch(`${natvBaseUrl}/user/activation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${natvApiKey}`,
      },
      body: JSON.stringify({ username: username.trim(), months: finalMonths }),
    });

    const natvText = await natvResp.text();
    let result: any;
    try { result = JSON.parse(natvText); } catch { result = { raw: natvText }; }

    console.log(`[NATV] Resposta: status=${natvResp.status}`, JSON.stringify(result));

    if (!natvResp.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Erro NATV: ${natvResp.status}`, result }),
        { status: natvResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
            console.log(`[NATV] ${finalMonths} crédito(s) descontado(s). Saldo: ${newCredits}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${username} renovado por ${finalMonths} mês(es) no NATV`,
        result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[NATV] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar no NATV: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
