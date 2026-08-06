
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPTS = {
  GATHER_CONTEXT: `
Você é o Motor de Conformidade Meta (Core da IA) do SuperGestor.
Sua funcionalidade é auditar mensagens e garantir que templates sejam aprovados como UTILITY.
Você deve atuar como um especialista certificado em WhatsApp Business Platform.

ORDEM DE AUDITORIA:
1. Identificar intenção (Utility, Marketing, Authentication, Ambígua).
2. Identificar incentivos comerciais (ofertas, descontos, bônus, CTA promocional, urgência, etc).
3. Verificar evento legítimo Utility (Conta criada, renovação, pagamento, suporte, etc).
4. Analisar contexto (Relacionamento prévio, evento transacional real).

SAÍDA ESPERADA (JSON):
{
  "business_purpose": "Resumo",
  "trigger_event": "Evento gatilho detectado",
  "base_name": "nome_em_snake_case",
  "body": "Corpo com {{n}}",
  "variables": { "1": "nome", "2": "valor" },
  "audit": {
    "intent": "Utility | Marketing | Authentication | Ambígua",
    "intent_reason": "Por que?",
    "commercial_incentives": ["lista de incentivos encontrados ou []"],
    "legitimate_event": "evento detectado ou null",
    "context": {
      "previous_relationship": boolean,
      "real_transactional_event": boolean,
      "depends_on_previous_event": boolean,
      "only_commercial_intent": boolean
    }
  },
  "utility_risk": "low | medium | high",
  "utility_risk_reason": "Explicação técnica",
  "approval_chance": "Muito Alta | Alta | Média | Baixa | Muito Baixa",
  "report": {
    "category_detected": "Marketing | Utility",
    "reason": "Motivo principal",
    "risk_level_percent": 0-100,
    "motivos_falha": ["motivo 1", "motivo 2"]
  }
}
`,

  REDRAFT: `
Você é o Reescritor de Templates UTILITY do SuperGestor.
Gere 3 versões de reescrita: Conservadora, Balanceada e Utility Máxima.
NÃO troque apenas palavras; altere a estrutura para conformidade Utility se houver contexto legítimo.
Se for impossível converter sem mudar a finalidade (ex: promoção pura), informe no fundamental_mismatch.

NÍVEL DE RIGOR: __LEVEL__
CONTEXTO: __CONTEXT_BLOCK__
HISTÓRICO: __ATTEMPTS_BLOCK__

SAÍDA ESPERADA (JSON):
{
  "options": [
    { "type": "Conservadora", "body": "...", "change_summary": "...", "score": 0-100 },
    { "type": "Balanceada", "body": "...", "change_summary": "...", "score": 0-100 },
    { "type": "Utility Máxima", "body": "...", "change_summary": "...", "score": 0-100 }
  ],
  "explanation": "Explicação detalhada dos trechos de risco e alterações realizadas",
  "fundamental_mismatch": boolean
}
`
};

const LINT_RULES = [
  { regex: /grátis|free|presente|gift|cupom|coupon/i, message: "Remova palavras promocionais como 'grátis' ou 'cupom'." },
  { regex: /oferta|desconto|discount|promo/i, message: "Remova referências a ofertas ou descontos." },
  { regex: /imperdível|exclusivo|especial|aproveite/i, message: "Evite adjetivos de marketing como 'imperdível' ou 'aproveite'." },
  { regex: /sentimos|falta|volte|miss/i, message: "Evite mensagens de re-engajamento ('sentimos sua falta')." },
  { regex: /novidade|chegou|conheça/i, message: "Anúncios de novos produtos costumam ser marketing." },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL") || "";
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supaUrl, svc);

    const { action, message, userId, sessionId, attemptNo, context, history, exemplars, body } = await req.json();

    // 1. LINTING
    if (action === "lint") {
      const issues = LINT_RULES.filter(r => r.regex.test(body)).map(r => r.message);
      return new Response(JSON.stringify({ success: true, issues }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AI OPERATIONS
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supaUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    
    if (!user) throw new Error("Não autorizado");

    const { data: settings } = await supabase
      .from('platform_settings')
      .select('ai_api_key, ai_provider')
      .eq('user_id', user.id)
      .maybeSingle();

    const providerKey = settings?.ai_api_key;
    const provider = settings?.ai_provider || 'gemini';

    if (action === "intake") {
      const prompt = `${PROMPTS.GATHER_CONTEXT}\n\nMENSAGEM DO USUÁRIO: "${message}"`;
      
      const aiRes = await fetch("https://api.lovable.app/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("LOVABLE_AI_GATEWAY_KEY")}`,
          ...(providerKey ? { "X-Lovable-AI-Provider-Key": providerKey } : {}),
        },
        body: JSON.stringify({
          model: provider === 'gemini' ? "gemini-1.5-pro" : "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });

      const aiData = await aiRes.json();
      const result = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");

      return new Response(JSON.stringify({ success: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "redraft") {
      const level = Math.min(5, (attemptNo || 1) + 1);
      let prompt = PROMPTS.REDRAFT
        .replace("__LEVEL__", level.toString())
        .replace("__CONTEXT_BLOCK__", JSON.stringify(context, null, 2))
        .replace("__ATTEMPTS_BLOCK__", JSON.stringify(history, null, 2))
        .replace("__EXEMPLARS_BLOCK__", (exemplars || []).join("\n\n"));

      const aiRes = await fetch("https://api.lovable.app/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("LOVABLE_AI_GATEWAY_KEY")}`,
          ...(providerKey ? { "X-Lovable-AI-Provider-Key": providerKey } : {}),
        },
        body: JSON.stringify({
          model: provider === 'gemini' ? "gemini-1.5-pro" : "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });

      const aiData = await aiRes.json();
      const result = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");

      return new Response(JSON.stringify({ success: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error('Edge Function Error:', error);
    let message = "Erro interno no servidor";
    if (error.message?.includes("ai_api_key")) message = "Chave de API da IA não configurada";
    if (error.message?.includes("not found")) message = "Recurso não encontrado no banco de dados";
    
    return new Response(JSON.stringify({ success: false, error: message, details: error.message }), { status: 500, headers: corsHeaders });
  }
});
