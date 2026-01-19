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
      return { success: false, error: `API error: ${response.status}` };
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
        JSON.stringify({ error: 'Failed to fetch schedules' }),
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
            last_run_status: 'error: missing zap settings'
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
            last_run_status: 'error: no department'
          })
          .eq('id', schedule.id);
        continue;
      }

      // Get dates
      const today = formatDateSaoPaulo(new Date());
      const yesterday = formatDateSaoPaulo(new Date(Date.now() - 86400000));
      const tomorrow = formatDateSaoPaulo(new Date(Date.now() + 86400000));

      // Build billing types to send
      const billingTypesToSend: string[] = [];
      if (schedule.send_d_minus_1) billingTypesToSend.push('D-1');
      if (schedule.send_d0) billingTypesToSend.push('D0');
      if (schedule.send_d_plus_1) billingTypesToSend.push('D+1');

      // Get customers for this user
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

      for (const customer of customers || []) {
        // Determine billing type
        let billingType: 'D-1' | 'D0' | 'D+1' | null = null;
        if (customer.due_date === tomorrow) billingType = 'D-1';
        else if (customer.due_date === today) billingType = 'D0';
        else if (customer.due_date === yesterday) billingType = 'D+1';

        if (!billingType || !billingTypesToSend.includes(billingType)) {
          skipped++;
          continue;
        }

        // Check if already sent today
        const { data: existingLog } = await supabase
          .from('billing_logs')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('billing_type', billingType)
          .gte('sent_at', `${today}T00:00:00`)
          .lte('sent_at', `${today}T23:59:59`)
          .maybeSingle();

        if (existingLog) {
          skipped++;
          continue;
        }

        // Send the template
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
            message: `[Agendado] [${customer.phone}] Template: ${templateName}`,
            whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
          });

        if (sendResult.success) {
          sent++;
        } else {
          errors++;
        }
      }

      // Update schedule with last run info
      await supabase
        .from('billing_schedule')
        .update({ 
          last_run_at: new Date().toISOString(),
          last_run_status: `success: ${sent} sent, ${errors} errors, ${skipped} skipped`
        })
        .eq('id', schedule.id);

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Scheduled Billing] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});