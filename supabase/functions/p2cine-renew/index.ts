import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cakto-webhook-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    return new Response(JSON.stringify({
      success: false,
      blocked: true,
      error: 'Renovação automática P2Cine desativada para não desconectar a sessão aberta no navegador.',
      reason: 'p2cine_cookie_reuse_invalidates_browser_session',
    }), { status: 409, headers: jsonHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[P2Cine] Erro:', err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
