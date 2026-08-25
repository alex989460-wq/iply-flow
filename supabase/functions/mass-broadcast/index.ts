import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeWhatsAppPhone } from '../_shared/phone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type BroadcastAction = 'start' | 'batch' | 'legacy' | 'finish' | 'pause' | 'resume' | 'sync-counts';

interface BroadcastRequestBase {
  action?: BroadcastAction;
  customer_ids: string[];
  template_name: string;
  template_language?: string;
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
  status?: string | null;
  due_date?: string | null;
  server_id?: string | null;
}

interface InitialResult {
  customer: string;
  phone: string;
  status: 'skipped';
  error: string;
}

// Normalize phone number for comparison (remove non-digits)
function normalizePhone(phone: string): string {
  return normalizeWhatsAppPhone(phone);
}

function phoneAliases(phone: string): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  if (normalized.startsWith('55') && normalized.length >= 12) aliases.add(normalized.slice(2));
  return [...aliases];
}

function saoPauloTodayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isActiveCurrentCustomer(customer: { status?: string | null; due_date?: string | null }): boolean {
  const status = String(customer.status || '').toLowerCase();
  const dueDate = String(customer.due_date || '').slice(0, 10);
  return status === 'ativa' && !!dueDate && dueDate >= saoPauloTodayDate();
}

function isRecoveryBroadcast(templateName?: string | null, campaignName?: string | null): boolean {
  const text = `${templateName || ''} ${campaignName || ''}`.toLowerCase();
  return /inadimpl|cobran|recupera|vencid|atrasad/.test(text);
}

function getCampaignFilterConfig(campaign?: any): Record<string, any> {
  const config = campaign?.filter_config;
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}

function campaignShouldExcludeActive(campaign?: any, templateName?: string | null, campaignName?: string | null): boolean {
  const config = getCampaignFilterConfig(campaign);
  return campaign?.exclude_active_phones === true ||
    config.exclude_active_phones === true ||
    isRecoveryBroadcast(templateName || campaign?.template_name, campaignName || campaign?.name);
}

function firstDayCurrentMonthSaoPaulo(): string {
  const today = saoPauloTodayDate();
  return `${today.slice(0, 8)}01`;
}

function daysOverdueFromDate(dueDateValue?: string | null): number {
  const dueDate = String(dueDateValue || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return -99999;
  const today = saoPauloTodayDate();
  const dueMs = Date.UTC(Number(dueDate.slice(0, 4)), Number(dueDate.slice(5, 7)) - 1, Number(dueDate.slice(8, 10)));
  const todayMs = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.floor((todayMs - dueMs) / 86400000);
}

function matchesStoredCampaignFilters(customer: any, filterConfig: Record<string, any>): boolean {
  const selectedCustomerIds = Array.isArray(filterConfig.selected_customer_ids)
    ? new Set(filterConfig.selected_customer_ids.map((id: unknown) => String(id)))
    : null;
  if (filterConfig.selection_mode === 'customers' && selectedCustomerIds?.size && !selectedCustomerIds.has(String(customer.id))) {
    return false;
  }

  const selectedServerIds = Array.isArray(filterConfig.selected_server_ids)
    ? new Set(filterConfig.selected_server_ids.map((id: unknown) => String(id)))
    : null;
  if (filterConfig.selection_mode === 'servers' && selectedServerIds?.size && !selectedServerIds.has(String(customer.server_id || ''))) {
    return false;
  }

  if (filterConfig.overdue_segment_enabled === true) {
    const min = Number.isFinite(Number(filterConfig.overdue_min)) ? Math.max(0, Math.round(Number(filterConfig.overdue_min))) : 0;
    const max = Number.isFinite(Number(filterConfig.overdue_max)) ? Math.max(min, Math.round(Number(filterConfig.overdue_max))) : 9999;
    const overdueDays = daysOverdueFromDate(customer.due_date);
    if (overdueDays < min || overdueDays > max) return false;
  }

  const statusFilter = String(filterConfig.status_filter || 'all');
  if (statusFilter === 'all') return true;
  if (['ativa', 'inativa', 'suspensa', 'bloqueado'].includes(statusFilter)) return String(customer.status || '') === statusFilter;

  const dueDate = String(customer.due_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return false;
  if (statusFilter === 'vencidos') return dueDate < saoPauloTodayDate();
  if (statusFilter === 'vencidos_mes_anterior') return dueDate < firstDayCurrentMonthSaoPaulo();
  if (statusFilter === 'ativos') return dueDate >= saoPauloTodayDate();
  return true;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

// Extrai "Retry after 49020ms." / "retry after 30s" das mensagens de rate limit
function parseRetryAfterMs(message: string): number | null {
  const text = String(message || '');
  if (!/rate limit|too many requests|429|#131056|#80007/i.test(text)) return null;
  const ms = text.match(/retry\s*after\s*(\d+)\s*ms/i);
  if (ms) return Number(ms[1]);
  const s = text.match(/retry\s*after\s*(\d+)\s*s/i);
  if (s) return Number(s[1]) * 1000;
  return 15000;
}

// Send WhatsApp template message via CRM Oficial (crm-oficial-sync shim)
async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  templateLanguage: string,
  _token: string,
  _apiBaseUrl: string,
  userIdOrDept: string,
  phoneNumberId?: string | null,
  customerName?: string | null,
): Promise<{ success: boolean; error?: string; messageId?: string | null }> {

  try {
    let formattedPhone = phone.replace(/\D/g, '');
    formattedPhone = normalizeWhatsAppPhone(formattedPhone);

    console.log(`[CRM Oficial] Sending template "${templateName}" to ${formattedPhone}`);

    const invokeTemplate = (selectedPhoneNumberId?: string | null) => fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/crm-oficial-sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          action: 'sendTemplate',
          number: formattedPhone,
          template_name: templateName,
          language: templateLanguage,
          user_id: userIdOrDept,
          // Nome real do cliente (evita cair no fallback "Cliente" nos templates/CRM)
          ...(customerName && String(customerName).trim()
            ? { parameters: [String(customerName).trim()], contact_name: String(customerName).trim() }
            : {}),
          ...(selectedPhoneNumberId ? { phone_number_id: selectedPhoneNumberId, from_phone_number_id: selectedPhoneNumberId } : {}),
        }),
      }
    );

    let response = await invokeTemplate(phoneNumberId);
    let result = await response.json().catch(() => ({}));

    // Rate limit: aguarda o tempo indicado pela Meta e tenta novamente (até 3x)
    for (let attempt = 0; attempt < 3; attempt++) {
      const errText = String(result?.send?.body?.error || result?.error || '');
      const waitMs = (!response.ok || result?.success === false) ? parseRetryAfterMs(errText) : null;
      if (waitMs == null) break;
      const capped = Math.min(waitMs + 1500, 60000);
      console.warn(`[CRM Oficial] Rate limit — aguardando ${capped}ms antes de reenviar (tentativa ${attempt + 1}/3)`);
      await sleepMs(capped);
      response = await invokeTemplate(phoneNumberId);
      result = await response.json().catch(() => ({}));
    }

    const initialError = String(result?.send?.body?.error || result?.error || '');
    if (
      phoneNumberId &&
      (!response.ok || result?.success === false) &&
      /Canal WhatsApp Oficial não configurado|does not exist in the translation|não existe no idioma|132001/i.test(initialError)
    ) {
      console.warn(`[CRM Oficial] Retrying template "${templateName}" without forced sender ${phoneNumberId}`);
      response = await invokeTemplate(null);
      result = await response.json().catch(() => ({}));
    }
    if (!response.ok || result?.success === false) {
      console.error(`[CRM Oficial] template error: ${response.status}`, result);
      return { success: false, error: (result?.send?.body?.error || result?.error || 'Falha ao enviar template') as string };
    }


    console.log(`[CRM Oficial] template "${templateName}" sent to ${formattedPhone}`);
    const messageId =
      result?.send?.body?.messages?.[0]?.id ||
      result?.messages?.[0]?.id ||
      result?.message_id ||
      result?.wamid ||
      null;
    return { success: true, messageId };
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
    const { data, error } = await supabase.from('customers').select('id, name, phone, status, due_date, server_id').in('id', chunk);
    if (error) return { customers: null as any[] | null, error };
    if (data?.length) customers.push(...data);
  }

  return { customers, error: null };
}

async function fetchAllRows(
  supabase: any,
  table: string,
  columns: string,
  applyFilters: (query: any) => any,
) {
  const rows: any[] = [];
  const pageSize = 1000;

  for (let page = 0; ; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const query = applyFilters(supabase.from(table).select(columns));
    const { data, error } = await query.range(from, to);
    if (error) return { rows: null as any[] | null, error };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  return { rows, error: null };
}

async function fetchCustomersForOwner(supabase: any, ownerId: string) {
  return fetchAllRows(
    supabase,
    'customers',
    'id, name, phone, status, due_date, server_id',
    (query) => query.eq('created_by', ownerId).order('name', { ascending: true }),
  );
}

async function fetchActiveCurrentPhonesForOwner(supabase: any, ownerId?: string | null) {
  const activePhones = new Set<string>();
  if (!ownerId) return { activePhones, error: null };

  const { rows, error } = await fetchAllRows(
    supabase,
    'customers',
    'phone, status, due_date',
    (query) => query
      .eq('created_by', ownerId)
      .eq('status', 'ativa')
      .gte('due_date', saoPauloTodayDate()),
  );

  if (error) return { activePhones: null as Set<string> | null, error };
  for (const row of rows || []) {
    for (const alias of phoneAliases(String(row.phone || ''))) activePhones.add(alias);
  }
  return { activePhones, error: null };
}

function hasActiveCurrentPhone(customer: { phone?: string | null }, activePhones: Set<string>): boolean {
  return phoneAliases(String(customer.phone || '')).some((alias) => activePhones.has(alias));
}

async function rebuildPendingCustomerIds(args: {
  supabase: any;
  campaign: any;
  sentCount: number;
  errorCount: number;
}) {
  const remainingSlots = Math.max(0, Number(args.campaign.total_targets || 0) - args.sentCount - args.errorCount);
  if (remainingSlots <= 0) return [];

  const { rows: customers, error: customersError } = await fetchCustomersForOwner(args.supabase, args.campaign.owner_id);
  if (customersError || !customers) {
    console.error('Error rebuilding pending campaign customers:', customersError);
    return [];
  }

  const { sentPhones, error: sentPhonesError } = await fetchAlreadySentPhones(
    args.supabase,
    args.campaign.template_name,
    customers.map((customer: any) => ({ id: customer.id, phone: customer.phone || '' })),
  );
  if (sentPhonesError || !sentPhones) {
    console.error('Error rebuilding pending campaign sent phones:', sentPhonesError);
    return [];
  }

  const { rows: campaignLogs, error: logsError } = await fetchAllRows(
    args.supabase,
    'broadcast_logs',
    'customer_id, last_status',
    (query) => query.eq('campaign_id', args.campaign.id),
  );
  if (logsError || !campaignLogs) {
    console.error('Error rebuilding pending campaign logs:', logsError);
    return [];
  }

  const processedIds = new Set(
    campaignLogs
      .filter((row: any) => ['sent', 'error'].includes(String(row.last_status || '')))
      .map((row: any) => String(row.customer_id)),
  );
  const seenPhones = new Set<string>();
  const pending: string[] = [];
  const audienceMode = String(args.campaign.audience_mode || 'new');
  const shouldExcludeActivePhones = isRecoveryBroadcast(args.campaign.template_name, args.campaign.name);
  const { activePhones, error: activePhonesError } = shouldExcludeActivePhones
    ? await fetchActiveCurrentPhonesForOwner(args.supabase, args.campaign.owner_id)
    : { activePhones: new Set<string>(), error: null };

  if (activePhonesError || !activePhones) {
    console.error('Error rebuilding pending campaign active phones:', activePhonesError);
    return [];
  }

  for (const customer of customers) {
    const id = String(customer.id || '');
    const normalizedPhone = normalizePhone(customer.phone || '');
    if (!id || !normalizedPhone || processedIds.has(id) || seenPhones.has(normalizedPhone)) continue;
    if (shouldExcludeActivePhones && (isActiveCurrentCustomer(customer) || hasActiveCurrentPhone(customer, activePhones))) continue;

    const received = phoneAliases(customer.phone || '').some((alias) => sentPhones.has(alias));
    const shouldSend = audienceMode === 'all' ? true : audienceMode === 'already' ? received : !received;
    if (!shouldSend) continue;

    seenPhones.add(normalizedPhone);
    pending.push(id);
    if (pending.length >= remainingSlots) break;
  }

  return pending;
}

async function sanitizeExistingPendingCustomerIds(args: {
  supabase: any;
  campaign: any;
  pendingCustomerIds: string[];
}) {
  const uniquePendingIds = [...new Set(args.pendingCustomerIds.map((id) => String(id)).filter(Boolean))];
  if (uniquePendingIds.length === 0) return { pending: [] as string[], removed: 0 };

  const { customers, error: customersError } = await fetchCustomersByIds(args.supabase, uniquePendingIds);
  if (customersError || !customers) {
    console.error('Error sanitizing pending campaign customers:', customersError);
    return { pending: uniquePendingIds, removed: 0 };
  }

  const { rows: campaignLogs, error: logsError } = await fetchAllRows(
    args.supabase,
    'broadcast_logs',
    'customer_id, last_status',
    (query) => query.eq('campaign_id', args.campaign.id),
  );
  if (logsError || !campaignLogs) {
    console.error('Error sanitizing pending campaign logs:', logsError);
    return { pending: uniquePendingIds, removed: 0 };
  }

  const processedIds = new Set(
    campaignLogs
      .filter((row: any) => ['sent', 'error'].includes(String(row.last_status || '')))
      .map((row: any) => String(row.customer_id)),
  );
  const shouldExcludeActivePhones = isRecoveryBroadcast(args.campaign.template_name, args.campaign.name);
  const { activePhones, error: activePhonesError } = shouldExcludeActivePhones
    ? await fetchActiveCurrentPhonesForOwner(args.supabase, args.campaign.owner_id)
    : { activePhones: new Set<string>(), error: null };

  if (activePhonesError || !activePhones) {
    console.error('Error sanitizing pending campaign active phones:', activePhonesError);
    return { pending: uniquePendingIds, removed: 0 };
  }

  const customerById = new Map((customers || []).map((customer: any) => [String(customer.id), customer]));
  const seenPhones = new Set<string>();
  const pending: string[] = [];

  for (const id of uniquePendingIds) {
    const customer = customerById.get(id);
    if (!customer || processedIds.has(id)) continue;
    const normalizedPhone = normalizePhone(customer.phone || '');
    if (!normalizedPhone || seenPhones.has(normalizedPhone)) continue;
    if (shouldExcludeActivePhones && (isActiveCurrentCustomer(customer) || hasActiveCurrentPhone(customer, activePhones))) continue;
    seenPhones.add(normalizedPhone);
    pending.push(id);
  }

  return { pending, removed: Math.max(0, uniquePendingIds.length - pending.length) };
}

async function fetchAlreadySentPhones(
  supabase: any,
  templateName: string,
  customers: Array<{ id: string; phone: string }>,
) {
  const sentPhones = new Set<string>();
  const aliases = [...new Set(customers.flatMap((customer) => phoneAliases(customer.phone)))];

  for (const chunk of chunkArray(aliases, PHONE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('broadcast_logs')
      .select('phone_normalized')
      .eq('template_name', templateName)
      .eq('last_status', 'sent')
      .in('phone_normalized', chunk);

    if (error) return { sentPhones: null as Set<string> | null, error };

    for (const row of data || []) {
      for (const alias of phoneAliases((row as any).phone_normalized)) sentPhones.add(alias);
    }
  }

  // Compatibilidade com disparos antigos, anteriores à criação de broadcast_logs.
  // Esses envios eram registrados apenas em billing_logs.
  for (const chunk of chunkArray(customers.map((customer) => customer.id), CUSTOMER_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('billing_logs')
      .select('customer_id')
      .in('customer_id', chunk)
      .eq('whatsapp_status', 'sent')
      .ilike('message', `%[BROADCAST]%Template: ${templateName}%`);

    if (error) return { sentPhones: null as Set<string> | null, error };
    const sentCustomerIds = new Set((data || []).map((row: any) => row.customer_id));
    for (const customer of customers) {
      if (!sentCustomerIds.has(customer.id)) continue;
      for (const alias of phoneAliases(customer.phone)) sentPhones.add(alias);
    }
  }

  return { sentPhones, error: null };
}

async function startBroadcastPlan(args: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  customerIds: string[];
  templateName: string;
  audienceMode?: 'new' | 'all' | 'already';
  ownerId?: string | null;
  campaignName?: string | null;
  phoneNumberId?: string | null;
  logSkips?: boolean;
  excludeActivePhones?: boolean;
}) {
  const audienceMode = args.audienceMode || 'new';
  const shouldExcludeActivePhones = args.excludeActivePhones === true || isRecoveryBroadcast(args.templateName, args.campaignName);

  const supabase = createClient(args.supabaseUrl, args.supabaseServiceKey);

  // Fetch customers (chunked)
  const { customers, error: customersError } = await fetchCustomersByIds(supabase, args.customerIds);

  if (customersError || !customers) {
    console.error('Error fetching customers:', customersError);
    return { ok: false as const, status: 500, body: { error: 'Não foi possível processar o envio' } };
  }

  // Check broadcast_logs for already sent templates (chunked)
  const { sentPhones: alreadySentPhones, error: sentPhonesError } = await fetchAlreadySentPhones(
    supabase,
    args.templateName,
    customers,
  );

  if (sentPhonesError || !alreadySentPhones) {
    console.error('Error fetching broadcast logs:', sentPhonesError);
    return { ok: false as const, status: 500, body: { error: 'Não foi possível processar o envio' } };
  }

  console.log(`Found ${alreadySentPhones.size} phones that already received template "${args.templateName}"`);

  const seenPhones = new Set<string>();
  const customersToSend: CustomerInfo[] = [];
  const duplicateCustomers: CustomerInfo[] = [];
  const alreadySentCustomers: CustomerInfo[] = [];
  const activeCurrentCustomers: CustomerInfo[] = [];

  const { activePhones, error: activePhonesError } = shouldExcludeActivePhones
    ? await fetchActiveCurrentPhonesForOwner(supabase, args.ownerId)
    : { activePhones: new Set<string>(), error: null };

  if (activePhonesError || !activePhones) {
    console.error('Error fetching active phones for broadcast plan:', activePhonesError);
    return { ok: false as const, status: 500, body: { error: 'Não foi possível processar o envio' } };
  }

  for (const customer of customers as any[]) {
    const normalizedPhone = normalizePhone(customer.phone);
    const received = phoneAliases(customer.phone).some((alias) => alreadySentPhones.has(alias));

    // Um mesmo telefone pode existir em mais de um cadastro. Nunca coloque o
    // número duas vezes na fila do mesmo disparo.
    if (!normalizedPhone || seenPhones.has(normalizedPhone)) {
      duplicateCustomers.push(customer);
      continue;
    }

    if (shouldExcludeActivePhones && (isActiveCurrentCustomer(customer) || hasActiveCurrentPhone(customer, activePhones))) {
      activeCurrentCustomers.push(customer);
      seenPhones.add(normalizedPhone);
      continue;
    }

    // audienceMode:
    //  - 'new'     => envia só para quem NUNCA recebeu este template (padrão)
    //  - 'all'     => envia para todos, mesmo quem já recebeu
    //  - 'already' => envia SOMENTE para quem já recebeu (reengajamento)
    const shouldSend = audienceMode === 'all' ? true : audienceMode === 'already' ? received : !received;

    if (!shouldSend) {
      alreadySentCustomers.push(customer);
    } else {
      seenPhones.add(normalizedPhone);
      customersToSend.push(customer);
    }

  }

  console.log(
    `Broadcast plan: total=${customers.length}, to_send=${customersToSend.length}, duplicates=${duplicateCustomers.length}, already_sent=${alreadySentCustomers.length}, active_current=${activeCurrentCustomers.length}`
  );

  const skipReason = audienceMode === 'already' ? 'ainda não recebeu este template' : 'já enviado anteriormente';

  // Por padrão os ignorados NÃO viram log nem entram na barra de progresso:
  // o disparo vai direto para quem ainda não recebeu.
  if (args.logSkips) {
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
          message: `[BROADCAST] ${customer.phone} - Template: ${args.templateName} - IGNORADO (${skipReason})`,
          whatsapp_status: 'skipped',
        }))
      );
      if (error) console.error('Error inserting already-sent skip logs:', error);
    }
  }

  const initialResults: InitialResult[] = args.logSkips
    ? [
        ...alreadySentCustomers.map((c) => ({
          customer: c.name,
          phone: c.phone,
          status: 'skipped' as const,
          error: audienceMode === 'already' ? 'Ainda não recebeu este template' : 'Já enviado anteriormente',
        })),
        ...activeCurrentCustomers.map((c) => ({
          customer: c.name,
          phone: c.phone,
          status: 'skipped' as const,
          error: 'Cliente ativo/em dia',
        })),
        ...duplicateCustomers.map((c) => ({
          customer: c.name,
          phone: c.phone,
          status: 'skipped' as const,
          error: 'Telefone duplicado',
        })),
      ]
    : [];

  // Cria a campanha (histórico do disparo)
  let campaignId: string | null = null;
  if (args.ownerId) {
    const { data: campaign, error: campaignError } = await supabase
      .from('broadcast_campaigns')
      .insert({
        owner_id: args.ownerId,
        name: (args.campaignName || '').trim() || `Disparo ${args.templateName}`,
        template_name: args.templateName,
        template_language: (args as any).templateLanguage || null,
        phone_number_id: args.phoneNumberId || null,
        audience_mode: audienceMode,
        total_targets: customersToSend.length,
        skipped_count: alreadySentCustomers.length + duplicateCustomers.length + activeCurrentCustomers.length,
        status: 'running',
        pending_customer_ids: customersToSend.map((c: any) => c.id),
      })
      .select('id')
      .maybeSingle();
    if (campaignError) console.error('Error creating broadcast campaign:', campaignError);
    campaignId = campaign?.id ?? null;
  }

  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      total: customers.length,
      unique: customersToSend.length,
      skipped: alreadySentCustomers.length + duplicateCustomers.length + activeCurrentCustomers.length,
      already_sent: alreadySentCustomers.length,
      duplicates: duplicateCustomers.length,
      active_current: activeCurrentCustomers.length,
      template: args.templateName,
      campaign_id: campaignId,
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
  templateLanguage: string;
  userId?: string | null;
  isAdmin?: boolean;
  phoneNumberId?: string | null;
  campaignId?: string | null;
  audienceMode?: 'new' | 'all' | 'already';
  excludeActivePhones?: boolean;
}) {
  const supabase = createClient(args.supabaseUrl, args.supabaseServiceKey);

  // Gate on reseller access (must be active and not expired)
  const { data: resellerAccess, error: resellerErr } = await supabase
    .from('reseller_access')
    .select('is_active, access_expires_at')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (resellerErr) {
    console.error('Error checking reseller access for broadcast:', resellerErr);
    return { ok: false as const, status: 500, body: { error: 'Erro ao validar acesso do revendedor.' } };
  }

  // Sem registro de acesso (ex.: conta admin/proprietária) => não bloqueia
  const isExpired = !!(resellerAccess?.access_expires_at && new Date(resellerAccess.access_expires_at) < new Date());
  if (!args.isAdmin && resellerAccess && (resellerAccess.is_active === false || isExpired)) {
    const reason = resellerAccess.is_active === false ? 'acesso desativado' : 'mensalidade expirada';
    return { ok: false as const, status: 403, body: { error: `Broadcast pausado: ${reason}.` } };
  }

  // Gate on CRM Oficial settings
  if (!args.userId) {
    return { ok: false as const, status: 400, body: { error: 'Usuário não identificado para o envio.' } };
  }
  const userId = args.userId;

  const { data: crmSettings, error: crmErr } = await supabase
    .from('crm_oficial_settings')
    .select('enabled, api_key')
    .eq('user_id', userId)
    .maybeSingle();

  if (crmErr) {
    console.error('Error fetching crm_oficial_settings:', crmErr);
    return { ok: false as const, status: 500, body: { error: 'Não foi possível processar o envio' } };
  }

  if (!crmSettings?.enabled || !crmSettings?.api_key) {
    return { ok: false as const, status: 400, body: { error: 'CRM Oficial não configurado. Acesse Configurações e habilite o CRM Oficial.' } };
  }

  // Customers
  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('id, name, phone, status, due_date')
    .in('id', args.customerIds);

  if (customersError || !customers) {
    console.error('Error fetching customers for batch:', customersError);
    return { ok: false as const, status: 500, body: { error: 'Não foi possível processar o envio' } };
  }

  console.log(
    `Processing batch: size=${customers.length}, template=${args.templateName}, provider=crm-oficial`
  );

  const nowIso = new Date().toISOString();

  // Reserva cada telefone antes do envio. Esta segunda trava é obrigatória:
  // dois navegadores podem iniciar campanhas ao mesmo tempo ou o frontend pode
  // repetir um lote após perder a resposta, mesmo que a Meta já tenha recebido.
  const claimedCustomers: any[] = [];
  const skippedCustomers: any[] = [];
  const seenBatchPhones = new Set<string>();
  const shouldExcludeActivePhones = args.excludeActivePhones === true || isRecoveryBroadcast(args.templateName);
  const { activePhones, error: activePhonesError } = shouldExcludeActivePhones
    ? await fetchActiveCurrentPhonesForOwner(supabase, userId)
    : { activePhones: new Set<string>(), error: null };

  if (activePhonesError || !activePhones) {
    console.error('Error fetching active phones for broadcast batch:', activePhonesError);
    return { ok: false as const, status: 500, body: { error: 'Não foi possível processar o envio' } };
  }

  for (const customer of customers as any[]) {
    const normalizedPhone = normalizePhone(customer.phone || '');
    if (!normalizedPhone || seenBatchPhones.has(normalizedPhone)) {
      skippedCustomers.push(customer);
      continue;
    }
    seenBatchPhones.add(normalizedPhone);

    if (shouldExcludeActivePhones && (isActiveCurrentCustomer(customer) || hasActiveCurrentPhone(customer, activePhones))) {
      skippedCustomers.push({ ...customer, skipReason: 'Cliente ativo/em dia' });
      continue;
    }

    const { data: existing } = await supabase
      .from('broadcast_logs')
      .select('id, last_status, updated_at, campaign_id')
      .in('phone_normalized', phoneAliases(customer.phone))
      .eq('template_name', args.templateName)
      .maybeSingle();

    const processingRecently = existing?.last_status === 'processing' &&
      Date.now() - new Date(existing.updated_at || 0).getTime() < 15 * 60 * 1000;
    const sentInSameCampaign = existing?.last_status === 'sent' && existing?.campaign_id === args.campaignId;
    const previouslySentInNewMode = existing?.last_status === 'sent' && (args.audienceMode || 'new') === 'new';
    if (sentInSameCampaign || previouslySentInNewMode || processingRecently) {
      skippedCustomers.push(customer);
      continue;
    }

    if (existing?.id) {
      const { data: claimed } = await supabase
        .from('broadcast_logs')
        .update({ last_status: 'processing', last_error: null, updated_at: nowIso })
        .eq('id', existing.id)
        .eq('last_status', existing.last_status)
        .select('id')
        .maybeSingle();
      if (!claimed) {
        skippedCustomers.push(customer);
        continue;
      }
    } else {
      const { error: claimError } = await supabase.from('broadcast_logs').insert({
        customer_id: customer.id,
        phone_normalized: normalizedPhone,
        template_name: args.templateName,
        last_status: 'processing',
        last_error: null,
        updated_at: nowIso,
        ...(args.campaignId ? { campaign_id: args.campaignId } : {}),
      });
      if (claimError) {
        // Conflito único significa que outra aba reservou o mesmo envio primeiro.
        if (claimError.code !== '23505') console.error('Error claiming broadcast recipient:', claimError);
        skippedCustomers.push(customer);
        continue;
      }
    }

    claimedCustomers.push(customer);
  }

  // Envio com paralelismo controlado: rápido, mas sem rajadas que estouram o rate limit.
  const SEND_CONCURRENCY = 6;
  const SEND_GAP_MS = 80;
  const list = claimedCustomers;
  const results: Array<{ customer: any; normalizedPhone: string; sendResult: any }> = new Array(list.length);

  let cursor = 0;
  const worker = async (slot: number) => {
    // pequeno escalonamento inicial para não disparar 6 requests no mesmo instante
    if (slot > 0) await sleepMs(slot * SEND_GAP_MS);
    while (true) {
      const i = cursor++;
      if (i >= list.length) break;
      const customer = list[i];
      const sendResult = await sendWhatsAppTemplate(
        customer.phone,
        args.templateName,
        args.templateLanguage,
        '',
        '',
        userId,
        args.phoneNumberId || null,
        customer.name,
      );
      results[i] = {
        customer,
        normalizedPhone: normalizePhone(customer.phone),
        sendResult,
      };
      await sleepMs(SEND_GAP_MS);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SEND_CONCURRENCY, list.length) }, (_, slot) => worker(slot)),
  );



  const billingRows = results.map(({ customer, sendResult }) => ({
    customer_id: customer.id,
    billing_type: 'D0' as any,
    message: `[BROADCAST] ${customer.phone} - Template: ${args.templateName}`,
    whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error || 'Unknown error'}`,
  }));

  if (billingRows.length > 0) {
    const { error: billingError } = await supabase.from('billing_logs').insert(billingRows);
    if (billingError) console.error('Error inserting billing logs (batch):', billingError);
  }

  const broadcastRows = results.map(({ customer, normalizedPhone, sendResult }) => ({
    customer_id: customer.id,
    phone_normalized: normalizedPhone,
    template_name: args.templateName,
    last_status: sendResult.success ? 'sent' : 'error',
    last_error: sendResult.success ? null : sendResult.error || 'Unknown error',
    last_sent_at: sendResult.success ? nowIso : null,
    updated_at: nowIso,
    ...(args.campaignId ? { campaign_id: args.campaignId } : {}),
    ...(sendResult.messageId ? { wa_message_id: sendResult.messageId } : {}),
  }));

  // Deduplica por (phone_normalized, template_name): o Postgres nao aceita
  // afetar a mesma linha duas vezes no mesmo ON CONFLICT.
  const dedupedRows = Array.from(
    new Map(broadcastRows.map((row) => [`${row.phone_normalized}|${row.template_name}`, row])).values(),
  );

  if (dedupedRows.length > 0) {
    const { error: broadcastError } = await supabase
      .from('broadcast_logs')
      .upsert(dedupedRows, { onConflict: 'phone_normalized,template_name' });
    if (broadcastError) console.error('Error upserting broadcast logs (batch):', broadcastError);
  }


  const sent = results.filter((r) => r.sendResult.success).length;
  const errors = results.length - sent;

  // Atualiza os contadores da campanha (histórico de disparos)
  if (args.campaignId) {
    const { data: campaign } = await supabase
      .from('broadcast_campaigns')
      .select('sent_count, error_count, pending_customer_ids')
      .eq('id', args.campaignId)
      .maybeSingle();
    if (campaign) {
      const processedIds = new Set(args.customerIds.map((id: string) => String(id)));
      const pending = Array.isArray((campaign as any).pending_customer_ids)
        ? ((campaign as any).pending_customer_ids as string[]).filter((id) => !processedIds.has(String(id)))
        : [];
      await supabase
        .from('broadcast_campaigns')
        .update({
          sent_count: (campaign.sent_count || 0) + sent,
          error_count: (campaign.error_count || 0) + errors,
          pending_customer_ids: pending,
        })
        .eq('id', args.campaignId);
    }
  }

  console.log(`Batch completed: sent=${sent}, errors=${errors}, skipped=${skippedCustomers.length}`);


  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      batch_total: results.length + skippedCustomers.length,
      sent,
      errors,
      skipped: skippedCustomers.length,
      results: [
        ...results.map(({ customer, sendResult }) => ({
          customer_id: customer.id,
          customer: customer.name,
          phone: customer.phone,
          status: sendResult.success ? 'sent' : 'error',
          error: sendResult.success ? undefined : sendResult.error || 'Erro desconhecido',
        })),
        ...skippedCustomers.map((customer) => ({
          customer_id: customer.id,
          customer: customer.name,
          phone: customer.phone,
          status: 'skipped',
          error: customer.skipReason || 'Já enviado ou em processamento',
        })),
      ],
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
  templateLanguage: string;
  phoneNumberId?: string | null;
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
      args.templateLanguage,
      args.zapToken,
      args.apiBaseUrl,
      args.departmentId,
      args.phoneNumberId || null,
      customer.name,
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
    const template_language = typeof body.template_language === 'string' && body.template_language.trim()
      ? body.template_language.trim()
      : 'pt_BR';
    const action: BroadcastAction = (body.action as BroadcastAction) || 'start';

    if (!['finish', 'pause', 'resume', 'sync-counts'].includes(action as string)) {
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

    // Admin ignora a trava de mensalidade
    let isAdminUser = false;
    if (userId) {
      const { data: adminRows } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .limit(1);
      isAdminUser = (adminRows?.length ?? 0) > 0;
    }

    // Get fallback zapToken from env
    const zapTokenEnv = Deno.env.get('ZAP_RESPONDER_TOKEN') || '';

    if (action === 'finish') {
      const campaignId = String((body as any).campaign_id || '');
      if (campaignId) {
        const { rows: campaignLogs } = await fetchAllRows(
          supabase,
          'broadcast_logs',
          'customer_id, last_status',
          (query) => query.eq('campaign_id', campaignId),
        );
        const sentCount = (campaignLogs || []).filter((r: any) => r.last_status === 'sent').length;
        const errorCount = (campaignLogs || []).filter((r: any) => r.last_status === 'error').length;
        const { data: campaign } = await supabase
          .from('broadcast_campaigns')
          .select('*')
          .eq('id', campaignId)
          .eq('owner_id', userId)
          .maybeSingle();
        const pending = Array.isArray((campaign as any)?.pending_customer_ids)
          ? ((campaign as any).pending_customer_ids as string[])
          : [];
        const completed = pending.length === 0;
        await supabase
          .from('broadcast_campaigns')
          .update({
            finished_at: completed ? new Date().toISOString() : null,
            status: completed ? 'completed' : 'paused',
            pending_customer_ids: pending,
            sent_count: sentCount,
            error_count: errorCount,
          })
          .eq('id', campaignId)
          .eq('owner_id', userId);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'pause') {
      const campaignId = String((body as any).campaign_id || '');
      if (campaignId) {
        await supabase
          .from('broadcast_campaigns')
          .update({ status: 'paused', paused_at: new Date().toISOString() })
          .eq('id', campaignId)
          .eq('owner_id', userId);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'resume') {
      const campaignId = String((body as any).campaign_id || '');
      const { data: campaign, error: campaignError } = await supabase
        .from('broadcast_campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('owner_id', userId)
        .maybeSingle();

      if (campaignError || !campaign) {
        return new Response(JSON.stringify({ success: false, error: 'Campanha não encontrada' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const pending: string[] = Array.isArray((campaign as any).pending_customer_ids)
        ? ((campaign as any).pending_customer_ids as string[])
        : [];

      let pendingCustomerIds = pending;
      if (pendingCustomerIds.length > 0) {
        const sanitized = await sanitizeExistingPendingCustomerIds({ supabase, campaign, pendingCustomerIds });
        pendingCustomerIds = sanitized.pending;
        if (sanitized.removed > 0) {
          await supabase
            .from('broadcast_campaigns')
            .update({
              pending_customer_ids: pendingCustomerIds,
              skipped_count: Number(campaign.skipped_count || 0) + sanitized.removed,
              total_targets: Number(campaign.sent_count || 0) + Number(campaign.error_count || 0) + pendingCustomerIds.length,
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaignId)
            .eq('owner_id', userId);
        }
      }

      if (pendingCustomerIds.length === 0) {
        const { rows: logs } = await fetchAllRows(
          supabase,
          'broadcast_logs',
          'last_status',
          (query) => query.eq('campaign_id', campaignId),
        );
        const rows = logs || [];
        const sentCount = rows.filter((r: any) => r.last_status === 'sent').length;
        const errorCount = rows.filter((r: any) => r.last_status === 'error').length;
        pendingCustomerIds = await rebuildPendingCustomerIds({ supabase, campaign, sentCount, errorCount });
      }

      await supabase
        .from('broadcast_campaigns')
        .update({ status: 'running', paused_at: null, finished_at: null, pending_customer_ids: pendingCustomerIds })
        .eq('id', campaignId);

      return new Response(JSON.stringify({ success: true, campaign, pending_customer_ids: pendingCustomerIds }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Recalcula entregues/lidos/respondidos a partir dos logs por número
    if (action === 'sync-counts') {
      const campaignId = String((body as any).campaign_id || '');
      const { data: campaign, error: campaignError } = await supabase
        .from('broadcast_campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('owner_id', userId)
        .maybeSingle();

      if (campaignError || !campaign) {
        return new Response(JSON.stringify({ success: false, error: 'Campanha não encontrada' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { rows: logs, error: logsError } = await fetchAllRows(
        supabase,
        'broadcast_logs',
        'customer_id, last_status, delivered_at, read_at, replied_at',
        (query) => query.eq('campaign_id', campaignId),
      );

      if (logsError || !logs) {
        console.error('Error syncing broadcast campaign counts:', logsError);
        return new Response(JSON.stringify({ success: false, error: 'Não foi possível sincronizar as métricas' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rows = logs || [];
      const counts = {
        sent_count: rows.filter((r: any) => r.last_status === 'sent').length,
        error_count: rows.filter((r: any) => r.last_status === 'error').length,
        delivered_count: rows.filter((r: any) => !!r.delivered_at).length,
        read_count: rows.filter((r: any) => !!r.read_at).length,
        replied_count: rows.filter((r: any) => !!r.replied_at).length,
      };
      const pending = await rebuildPendingCustomerIds({
        supabase,
        campaign,
        sentCount: counts.sent_count,
        errorCount: counts.error_count,
      });
      const completed = pending.length === 0;

      await supabase
        .from('broadcast_campaigns')
        .update({
          ...counts,
          pending_customer_ids: pending,
          status: completed ? 'completed' : 'paused',
          finished_at: completed ? (campaign.finished_at || new Date().toISOString()) : null,
          paused_at: completed ? null : (campaign.paused_at || new Date().toISOString()),
        })
        .eq('id', campaignId)
        .eq('owner_id', userId);

      return new Response(JSON.stringify({ success: true, ...counts, pending_count: pending.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'start') {
      console.log(`Starting broadcast plan: customers=${customer_ids.length}, template=${template_name}`);

      const planned = await startBroadcastPlan({
        supabaseUrl,
        supabaseServiceKey,
        customerIds: customer_ids,
        templateName: template_name,
        templateLanguage: template_language,
        audienceMode: ((body as any).audience_mode as 'new' | 'all' | 'already') || 'new',
        ownerId: userId,
        campaignName: (body as any).campaign_name || null,
        phoneNumberId: (body as any).phone_number_id || null,
        logSkips: (body as any).log_skips === true,
        excludeActivePhones: (body as any).exclude_active_phones === true,
      } as any);


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
        templateLanguage: template_language,
        userId,
        isAdmin: isAdminUser,
        phoneNumberId: (body as any).phone_number_id || null,
        campaignId: (body as any).campaign_id || null,
        audienceMode: ((body as any).audience_mode as 'new' | 'all' | 'already') || 'new',
        excludeActivePhones: (body as any).exclude_active_phones === true,
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
      return new Response(JSON.stringify({ error: 'Não foi possível processar o envio' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { sentPhones: alreadySentPhones, error: sentPhonesError } = await fetchAlreadySentPhones(
      supabase,
      template_name,
      customers,
    );

    if (sentPhonesError || !alreadySentPhones) {
      console.error('Error fetching broadcast logs:', sentPhonesError);
      return new Response(JSON.stringify({ error: 'Não foi possível processar o envio' }), {
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

      if (phoneAliases(customer.phone).some((alias) => alreadySentPhones.has(alias))) {
        alreadySentCustomers.push(customer);
      } else {
        // Dedupe por telefone desativado.
        seenPhones.add(normalizedPhone);
        customersToSend.push(customer);
      }
    }

    // Gate on CRM Oficial settings (replaces legacy zap)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Usuário não identificado para o envio.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: crmSettings } = await supabase
      .from('crm_oficial_settings')
      .select('enabled, api_key')
      .eq('user_id', userId)
      .maybeSingle();

    if (!crmSettings?.enabled || !crmSettings?.api_key) {
      return new Response(JSON.stringify({ error: 'CRM Oficial não configurado. Acesse Configurações e habilite o CRM Oficial.' }), {
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
        templateLanguage: template_language,
        phoneNumberId: (body as any).phone_number_id || null,
        delayMinSeconds: delay_min_seconds,
        delayMaxSeconds: delay_max_seconds,
        supabaseUrl,
        supabaseServiceKey,
        zapToken: '',
        apiBaseUrl: '',
        departmentId: userId,
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
    console.error('Unexpected error in mass broadcast:', error);
    return new Response(JSON.stringify({ error: 'Não foi possível processar o envio' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
