import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Billing message templates
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

// Send WhatsApp message via Zap Responder API using internal message (Agente IA)
async function sendWhatsAppMessage(
  phone: string, 
  message: string, 
  token: string, 
  apiBaseUrl: string,
  sessionId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Format phone number (remove non-digits and ensure country code)
    let formattedPhone = phone.replace(/\D/g, '');
    
    // Ensure phone has country code (Brazil = 55)
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    
    console.log(`Sending WhatsApp message to ${formattedPhone}`);
    
    // Use the internal message endpoint (Agente IA) to send messages
    // POST /api/v2/assistants/internal_message
    const body = {
      chatId: formattedPhone,
      content: {
        type: 'text',
        text: message,
      },
      generateAssistantResponse: false, // Don't generate AI response, just send the message
    };
    
    const response = await fetch(`${apiBaseUrl}/v2/assistants/internal_message`, {
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
      console.error(`Zap Responder API error (internal_message): ${response.status} - ${errorText}`);
      
      // If internal message fails, try starting a bot with the message
      console.log('Trying alternative method: iniciar bot...');
      return await sendViaIniciarBot(formattedPhone, message, token, apiBaseUrl, sessionId);
    }

    const result = await response.json();
    console.log(`Message sent successfully to ${formattedPhone} via internal_message`, result);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error sending message to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
}

// Alternative method: Start bot with initial message
async function sendViaIniciarBot(
  phone: string,
  message: string,
  token: string,
  apiBaseUrl: string,
  departmentId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Trying to send via iniciarBot to ${phone}`);
    
    // If no department ID, we can't use this method
    if (!departmentId) {
      console.error('No department ID available for iniciarBot');
      return { success: false, error: 'Department ID required for iniciarBot method' };
    }
    
    const body = {
      chatId: phone,
      departamento: departmentId,
      aplicacao: 'whatsapp',
      mensagemInicial: message,
    };
    
    const response = await fetch(`${apiBaseUrl}/conversa/iniciarBot`, {
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
      console.error(`Zap Responder API error (iniciarBot): ${response.status} - ${errorText}`);
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
    }

    const result = await response.json();
    console.log(`Message sent successfully to ${phone} via iniciarBot`, result);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error sending via iniciarBot to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
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
  
  if (diffDays === 1) return 'D-1';   // Due tomorrow
  if (diffDays === 0) return 'D0';    // Due today
  if (diffDays === -1) return 'D+1';  // Due yesterday
  
  return null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    
    console.log(`Using department ID: ${departmentId}`);

    // Get today's date in ISO format
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    console.log(`Processing billings for dates: yesterday=${yesterday}, today=${today}, tomorrow=${tomorrow}`);

    // Fetch active customers with due dates in our range
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, name, phone, due_date, status')
      .eq('status', 'ativa')
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

    for (const customer of customers || []) {
      results.processed++;
      
      const billingType = getBillingType(customer.due_date, today);
      
      if (!billingType) {
        console.log(`Skipping customer ${customer.name}: no billing type matched`);
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
        console.log(`Skipping customer ${customer.name}: billing ${billingType} already sent today`);
        results.skipped++;
        continue;
      }

      // Get message template
      const message = MESSAGES[billingType];
      
      // Send WhatsApp message - pass departmentId instead of sessionId
      const sendResult = await sendWhatsAppMessage(customer.phone, message, zapToken, apiBaseUrl, departmentId);
      
      // Log the billing attempt
      const { error: logError } = await supabase
        .from('billing_logs')
        .insert({
          customer_id: customer.id,
          billing_type: billingType,
          message: message,
          whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
        });

      if (logError) {
        console.error(`Error logging billing for ${customer.name}:`, logError);
      }

      if (sendResult.success) {
        results.sent++;
        results.details.push({
          customer: customer.name,
          phone: customer.phone,
          billingType,
          status: 'sent',
        });
      } else {
        results.errors++;
        results.details.push({
          customer: customer.name,
          phone: customer.phone,
          billingType,
          status: 'error',
          error: sendResult.error,
        });
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
