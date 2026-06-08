import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default mapping of billing types to template names (fallback only)
const DEFAULT_TEMPLATE_MAPPING: Record<string, string> = {
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
  template_d_minus_1: string | null;
  template_d0: string | null;
  template_d_plus_1: string | null;
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

    // Find all enabled schedules that should run now (resumable across cron ticks)
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

    // Run schedule if: current time >= send_time, within 6h window, and not completed today.
    // This lets cron resume the same schedule across multiple minutes until all customers are sent.
    const todayStrSP = getRelativeDateSaoPaulo(0);
    const currentMinutes = hour * 60 + minute;
    const schedulesToRun = (schedules || []).filter((s: BillingSchedule) => {
      const [sh, sm] = s.send_time.substring(0, 5).split(':').map(Number);
      const sendMinutes = sh * 60 + sm;
      if (currentMinutes < sendMinutes) return false;
      if (currentMinutes > sendMinutes + 360) return false;
      const lastRunAt = (s as any).last_run_at as string | null;
      const lastStatus = (s as any).last_run_status as string | null;
      if (lastRunAt && lastStatus?.startsWith('completed:')) {
        const lastDateSP = formatDateSaoPaulo(new Date(lastRunAt));
        if (lastDateSP === todayStrSP) return false;
      }
      return true;
    });

    console.log(`[Scheduled Billing] Schedules to run now: ${schedulesToRun.length}`);

    if (schedulesToRun.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No schedules to run at this time', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process at most this many customers per invocation to stay under edge function limits
    const BATCH_SIZE = 4;

    const results: any[] = [];

    for (const schedule of schedulesToRun) {
      console.log(`[Scheduled Billing] Processing schedule for user: ${schedule.user_id}`);

      // Get user's zap settings
      const { data: zapSettings } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .eq('user_id', schedule.user_id)
        .maybeSingle();

      if (!zapSettings?.zap_api_token || (!zapSettings?.selected_session_id && !zapSettings?.selected_department_id)) {
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

      // Use saved department ID first, then try to fetch from API as fallback
      let departmentId: string | undefined = zapSettings.selected_department_id || undefined;
      
      if (!departmentId && zapSettings.selected_session_id) {
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
          } else {
            console.log(`[Scheduled Billing] Could not fetch attendants, will use saved department ID if available`);
          }
        } catch (e) {
          console.error('[Scheduled Billing] Error fetching department:', e);
        }
      }

      if (!departmentId) {
        console.log(`[Scheduled Billing] No department found for user ${schedule.user_id}`);
        await supabase
          .from('billing_schedule')
          .update({ 
            last_run_at: new Date().toISOString(),
            last_run_status: 'error: configuração de departamento ausente'
          })
          .eq('id', schedule.id);
        continue;
      }

      console.log(`[Scheduled Billing] Using department ID: ${departmentId}`);

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
        .select('id, name, phone, extra_phone, due_date, status')
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

      const totalPending = customersToProcess.length;
      const batch = customersToProcess.slice(0, BATCH_SIZE);
      console.log(`[Scheduled Billing] Customers pending today: ${totalPending}. Processing batch of ${batch.length}.`);

      // Mark in_progress immediately so manual UI shows progress and we don't double-trigger
      await supabase
        .from('billing_schedule')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: `in_progress: ${totalPending} pendentes`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id);

      // Sequential send with anti-ban delay (shorter to fit more per invocation)
      const MIN_DELAY_MS = 8_000;
      const MAX_DELAY_MS = 15_000;
      
      // Build template mapping from schedule's saved templates
      const templateMapping: Record<string, string> = { ...DEFAULT_TEMPLATE_MAPPING };
      if (schedule.template_d_minus_1) templateMapping['D-1'] = schedule.template_d_minus_1;
      if (schedule.template_d0) templateMapping['D0'] = schedule.template_d0;
      if (schedule.template_d_plus_1) templateMapping['D+1'] = schedule.template_d_plus_1;

      for (let i = 0; i < batch.length; i++) {
        const customer = batch[i];
        const billingType = customer.billingType as 'D-1' | 'D0' | 'D+1';
        const templateName = templateMapping[billingType];

        console.log(`[Scheduled] (${i + 1}/${batch.length}) Template "${templateName}" -> ${customer.name}`);

        const sendResult = await sendWhatsAppTemplate(
          customer.phone,
          templateName,
          zapSettings.zap_api_token,
          zapSettings.api_base_url,
          departmentId
        );

        if (customer.extra_phone && String(customer.extra_phone).replace(/\D/g, '').length >= 10) {
          try {
            await sendWhatsAppTemplate(
              customer.extra_phone,
              templateName,
              zapSettings.zap_api_token,
              zapSettings.api_base_url,
              departmentId
            );
          } catch (e) {
            console.error(`[Scheduled] Extra phone send failed for ${customer.name}:`, e);
          }
        }

        await supabase.from('billing_logs').insert({
          customer_id: customer.id,
          billing_type: billingType,
          message: `[Agendado] [${normalizePhone(customer.phone)}] Template: ${templateName}`,
          whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
        });

        if (sendResult.success) sent++; else errors++;

        // Anti-ban random delay before next send within this batch
        if (i < batch.length - 1) {
          const delay = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
          console.log(`[Scheduled] Waiting ${(delay / 1000).toFixed(1)}s before next send...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      const remaining = totalPending - batch.length;
      const statusMessage = remaining > 0
        ? `in_progress: lote ${sent} enviados / ${remaining} restantes`
        : `completed: ${sent} enviados, ${errors} erros nesta execução`;
      console.log(`[Scheduled Billing] Updating schedule ${schedule.id}: ${statusMessage}`);

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
      }

      results.push({
        user_id: schedule.user_id,
        sent,
        errors,
        skipped,
        remaining,
      });

      console.log(`[Scheduled Billing] User ${schedule.user_id}: sent=${sent}, errors=${errors}, remaining=${remaining}`);
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