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

    const { username, duration_days, customer_id } = await req.json();

    if (!username) {
      return new Response(
        JSON.stringify({ error: 'Username é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const durationDays = duration_days || 30;

    // Get user_id from customer to find VPlay settings
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Configuração interna ausente' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let createdBy: string | null = null;
    if (customer_id) {
      const { data: customerData } = await supabaseAdmin
        .from('customers')
        .select('created_by')
        .eq('id', customer_id)
        .maybeSingle();
      createdBy = customerData?.created_by || null;
    }

    if (!createdBy) {
      return new Response(JSON.stringify({ error: 'Cliente não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find VPlay integration URL
    let vplayUrl = '';
    let keyMessage = 'XCLOUD';

    const { data: vplayServer } = await supabaseAdmin
      .from('vplay_servers')
      .select('integration_url, key_message')
      .eq('user_id', createdBy)
      .eq('is_default', true)
      .maybeSingle();

    if (vplayServer?.integration_url) {
      vplayUrl = vplayServer.integration_url.replace(/\/+$/, '');
      keyMessage = vplayServer.key_message || 'XCLOUD';
    } else {
      const { data: billingSettings } = await supabaseAdmin
        .from('billing_settings')
        .select('vplay_integration_url, vplay_key_message')
        .eq('user_id', createdBy)
        .maybeSingle();

      if (billingSettings?.vplay_integration_url) {
        vplayUrl = billingSettings.vplay_integration_url.replace(/\/+$/, '');
        keyMessage = billingSettings.vplay_key_message || 'XCLOUD';
      }
    }

    if (!vplayUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL de integração VPlay não configurada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[VPlay] Renovando usuário: ${username} por ${durationDays} dias, URL: ${vplayUrl}`);

    const vplayResp = await fetch(vplayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: keyMessage,
        action: 'renew',
        username: username.trim(),
        duration: durationDays,
      }),
    });

    const vplayText = await vplayResp.text();
    let result: any;
    try { result = JSON.parse(vplayText); } catch { result = { raw: vplayText }; }

    console.log(`[VPlay] Resposta: status=${vplayResp.status}`, JSON.stringify(result));

    if (!vplayResp.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Erro VPlay: ${vplayResp.status}`, result }),
        { status: vplayResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Credit deduction
    if (createdBy) {
      const months = Math.max(1, Math.round(durationDays / 30));
      const { data: ownerAccess } = await supabaseAdmin
        .from('reseller_access')
        .select('id, credits')
        .eq('user_id', createdBy)
        .maybeSingle();

      if (ownerAccess && (ownerAccess.credits ?? 0) >= months) {
        const newCredits = ownerAccess.credits - months;
        await supabaseAdmin
          .from('reseller_access')
          .update({ credits: newCredits })
          .eq('id', ownerAccess.id);
        console.log(`[VPlay] ${months} crédito(s) descontado(s). Saldo: ${newCredits}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuário ${username} renovado por ${durationDays} dias no VPlay`,
        result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[VPlay] Erro:', error);
    return new Response(
      JSON.stringify({ error: `Erro ao renovar no VPlay: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
