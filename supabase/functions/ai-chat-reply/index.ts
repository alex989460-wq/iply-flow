import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, message, userId, customerId, provider = 'gemini' } = await req.json();
    
    const supaUrl = Deno.env.get("SUPABASE_URL") || "";
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supaUrl, svc);

    // 1. Busca conhecimento aprovado do usuário
    const { data: knowledge } = await supabase
      .from('ai_knowledge_items')
      .select('subject, solution, kind')
      .eq('user_id', userId)
      .eq('status', 'approved');

    if (!knowledge || knowledge.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No knowledge base found' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const kbText = knowledge.map(k => `Tópico: ${k.subject}\nSolução: ${k.solution}`).join('\n\n');

    // 2. Busca chave da IA
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('ai_api_key, ai_provider')
      .eq('user_id', userId)
      .maybeSingle();

    const apiKey = settings?.ai_api_key || Deno.env.get("LOVABLE_AI_GATEWAY_KEY");
    const selectedProvider = settings?.ai_provider || provider;

    // 3. Chama a IA via Gateway
    const prompt = `Você é um assistente de atendimento IPTV/Streaming. 
Use a base de conhecimento abaixo para responder ao cliente de forma curta, prestativa e profissional.
Se não souber a resposta na base, peça para ele aguardar um atendente humano.

Base de Conhecimento:
${kbText}

Mensagem do Cliente: ${message}

Resposta:`;

    const aiRes = await fetch("https://api.lovable.app/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_AI_GATEWAY_KEY")}`,
      },
      body: JSON.stringify({
        model: selectedProvider === 'gemini' ? "gemini-1.5-pro" : "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiData = await aiRes.json();
    const answer = aiData.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua resposta. Um atendente humano irá te ajudar em breve.";

    return new Response(JSON.stringify({ success: true, answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
