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

interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
}

interface InitialResult {
  customer: string;
  phone: string;
  status: 'skipped';
  error: string;
}

// Generate random delay between min and max
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Normalize phone number for comparison (remove non-digits)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
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

// Background task to process broadcast
async function processBroadcast(
  customersToSend: CustomerInfo[],
  alreadySentCustomers: CustomerInfo[],
  duplicateCustomers: CustomerInfo[],
  templateName: string,
  delayMinSeconds: number,
  delayMaxSeconds: number,
  supabaseUrl: string,
  supabaseServiceKey: string,
  zapToken: string,
  apiBaseUrl: string,
  departmentId: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log(`[BACKGROUND] Starting broadcast processing for ${customersToSend.length} unique customers (${duplicateCustomers.length} duplicates, ${alreadySentCustomers.length} already sent)`);

  let sent = 0;
  let errors = 0;

  // Log duplicate skipped customers
  for (const customer of duplicateCustomers) {
    await supabase
      .from('billing_logs')
      .insert({
        customer_id: customer.id,
        billing_type: 'D0' as any,
        message: `[BROADCAST] ${customer.phone} - Template: ${templateName} - IGNORADO (telefone duplicado)`,
        whatsapp_status: 'skipped',
      });
  }

  // Log already-sent skipped customers
  for (const customer of alreadySentCustomers) {
    await supabase
      .from('billing_logs')
      .insert({
        customer_id: customer.id,
        billing_type: 'D0' as any,
        message: `[BROADCAST] ${customer.phone} - Template: ${templateName} - IGNORADO (já enviado anteriormente)`,
        whatsapp_status: 'skipped',
      });
  }

  // Process customers one by one with delay
  for (let i = 0; i < customersToSend.length; i++) {
    const customer = customersToSend[i];
    const normalizedPhone = normalizePhone(customer.phone);
    
    console.log(`[BACKGROUND] Processing ${i + 1}/${customersToSend.length}: ${customer.name} (${customer.phone})`);

    // Send WhatsApp template
    const sendResult = await sendWhatsAppTemplate(
      customer.phone, 
      templateName, 
      zapToken, 
      apiBaseUrl, 
      departmentId
    );

    // Log the broadcast attempt to billing_logs
    await supabase
      .from('billing_logs')
      .insert({
        customer_id: customer.id,
        billing_type: 'D0' as any,
        message: `[BROADCAST] ${customer.phone} - Template: ${templateName}`,
        whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
      });

    // Upsert to broadcast_logs to track sent templates
    const now = new Date().toISOString();
    await supabase
      .from('broadcast_logs')
      .upsert({
        customer_id: customer.id,
        phone_normalized: normalizedPhone,
        template_name: templateName,
        last_status: sendResult.success ? 'sent' : 'error',
        last_error: sendResult.success ? null : sendResult.error,
        last_sent_at: sendResult.success ? now : null,
        updated_at: now,
      }, { onConflict: 'phone_normalized,template_name' });

    if (sendResult.success) {
      sent++;
    } else {
      errors++;
    }

    // Add random delay between messages (except for the last one)
    if (i < customersToSend.length - 1) {
      const randomDelay = getRandomDelay(delayMinSeconds, delayMaxSeconds);
      console.log(`[BACKGROUND] Waiting ${randomDelay} seconds before next message...`);
      await delay(randomDelay * 1000);
    }
  }

  console.log(`[BACKGROUND] Broadcast completed: ${sent} sent, ${errors} errors, ${duplicateCustomers.length} duplicates skipped, ${alreadySentCustomers.length} already sent skipped`);
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch customers
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, name, phone')
      .in('id', customer_ids);

    if (customersError || !customers) {
      console.error('Error fetching customers:', customersError);
      return new Response(
        JSON.stringify({ error: 'Error fetching customers' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all normalized phones to check
    const allNormalizedPhones = customers.map(c => normalizePhone(c.phone));

    // Check broadcast_logs for already sent templates
    const { data: existingLogs } = await supabase
      .from('broadcast_logs')
      .select('phone_normalized')
      .eq('template_name', template_name)
      .eq('last_status', 'sent')
      .in('phone_normalized', allNormalizedPhones);

    const alreadySentPhones = new Set((existingLogs || []).map((l: any) => l.phone_normalized));
    console.log(`Found ${alreadySentPhones.size} phones that already received template "${template_name}"`);

    // Filter customers:
    // 1) Already sent (same template) -> skip
    // 2) Duplicate phone in current batch -> skip
    // 3) New -> send
    const seenPhones = new Set<string>();
    const customersToSend: CustomerInfo[] = [];
    const duplicateCustomers: CustomerInfo[] = [];
    const alreadySentCustomers: CustomerInfo[] = [];

    for (const customer of customers) {
      const normalizedPhone = normalizePhone(customer.phone);

      if (alreadySentPhones.has(normalizedPhone)) {
        alreadySentCustomers.push(customer);
        console.log(`Skipping already sent: ${customer.name} (${customer.phone})`);
      } else if (seenPhones.has(normalizedPhone)) {
        duplicateCustomers.push(customer);
        console.log(`Skipping duplicate phone: ${customer.name} (${customer.phone})`);
      } else {
        seenPhones.add(normalizedPhone);
        customersToSend.push(customer);
      }
    }

    console.log(`To send: ${customersToSend.length}, Duplicates: ${duplicateCustomers.length}, Already sent: ${alreadySentCustomers.length}`);

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

    // Start background task for processing
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    (globalThis as any).EdgeRuntime.waitUntil(
      processBroadcast(
        customersToSend,
        alreadySentCustomers,
        duplicateCustomers,
        template_name,
        delay_min_seconds,
        delay_max_seconds,
        supabaseUrl,
        supabaseServiceKey,
        zapToken,
        apiBaseUrl,
        departmentId
      )
    );

    // Return immediately with acknowledgment including duplicate and already-sent info
    console.log('Broadcast task started in background, returning response immediately');

    // Build initial results for UI
    const initialResults: InitialResult[] = [
      ...alreadySentCustomers.map(c => ({
        customer: c.name,
        phone: c.phone,
        status: 'skipped' as const,
        error: 'Já enviado anteriormente',
      })),
      ...duplicateCustomers.map(c => ({
        customer: c.name,
        phone: c.phone,
        status: 'skipped' as const,
        error: 'Telefone duplicado',
      })),
    ];

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Broadcast started in background',
        total: customers.length,
        unique: customersToSend.length,
        skipped: alreadySentCustomers.length + duplicateCustomers.length,
        already_sent: alreadySentCustomers.length,
        duplicates: duplicateCustomers.length,
        template: template_name,
        estimated_time_minutes: Math.ceil((customersToSend.length * ((delay_min_seconds + delay_max_seconds) / 2)) / 60),
        initial_results: initialResults,
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
