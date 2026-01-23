import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapping of billing types to template names (approved templates from the API)
const TEMPLATE_MAPPING: Record<string, string> = {
  'D-1': 'vence_amanha',  // Due tomorrow
  'D0': 'hoje01',         // Due today
  'D+1': 'vencido',       // Overdue (yesterday)
};

// Fallback messages if templates fail
const MESSAGES = {
  'D-1': 'Olá, consta em nosso sistema que sua conta possui vencimento agendado para amanhã. Caso já tenha realizado o pagamento, desconsidere esta mensagem.',
  'D0': 'Olá, consta em nosso sistema que sua conta possui vencimento registrado para hoje. Caso já tenha realizado o pagamento, desconsidere esta mensagem.',
  'D+1': 'Olá, consta em nosso sistema que sua conta encontra-se vencida. Para restabelecer o acesso aos serviços, é necessária a regularização.',
};

interface Customer {
  id: string;
  name: string;
  phone: string;
  due_date: string;
  status: string;
}

// Send WhatsApp template message via Zap Responder API
async function sendWhatsAppTemplateZapResponder(
  phone: string, 
  templateName: string,
  token: string, 
  apiBaseUrl: string,
  departmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    
    console.log(`[ZapResponder] Sending template "${templateName}" to ${formattedPhone}`);
    
    const body = {
      type: 'template',
      template_name: templateName,
      number: formattedPhone,
      language: 'pt_BR',
    };
    
    const response = await fetch(`${apiBaseUrl}/whatsapp/message/${departmentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao enviar mensagem' };
    }

    const result = await response.json();
    console.log(`Template sent successfully to ${formattedPhone}`, result);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error sending template to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
}

// Send WhatsApp text message via Evolution API
async function sendWhatsAppTextEvolution(
  phone: string, 
  text: string,
  apiKey: string, 
  apiBaseUrl: string,
  instanceName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    
    console.log(`[Evolution] Sending text to ${formattedPhone} via instance ${instanceName}`);
    
    const response = await fetch(`${apiBaseUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Evolution API error: ${response.status} - ${errorText}`);
      return { success: false, error: `Erro ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log(`Message sent successfully to ${formattedPhone}`, result);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error sending message to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
}

// Format YYYY-MM-DD in America/Sao_Paulo
function formatDateSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find(p => p.type === 'year')?.value ?? '1970';
  const month = parts.find(p => p.type === 'month')?.value ?? '01';
  const day = parts.find(p => p.type === 'day')?.value ?? '01';

  return `${year}-${month}-${day}`;
}

// Get dates relative to São Paulo timezone
function getRelativeDateSaoPaulo(daysOffset: number): string {
  const now = new Date();
  const saoPauloDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  
  const [year, month, day] = saoPauloDate.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day + daysOffset);
  
  return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
}

// Normalize phone number for comparison
function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  if (!normalized.startsWith('55') && normalized.length <= 11) {
    normalized = '55' + normalized;
  }
  return normalized;
}

// Get billing type based on due date comparison with today
function getBillingType(dueDate: string, today: string): 'D-1' | 'D0' | 'D+1' | null {
  const due = new Date(dueDate);
  const todayDate = new Date(today);

  due.setHours(0, 0, 0, 0);
  todayDate.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - todayDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return 'D-1';
  if (diffDays === 0) return 'D0';
  if (diffDays === -1) return 'D+1';

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let filterBillingType: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        filterBillingType = body?.billing_type || null;
        console.log(`Filter billing type: ${filterBillingType}`);
      } catch {
        // No body or invalid JSON
      }
    }
    
    console.log('Starting billing process...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract user_id from JWT token
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      } catch (e) {
        console.log('Could not extract user from token:', e);
      }
    }

    // Check if user is admin
    const { data: adminRows } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .limit(1);
    const isAdminUser = (adminRows?.length ?? 0) > 0;

    // Load settings for current user
    const { data: userSettings } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let zapSettings: any = userSettings;

    // Admin-only fallback
    if (!zapSettings && isAdminUser) {
      const { data } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .is('user_id', null)
        .limit(1)
        .maybeSingle();
      zapSettings = data;
    }

    const apiType = zapSettings?.api_type || 'zap_responder';
    const apiKey = zapSettings?.zap_api_token || (isAdminUser ? Deno.env.get('ZAP_RESPONDER_TOKEN') : null);
    
    if (!apiKey) {
      console.error('API key not configured for user:', userId);
      return new Response(
        JSON.stringify({ error: 'Configuração incompleta. Verifique suas configurações.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiBaseUrl = zapSettings?.api_base_url || (apiType === 'evolution' 
      ? 'https://api-evolution.supergestor.top' 
      : 'https://api.zapresponder.com.br/api');
    
    console.log(`Using API type: ${apiType}`);
    console.log(`Using API base URL: ${apiBaseUrl}`);

    // For Evolution API, we need the instance name
    // For Zap Responder, we need the department ID
    let departmentId: string | undefined;
    let instanceName: string | undefined;

    if (apiType === 'evolution') {
      instanceName = zapSettings?.instance_name;
      if (!instanceName) {
        console.error('Instance name not configured for Evolution API user:', userId);
        return new Response(
          JSON.stringify({ error: 'Configuração incompleta. Selecione uma instância em Configurações.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`Using Evolution instance: ${instanceName}`);
    } else {
      // Zap Responder: Get department ID
      const selectedSessionId = zapSettings?.selected_session_id;
      if (selectedSessionId) {
        try {
          const atendenteResponse = await fetch(`${apiBaseUrl}/atendentes`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
          });
          
          if (atendenteResponse.ok) {
            const atendentes = await atendenteResponse.json();
            const selectedAtendente = atendentes?.find((a: any) => a._id === selectedSessionId);
            if (selectedAtendente?.departamento?.length > 0) {
              departmentId = selectedAtendente.departamento[0];
              console.log(`Found department ID: ${departmentId}`);
            }
          }
        } catch (e) {
          console.error('Error fetching attendant department:', e);
        }
      }
      
      if (!departmentId) {
        // Fallback to selected_department_id
        departmentId = zapSettings?.selected_department_id;
      }
      
      if (!departmentId) {
        console.error('No department ID found for user:', userId);
        return new Response(
          JSON.stringify({ error: 'Configuração incompleta. Selecione uma sessão/departamento em Configurações.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`Using department ID: ${departmentId}`);
    }

    // Get dates
    const today = getRelativeDateSaoPaulo(0);
    const yesterday = getRelativeDateSaoPaulo(-1);
    const tomorrow = getRelativeDateSaoPaulo(1);

    console.log(`Processing billings: yesterday=${yesterday}, today=${today}, tomorrow=${tomorrow}`);

    // Fetch customers
    let customerQuery = supabase
      .from('customers')
      .select('id, name, phone, due_date, status')
      .in('status', ['ativa', 'inativa'])
      .in('due_date', [yesterday, today, tomorrow]);
    
    if (!isAdminUser && userId) {
      customerQuery = customerQuery.eq('created_by', userId);
    }
    
    const { data: customers, error: customersError } = await customerQuery;

    if (customersError) {
      console.error('Error fetching customers:', customersError);
      return new Response(
        JSON.stringify({ error: 'Unable to process billing request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${customers?.length || 0} customers to process`);

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[],
    };

    // Pre-fetch billing logs for today
    const { data: existingLogs } = await supabase
      .from('billing_logs')
      .select('customer_id, billing_type, message')
      .gte('sent_at', `${today}T00:00:00`)
      .lte('sent_at', `${today}T23:59:59`);

    const sentByCustomerAndType = new Set<string>();
    const sentByPhoneAndType = new Set<string>();
    
    for (const log of existingLogs || []) {
      sentByCustomerAndType.add(`${log.customer_id}:${log.billing_type}`);
      const phoneMatch = log.message?.match(/\[(\d+)\]/);
      if (phoneMatch) {
        const normalizedLogPhone = normalizePhone(phoneMatch[1]);
        sentByPhoneAndType.add(`${normalizedLogPhone}:${log.billing_type}`);
      }
    }

    console.log(`Found ${existingLogs?.length || 0} existing logs for today`);

    // Filter customers
    const customersToProcess: any[] = [];
    
    for (const customer of customers || []) {
      results.processed++;
      
      const billingType = getBillingType(customer.due_date, today);
      
      if (!billingType) {
        results.skipped++;
        continue;
      }
      
      if (filterBillingType && billingType !== filterBillingType) {
        results.skipped++;
        continue;
      }

      if (sentByCustomerAndType.has(`${customer.id}:${billingType}`)) {
        results.skipped++;
        continue;
      }

      const normalizedPhone = normalizePhone(customer.phone);
      if (sentByPhoneAndType.has(`${normalizedPhone}:${billingType}`)) {
        console.log(`Skipping ${customer.name} - phone already received ${billingType} today`);
        results.skipped++;
        continue;
      }

      customersToProcess.push({ ...customer, billingType, normalizedPhone });
      sentByCustomerAndType.add(`${customer.id}:${billingType}`);
      sentByPhoneAndType.add(`${normalizedPhone}:${billingType}`);
    }

    console.log(`Customers to process after filtering: ${customersToProcess.length}`);

    // Process in parallel batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < customersToProcess.length; i += BATCH_SIZE) {
      const batch = customersToProcess.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (customer) => {
        const billingType = customer.billingType as 'D-1' | 'D0' | 'D+1';
        let sendResult: { success: boolean; error?: string };
        let messageIdentifier: string;
        
        if (apiType === 'evolution') {
          // Use Evolution API - send text message
          const textMessage = MESSAGES[billingType];
          sendResult = await sendWhatsAppTextEvolution(
            customer.phone, 
            textMessage, 
            apiKey, 
            apiBaseUrl, 
            instanceName!
          );
          messageIdentifier = `[${customer.normalizedPhone}] Evolution: ${billingType}`;
        } else {
          // Use Zap Responder API - send template
          const templateName = TEMPLATE_MAPPING[billingType];
          sendResult = await sendWhatsAppTemplateZapResponder(
            customer.phone, 
            templateName, 
            apiKey, 
            apiBaseUrl, 
            departmentId!
          );
          messageIdentifier = `[${customer.normalizedPhone}] Template: ${templateName}`;
        }
        
        // Log the billing attempt
        await supabase
          .from('billing_logs')
          .insert({
            customer_id: customer.id,
            billing_type: billingType,
            message: messageIdentifier,
            whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
          });

        return {
          customer: customer.name,
          phone: customer.phone,
          billingType,
          success: sendResult.success,
          error: sendResult.error,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        if (result.success) {
          results.sent++;
          results.details.push({
            customer: result.customer,
            phone: result.phone,
            billingType: result.billingType,
            status: 'sent',
          });
        } else {
          results.errors++;
          results.details.push({
            customer: result.customer,
            phone: result.phone,
            billingType: result.billingType,
            status: 'error',
            error: result.error,
          });
        }
      }
    }

    console.log('Billing process completed:', results);

    // Update billing_schedule
    if (userId) {
      const statusMessage = `success: ${results.sent} sent, ${results.errors} errors, ${results.skipped} skipped`;
      const { error: updateError } = await supabase
        .from('billing_schedule')
        .update({ 
          last_run_at: new Date().toISOString(),
          last_run_status: statusMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating billing_schedule:', updateError);
      } else {
        console.log('Billing schedule updated with status:', statusMessage);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Billing process completed',
        results,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Unexpected error in billing process:', error);
    return new Response(
      JSON.stringify({ error: 'Unable to process billing request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
