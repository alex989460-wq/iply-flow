// Otimizador de templates: recebe uma mensagem crua e devolve um template
// reescrito para ser aprovado como UTILITY (e não MARKETING) pela Meta.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `Você é o melhor especialista do Brasil em templates aprovados na WhatsApp Cloud API (Meta).
Sua tarefa: transformar a mensagem crua do usuário em um template PROFISSIONAL, bonito e bem estruturado, com ALTÍSSIMA chance de aprovação na categoria UTILITY.

## Qualidade obrigatória do texto (isto é o mais importante)
- NUNCA devolva uma frase curta e simples. Entregue uma mensagem completa, bem diagramada, com múltiplas linhas.
- Estrutura recomendada:
  1) Saudação personalizada com o nome: "Olá, *{{nome}}*! 👋"
  2) Uma linha explicando o motivo do aviso (transacional).
  3) Um bloco de dados em lista, cada linha com um emoji e o rótulo em *negrito*, ex.:
     "📅 *Vencimento:* {{vencimento}}"
     "👤 *Usuário:* {{usuario}}"
     "💰 *Valor:* R$ {{valor}}"
     "📦 *Plano:* {{plano}}"
     "🖥️ *Servidor:* {{servidor}}"
  4) Uma linha final de instrução/agradecimento neutra, ex.: "Qualquer dúvida, estamos à disposição. 🙏"
- Use emojis com moderação e sentido informativo (📅 👤 💰 📦 ✅ 🔒 🧾 🖥️ 🙏 👋). Nada de emojis de venda (🔥🎉🤑💥).
- Use a formatação do WhatsApp: *negrito*, _itálico_. Nunca use markdown (**, ##, -).
- Quebre linhas de verdade (\\n). Deixe uma linha em branco entre os blocos.

## Variáveis (geração automática)
- Detecte automaticamente TODOS os dados que fazem sentido no contexto e crie variáveis para eles, mesmo que o usuário não tenha escrito nenhuma.
- Preserve as variáveis que o usuário já escreveu ({{...}}), sem renomear.
- Formato snake_case minúsculo sem acentos. Nomes preferidos: nome, vencimento, valor, plano, usuario, senha, servidor, link, data, telas, pedido.
- Sempre inclua {{nome}} na saudação.
- Nunca comece nem termine o corpo com variável, e nunca coloque duas variáveis coladas (regra da Meta).
- Para cada variável forneça um "example" realista (ex.: nome="João Silva", vencimento="15/08/2026", valor="49,90").

## Regras UTILITY
- Conteúdo transacional: pedido, conta, assinatura, pagamento, vencimento, renovação, agendamento ou serviço JÁ contratado.
- PROIBIDO: oferta, desconto, promoção, "aproveite", "assine agora", cupom, urgência comercial, convites.
- Corpo até 1024 caracteres. Footer curto (máx 60 caracteres, neutro, ex.: "Mensagem automática do sistema").
- Botões só se transacionais (URL de pagamento/2ª via ou QUICK_REPLY de confirmação).
- Nome do template: snake_case, minúsculo, sem acentos, até 60 caracteres, descritivo (ex.: aviso_vencimento_assinatura).

## Cabeçalho
- Sugira um header. Use "TEXT" com um título curto (máx 60 caracteres, pode ter 1 emoji), ou "IMAGE" quando a mensagem ficar melhor com uma arte (confirmações de pagamento, comprovantes, avisos visuais).
- Se sugerir IMAGE, explique no reasoning que o usuário deve anexar a imagem no construtor.

Responda SOMENTE com JSON válido, sem markdown, no formato:
{
  "name": "string",
  "category": "UTILITY",
  "language": "pt_BR",
  "header": {"type":"NONE|TEXT|IMAGE","text":"string quando TEXT"},
  "body": "string com {{variaveis}}, emojis e quebras de linha",
  "footer": "string ou vazio",
  "buttons": [{"type":"URL|QUICK_REPLY|PHONE_NUMBER","text":"string","url":"opcional","phone":"opcional"}],
  "variables": [{"name":"nome","example":"João Silva"}],
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

const EXAMPLES: Record<string, string> = {
  nome: 'João Silva',
  vencimento: '15/08/2026',
  data: '15/08/2026',
  valor: '49,90',
  plano: 'Mensal',
  usuario: 'joao123',
  senha: 'a1b2c3',
  servidor: 'Servidor 1',
  telas: '2',
  link: 'https://exemplo.com/pagar',
  pedido: '10245',
};

const FIELD_HINTS: Array<{ key: string; emoji: string; label: string; terms: string[] }> = [
  { key: 'vencimento', emoji: '📅', label: 'Vencimento', terms: ['vencimento', 'vence', 'validade', 'expira'] },
  { key: 'usuario', emoji: '👤', label: 'Usuário', terms: ['usuario', 'usuário', 'login', 'user'] },
  { key: 'senha', emoji: '🔒', label: 'Senha', terms: ['senha', 'password'] },
  { key: 'valor', emoji: '💰', label: 'Valor', terms: ['valor', 'preço', 'preco', 'r$', 'pagamento'] },
  { key: 'plano', emoji: '📦', label: 'Plano', terms: ['plano', 'assinatura', 'pacote'] },
  { key: 'servidor', emoji: '🖥️', label: 'Servidor', terms: ['servidor', 'server', 'painel'] },
  { key: 'telas', emoji: '📺', label: 'Telas', terms: ['tela', 'telas', 'conexão', 'conexao'] },
  { key: 'pedido', emoji: '🧾', label: 'Pedido', terms: ['pedido', 'protocolo', 'order'] },
];

// Fallback determinístico (sem IA): monta um template UTILITY rico e estruturado.
function localOptimize(message: string) {
  const original = message.trim();
  const lower = original.toLowerCase();
  const warnings = MARKETING_TERMS.filter(t => lower.includes(t))
    .map(t => `Termo promocional detectado: "${t}"`);

  const existing = Array.from(new Set([...original.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(m => m[1])));

  // campos detectados pelo texto + variáveis já escritas pelo usuário
  const fields = FIELD_HINTS.filter(f => existing.includes(f.key) || f.terms.some(t => lower.includes(t)));
  if (!fields.length) {
    fields.push(FIELD_HINTS[0], FIELD_HINTS[1], FIELD_HINTS[4]);
  }

  const isPayment = /pag|comprovante|confirma|aprovad|renov/.test(lower);
  const intro = isPayment
    ? 'Recebemos a confirmação do seu pagamento. ✅ Seguem abaixo os dados da sua assinatura:'
    : 'Passando um aviso sobre a sua assinatura. Seguem abaixo os dados atualizados:';

  const lines = fields.map(f => `${f.emoji} *${f.label}:* {{${f.key}}}`);

  const extras = existing.filter(v => v !== 'nome' && !fields.some(f => f.key === v));
  for (const v of extras) lines.push(`• *${v.replace(/_/g, ' ')}:* {{${v}}}`);

  let body = [
    'Olá, *{{nome}}*! 👋',
    '',
    intro,
    '',
    lines.join('\n'),
    '',
    'Qualquer dúvida, estamos à disposição. 🙏',
  ].join('\n').slice(0, 1024);

  const vars = ['nome', ...fields.map(f => f.key), ...extras];

  return {
    name: slug(isPayment ? 'confirmacao_pagamento_assinatura' : 'aviso_vencimento_assinatura'),
    category: 'UTILITY',
    language: 'pt_BR',
    header: { type: 'TEXT', text: isPayment ? '✅ Pagamento confirmado' : '📅 Aviso de vencimento' },
    body,
    footer: 'Mensagem automática do sistema',
    buttons: [],
    variables: Array.from(new Set(vars)).map(v => ({ name: v, example: EXAMPLES[v] || '' })),
    risk: warnings.length ? 'MEDIUM' : 'LOW',
    reasoning: 'Versão gerada localmente (IA indisponível): montei um template UTILITY estruturado, com saudação, bloco de dados em lista e variáveis detectadas automaticamente.',
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
              content: `Mensagem original:\n"""${message.slice(0, 3000)}"""\n${hint ? `Contexto adicional: ${String(hint).slice(0, 500)}` : ''}\n\nGere o melhor template UTILITY possível: rico, com emojis informativos, *negrito*, bloco de dados em linhas separadas e variáveis criadas automaticamente com exemplos.`,
            },
          ],
          temperature: 0.7,
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
