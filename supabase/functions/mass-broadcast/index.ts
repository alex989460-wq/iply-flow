import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BroadcastRequest {
  customer_ids: string[];
  template_name: string;
  delay_min_seconds?: number;
  delay_max_seconds?: number;
}

// Generate random delay between min and max
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

// Delay helper function
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_ids, template_name, delay_min_seconds = 5, delay_max_seconds = 10 }: BroadcastRequest = await req.json();

    console.log(`Starting mass broadcast: ${customer_ids.length} customers, template: ${template_name}, delay: ${delay_min_seconds}-${delay_max_seconds}s (random)`);

    if (!customer_ids || customer_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No customers specified' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!template_name) {
      return new Response(
        JSON.stringify({ error: 'No template specified' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Fetch customers
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, name, phone')
      .in('id', customer_ids);

    if (customersError) {
      console.error('Error fetching customers:', customersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch customers', details: customersError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${customers?.length || 0} customers to send`);

    const results = {
      total: customers?.length || 0,
      sent: 0,
      errors: 0,
      details: [] as any[],
    };

    // Process customers one by one with delay to avoid blocking
    for (let i = 0; i < (customers || []).length; i++) {
      const customer = customers![i];
      
      console.log(`Processing ${i + 1}/${customers!.length}: ${customer.name}`);

      // Send WhatsApp template
      const sendResult = await sendWhatsAppTemplate(
        customer.phone, 
        template_name, 
        zapToken, 
        apiBaseUrl, 
        departmentId
      );

      // Log the broadcast attempt (using billing_logs table with a generic type)
      await supabase
        .from('billing_logs')
        .insert({
          customer_id: customer.id,
          billing_type: 'D0' as any, // Using D0 as a placeholder for mass broadcast
          message: `[BROADCAST] ${customer.phone} - Template: ${template_name}`,
          whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
        });

      if (sendResult.success) {
        results.sent++;
        results.details.push({
          customer: customer.name,
          phone: customer.phone,
          status: 'sent',
        });
      } else {
        results.errors++;
        results.details.push({
          customer: customer.name,
          phone: customer.phone,
          status: 'error',
          error: sendResult.error,
        });
      }

      // Add random delay between messages (except for the last one)
      if (i < customers!.length - 1) {
        const randomDelay = getRandomDelay(delay_min_seconds, delay_max_seconds);
        console.log(`Waiting ${randomDelay} seconds before next message... (random between ${delay_min_seconds}-${delay_max_seconds}s)`);
        await delay(randomDelay * 1000);
      }
    }

    console.log('Mass broadcast completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mass broadcast completed',
        results,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Unexpected error in mass broadcast:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
