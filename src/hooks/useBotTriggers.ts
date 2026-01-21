import { supabase } from '@/integrations/supabase/client';

interface Customer {
  id: string;
  name: string;
  phone: string;
  due_date: string;
  plan_id?: string;
}

interface Plan {
  id: string;
  plan_name: string;
}

interface TriggerResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Dispara o gatilho de boas-vindas para um novo cliente
 * Nota: o cliente Supabase já usa a sessão do usuário logado automaticamente
 */
export async function triggerWelcomeBot(
  userId: string,
  customer: Customer,
  plans?: Plan[]
): Promise<TriggerResult> {
  try {
    console.log('[triggerWelcomeBot] Iniciando para cliente:', customer.name);

    // Verificar sessão ativa
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('[triggerWelcomeBot] Sessão não encontrada:', sessionError);
      return { success: false, error: 'Usuário não autenticado' };
    }
    console.log('[triggerWelcomeBot] Sessão ativa para user:', session.user.id);

    // 1. Verificar se o gatilho de boas_vindas está ativo
    const { data: trigger, error: triggerError } = await supabase
      .from('bot_triggers')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_type', 'boas_vindas')
      .eq('is_enabled', true)
      .maybeSingle();

    if (triggerError) {
      console.error('[triggerWelcomeBot] Erro ao buscar gatilho:', triggerError);
      return { success: false, error: triggerError.message };
    }

    if (!trigger) {
      console.log('[triggerWelcomeBot] Gatilho de boas-vindas não está ativo');
      return { success: false, error: 'Gatilho de boas-vindas não está ativo' };
    }
    console.log('[triggerWelcomeBot] Gatilho encontrado:', trigger);

    // 2. Buscar configurações (apenas campos necessários)
    const { data: zapSettings, error: zapError } = await supabase
      .from('zap_responder_settings')
      .select('selected_department_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (zapError) {
      console.error('[triggerWelcomeBot] Erro ao buscar configurações:', zapError);
      return { success: false, error: zapError.message };
    }

    const departmentId = trigger.bot_department_id || zapSettings?.selected_department_id;
    if (!departmentId) {
      console.log('[triggerWelcomeBot] Nenhum departamento configurado');
      return { success: false, error: 'Nenhum departamento configurado para o gatilho' };
    }
    console.log('[triggerWelcomeBot] Departamento:', departmentId);

    // 3. Preparar variáveis para a mensagem
    const phone = customer.phone.replace(/\D/g, '');
    const phoneWithCode = phone.startsWith('55') ? phone : `55${phone}`;
    const plan = plans?.find(p => p.id === customer.plan_id);
    
    const variables: Record<string, string | number> = {
      nome: customer.name,
      telefone: customer.phone,
      vencimento: new Date(customer.due_date).toLocaleDateString('pt-BR'),
      plano: plan?.plan_name || '-',
    };

    // 4. Preparar mensagem inicial (substituir variáveis)
    let mensagemInicial = trigger.message_template || '';
    if (mensagemInicial) {
      mensagemInicial = mensagemInicial
        .replace(/{nome}/g, customer.name)
        .replace(/{telefone}/g, customer.phone)
        .replace(/{vencimento}/g, variables.vencimento as string)
        .replace(/{plano}/g, variables.plano as string);
    }

    console.log('[triggerWelcomeBot] Disparando bot para:', phoneWithCode, 'Departamento:', departmentId, 'Mensagem:', mensagemInicial);

    // 5. Iniciar o bot com a mensagemInicial (a API iniciarBot é a única que entrega)
    const { data: botData, error: botError } = await supabase.functions.invoke('zap-responder', {
      body: {
        action: 'iniciar-bot',
        chat_id: phoneWithCode,
        departamento: departmentId,
        aplicacao: 'whatsapp',
        mensagem_inicial: mensagemInicial || undefined,
        variaveis: variables,
      },
    });

    console.log('[triggerWelcomeBot] Resposta da edge function:', { botData, botError });

    if (botError) {
      console.error('[triggerWelcomeBot] Erro ao chamar edge function:', botError);
      return { success: false, error: botError.message };
    }

    if (!botData?.success) {
      console.error('[triggerWelcomeBot] Falha ao iniciar bot:', botData);
      return { success: false, error: botData?.error || 'Falha ao iniciar bot' };
    }

    console.log('[triggerWelcomeBot] Bot iniciado com sucesso:', botData);
    return { success: true, data: botData };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[triggerWelcomeBot] Erro:', error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Hook para usar os gatilhos de bot
 */
export function useBotTriggers() {
  return {
    triggerWelcomeBot,
  };
}
