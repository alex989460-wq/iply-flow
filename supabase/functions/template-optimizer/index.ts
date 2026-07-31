// Otimizador de templates: recebe uma mensagem crua e devolve um template
// reescrito para ser aprovado como UTILITY (e não MARKETING) pela Meta.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `Você é especialista em aprovação de templates da WhatsApp Cloud API (Meta).
Sua tarefa: reescrever a mensagem do usuário como um template com ALTA chance de ser aprovado na categoria UTILITY.

Regras obrigatórias para UTILITY:
- A mensagem deve ser transacional: referente a um pedido, conta, assinatura, pagamento, vencimento, agendamento ou serviço JÁ contratado pelo cliente.
- PROIBIDO: linguagem promocional, ofertas, descontos, "aproveite", "promoção", "novidade", "assine agora", convites, cupons, emojis chamativos de venda, urgência comercial.
- Tom neutro, informativo e objetivo. Português do Brasil.
- Use variáveis nomeadas no formato {{nome_da_variavel}} (snake_case, minúsculas), por exemplo {{nome}}, {{vencimento}}, {{valor}}, {{plano}}.
- Máximo 1024 caracteres no corpo. Footer opcional e curto (máx 60 caracteres, sem promoção).
- Botões: apenas se fizerem sentido de forma transacional (URL de pagamento/2ª via, ou QUICK_REPLY de confirmação). Nunca botões promocionais.
- O nome do template deve ser snake_case, minúsculo, sem acentos, até 60 caracteres.

Responda SOMENTE com JSON válido, sem markdown, no formato:
{
  "name": "string",
  "category": "UTILITY",
  "language": "pt_BR",
  "body": "string com {{variaveis}}",
  "footer": "string ou vazio",
  "buttons": [{"type":"URL|QUICK_REPLY|PHONE_NUMBER","text":"string","url":"opcional","phone":"opcional"}],
  "variables": [{"name":"nome","example":"João"}],
  "risk": "LOW|MEDIUM|HIGH",
  "reasoning": "explicação curta em português do que foi alterado e por quê",
  "warnings": ["itens da mensagem original que seriam classificados como MARKETING"]
}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { message, hint } = await req.json();
    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'Mensagem obrigatória' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY não configurada');

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.5-flash',
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `Mensagem original:\n"""${message.slice(0, 3000)}"""\n${hint ? `Contexto adicional: ${String(hint).slice(0, 500)}` : ''}`,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`AI gateway falhou [${res.status}]: ${body}`);
      const msg = res.status === 429
        ? 'Limite de requisições atingido, tente novamente em instantes.'
        : res.status === 402
          ? 'Créditos de IA esgotados. Adicione créditos ao workspace.'
          : `Falha na IA (${res.status})`;
      return new Response(JSON.stringify({ error: msg, details: body }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    parsed.category = 'UTILITY';
    parsed.language = parsed.language || 'pt_BR';
    parsed.name = String(parsed.name || 'template_utility')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    parsed.buttons = Array.isArray(parsed.buttons) ? parsed.buttons : [];
    parsed.variables = Array.isArray(parsed.variables) ? parsed.variables : [];
    parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    return new Response(JSON.stringify({ success: true, template: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('template-optimizer error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
