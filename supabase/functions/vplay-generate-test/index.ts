import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vplayUrl, senderName, keyMessage } = await req.json();

    if (!vplayUrl) {
      console.error('[Vplay] Missing vplayUrl');
      return new Response(
        JSON.stringify({ error: 'URL Vplay não configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Vplay] Sending request to: ${vplayUrl}`);
    
    const payload = {
      senderName: senderName || 'Cliente',
      senderMessage: keyMessage || 'XCLOUD',
      messageDateTime: Date.now().toString(),
      isMessageFromGroup: 0,
      receiveMessageAppId: 'com.whatsapp',
      receiveMessagePattern: keyMessage || 'XCLOUD',
    };

    console.log('[Vplay] Payload:', JSON.stringify(payload));

    const response = await fetch(vplayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log(`[Vplay] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Vplay] Error response: ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Erro do servidor Vplay: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[Vplay] Response data:', JSON.stringify(data));

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro ao conectar com servidor Vplay';
    console.error('[Vplay] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
