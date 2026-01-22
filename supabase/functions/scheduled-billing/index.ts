import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapping of billing types to template names
const TEMPLATE_MAPPING: Record<string, string> = {
  'D-1': 'vence_amanha',
  'D0': 'hoje01',
  'D+1': 'vencido',
};

interface BillingSchedule {
  id: string;
  user_id: string;
  is_enabled: boolean;
  send_time: string;
  send_d_minus_1: boolean;
  send_d0: boolean;
  send_d_plus_1: boolean;
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

// Get current time in Sao Paulo
function getCurrentTimeSaoPaulo(): { hour: number; minute: number } {
  const now = new Date();
  const saoPauloTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = parseInt(saoPauloTime.find(p => p.type === 'hour')?.value ?? '0');
  const minute = parseInt(saoPauloTime.find(p => p.type === 'minute')?.value ?? '0');

  return { hour, minute };
}

// Normalize phone number for comparison
function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  if (!normalized.startsWith('55') && normalized.length <= 11) {
    normalized = '55' + normalized;
  }
  return normalized;
}

// Send WhatsApp template message
async function sendWhatsAppTemplate(
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
    
    console.log(`[Scheduled] Sending template "${templateName}" to ${formattedPhone}`);
    
    const response = await fetch(`${apiBaseUrl}/whatsapp/message/${departmentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'template',
        template_name: templateName,
        number: formattedPhone,
        language: 'pt_BR',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Scheduled] API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao enviar mensagem' };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Scheduled] Error sending to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Scheduled Billing] Starting scheduled billing check...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current time in Sao Paulo
    const { hour, minute } = getCurrentTimeSaoPaulo();
    const currentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
    
    console.log(`[Scheduled Billing] Current time in São Paulo: ${currentTime}`);

    // Find all enabled schedules that should run now (within 1-minute window)
    const { data: schedules, error: schedulesError } = await supabase
      .from('billing_schedule')
      .select('*')
      .eq('is_enabled', true);

    if (schedulesError) {
      console.error('[Scheduled Billing] Error fetching schedules:', schedulesError);
      return new Response(
        JSON.stringify({ error: 'Unable to process scheduled billing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Scheduled Billing] Found ${schedules?.length || 0} enabled schedules`);

    // Filter schedules that match current time (within same minute)
    const schedulesToRun = (schedules || []).filter((s: BillingSchedule) => {
      const scheduleTime = s.send_time.substring(0, 5); // HH:MM
      const currentTimeShort = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      return scheduleTime === currentTimeShort;
    });

    console.log(`[Scheduled Billing] Schedules to run now: ${schedulesToRun.length}`);

    if (schedulesToRun.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No schedules to run at this time', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];

    for (const schedule of schedulesToRun) {
      console.log(`[Scheduled Billing] Processing schedule for user: ${schedule.user_id}`);

      // Get user's zap settings
      const { data: zapSettings } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .eq('user_id', schedule.user_id)
        .maybeSingle();

      if (!zapSettings?.zap_api_token || !zapSettings?.selected_session_id) {
        console.log(`[Scheduled Billing] User ${schedule.user_id} missing zap settings`);
        await supabase
          .from('billing_schedule')
          .update({ 
            last_run_at: new Date().toISOString(),
            last_run_status: 'error: configuração incompleta'
          })
          .eq('id', schedule.id);
        continue;
      }

      // Get department ID for the selected session
      let departmentId: string | undefined;
      try {
        const atendenteResponse = await fetch(`${zapSettings.api_base_url}/atendentes`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${zapSettings.zap_api_token}`,
          },
        });
        
        if (atendenteResponse.ok) {
          const atendentes = await atendenteResponse.json();
          const selectedAtendente = atendentes?.find((a: any) => a._id === zapSettings.selected_session_id);
          if (selectedAtendente?.departamento?.length > 0) {
            departmentId = selectedAtendente.departamento[0];
          }
        }
      } catch (e) {
        console.error('[Scheduled Billing] Error fetching department:', e);
      }

      if (!departmentId) {
        console.log(`[Scheduled Billing] No department found for user ${schedule.user_id}`);
        await supabase
          .from('billing_schedule')
          .update({ 
            last_run_at: new Date().toISOString(),
            last_run_status: 'error: configuração incompleta'
          })
          .eq('id', schedule.id);
        continue;
      }

      // Get dates using São Paulo timezone-aware function
      const today = getRelativeDateSaoPaulo(0);
      const yesterday = getRelativeDateSaoPaulo(-1);
      const tomorrow = getRelativeDateSaoPaulo(1);

      console.log(`[Scheduled Billing] Date range: yesterday=${yesterday}, today=${today}, tomorrow=${tomorrow}`);

      // Build billing types to send
      const billingTypesToSend: string[] = [];
      if (schedule.send_d_minus_1) billingTypesToSend.push('D-1');
      if (schedule.send_d0) billingTypesToSend.push('D0');
      if (schedule.send_d_plus_1) billingTypesToSend.push('D+1');

      // Get customers for this user (ativa and inativa only - suspensa is excluded)
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, phone, due_date, status')
        .in('status', ['ativa', 'inativa'])
        .eq('created_by', schedule.user_id)
        .in('due_date', [yesterday, today, tomorrow]);

      console.log(`[Scheduled Billing] Found ${customers?.length || 0} customers for user ${schedule.user_id}`);

      let sent = 0;
      let errors = 0;
      let skipped = 0;

      // Pre-fetch all existing logs for today to avoid individual queries (OPTIMIZATION)
      const { data: existingLogs } = await supabase
        .from('billing_logs')
        .select('customer_id, billing_type, message')
        .gte('sent_at', `${today}T00:00:00`)
        .lte('sent_at', `${today}T23:59:59`);

      // Build a set of already processed customer_ids and phones per billing type
      const processedByType: Record<string, { customerIds: Set<string>; phones: Set<string> }> = {
        'D-1': { customerIds: new Set(), phones: new Set() },
        'D0': { customerIds: new Set(), phones: new Set() },
        'D+1': { customerIds: new Set(), phones: new Set() },
      };

      for (const log of existingLogs || []) {
        const type = log.billing_type as string;
        if (processedByType[type]) {
          processedByType[type].customerIds.add(log.customer_id);
          // Extract phone from message format [Agendado] [phone] or [phone]
          const phoneMatch = log.message?.match(/\[(\d+)\]/);
          if (phoneMatch) {
            processedByType[type].phones.add(normalizePhone(phoneMatch[1]));
          }
        }
      }

      // Filter customers to process
      const customersToProcess: any[] = [];
      
      for (const customer of customers || []) {
        let billingType: 'D-1' | 'D0' | 'D+1' | null = null;
        if (customer.due_date === tomorrow) billingType = 'D-1';
        else if (customer.due_date === today) billingType = 'D0';
        else if (customer.due_date === yesterday) billingType = 'D+1';

        if (!billingType || !billingTypesToSend.includes(billingType)) {
          skipped++;
          continue;
        }

        const normalizedPhone = normalizePhone(customer.phone);
        
        // Check if already sent (by customer_id OR phone)
        if (processedByType[billingType].customerIds.has(customer.id)) {
          skipped++;
          continue;
        }
        
        if (processedByType[billingType].phones.has(normalizedPhone)) {
          console.log(`[Scheduled Billing] Skipping ${customer.name} - phone already received ${billingType}`);
          skipped++;
          continue;
        }

        // Mark as being processed to avoid duplicates within this run
        processedByType[billingType].customerIds.add(customer.id);
        processedByType[billingType].phones.add(normalizedPhone);
        
        customersToProcess.push({ ...customer, billingType });
      }

      console.log(`[Scheduled Billing] Customers to process: ${customersToProcess.length}`);

      // Process in parallel batches of 5 to speed up (CRITICAL OPTIMIZATION)
      const BATCH_SIZE = 5;
      for (let i = 0; i < customersToProcess.length; i += BATCH_SIZE) {
        const batch = customersToProcess.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (customer) => {
          const billingType = customer.billingType as 'D-1' | 'D0' | 'D+1';
          const templateName = TEMPLATE_MAPPING[billingType];
          
          const sendResult = await sendWhatsAppTemplate(
            customer.phone,
            templateName,
            zapSettings.zap_api_token,
            zapSettings.api_base_url,
            departmentId
          );

          // Log the attempt
          await supabase
            .from('billing_logs')
            .insert({
              customer_id: customer.id,
              billing_type: billingType,
              message: `[Agendado] [${normalizePhone(customer.phone)}] Template: ${templateName}`,
              whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
            });

          return sendResult.success;
        });

        const results = await Promise.all(batchPromises);
        
        for (const success of results) {
          if (success) sent++;
          else errors++;
        }
      }

      // Update schedule with last run info
      const statusMessage = `success: ${sent} sent, ${errors} errors, ${skipped} skipped`;
      console.log(`[Scheduled Billing] Updating schedule ${schedule.id} with status: ${statusMessage}`);
      
      const { error: updateError } = await supabase
        .from('billing_schedule')
        .update({ 
          last_run_at: new Date().toISOString(),
          last_run_status: statusMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id);

      if (updateError) {
        console.error(`[Scheduled Billing] Error updating schedule: ${JSON.stringify(updateError)}`);
      } else {
        console.log(`[Scheduled Billing] Schedule ${schedule.id} updated successfully`);
      }

      results.push({
        user_id: schedule.user_id,
        sent,
        errors,
        skipped,
      });

      console.log(`[Scheduled Billing] User ${schedule.user_id}: sent=${sent}, errors=${errors}, skipped=${skipped}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Scheduled billing completed',
        schedulesProcessed: schedulesToRun.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Scheduled Billing] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Unable to process scheduled billing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});