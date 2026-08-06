import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Normaliza telefone para o formato E.164 (ex: 5511999999999)
 */
const normalizePhone = (phone: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length >= 10 && digits.length <= 11) return "55" + digits;
  return digits;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL") || "";
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supaUrl, svc);

    let { action, message, userId, customerId, provider = 'gemini' } = await req.json().catch(() => ({}));
    
    // Autenticação via Chave de API (para uso externo)
    const apiKey = req.headers.get("x-api-key");
    if (apiKey) {
      const { data: checkoutSettings } = await supabase
        .from('reseller_checkout_settings')
        .select('user_id')
        .eq('api_key', apiKey)
        .maybeSingle();
      
      if (checkoutSettings?.user_id) {
        userId = checkoutSettings.user_id;
      } else {
        return new Response(JSON.stringify({ success: false, error: 'Chave de API inválida' }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Identificação do revendedor (userId ou x-api-key) é obrigatória' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Carrega configurações e chave
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('ai_api_key, ai_provider, ai_automation_enabled, reseller_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings?.ai_automation_enabled || !settings?.ai_api_key) {
      return new Response(JSON.stringify({ success: false, error: 'IA desativada ou Chave de API (Gemini/OpenAI) não configurada no SuperGestor' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Identifica o cliente (prioriza customerId, depois busca por telefone na mensagem, depois por nome/username)
    let identifiedCustomer = null;
    if (customerId) {
      const { data: c } = await supabase
        .from('customers')
        .select(`
          id, name, username, password, phone, due_date, status,
          plans:plan_id (plan_name, price),
          servers:server_id (server_name)
        `)
        .eq('id', customerId)
        .maybeSingle();
      identifiedCustomer = c;
    } 
    
    if (!identifiedCustomer) {
      // Tenta extrair telefone da mensagem
      const phoneMatch = message.match(/(?:(?:\+|00)?(55))?(\d{2})9?(\d{8})/);
      if (phoneMatch) {
        const fullPhone = normalizePhone(phoneMatch[0]);
        const { data: customers } = await supabase
          .from('customers')
          .select(`
            id, name, username, password, phone, due_date, status,
            plans:plan_id (plan_name, price),
            servers:server_id (server_name)
          `)
          .eq('phone', fullPhone)
          .eq('created_by', userId)
          .limit(1);
        if (customers && customers.length > 0) identifiedCustomer = customers[0];
      }
    }

    if (!identifiedCustomer) {
      // Tenta buscar por username ou nome se for uma palavra isolada ou contexto curto
      const words = message.split(/\s+/).filter(w => w.length > 3);
      for (const word of words) {
        const { data: found } = await supabase
          .from('customers')
          .select(`
            id, name, username, password, phone, due_date, status,
            plans:plan_id (plan_name, price),
            servers:server_id (server_name)
          `)
          .or(`username.ilike.%${word}%,name.ilike.%${word}%`)
          .eq('created_by', userId)
          .limit(1);
        if (found && found.length > 0) {
          identifiedCustomer = found[0];
          break;
        }
      }
    }

    // 3. Carrega base de conhecimento
    const { data: knowledgeItems } = await supabase
      .from('ai_knowledge_items')
      .select('kind, subject, problem, solution, steps, category, keywords')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .limit(50);

    const { data: kbEntries } = await supabase
      .from('ai_knowledge_entries')
      .select('title, response_template, keywords')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .limit(50);

    // 4. Constrói contexto dinâmico
    let contextInfo = `### DADOS DO CLIENTE ATUAL:\n`;
    if (identifiedCustomer) {
      const dueDate = identifiedCustomer.due_date ? new Date(identifiedCustomer.due_date).toLocaleDateString('pt-BR') : 'Não informada';
      contextInfo += `Nome: ${identifiedCustomer.name}\nUsuário: ${identifiedCustomer.username || 'N/A'}\nSenha: ${identifiedCustomer.password || 'Não informada'}\nStatus: ${identifiedCustomer.status}\nVencimento: ${dueDate}\nPlano: ${identifiedCustomer.plans?.plan_name || 'N/A'}\nServidor: ${identifiedCustomer.servers?.server_name || 'N/A'}\n\n`;
    } else {
      contextInfo += `Cliente não identificado. Se ele perguntar sobre seus dados, peça o telefone ou o usuário.\n\n`;
    }

    const prompt = `Você é um atendente de WhatsApp da "${settings.reseller_name || 'Social TV'}".
Sua função é consultar o banco de dados fornecido abaixo e responder ao cliente.

${contextInfo}

### BASE DE CONHECIMENTO:
${knowledgeItems?.map(i => `[${i.kind}] ${i.subject}: ${i.solution || i.steps?.join(', ')}`).join('\n')}
${kbEntries?.map(e => `[Resposta] ${e.title}: ${e.response_template}`).join('\n')}

### REGRAS:
1. Se o cliente perguntar "qual meu usuário?" ou "quando vence?", use os DADOS DO CLIENTE ATUAL acima.
2. Se os dados de Usuário/Senha estiverem no contexto, você pode reenviá-los se solicitado.
3. Responda de forma CURTA (máximo 3 linhas).
4. Se não encontrar a informação, peça para aguardar um atendente humano.
5. Nunca diga que é um robô.

Mensagem do Cliente: "${message}"

Resposta:`;

    const aiRes = await fetch("https://api.lovable.app/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_AI_GATEWAY_KEY")}`,
        "X-Lovable-AI-Provider-Key": settings.ai_api_key,
      },
      body: JSON.stringify({
        model: settings.ai_provider === 'openai' ? "gpt-4o" : "gemini-1.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    const aiData = await aiRes.json();
    const answer = aiData.choices?.[0]?.message?.content || "Vou verificar para você.";

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