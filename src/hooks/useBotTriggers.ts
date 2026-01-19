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
 */
export async function triggerWelcomeBot(
  userId: string,
  customer: Customer,
  plans?: Plan[]
): Promise<TriggerResult> {
  try {
    console.log('Checking welcome bot trigger for new customer:', customer.name);

    // 1. Verificar se o gatilho de boas_vindas está ativo
    const { data: trigger, error: triggerError } = await supabase
      .from('bot_triggers')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_type', 'boas_vindas')
      .eq('is_enabled', true)
      .maybeSingle();

    if (triggerError) {
      console.error('Error fetching welcome trigger:', triggerError);
      return { success: false, error: triggerError.message };
    }

    if (!trigger) {
      console.log('Welcome bot trigger not enabled');
      return { success: false, error: 'Gatilho de boas-vindas não está ativo' };
    }

    if (!trigger.bot_department_id) {
      console.log('No department configured for welcome trigger');
      return { success: false, error: 'Nenhum departamento configurado para o gatilho' };
    }

    // 2. Buscar configurações do Zap Responder
    const { data: zapSettings, error: zapError } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (zapError || !zapSettings?.zap_api_token) {
      console.error('Zap Responder not configured');
      return { success: false, error: 'Zap Responder não configurado' };
    }

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

    console.log('Triggering welcome bot for:', phoneWithCode, 'Department:', trigger.bot_department_id);

    // 5. Chamar a edge function para iniciar o bot
    const { data, error } = await supabase.functions.invoke('zap-responder', {
      body: {
        action: 'iniciar-bot',
        chat_id: phoneWithCode,
        departamento: trigger.bot_department_id,
        aplicacao: 'whatsapp',
        mensagem_inicial: mensagemInicial || undefined,
        variaveis: variables,
      },
    });

    if (error) {
      console.error('Error triggering welcome bot:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      console.error('Failed to trigger welcome bot:', data);
      return { success: false, error: data?.error || 'Falha ao iniciar bot' };
    }

    console.log('Welcome bot triggered successfully:', data);
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Error in triggerWelcomeBot:', error);
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
