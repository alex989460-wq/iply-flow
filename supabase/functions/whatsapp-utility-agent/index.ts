
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPTS = {
  GATHER_CONTEXT: `
Você é um especialista em extrair contexto estruturado de uma descrição livre de um template de WhatsApp que será enviado para aprovação da Meta.
O objetivo é garantir que o template seja aprovado na categoria **UTILITY** (Utilidade) e não seja recategorizado para MARKETING.

INFORMAÇÕES NECESSÁRIAS:
- Propósito do negócio: o que a empresa faz.
- Evento gatilho: qual ação específica do usuário causa o envio dessa mensagem (ex: "cliente concluiu cadastro", "pedido realizado", "pagamento recebido"). Este é o fator #1 para a Meta.
- Destinatário: quem recebe (cliente existente, novo lead, etc).
- Corpo da mensagem: o texto exato com {{1}}, {{2}}...
- Variáveis: o significado de cada {{n}}.

REGRAS DE UTILIDADE DA META:
QUALIFICA como UTILITY: Confirmação de pedido, recibo de pagamento, atualização de status de conta, OTP, atualização de envio, confirmação de ativação/renovação para assinantes existentes, status de transação, documento pronto, status de KYC.

NÃO QUALIFICA (é MARKETING): Convites para eventos, lembretes de webinars, promoções, ofertas, descontos, brindes, re-engajamento ("sentimos sua falta"), conteúdo educativo ou marketing de conteúdo, venda cruzada.

SAÍDA ESPERADA (JSON):
{
  "business_purpose": "Resumo em uma frase",
  "trigger_event": "Ação concreta do usuário ou MISSING",
  "base_name": "nome_do_template_em_snake_case",
  "body": "Corpo completo com {{n}}",
  "variables": { "1": "significado", "2": "significado" },
  "utility_risk": "low | medium | high",
  "utility_risk_reason": "Explicação curta",
  "clarifications": ["Pergunta 1", "Pergunta 2"]
}
`,

  REDRAFT: `
Você é um gerador de reescritas para um agente de aprovação de templates UTILITY do WhatsApp.
A tentativa anterior falhou (REJEITADO ou RECATEGORIZADO para MARKETING).
Gere 3 opções de reescrita no nível de rigor __LEVEL__.

NÍVEIS DE RIGOR:
Nível 2: Limpeza óbvia. Remova palavras como "grátis", "cupom", "oferta", "desconto", "bônus", "imperdível", "exclusivo". Mantenha o tom e estrutura.
Nível 3: Remoção de formatação e enchimento. Remova negritos/itálicos/emojis. Remova adjetivos não factuais ("sucesso", "rápido", "fácil"). Remova frases de cortesia excessiva.
Nível 4: Essencial transacional. Responda apenas "O que aconteceu com meu <item>?". Máximo 2 frases. Sem saudações ou encerramentos.
Nível 5: Apenas o fato bruto. Uma frase. Tom robótico e factual. Priorize passar sobre soar bem.

CONTEXTO:
__CONTEXT_BLOCK__

HISTÓRICO DE TENTATIVAS:
__ATTEMPTS_BLOCK__

EXEMPLARES APROVADOS (Use como referência de tom, não copie):
__EXEMPLARS_BLOCK__

RESULTADO DA ÚLTIMA FALHA:
- Status: __STATUS__
- Categoria retornada: __CATEGORY__
- Motivo: __REJECTED_REASON__

SAÍDA ESPERADA (JSON):
{
  "options": [
    { "body": "...", "change_summary": "O que mudou e por que ajuda a aprovar" },
    { "body": "...", "change_summary": "..." },
    { "body": "...", "change_summary": "..." }
  ],
  "fundamental_mismatch": false
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
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});
