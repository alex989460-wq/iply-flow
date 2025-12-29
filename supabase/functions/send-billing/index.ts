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

// Send WhatsApp message via Zap Responder API
async function sendWhatsAppMessage(
  phone: string, 
  message: string, 
  token: string, 
  apiBaseUrl: string,
  sessionId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Format phone number (remove non-digits and ensure country code)
    const formattedPhone = phone.replace(/\D/g, '');
    
    console.log(`Sending WhatsApp message to ${formattedPhone}`);
    
    const body: any = {
      phone: formattedPhone,
      message: message,
    };
    
    // Add session_id if available
    if (sessionId) {
      body.session_id = sessionId;
    }
    
    const response = await fetch(`${apiBaseUrl}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Zap Responder API error: ${response.status} - ${errorText}`);
      return { success: false, error: `API error: ${response.status} - ${errorText}` };
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

    const apiBaseUrl = zapSettings?.api_base_url || 'https://api.zapresponder.com.br/v1';
    const selectedSessionId = zapSettings?.selected_session_id;

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
      
      // Send WhatsApp message
      const sendResult = await sendWhatsAppMessage(customer.phone, message, zapToken, apiBaseUrl, selectedSessionId);
      
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
