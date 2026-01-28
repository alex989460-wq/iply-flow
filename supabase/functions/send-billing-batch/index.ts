import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_APP_SECRET = Deno.env.get('META_APP_SECRET');

// Mapping of billing types to template names
const TEMPLATE_MAPPING: Record<string, string> = {
  'D-1': 'vence_amanha',
  'D0': 'hoje01',
  'D+1': 'vencido',
};

interface Customer {
  id: string;
  name: string;
  phone: string;
  due_date: string;
  status: string;
  billingType?: 'D-1' | 'D0' | 'D+1';
  normalizedPhone?: string;
}

// Generate appsecret_proof for secure Meta Graph API calls
async function generateAppSecretProof(accessToken: string, appSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const messageData = encoder.encode(accessToken);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Send WhatsApp template message via Meta Cloud API
async function sendWhatsAppTemplateMeta(
  phone: string, 
  templateName: string,
  accessToken: string,
  phoneNumberId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    
    console.log(`[Meta Cloud] Sending template "${templateName}" to ${formattedPhone}`);
    
    // Generate appsecret_proof for security
    let url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    if (META_APP_SECRET) {
      const proof = await generateAppSecretProof(accessToken, META_APP_SECRET);
      url += `?appsecret_proof=${proof}`;
    }
    
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: 'pt_BR'
        }
      }
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    
    if (!response.ok || result.error) {
      console.error(`[Meta Cloud] API error:`, result.error || response.status);
      return { 
        success: false, 
        error: result.error?.message || `Falha ao enviar (${response.status})` 
      };
    }

    console.log(`[Meta Cloud] Template sent successfully to ${formattedPhone}`, result);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Meta Cloud] Error sending template to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
}

// Send WhatsApp template message via Zap Responder API
async function sendWhatsAppTemplateZap(
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
    
    console.log(`[Zap Responder] Sending template "${templateName}" to ${formattedPhone}`);
    
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
      console.error(`[Zap Responder] API error: ${response.status} - ${errorText}`);
      return { success: false, error: 'Falha ao enviar mensagem' };
    }

    const result = await response.json();
    console.log(`[Zap Responder] Template sent successfully to ${formattedPhone}`, result);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Zap Responder] Error sending template to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
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

// Normalize phone number
function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  if (!normalized.startsWith('55') && normalized.length <= 11) {
    normalized = '55' + normalized;
  }
  return normalized;
}

// Get billing type based on due date
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
    const body = await req.json();
    const action = body?.action || 'start';
    
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

    // Load settings
    const { data: userSettings } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let zapSettings: any = userSettings;
    if (!zapSettings && isAdminUser) {
      const { data } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .is('user_id', null)
        .limit(1)
        .maybeSingle();
      zapSettings = data;
    }

    // Detect API type - Meta Cloud or Zap Responder
    const apiType = zapSettings?.api_type || 'zap_responder';
    const isMetaCloud = apiType === 'meta_cloud';
    
    console.log(`[Billing Batch] API type: ${apiType}, isMetaCloud: ${isMetaCloud}`);

    // Validate configuration based on API type
    if (isMetaCloud) {
      if (!zapSettings?.meta_access_token || !zapSettings?.meta_phone_number_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Meta Cloud API não configurada. Conecte seu WhatsApp Oficial em Configurações.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      const zapToken = zapSettings?.zap_api_token || (isAdminUser ? Deno.env.get('ZAP_RESPONDER_TOKEN') : null);
      if (!zapToken) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token não configurado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const departmentId = zapSettings?.selected_department_id;
      if (!departmentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Departamento não configurado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const today = getRelativeDateSaoPaulo(0);
    const yesterday = getRelativeDateSaoPaulo(-1);
    const tomorrow = getRelativeDateSaoPaulo(1);

    // ACTION: START - Get list of customers to process
    if (action === 'start') {
      const filterBillingType = body?.billing_type || null;
      console.log('[Billing Batch] Starting - filter:', filterBillingType);

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
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao buscar clientes' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Pre-fetch billing logs for today
      const { data: existingLogs } = await supabase
        .from('billing_logs')
        .select('customer_id, billing_type, message')
        .gte('sent_at', `${today}T00:00:00`)
        .lte('sent_at', `${today}T23:59:59`);

      // Build sets for deduplication
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

      // Filter customers
      const customersToProcess: Customer[] = [];
      let skippedCount = 0;
      
      for (const customer of customers || []) {
        const billingType = getBillingType(customer.due_date, today);
        
        if (!billingType) {
          skippedCount++;
          continue;
        }
        
        if (filterBillingType && billingType !== filterBillingType) {
          skippedCount++;
          continue;
        }

        if (sentByCustomerAndType.has(`${customer.id}:${billingType}`)) {
          skippedCount++;
          continue;
        }

        const normalizedPhone = normalizePhone(customer.phone);
        if (sentByPhoneAndType.has(`${normalizedPhone}:${billingType}`)) {
          skippedCount++;
          continue;
        }

        customersToProcess.push({ 
          ...customer, 
          billingType, 
          normalizedPhone 
        });
        
        // Mark to avoid duplicates within the batch
        sentByCustomerAndType.add(`${customer.id}:${billingType}`);
        sentByPhoneAndType.add(`${normalizedPhone}:${billingType}`);
      }

      console.log(`[Billing Batch] Total: ${customers?.length || 0}, To process: ${customersToProcess.length}, Skipped: ${skippedCount}`);

      return new Response(
        JSON.stringify({
          success: true,
          action: 'start',
          customers: customersToProcess,
          total: customersToProcess.length,
          skipped: skippedCount,
          userId,
          apiType,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: BATCH - Process a batch of customers
    if (action === 'batch') {
      const batch: Customer[] = body?.batch || [];
      console.log(`[Billing Batch] Processing batch of ${batch.length} customers via ${apiType}`);

      const results: any[] = [];

      for (const customer of batch) {
        const billingType = customer.billingType as 'D-1' | 'D0' | 'D+1';
        const templateName = TEMPLATE_MAPPING[billingType];
        const normalizedPhone = customer.normalizedPhone || normalizePhone(customer.phone);
        
        let sendResult: { success: boolean; error?: string };
        
        if (isMetaCloud) {
          // Send via Meta Cloud API
          sendResult = await sendWhatsAppTemplateMeta(
            customer.phone, 
            templateName, 
            zapSettings.meta_access_token,
            zapSettings.meta_phone_number_id
          );
        } else {
          // Send via Zap Responder
          const zapToken = zapSettings?.zap_api_token || Deno.env.get('ZAP_RESPONDER_TOKEN');
          const apiBaseUrl = zapSettings?.api_base_url || 'https://api.zapresponder.com.br/api';
          const departmentId = zapSettings?.selected_department_id;
          
          sendResult = await sendWhatsAppTemplateZap(
            customer.phone, 
            templateName, 
            zapToken!, 
            apiBaseUrl, 
            departmentId!
          );
        }
        
        // Log to database
        await supabase
          .from('billing_logs')
          .insert({
            customer_id: customer.id,
            billing_type: billingType,
            message: `[${normalizedPhone}] Template: ${templateName} via ${apiType}`,
            whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
          });

        results.push({
          customerId: customer.id,
          customer: customer.name,
          phone: normalizedPhone,
          billingType,
          template: templateName,
          status: sendResult.success ? 'sent' : 'error',
          error: sendResult.error,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'batch',
          results,
          sent: results.filter(r => r.status === 'sent').length,
          errors: results.filter(r => r.status === 'error').length,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: COMPLETE - Update billing schedule with final status
    if (action === 'complete') {
      const { sent, errors, skipped } = body;
      
      if (userId) {
        const statusMessage = `success: ${sent} sent, ${errors} errors, ${skipped} skipped`;
        await supabase
          .from('billing_schedule')
          .update({ 
            last_run_at: new Date().toISOString(),
            last_run_status: statusMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        
        console.log(`[Billing Batch] Complete: ${statusMessage}`);
      }

      return new Response(
        JSON.stringify({ success: true, action: 'complete' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Ação inválida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Billing Batch] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
