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
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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
    
    const zapToken = Deno.env.get('ZAP_RESPONDER_TOKEN');
    if (!zapToken) {
      console.error('ZAP_RESPONDER_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'ZAP_RESPONDER_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role for full access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Zap Responder settings
    const { data: zapSettings } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .limit(1)
      .single();

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
      console.error('No department ID found - cannot send messages');
      return new Response(
        JSON.stringify({ error: 'No department ID configured. Please select a session in Billing settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Using department ID: ${departmentId}`);

    // Get today's date in Sao Paulo timezone (YYYY-MM-DD)
    const today = formatDateSaoPaulo(new Date());
    const yesterday = formatDateSaoPaulo(new Date(Date.now() - 86400000));
    const tomorrow = formatDateSaoPaulo(new Date(Date.now() + 86400000));

    console.log(`Processing billings for dates: yesterday=${yesterday}, today=${today}, tomorrow=${tomorrow}`);

    // Fetch customers (ativa + inativa) with due dates in our range
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, name, phone, due_date, status')
      .in('status', ['ativa', 'inativa'])
      .in('due_date', [yesterday, today, tomorrow]);

    if (customersError) {
      console.error('Error fetching customers:', customersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch customers', details: customersError }),
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

    // Pre-filter customers to avoid duplicate log checks in parallel processing
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

      // Check if we already sent this billing type today
      const { data: existingLog } = await supabase
        .from('billing_logs')
        .select('id')
        .eq('customer_id', customer.id)
        .eq('billing_type', billingType)
        .gte('sent_at', `${today}T00:00:00`)
        .lte('sent_at', `${today}T23:59:59`)
        .maybeSingle();

      if (existingLog) {
        results.skipped++;
        continue;
      }

      customersToProcess.push({ ...customer, billingType });
    }

    console.log(`Customers to process after filtering: ${customersToProcess.length}`);

    // Process in parallel batches of 5 to speed up
    const BATCH_SIZE = 5;
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
            message: `[${customer.phone}] Template: ${templateName}`,
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Unexpected error in billing process:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});