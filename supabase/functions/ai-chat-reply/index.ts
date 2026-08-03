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

    // ============================================================
    // 1. Carrega TODA a base de conhecimento do revendedor
    // ============================================================

    // 1a. Itens aprovados da Central de Conhecimento IA (procedimentos, fluxos, regras, tutoriais)
    const { data: knowledgeItems } = await supabase
      .from('ai_knowledge_items')
      .select('kind, subject, problem, solution, steps, category, keywords, devices, apps')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .order('usage_count', { ascending: false })
      .limit(80);

    // 1b. Entradas manuais da Base de Conhecimento (respostas prontas por palavra-chave)
    const { data: kbEntries } = await supabase
      .from('ai_knowledge_entries')
      .select('title, category, keywords, response_template, requires_human')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true })
      .limit(80);

    const hasItems = knowledgeItems && knowledgeItems.length > 0;
    const hasEntries = kbEntries && kbEntries.length > 0;

    if (!hasItems && !hasEntries) {
      return new Response(JSON.stringify({ success: false, error: 'No knowledge base found' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // 2. Monta as seções da base de conhecimento
    // ============================================================

    // --- Seção A: Respostas prontas (Base de Conhecimento manual) ---
    let respostasProntas = '';
    if (hasEntries) {
      const linhas = kbEntries!.map((e: any) => {
        const kw = (e.keywords || []).join(', ');
        const ehHumano = e.requires_human ? ' [⚠️ ESCALAR PARA HUMANO]' : '';
        return `• ${e.title}${ehHumano}\n  Categoria: ${e.category || 'outros'}\n  Palavras-chave: ${kw || '—'}\n  Resposta: ${e.response_template || '(encaminhar para atendente)'}`;
      }).join('\n\n');
      respostasProntas = `### RESPOSTAS PRONTAS (responda exatamente com estes textos quando o cliente perguntar algo que combine com as palavras-chave):\n${linhas}`;
    }

    // --- Seção B: Procedimentos, fluxos e regras (Central de Conhecimento IA) ---
    let conhecimentoIA = '';
    if (hasItems) {
      const tipoLabels: Record<string, string> = {
        procedure: 'Procedimento',
        flow: 'Fluxo',
        intent: 'Intenção',
        official_answer: 'Resposta Oficial',
        business_rule: 'Regra de Negócio',
        tutorial: 'Tutorial',
      };

      const grupos: Record<string, any[]> = {};
      for (const item of knowledgeItems!) {
        const k = tipoLabels[item.kind] || item.kind;
        if (!grupos[k]) grupos[k] = [];
        grupos[k].push(item);
      }

      const secoes = Object.entries(grupos).map(([tipo, itens]) => {
        const linhas = itens.map((item: any) => {
          const partes: string[] = [`• ${item.subject}`];
          if (item.problem) partes.push(`  Problema: ${item.problem}`);
          if (item.solution) partes.push(`  Solução: ${item.solution}`);
          if (item.steps && item.steps.length > 0) {
            partes.push(`  Passos: ${item.steps.map((s: string, i: number) => `${i + 1}) ${s}`).join(' | ')}`);
          }
          if (item.keywords && item.keywords.length > 0) {
            partes.push(`  Palavras-chave: ${item.keywords.join(', ')}`);
          }
          if (item.devices && item.devices.length > 0) {
            partes.push(`  Dispositivos: ${item.devices.join(', ')}`);
          }
          if (item.apps && item.apps.length > 0) {
            partes.push(`  Apps: ${item.apps.join(', ')}`);
          }
          return partes.join('\n');
        }).join('\n\n');
        return `#### ${tipo}:\n${linhas}`;
      }).join('\n\n---\n\n');

      conhecimentoIA = `### CONHECIMENTO OPERACIONAL (use estas regras e procedimentos para guiar o atendimento):\n${secoes}`;
    }

    // --- Combina as seções ---
    const secoesBase = [respostasProntas, conhecimentoIA].filter(Boolean).join('\n\n---\n\n');

    // ============================================================
    // 3. Busca chave da IA e configurações de automação
    // ============================================================
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('ai_api_key, ai_provider, ai_automation_enabled, notification_phone, reseller_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings?.ai_automation_enabled || !settings?.ai_api_key) {
      return new Response(JSON.stringify({ success: false, error: 'AI automation disabled or API key missing' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = settings.ai_api_key;
    const selectedProvider = settings.ai_provider || provider;
    const nomeRevenda = settings.reseller_name || 'nosso serviço';

    // ============================================================
    // 4. Monta o prompt completo
    // ============================================================
    const prompt = `Você é um atendente de WhatsApp de IPTV/Streaming, trabalhando para "${nomeRevenda}".
Sua função é responder clientes de forma CURTA, prestativa e profissional, como se fosse um humano atendendo no WhatsApp.

## INSTRUÇÕES DE COMPORTAMENTO:
1. Use SEMPRE que possível as respostas prontas da base de conhecimento — elas foram aprovadas pelo gestor e devem ser seguidas à risca.
2. Responda em português brasileiro, de forma breve (máximo 3-4 linhas), como uma mensagem de WhatsApp.
3. Use emojis com moderação (1-2 por mensagem) para parecer natural e amigável.
4. Se o cliente perguntar sobre renovação, forneça o link do site para gerar o PIX automaticamente.
5. Se a entrada marcar "ESCALAR PARA HUMANO", NÃO responda automaticamente — diga apenas que está transferindo para um atendente.
6. Se não encontrar a resposta na base de conhecimento, diga que vai verificar com a equipe e que um atendente responderá em breve. NÃO invente informações.
7. Nunca revele que é uma IA ou robô — aja como um atendente humano.
8. Não peça dados sensíveis (senhas, cartões). Apenas oriente o cliente.
9. Trate o cliente com empatia e paciência, mesmo se ele estiver irritado.

## BASE DE CONHECIMENTO:
${secoesBase}

## Mensagem do Cliente:
"${message}"

## Sua resposta (direta, curta, como mensagem de WhatsApp):`;

    // ============================================================
    // 5. Chama a IA via Gateway
    // ============================================================
    const aiRes = await fetch("https://api.lovable.app/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_AI_GATEWAY_KEY")}`,
        "X-Lovable-AI-Provider-Key": apiKey,
      },
      body: JSON.stringify({
        model: selectedProvider === 'gemini' ? "gemini-1.5-pro" : "gpt-4o",
        messages: [
          { role: "system", content: "Você é um atendente de WhatsApp profissional de IPTV/Streaming. Responda sempre em português brasileiro, de forma curta e natural." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 500,
      }),
    });

    const aiData = await aiRes.json();
    let answer = aiData.choices?.[0]?.message?.content || '';

    // Limpa marcações de markdown que não pertencem ao WhatsApp
    answer = answer
      .replace(/^["']|["']$/g, '')   // remove aspas do início/fim
      .replace(/\*\*/g, '')          // remove negrito markdown
      .replace(/^resposta:\s*/i, '') // remove prefixo "Resposta:"
      .trim();

    if (!answer) {
      answer = "Desculpe, não consegui processar sua resposta. Um atendente humano irá te ajudar em breve. 😊";
    }

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
