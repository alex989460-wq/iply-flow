import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type BroadcastAction = 'start' | 'batch' | 'legacy';

interface BroadcastRequestBase {
  action?: BroadcastAction;
  customer_ids: string[];
  template_name: string;
}

interface LegacyBroadcastRequest extends BroadcastRequestBase {
  action?: 'legacy';
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
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
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

function clampInt(value: unknown, fallback: number, min: number, max?: number) {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const floored = Math.floor(raw);
  const clamped = Math.max(min, max != null ? Math.min(floored, max) : floored);
  return clamped;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

// PostgREST can return 400 (Bad Request) when `.in(...)` lists are too large.
// Chunking avoids URL/query length limits for big broadcasts.
const CUSTOMER_ID_CHUNK_SIZE = 200;
const PHONE_CHUNK_SIZE = 500;

async function fetchCustomersByIds(supabase: any, customerIds: string[]) {
  const customers: any[] = [];

  for (const chunk of chunkArray(customerIds, CUSTOMER_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase.from('customers').select('id, name, phone').in('id', chunk);
    if (error) return { customers: null as any[] | null, error };
    if (data?.length) customers.push(...data);
  }

  return { customers, error: null };
}

async function fetchAlreadySentPhones(supabase: any, templateName: string, phonesNormalized: string[]) {
  const sentPhones = new Set<string>();

  for (const chunk of chunkArray(phonesNormalized, PHONE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('broadcast_logs')
      .select('phone_normalized')
      .eq('template_name', templateName)
      .eq('last_status', 'sent')
      .in('phone_normalized', chunk);

    if (error) return { sentPhones: null as Set<string> | null, error };

    for (const row of data || []) {
      sentPhones.add((row as any).phone_normalized);
    }
  }

  return { sentPhones, error: null };
}

async function startBroadcastPlan(args: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  customerIds: string[];
  templateName: string;
}) {
  const supabase = createClient(args.supabaseUrl, args.supabaseServiceKey);

  // Fetch customers (chunked)
  const { customers, error: customersError } = await fetchCustomersByIds(supabase, args.customerIds);

  if (customersError || !customers) {
    console.error('Error fetching customers:', customersError);
    return { ok: false as const, status: 500, body: { error: 'Error fetching customers' } };
  }

  // Get all normalized phones to check
  const allNormalizedPhones = customers.map((c: any) => normalizePhone(c.phone));

  // Check broadcast_logs for already sent templates (chunked)
  const { sentPhones: alreadySentPhones, error: sentPhonesError } = await fetchAlreadySentPhones(
    supabase,
    args.templateName,
    allNormalizedPhones
  );

  if (sentPhonesError || !alreadySentPhones) {
    console.error('Error fetching broadcast logs:', sentPhonesError);
    return { ok: false as const, status: 500, body: { error: 'Error checking previous sends' } };
  }

  console.log(`Found ${alreadySentPhones.size} phones that already received template "${args.templateName}"`);

  const seenPhones = new Set<string>();
  const customersToSend: CustomerInfo[] = [];
  const duplicateCustomers: CustomerInfo[] = [];
  const alreadySentCustomers: CustomerInfo[] = [];

  for (const customer of customers as any[]) {
    const normalizedPhone = normalizePhone(customer.phone);

    if (alreadySentPhones.has(normalizedPhone)) {
      alreadySentCustomers.push(customer);
    } else if (seenPhones.has(normalizedPhone)) {
      duplicateCustomers.push(customer);
    } else {
      seenPhones.add(normalizedPhone);
      customersToSend.push(customer);
    }
  }

  console.log(
    `Broadcast plan: total=${customers.length}, to_send=${customersToSend.length}, duplicates=${duplicateCustomers.length}, already_sent=${alreadySentCustomers.length}`
  );

  // Log skips immediately (so UI receives realtime updates)
  if (duplicateCustomers.length > 0) {
    const { error } = await supabase.from('billing_logs').insert(
      duplicateCustomers.map((customer) => ({
        customer_id: customer.id,
        billing_type: 'D0' as any,
        message: `[BROADCAST] ${customer.phone} - Template: ${args.templateName} - IGNORADO (telefone duplicado)`,
        whatsapp_status: 'skipped',
      }))
    );

    if (error) console.error('Error inserting duplicate skip logs:', error);
  }

  if (alreadySentCustomers.length > 0) {
    const { error } = await supabase.from('billing_logs').insert(
      alreadySentCustomers.map((customer) => ({
        customer_id: customer.id,
        billing_type: 'D0' as any,
        message: `[BROADCAST] ${customer.phone} - Template: ${args.templateName} - IGNORADO (já enviado anteriormente)`,
        whatsapp_status: 'skipped',
      }))
    );

    if (error) console.error('Error inserting already-sent skip logs:', error);
  }

  const initialResults: InitialResult[] = [
    ...alreadySentCustomers.map((c) => ({
      customer: c.name,
      phone: c.phone,
      status: 'skipped' as const,
      error: 'Já enviado anteriormente',
    })),
    ...duplicateCustomers.map((c) => ({
      customer: c.name,
      phone: c.phone,
      status: 'skipped' as const,
      error: 'Telefone duplicado',
    })),
  ];

  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      total: customers.length,
      unique: customersToSend.length,
      skipped: alreadySentCustomers.length + duplicateCustomers.length,
      already_sent: alreadySentCustomers.length,
      duplicates: duplicateCustomers.length,
      template: args.templateName,
      queue_customer_ids: customersToSend.map((c) => c.id),
      initial_results: initialResults,
    },
  };
}

async function processBroadcastBatch(args: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  zapToken: string;
  customerIds: string[];
  templateName: string;
  userId?: string | null;
  isAdmin?: boolean;
}) {
  const supabase = createClient(args.supabaseUrl, args.supabaseServiceKey);

  // Fetch user-specific settings
  let zapSettings: any = null;
  if (args.userId) {
    const { data } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('user_id', args.userId)
      .maybeSingle();
    zapSettings = data;
  }

  // Admin-only fallback to global settings (backwards compatibility)
  if (!zapSettings) {
    if (args.isAdmin) {
      const { data, error: zapSettingsError } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .is('user_id', null)
        .limit(1)
        .maybeSingle();

      if (zapSettingsError) {
        console.error('Error fetching zap settings:', zapSettingsError);
        return { ok: false as const, status: 500, body: { error: 'Erro ao carregar configurações do Zap' } };
      }

      zapSettings = data;
    } else {
      return { ok: false as const, status: 400, body: { error: 'Token da API não configurado. Configure em Configurações.' } };
    }
  }

  // Token MUST be user-configured for non-admin users
  const effectiveToken = zapSettings?.zap_api_token || (args.isAdmin ? args.zapToken : null);
  if (!effectiveToken) {
    return { ok: false as const, status: 400, body: { error: 'Token da API não configurado. Configure em Configurações.' } };
  }

  const apiBaseUrl = zapSettings?.api_base_url || 'https://api.zapresponder.com.br/api';
  const departmentId = zapSettings?.selected_department_id;

  if (!departmentId) {
    return {
      ok: false as const,
      status: 400,
      body: { error: 'Departamento não configurado. Configure em Configurações.' },
    };
  }

  // Customers
  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, name, phone')
    .in('id', args.customerIds);

  if (customersError || !customers) {
    console.error('Error fetching customers for batch:', customersError);
    return { ok: false as const, status: 500, body: { error: 'Error fetching customers' } };
  }

  console.log(
    `Processing batch: size=${customers.length}, template=${args.templateName}, department=${departmentId}, apiBaseUrl=${apiBaseUrl}`
  );

  const nowIso = new Date().toISOString();

  const results = await Promise.all(
    (customers as any[]).map(async (customer) => {
      const sendResult = await sendWhatsAppTemplate(customer.phone, args.templateName, effectiveToken, apiBaseUrl, departmentId);
      return {
        customer,
        normalizedPhone: normalizePhone(customer.phone),
        sendResult,
      };
    })
  );

  const billingRows = results.map(({ customer, sendResult }) => ({
    customer_id: customer.id,
    billing_type: 'D0' as any,
    message: `[BROADCAST] ${customer.phone} - Template: ${args.templateName}`,
    whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error || 'Unknown error'}`,
  }));

  const { error: billingError } = await supabase.from('billing_logs').insert(billingRows);
  if (billingError) console.error('Error inserting billing logs (batch):', billingError);

  const broadcastRows = results.map(({ customer, normalizedPhone, sendResult }) => ({
    customer_id: customer.id,
    phone_normalized: normalizedPhone,
    template_name: args.templateName,
    last_status: sendResult.success ? 'sent' : 'error',
    last_error: sendResult.success ? null : sendResult.error || 'Unknown error',
    last_sent_at: sendResult.success ? nowIso : null,
    updated_at: nowIso,
  }));

  const { error: broadcastError } = await supabase
    .from('broadcast_logs')
    .upsert(broadcastRows, { onConflict: 'phone_normalized,template_name' });
  if (broadcastError) console.error('Error upserting broadcast logs (batch):', broadcastError);

  const sent = results.filter((r) => r.sendResult.success).length;
  const errors = results.length - sent;

  console.log(`Batch completed: sent=${sent}, errors=${errors}`);

  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      batch_total: results.length,
      sent,
      errors,
    },
  };
}

// Delay helper function (legacy mode)
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generate random delay between min and max (legacy mode)
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Legacy background task to process the whole broadcast (can time out on long lists)
async function processBroadcastLegacy(args: {
  customersToSend: CustomerInfo[];
  alreadySentCustomers: CustomerInfo[];
  duplicateCustomers: CustomerInfo[];
  templateName: string;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  supabaseUrl: string;
  supabaseServiceKey: string;
  zapToken: string;
  apiBaseUrl: string;
  departmentId: string;
}) {
  const supabase = createClient(args.supabaseUrl, args.supabaseServiceKey);

  console.log(
    `[BACKGROUND][LEGACY] Starting broadcast processing for ${args.customersToSend.length} unique customers (${args.duplicateCustomers.length} duplicates, ${args.alreadySentCustomers.length} already sent)`
  );

  // Log duplicate skipped customers
  if (args.duplicateCustomers.length > 0) {
    await supabase.from('billing_logs').insert(
      args.duplicateCustomers.map((customer) => ({
        customer_id: customer.id,
        billing_type: 'D0' as any,
        message: `[BROADCAST] ${customer.phone} - Template: ${args.templateName} - IGNORADO (telefone duplicado)`,
        whatsapp_status: 'skipped',
      }))
    );
  }

  // Log already-sent skipped customers
  if (args.alreadySentCustomers.length > 0) {
    await supabase.from('billing_logs').insert(
      args.alreadySentCustomers.map((customer) => ({
        customer_id: customer.id,
        billing_type: 'D0' as any,
        message: `[BROADCAST] ${customer.phone} - Template: ${args.templateName} - IGNORADO (já enviado anteriormente)`,
        whatsapp_status: 'skipped',
      }))
    );
  }

  for (let i = 0; i < args.customersToSend.length; i++) {
    const customer = args.customersToSend[i];
    const normalizedPhone = normalizePhone(customer.phone);

    console.log(`[BACKGROUND][LEGACY] Processing ${i + 1}/${args.customersToSend.length}: ${customer.name} (${customer.phone})`);

    const sendResult = await sendWhatsAppTemplate(
      customer.phone,
      args.templateName,
      args.zapToken,
      args.apiBaseUrl,
      args.departmentId
    );

    await supabase.from('billing_logs').insert({
      customer_id: customer.id,
      billing_type: 'D0' as any,
      message: `[BROADCAST] ${customer.phone} - Template: ${args.templateName}`,
      whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
    });

    const now = new Date().toISOString();
    await supabase
      .from('broadcast_logs')
      .upsert(
        {
          customer_id: customer.id,
          phone_normalized: normalizedPhone,
          template_name: args.templateName,
          last_status: sendResult.success ? 'sent' : 'error',
          last_error: sendResult.success ? null : sendResult.error,
          last_sent_at: sendResult.success ? now : null,
          updated_at: now,
        },
        { onConflict: 'phone_normalized,template_name' }
      );

    if (i < args.customersToSend.length - 1) {
      const randomDelay = getRandomDelay(args.delayMinSeconds, args.delayMaxSeconds);
      console.log(`[BACKGROUND][LEGACY] Waiting ${randomDelay} seconds before next message...`);
      await delay(randomDelay * 1000);
    }
  }

  console.log('[BACKGROUND][LEGACY] Broadcast completed');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as BroadcastRequestBase & Partial<LegacyBroadcastRequest>;

    const customer_ids = Array.isArray(body.customer_ids) ? body.customer_ids : [];
    const template_name = typeof body.template_name === 'string' ? body.template_name : '';
    const action: BroadcastAction = (body.action as BroadcastAction) || 'start';

    if (!customer_ids || customer_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'No customers specified' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!template_name) {
      return new Response(JSON.stringify({ error: 'No template specified' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Get fallback zapToken from env
    const zapTokenEnv = Deno.env.get('ZAP_RESPONDER_TOKEN') || '';

    if (action === 'start') {
      console.log(`Starting broadcast plan: customers=${customer_ids.length}, template=${template_name}`);

      const planned = await startBroadcastPlan({
        supabaseUrl,
        supabaseServiceKey,
        customerIds: customer_ids,
        templateName: template_name,
      });

      return new Response(JSON.stringify(planned.body), {
        status: planned.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'batch') {
      console.log(`Processing broadcast batch: customers=${customer_ids.length}, template=${template_name}`);

      const batched = await processBroadcastBatch({
        supabaseUrl,
        supabaseServiceKey,
        zapToken: zapTokenEnv,
        customerIds: customer_ids,
        templateName: template_name,
        userId,
      });

      return new Response(JSON.stringify(batched.body), {
        status: batched.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Legacy mode (kept for compatibility)
    console.log(`Starting legacy mass broadcast: customers=${customer_ids.length}, template=${template_name}`);

    const delay_min_seconds = clampInt((body as any).delay_min_seconds, 1, 0);
    const delay_max_seconds = Math.max(delay_min_seconds, clampInt((body as any).delay_max_seconds, 2, 0));

    // Fetch customers (chunked)
    const { customers, error: customersError } = await fetchCustomersByIds(supabase, customer_ids);

    if (customersError || !customers) {
      console.error('Error fetching customers:', customersError);
      return new Response(JSON.stringify({ error: 'Error fetching customers' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allNormalizedPhones = (customers as any[]).map((c) => normalizePhone(c.phone));

    const { sentPhones: alreadySentPhones, error: sentPhonesError } = await fetchAlreadySentPhones(
      supabase,
      template_name,
      allNormalizedPhones
    );

    if (sentPhonesError || !alreadySentPhones) {
      console.error('Error fetching broadcast logs:', sentPhonesError);
      return new Response(JSON.stringify({ error: 'Error checking previous sends' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const seenPhones = new Set<string>();
    const customersToSend: CustomerInfo[] = [];
    const duplicateCustomers: CustomerInfo[] = [];
    const alreadySentCustomers: CustomerInfo[] = [];

    for (const customer of customers as any[]) {
      const normalizedPhone = normalizePhone(customer.phone);

      if (alreadySentPhones.has(normalizedPhone)) {
        alreadySentCustomers.push(customer);
      } else if (seenPhones.has(normalizedPhone)) {
        duplicateCustomers.push(customer);
      } else {
        seenPhones.add(normalizedPhone);
        customersToSend.push(customer);
      }
    }

    // Fetch user-specific settings or fall back to global settings
    let zapSettingsLegacy: any = null;
    if (userId) {
      const { data } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      zapSettingsLegacy = data;
    }
    
    if (!zapSettingsLegacy) {
      const { data } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .is('user_id', null)
        .limit(1)
        .maybeSingle();
      zapSettingsLegacy = data;
    }

    const effectiveLegacyToken = zapSettingsLegacy?.zap_api_token || zapTokenEnv;
    if (!effectiveLegacyToken) {
      return new Response(JSON.stringify({ error: 'Token da API não configurado. Configure em Configurações.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiBaseUrl = zapSettingsLegacy?.api_base_url || 'https://api.zapresponder.com.br/api';
    const departmentId = zapSettingsLegacy?.selected_department_id;

    if (!departmentId) {
      return new Response(JSON.stringify({ error: 'Departamento não configurado. Configure em Configurações.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // @ts-ignore
    (globalThis as any).EdgeRuntime.waitUntil(
      processBroadcastLegacy({
        customersToSend,
        alreadySentCustomers,
        duplicateCustomers,
        templateName: template_name,
        delayMinSeconds: delay_min_seconds,
        delayMaxSeconds: delay_max_seconds,
        supabaseUrl,
        supabaseServiceKey,
        zapToken: effectiveLegacyToken,
        apiBaseUrl,
        departmentId,
      })
    );

    const initialResults: InitialResult[] = [
      ...alreadySentCustomers.map((c) => ({
        customer: c.name,
        phone: c.phone,
        status: 'skipped' as const,
        error: 'Já enviado anteriormente',
      })),
      ...duplicateCustomers.map((c) => ({
        customer: c.name,
        phone: c.phone,
        status: 'skipped' as const,
        error: 'Telefone duplicado',
      })),
    ];

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Broadcast started in background (legacy mode)',
        total: (customers as any[]).length,
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Unexpected error in mass broadcast:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
