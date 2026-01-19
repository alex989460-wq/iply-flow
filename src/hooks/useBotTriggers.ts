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

    // 2. Buscar configurações (apenas campos necessários)
    const { data: zapSettings, error: zapError } = await supabase
      .from('zap_responder_settings')
      .select('selected_department_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (zapError) {
      console.error('Error fetching Zap Responder settings:', zapError);
      return { success: false, error: zapError.message };
    }

    const departmentId = trigger.bot_department_id || zapSettings?.selected_department_id;
    if (!departmentId) {
      console.log('No department configured for welcome trigger');
      return { success: false, error: 'Nenhum departamento configurado para o gatilho' };
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

    console.log('Triggering welcome bot for:', phoneWithCode, 'Department:', departmentId);

    // 5. Iniciar o bot (sem mensagem inicial). O envio do texto inicial
    // será feito via ação `enviar-mensagem`, que usa endpoints mais confiáveis.
    const { data: botData, error: botError } = await supabase.functions.invoke('zap-responder', {
      body: {
        action: 'iniciar-bot',
        chat_id: phoneWithCode,
        departamento: departmentId,
        aplicacao: 'whatsapp',
        variaveis: variables,
      },
    });

    if (botError) {
      console.error('Error triggering welcome bot:', botError);
      return { success: false, error: botError.message };
    }

    if (!botData?.success) {
      console.error('Failed to trigger welcome bot:', botData);
      return { success: false, error: botData?.error || 'Falha ao iniciar bot' };
    }

    // 6. Enviar a mensagem inicial (se configurada)
    const initialText = (mensagemInicial || '').trim();
    if (initialText) {
      const { data: msgData, error: msgError } = await supabase.functions.invoke('zap-responder', {
        body: {
          action: 'enviar-mensagem',
          department_id: departmentId,
          number: phoneWithCode,
          text: initialText,
        },
      });

      if (msgError) {
        console.error('Error sending welcome initial message:', msgError);
        return { success: false, error: msgError.message };
      }

      if (!msgData?.success) {
        console.error('Failed to send welcome initial message:', msgData);
        return { success: false, error: msgData?.error || 'Falha ao enviar mensagem inicial' };
      }

      console.log('Welcome initial message sent successfully:', msgData);
    }

    console.log('Welcome bot triggered successfully:', botData);
    return { success: true, data: { bot: botData, messageSent: Boolean(initialText) } };
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
