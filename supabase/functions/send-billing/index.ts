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
async function sendWhatsAppTemplate(
  phone: string, 
  templateName: string,
  token: string, 
  apiBaseUrl: string,
  departmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Format phone number (remove non-digits and ensure country code)
    let formattedPhone = phone.replace(/\D/g, '');
    
    // Ensure phone has country code (Brazil = 55)
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    
    console.log(`Sending WhatsApp template "${templateName}" to ${formattedPhone} via department ${departmentId}`);
    
    // Use the WhatsApp template endpoint
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
      console.error(`Zap Responder API error (template): ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao enviar mensagem' };
    }

    const result = await response.json();
    console.log(`Template "${templateName}" sent successfully to ${formattedPhone}`, result);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error sending template to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
}

// Format YYYY-MM-DD in America/Sao_Paulo (prevents UTC day-shift issues)
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

// Get dates relative to São Paulo timezone (handles DST correctly)
function getRelativeDateSaoPaulo(daysOffset: number): string {
  // Get current date parts in São Paulo
  const now = new Date();
  const saoPauloDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  
  // Parse and add offset
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

  // Reset time for accurate date comparison
  due.setHours(0, 0, 0, 0);
  todayDate.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - todayDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return 'D-1'; // Due tomorrow
  if (diffDays === 0) return 'D0'; // Due today
  if (diffDays === -1) return 'D+1'; // Due yesterday

  return null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body to get optional billing_type filter
    let filterBillingType: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        filterBillingType = body?.billing_type || null;
        console.log(`Filter billing type: ${filterBillingType}`);
      } catch {
        // No body or invalid JSON, proceed without filter
      }
    }
    
    console.log('Starting billing process...');
    
    // Initialize Supabase client with service role for full access
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

    // Admin-only fallback to global settings (backwards compatibility)
    if (!zapSettings && isAdminUser) {
      const { data } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .is('user_id', null)
        .limit(1)
        .maybeSingle();
      zapSettings = data;
    }

    // Token MUST be user-configured for non-admin users
    const zapToken = zapSettings?.zap_api_token || (isAdminUser ? Deno.env.get('ZAP_RESPONDER_TOKEN') : null);
    if (!zapToken) {
      console.error('API token not configured for user:', userId);
      return new Response(
        JSON.stringify({ error: 'Configuração incompleta. Verifique suas configurações.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiBaseUrl = zapSettings?.api_base_url || 'https://api.zapresponder.com.br/api';
    const selectedSessionId = zapSettings?.selected_session_id;

    console.log(`Using API base URL: ${apiBaseUrl}`);
    console.log(`Selected session ID: ${selectedSessionId}`);

    // Fetch the attendant info to get the department ID
    let departmentId: string | undefined;
    if (selectedSessionId) {
      try {
        const atendenteResponse = await fetch(`${apiBaseUrl}/atendentes`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${zapToken}`,
          },
        });
        
        if (atendenteResponse.ok) {
          const atendentes = await atendenteResponse.json();
          // Find the selected attendant
          const selectedAtendente = atendentes?.find((a: any) => a._id === selectedSessionId);
          if (selectedAtendente?.departamento?.length > 0) {
            departmentId = selectedAtendente.departamento[0];
            console.log(`Found department ID for attendant: ${departmentId}`);
          }
        }
      } catch (e) {
        console.error('Error fetching attendant department:', e);
      }
    }
    
    if (!departmentId) {
      console.error('No department ID found for user:', userId);
      return new Response(
        JSON.stringify({ error: 'Configuração incompleta. Selecione uma sessão em Configurações.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Using department ID: ${departmentId}`);

    // Get today's date in Sao Paulo timezone (YYYY-MM-DD) using timezone-aware function
    const today = getRelativeDateSaoPaulo(0);
    const yesterday = getRelativeDateSaoPaulo(-1);
    const tomorrow = getRelativeDateSaoPaulo(1);

    console.log(`Processing billings for dates: yesterday=${yesterday}, today=${today}, tomorrow=${tomorrow}`);

    // Fetch customers (ativa + inativa) with due dates in our range
    // SECURITY: Filter by created_by to ensure user can only process their own customers
    let customerQuery = supabase
      .from('customers')
      .select('id, name, phone, due_date, status')
      .in('status', ['ativa', 'inativa'])
      .in('due_date', [yesterday, today, tomorrow]);
    
    // Non-admin users can only access their own customers
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

    // Pre-fetch ALL billing logs for today in a SINGLE query (optimized)
    const { data: existingLogs } = await supabase
      .from('billing_logs')
      .select('customer_id, billing_type, message')
      .gte('sent_at', `${today}T00:00:00`)
      .lte('sent_at', `${today}T23:59:59`);

    // Build sets for fast lookups
    const sentByCustomerAndType = new Set<string>();
    const sentByPhoneAndType = new Set<string>();
    
    for (const log of existingLogs || []) {
      // Track customer_id + billing_type
      sentByCustomerAndType.add(`${log.customer_id}:${log.billing_type}`);
      
      // Extract phone from message and track phone + billing_type
      const phoneMatch = log.message?.match(/\[(\d+)\]/);
      if (phoneMatch) {
        const normalizedLogPhone = normalizePhone(phoneMatch[1]);
        sentByPhoneAndType.add(`${normalizedLogPhone}:${log.billing_type}`);
      }
    }

    console.log(`Found ${existingLogs?.length || 0} existing logs for today`);

    // Pre-filter customers to avoid duplicate processing
    const customersToProcess: any[] = [];
    
    for (const customer of customers || []) {
      results.processed++;
      
      const billingType = getBillingType(customer.due_date, today);
      
      if (!billingType) {
        results.skipped++;
        continue;
      }
      
      // If filter is set, skip customers that don't match
      if (filterBillingType && billingType !== filterBillingType) {
        results.skipped++;
        continue;
      }

      // Check if already sent by customer_id + billing_type
      if (sentByCustomerAndType.has(`${customer.id}:${billingType}`)) {
        results.skipped++;
        continue;
      }

      // Check if already sent by phone + billing_type
      const normalizedPhone = normalizePhone(customer.phone);
      if (sentByPhoneAndType.has(`${normalizedPhone}:${billingType}`)) {
        console.log(`Skipping ${customer.name} - phone ${normalizedPhone} already received ${billingType} message today`);
        results.skipped++;
        continue;
      }

      // Add to processing list and mark as "will be sent" to avoid duplicates within batch
      customersToProcess.push({ ...customer, billingType, normalizedPhone });
      sentByCustomerAndType.add(`${customer.id}:${billingType}`);
      sentByPhoneAndType.add(`${normalizedPhone}:${billingType}`);
    }

    console.log(`Customers to process after filtering: ${customersToProcess.length}`);

    // Process in parallel batches of 10 for faster execution
    const BATCH_SIZE = 10;
    for (let i = 0; i < customersToProcess.length; i += BATCH_SIZE) {
      const batch = customersToProcess.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (customer) => {
        const billingType = customer.billingType as 'D-1' | 'D0' | 'D+1';
        const templateName = TEMPLATE_MAPPING[billingType];
        
        // Send WhatsApp template
        const sendResult = await sendWhatsAppTemplate(customer.phone, templateName, zapToken, apiBaseUrl, departmentId);
        
        // Log the billing attempt
        await supabase
          .from('billing_logs')
          .insert({
            customer_id: customer.id,
            billing_type: billingType,
            message: `[${customer.normalizedPhone}] Template: ${templateName}`,
            whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
          });

        return {
          customer: customer.name,
          phone: customer.phone,
          billingType,
          template: templateName,
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
            template: result.template,
            status: 'sent',
          });
        } else {
          results.errors++;
          results.details.push({
            customer: result.customer,
            phone: result.phone,
            billingType: result.billingType,
            template: result.template,
            status: 'error',
            error: result.error,
          });
        }
      }
    }

    console.log('Billing process completed:', results);

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