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

const MARKETING_TERMS = [
  'promoção', 'promocao', 'oferta', 'desconto', 'aproveite', 'novidade', 'assine agora',
  'imperdível', 'imperdivel', 'cupom', 'grátis', 'gratis', 'teste gratuito', 'volte',
  'últimas vagas', 'ultimas vagas', 'corra', 'não perca', 'nao perca', 'exclusivo',
];

function slug(s: string) {
  return String(s || 'template_utility')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'template_utility';
}

// Fallback determinístico (sem IA): limpa termos de marketing e monta corpo transacional.
function localOptimize(message: string) {
  const original = message.trim();
  const lower = original.toLowerCase();
  const warnings = MARKETING_TERMS.filter(t => lower.includes(t))
    .map(t => `Termo promocional detectado: "${t}"`);

  const vars = Array.from(new Set([...original.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(m => m[1])));
  if (!vars.includes('nome')) vars.unshift('nome');

  let body = original
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n');

  // remove frases claramente promocionais
  body = body.split(/\n/).filter(line => !MARKETING_TERMS.some(t => line.toLowerCase().includes(t))).join('\n');
  if (!body.trim()) {
    body = 'Olá, {{nome}}. Este é um aviso sobre a sua assinatura.';
  }
  if (!/\{\{\s*nome\s*\}\}/.test(body)) body = `Olá, {{nome}}.\n\n${body}`;
  body = body.slice(0, 1024);

  return {
    name: slug('aviso_' + (body.split('\n')[0] || 'assinatura').slice(0, 30)),
    category: 'UTILITY',
    language: 'pt_BR',
    body,
    footer: '',
    buttons: [],
    variables: vars.map(v => ({ name: v, example: v === 'nome' ? 'João' : '' })),
    risk: warnings.length ? 'MEDIUM' : 'LOW',
    reasoning: 'Versão gerada localmente (IA indisponível): emojis e termos promocionais foram removidos e a mensagem foi ajustada para tom transacional.',
    warnings,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const ok = (payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { message, hint } = await req.json();
    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'Mensagem obrigatória' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return ok({ success: true, template: localOptimize(message), fallback: true, notice: 'IA indisponível — usei o otimizador local.' });
    }

    let res: Response;
    try {
      res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3.6-flash',
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
    } catch (netErr) {
      console.error('AI gateway network error:', netErr);
      return ok({ success: true, template: localOptimize(message), fallback: true, notice: 'IA indisponível — usei o otimizador local.' });
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`AI gateway falhou [${res.status}]: ${body}`);
      const notice = res.status === 429
        ? 'Limite de requisições da IA atingido — usei o otimizador local.'
        : res.status === 402
          ? 'Créditos de IA esgotados no workspace — usei o otimizador local. Adicione créditos em Settings → Workspace → Usage para usar a IA.'
          : `IA indisponível (${res.status}) — usei o otimizador local.`;
      return ok({ success: true, template: localOptimize(message), fallback: true, notice });
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

    if (!parsed?.body) {
      return ok({ success: true, template: localOptimize(message), fallback: true, notice: 'A IA não retornou um template válido — usei o otimizador local.' });
    }

    parsed.category = 'UTILITY';
    parsed.language = parsed.language || 'pt_BR';
    parsed.name = slug(parsed.name);
    parsed.buttons = Array.isArray(parsed.buttons) ? parsed.buttons : [];
    parsed.variables = Array.isArray(parsed.variables) ? parsed.variables : [];
    parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    return ok({ success: true, template: parsed });
  } catch (e) {
    console.error('template-optimizer error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
