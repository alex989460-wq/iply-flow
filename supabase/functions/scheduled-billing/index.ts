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

interface CrmBillingSchedule {
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
  template_lang_d_minus_1: string | null;
  template_lang_d0: string | null;
  template_lang_d_plus_1: string | null;
  min_delay_seconds: number | null;
  max_delay_seconds: number | null;
  channel_id: string | null;
  phone_number_id: string | null;
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

function formatBRL(v: any): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(',', '.'));
  if (!isFinite(n)) return '0,00';
  return n.toFixed(2).replace('.', ',');
}

function formatBRDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildTemplateVars(customer: any): Array<{ name: string; value: string }> {
  const planName = customer?.plan?.plan_name || '';
  const planPrice = customer?.plan?.price;
  const serverName = customer?.server?.server_name || '';
  const price = customer?.custom_price ?? planPrice ?? 0;
  const firstName = String(customer?.name || '').trim().split(/\s+/)[0] || customer?.name || '';
  return [
    { name: 'name', value: firstName },
    { name: 'user', value: String(customer?.username || '') },
    { name: 'price', value: formatBRL(price) },
    { name: 'weak', value: String(planName) },
    { name: 'serv', value: String(serverName) },
    { name: 'data', value: formatBRDate(customer?.due_date || '') },
  ];
}

function extractHeaderImageUrl(template: any): string | undefined {
  const header = template?.components?.find((c: any) => c?.type === 'HEADER' && c?.format === 'IMAGE');
  return header?.example?.header_handle?.[0] || header?.example?.header_url?.[0] || undefined;
}

function getCrmTemplateCustomerValues(customer: any, pixKey = '') {
  const fullName = String(customer?.name || '');
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;
  const rawPrice = customer?.custom_price ?? customer?.plan?.price ?? 0;
  const priceFormatted = formatBRL(rawPrice);
  const dueDate = formatBRDate(customer?.due_date || '');
  const userName = String(customer?.username || '');
  const planName = String(customer?.plan?.plan_name || '');
  const serverName = String(customer?.server?.server_name || '');
  const phone = String(customer?.phone || '');
  const screens = String(customer?.screens || 1);

  return {
    firstName,
    byKey: (key: string, index: number) => {
      const normalized = String(key || '').toLowerCase();
      const named: Record<string, string> = {
        name: firstName, nome: firstName, cliente: firstName, customer: firstName,
        user: userName, usuario: userName, username: userName, login: userName,
        price: priceFormatted, valor: priceFormatted, preco: priceFormatted, value: priceFormatted,
        weak: planName, plan: planName, plano: planName,
        serv: serverName, server: serverName, servidor: serverName,
        data: dueDate, vencimento: dueDate, due: dueDate, due_date: dueDate, date: dueDate,
        telefone: phone, phone, telas: screens, screens,
        pix: pixKey || '',
      };
      const positional = [firstName, userName, priceFormatted, planName, serverName, dueDate, phone, screens];
      return named[normalized] ?? positional[index] ?? '';
    },
  };
}

function buildCrmTemplatePayload(template: any, customer: any, pixKey = '') {
  const values = getCrmTemplateCustomerValues(customer, pixKey);
  const components = Array.isArray(template?.components) ? template.components : [];
  const bodyComponent = components.find((component: any) => String(component?.type || '').toUpperCase() === 'BODY');
  const bodyText = String(bodyComponent?.text || '');
  const parameterFormat = String(template?.parameter_format || '').toUpperCase();
  const isNamed = parameterFormat === 'NAMED' || /\{\{\s*[A-Za-z_]\w*\s*\}\}/.test(bodyText);

  const namedFromExample = Array.isArray(bodyComponent?.example?.body_text_named_params)
    ? bodyComponent.example.body_text_named_params.map((param: any) => String(param?.param_name || '').trim()).filter(Boolean)
    : [];
  const namedFromBody = Array.from(new Set((bodyText.match(/\{\{\s*([A-Za-z_]\w*)\s*\}\}/g) || [])
    .map((match) => match.replace(/[{}\s]/g, ''))));
  const positionalIndexes = Array.from(new Set((bodyText.match(/\{\{\s*\d+\s*\}\}/g) || [])
    .map((match) => Number(match.replace(/\D/g, '')))
    .filter((num) => Number.isFinite(num) && num > 0)))
    .sort((a, b) => a - b);

  const outgoingComponents: any[] = [];
  let bodyParamTexts: string[] = [];

  if (isNamed) {
    const paramNames = namedFromExample.length ? namedFromExample : namedFromBody;
    const parameters = paramNames.map((name, index) => ({
      type: 'text',
      parameter_name: name,
      text: values.byKey(name, index),
    }));
    bodyParamTexts = parameters.map((param) => param.text);
    if (parameters.length) outgoingComponents.push({ type: 'body', parameters });
  } else if (positionalIndexes.length) {
    const parameters = positionalIndexes.map((position, index) => ({
      type: 'text',
      text: values.byKey(String(position), index),
    }));
    bodyParamTexts = parameters.map((param) => param.text);
    outgoingComponents.push({ type: 'body', parameters });
  }

  const headerComponent = components.find((component: any) => String(component?.type || '').toUpperCase() === 'HEADER');
  const headerFormat = String(headerComponent?.format || '').toUpperCase();
  if (headerFormat === 'IMAGE') {
    const headerImageUrl = extractHeaderImageUrl(template);
    if (headerImageUrl) {
      outgoingComponents.unshift({
        type: 'header',
        parameters: [{ type: 'image', image: { link: headerImageUrl } }],
      });
    }
  } else if (headerFormat === 'TEXT' && String(headerComponent?.text || '').includes('{{')) {
    outgoingComponents.unshift({
      type: 'header',
      parameters: [{ type: 'text', text: values.firstName }],
    });
  }

  const fallbackBody = bodyText
    .replace(/\{\{\s*([A-Za-z_]\w*)\s*\}\}/g, (_match, key) => values.byKey(key, 0))
    .replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, position) => values.byKey(position, Number(position) - 1));

  return { components: outgoingComponents, params: bodyParamTexts, fallbackBody };
}

function shouldRunSchedule(schedule: any, currentMinutes: number, todayStrSP: string): boolean {
  const [sh, sm] = String(schedule.send_time || '00:00').substring(0, 5).split(':').map(Number);
  const sendMinutes = sh * 60 + sm;
  if (currentMinutes < sendMinutes) return false;
  if (currentMinutes > sendMinutes + 360) return false;
  const lastRunAt = schedule.last_run_at as string | null;
  const lastStatus = schedule.last_run_status as string | null;
  if (lastRunAt && (lastStatus?.startsWith('completed:') || lastStatus?.startsWith('success:') || lastStatus?.startsWith('error:'))) {
    const lastDateSP = formatDateSaoPaulo(new Date(lastRunAt));
    const updatedAt = schedule.updated_at as string | null;
    const changedAfterError = !!updatedAt && (new Date(updatedAt).getTime() - new Date(lastRunAt).getTime()) > 30_000;
    if (lastDateSP === todayStrSP && !changedAfterError) return false;
  }
  return true;
}

async function loadCrmTemplateMetadata(supabase: any, apiKey: string, schedule: CrmBillingSchedule) {
  const templateLangMap: Record<string, string> = {};
  const templateConfigMap: Record<string, any> = {};
  const templateNames = {
    'D-1': schedule.template_d_minus_1 || DEFAULT_TEMPLATE_MAPPING['D-1'],
    D0: schedule.template_d0 || DEFAULT_TEMPLATE_MAPPING['D0'],
    'D+1': schedule.template_d_plus_1 || DEFAULT_TEMPLATE_MAPPING['D+1'],
  } as Record<'D-1' | 'D0' | 'D+1', string>;
  const langFallbacks = {
    'D-1': schedule.template_lang_d_minus_1 || 'pt_BR',
    D0: schedule.template_lang_d0 || 'pt_BR',
    'D+1': schedule.template_lang_d_plus_1 || 'pt_BR',
  } as Record<'D-1' | 'D0' | 'D+1', string>;

  for (const [type, name] of Object.entries(templateNames)) {
    templateLangMap[name] = langFallbacks[type as 'D-1' | 'D0' | 'D+1'];
  }

  try {
    const invokeRes = await supabase.functions.invoke('crm-oficial-sync', {
      body: { action: 'list-templates', data: { apiKey, limit: 250 } },
    });
    const raw: any = invokeRes.data?.results?.templates;
    const body = raw?.body;
    const list: any[] = Array.isArray(raw) ? raw
      : Array.isArray(body) ? body
      : Array.isArray(raw?.data) ? raw.data
      : Array.isArray(raw?.templates) ? raw.templates
      : Array.isArray(raw?.items) ? raw.items
      : Array.isArray(body?.data) ? body.data
      : Array.isArray(body?.templates) ? body.templates
      : Array.isArray(body?.items) ? body.items
      : [];
    for (const t of list) {
      const name = t?.name || t?.template_name;
      if (!name) continue;
      const lang = t?.language || t?.language_code || t?.lang;
      const status = String(t?.status || '').toUpperCase();
      let components = Array.isArray(t?.components) ? t.components : [];
      if (components.length === 0) {
        const bodyText = t?.body_text || t?.body || t?.content || '';
        if (bodyText) components = [{ type: 'BODY', text: String(bodyText) }];
      }
      const existing = templateConfigMap[name];
      if (!existing || status === 'APPROVED') {
        if (lang) templateLangMap[name] = lang;
        templateConfigMap[name] = { ...t, components };
      }
    }
    console.log(`[Scheduled CRM Oficial] Loaded ${Object.keys(templateConfigMap).length} templates`);
  } catch (e) {
    console.error('[Scheduled CRM Oficial] Error fetching templates:', e);
  }

  return { templateNames, templateLangMap, templateConfigMap };
}

// Filter vars to only those actually used by the template body (avoids Meta #132000).
// Supports named placeholders ({{name}}) and positional ({{1}}, {{2}}...).
function filterVarsForTemplate(
  template: any,
  vars: Array<{ name: string; value: string }>
): Array<{ name: string; value: string }> {
  if (!template) return vars;
  const body = template?.components?.find((c: any) => String(c?.type).toUpperCase() === 'BODY');
  const text: string = body?.text || '';
  // Some Zap Responder template endpoints omit BODY.text even when Meta expects variables.
  // In that case keep the complete default variable list instead of sending 0 params (#132000).
  if (!text) return vars;
  const tokens = Array.from(text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((m) => m[1]);
  if (tokens.length === 0) return [];
  const isPositional = tokens.every((t) => /^\d+$/.test(t));
  if (isPositional) {
    const count = Math.max(...tokens.map((t) => parseInt(t, 10)));
    return vars.slice(0, count).map((v, i) => ({ name: String(i + 1), value: v.value }));
  }
  const used = new Set(tokens);
  const filtered = vars.filter((v) => used.has(v.name));
  // Preserve order as in template
  const order = new Map<string, number>();
  tokens.forEach((t, i) => { if (!order.has(t)) order.set(t, i); });
  filtered.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
  return filtered;
}

// Send WhatsApp template message with language + payload fallbacks (mirrors send-billing-batch)
async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  token: string,
  apiBaseUrl: string,
  departmentId: string,
  language: string = 'pt_BR',
  vars: Array<{ name: string; value: string }> = [],
  headerImageUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const hasPlus = phone.trim().startsWith('+');
    let formattedPhone = phone.replace(/\D/g, '');
    if (!hasPlus && !formattedPhone.startsWith('55') && formattedPhone.length >= 10 && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }

    console.log(`[Scheduled] Sending template "${templateName}" to ${formattedPhone}`);

    const positional = vars.map((v) => v.value);

    const buildPayloadForLang = (lang: string) => {
      const basePayload: Record<string, unknown> = {
        type: 'template',
        template_name: templateName,
        number: formattedPhone,
        language: lang,
      };
      if (headerImageUrl) {
        basePayload.header_image = headerImageUrl;
        basePayload.image_url = headerImageUrl;
      }

      const body = vars.length > 0
        ? { ...basePayload, variables: { body_text: positional } }
        : basePayload;

      return { name: `template + variables.body_text [${lang}]`, body: body as Record<string, unknown> };
    };

    // If caller explicitly passed a language (resolved from Meta template list), don't iterate others.
    const langCandidates = language
      ? [language]
      : Array.from(new Set(['pt_BR', 'en', 'en_US', 'pt_PT']));
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    let lastError = 'Falha ao enviar mensagem';

    for (const lang of langCandidates) {
      const payload = buildPayloadForLang(lang);
      const response = await fetch(`${apiBaseUrl}/whatsapp/message/${departmentId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload.body),
      });

      const responseText = await response.text();
      const isTranslationError =
        responseText.includes('#132001') ||
        responseText.includes('does not exist') ||
        responseText.includes('translation');

      if (isTranslationError) {
        lastError = `Template "${templateName}" não existe no idioma ${lang} (132001).`;
        console.warn(`[Scheduled] ${lastError} Tentando próximo idioma...`);
        continue;
      }

      if (!response.ok) {
        console.error(`[Scheduled] API error: ${response.status} - ${responseText}`);
        try {
          const j = JSON.parse(responseText);
          lastError = j.message || j.error || `HTTP ${response.status}`;
        } catch {
          lastError = `HTTP ${response.status}`;
        }
        break;
      }

      if (responseText.trim()) {
        try {
          const result = JSON.parse(responseText);
          const body = JSON.stringify(result);
          if (body.includes('#132001') || body.includes('does not exist') || body.includes('translation')) {
            lastError = `Template "${templateName}" não existe no idioma ${lang} (132001).`;
            console.warn(`[Scheduled] ${lastError} Tentando próximo idioma...`);
            continue;
          }
          if (result.error || result.success === false) {
            lastError = result.message || result.error || 'Erro retornado pela API';
            break;
          }
        } catch {
          if (responseText.trim().toLowerCase() === 'ok') {
            console.log(`[Scheduled] Template enviado (${payload.name})`);
            return { success: true };
          }
        }
      }

      console.log(`[Scheduled] Template enviado (${payload.name}) idioma=${lang}`);
      return { success: true };
    }

    return { success: false, error: lastError };
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

    const { data: crmSchedules, error: crmSchedulesError } = await supabase
      .from('crm_oficial_billing_schedule')
      .select('*')
      .eq('is_enabled', true);

    if (crmSchedulesError) {
      console.error('[Scheduled CRM Oficial] Error fetching schedules:', crmSchedulesError);
    }

    console.log(`[Scheduled CRM Oficial] Found ${crmSchedules?.length || 0} enabled schedules`);

    // Run schedule if: current time >= send_time, within 6h window, and not completed today.
    // This lets cron resume the same schedule across multiple minutes until all customers are sent.
    const todayStrSP = getRelativeDateSaoPaulo(0);
    const currentMinutes = hour * 60 + minute;
    const schedulesToRun = (schedules || []).filter((s: BillingSchedule) => shouldRunSchedule(s, currentMinutes, todayStrSP));
    const crmSchedulesToRun = (crmSchedules || []).filter((s: CrmBillingSchedule) => shouldRunSchedule(s, currentMinutes, todayStrSP));

    console.log(`[Scheduled Billing] Schedules to run now: ${schedulesToRun.length}`);
    console.log(`[Scheduled CRM Oficial] Schedules to run now: ${crmSchedulesToRun.length}`);

    if (schedulesToRun.length === 0 && crmSchedulesToRun.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No schedules to run at this time', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process at most this many customers per invocation to stay under edge function limits
    const BATCH_SIZE = 8;

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

      // Fetch templates from ZapResponder once to resolve EXACT language per template name (avoids #132001)
      const templateLangMap: Record<string, string> = {};
      const templateConfigMap: Record<string, any> = {};
      try {
        const tplRes = await fetch(`${zapSettings.api_base_url}/whatsapp/templates/${departmentId}`, {
          headers: {
            'Authorization': `Bearer ${zapSettings.zap_api_token}`,
            'Accept': 'application/json',
          },
        });
        if (tplRes.ok) {
          const tplJson = await tplRes.json();
          const list = Array.isArray(tplJson) ? tplJson : (tplJson.data || tplJson.templates || []);
          for (const t of list) {
            const name = t?.name || t?.template_name;
            const lang = t?.language || t?.language_code || t?.lang;
            const status = (t?.status || '').toString().toUpperCase();
            if (!name || !lang) continue;
            // Prefer APPROVED entries; only overwrite if current entry isn't approved
            const existing = templateLangMap[name];
            if (!existing || status === 'APPROVED') {
              templateLangMap[name] = lang;
              templateConfigMap[name] = t;
            }
          }
          console.log(`[Scheduled Billing] Loaded ${Object.keys(templateLangMap).length} template languages from Meta`);
        } else {
          console.warn(`[Scheduled Billing] Could not fetch templates list (${tplRes.status}). Falling back to language guessing.`);
        }
      } catch (e) {
        console.error('[Scheduled Billing] Error fetching templates list:', e);
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
        .select('id, name, phone, extra_phone, due_date, status, username, custom_price, plan:plans(plan_name, price), server:servers(server_name)')
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
        .select('customer_id, billing_type, message, whatsapp_status')
        .gte('sent_at', `${today}T00:00:00`)
        .lte('sent_at', `${today}T23:59:59`);

      // Build a set of already processed customer_ids and phones per billing type
      const processedByType: Record<string, { customerIds: Set<string>; phones: Set<string> }> = {
        'D-1': { customerIds: new Set(), phones: new Set() },
        'D0': { customerIds: new Set(), phones: new Set() },
        'D+1': { customerIds: new Set(), phones: new Set() },
      };

      for (const log of existingLogs || []) {
        if (log.whatsapp_status !== 'sent') continue;
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

      // Short pause only, to keep scheduled sending responsive without retry storms.
      const MIN_DELAY_MS = 1_000;
      const MAX_DELAY_MS = 2_000;
      
      // Build template mapping from schedule's saved templates
      const templateMapping: Record<string, string> = { ...DEFAULT_TEMPLATE_MAPPING };
      if (schedule.template_d_minus_1) templateMapping['D-1'] = schedule.template_d_minus_1;
      if (schedule.template_d0) templateMapping['D0'] = schedule.template_d0;
      if (schedule.template_d_plus_1) templateMapping['D+1'] = schedule.template_d_plus_1;

      for (let i = 0; i < batch.length; i++) {
        const customer = batch[i];
        const billingType = customer.billingType as 'D-1' | 'D0' | 'D+1';
        const templateName = templateMapping[billingType];
        const templateConfig = templateConfigMap[templateName];
        const templateVars = filterVarsForTemplate(templateConfig, buildTemplateVars(customer));
        const headerImageUrl = extractHeaderImageUrl(templateConfig);

        console.log(`[Scheduled] (${i + 1}/${batch.length}) Template "${templateName}" -> ${customer.name}`);

        const phone = normalizePhone(customer.phone);
        const { data: reservation, error: reserveError } = await supabase
          .from('billing_logs')
          .insert({
            customer_id: customer.id,
            billing_type: billingType,
            message: `[Agendado] [${phone}] reservando envio...`,
            whatsapp_status: 'pending',
          })
          .select('id')
          .single();

        if (reserveError) {
          console.log(`[Scheduled Billing] SKIP duplicate ${customer.name} (${billingType}): ${reserveError.message}`);
          skipped++;
          continue;
        }

        const exactLang = templateLangMap[templateName];
        if (exactLang) {
          console.log(`[Scheduled] Using exact Meta language "${exactLang}" for template "${templateName}"`);
        } else {
          console.warn(`[Scheduled] Template "${templateName}" not found in Meta list; using fallback language order`);
        }

        const sendResult = await sendWhatsAppTemplate(
          customer.phone,
          templateName,
          zapSettings.zap_api_token,
          zapSettings.api_base_url,
          departmentId,
          exactLang || 'pt_BR',
          templateVars,
          headerImageUrl
        );

        if (customer.extra_phone && String(customer.extra_phone).replace(/\D/g, '').length >= 10) {
          try {
            await sendWhatsAppTemplate(
              customer.extra_phone,
              templateName,
              zapSettings.zap_api_token,
              zapSettings.api_base_url,
              departmentId,
              exactLang || 'pt_BR',
              templateVars,
              headerImageUrl
            );
          } catch (e) {
            console.error(`[Scheduled] Extra phone send failed for ${customer.name}:`, e);
          }
        }


        await supabase.from('billing_logs').update({
          message: `[Agendado] [${normalizePhone(customer.phone)}] Template: ${templateName}`,
          whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
        }).eq('id', reservation.id);

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

    for (const schedule of crmSchedulesToRun) {
      console.log(`[Scheduled CRM Oficial] Processing schedule for user: ${schedule.user_id}`);

      const { data: crmSettings } = await supabase
        .from('crm_oficial_settings')
        .select('enabled, api_key')
        .eq('user_id', schedule.user_id)
        .maybeSingle();

      if (!crmSettings?.enabled || !crmSettings?.api_key) {
        console.log(`[Scheduled CRM Oficial] User ${schedule.user_id} missing CRM settings`);
        await supabase
          .from('crm_oficial_billing_schedule')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'error: CRM Oficial não configurado',
          })
          .eq('id', schedule.id);
        continue;
      }

      const { data: billSettings } = await supabase
        .from('billing_settings')
        .select('pix_key')
        .eq('user_id', schedule.user_id)
        .maybeSingle();

      const { templateNames, templateLangMap, templateConfigMap } = await loadCrmTemplateMetadata(
        supabase,
        crmSettings.api_key,
        schedule,
      );

      const today = getRelativeDateSaoPaulo(0);
      const yesterday = getRelativeDateSaoPaulo(-1);
      const tomorrow = getRelativeDateSaoPaulo(1);

      const billingTypesToSend: string[] = [];
      if (schedule.send_d_minus_1) billingTypesToSend.push('D-1');
      if (schedule.send_d0) billingTypesToSend.push('D0');
      if (schedule.send_d_plus_1) billingTypesToSend.push('D+1');

      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, name, phone, extra_phone, due_date, status, username, custom_price, screens, plan:plans(plan_name, price), server:servers(server_name)')
        .in('status', ['ativa', 'inativa'])
        .eq('created_by', schedule.user_id)
        .in('due_date', [yesterday, today, tomorrow]);

      if (customersError) {
        console.error('[Scheduled CRM Oficial] Error fetching customers:', customersError);
        await supabase
          .from('crm_oficial_billing_schedule')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'error: erro ao buscar clientes',
          })
          .eq('id', schedule.id);
        continue;
      }

      console.log(`[Scheduled CRM Oficial] Found ${customers?.length || 0} customers for user ${schedule.user_id}`);

      const { data: existingLogs } = await supabase
        .from('billing_logs')
        .select('customer_id, billing_type, message, whatsapp_status')
        .gte('sent_at', `${today}T00:00:00`)
        .lte('sent_at', `${today}T23:59:59`);

      const processedByType: Record<string, { customerIds: Set<string>; phones: Set<string> }> = {
        'D-1': { customerIds: new Set(), phones: new Set() },
        'D0': { customerIds: new Set(), phones: new Set() },
        'D+1': { customerIds: new Set(), phones: new Set() },
      };

      for (const log of existingLogs || []) {
        if (log.whatsapp_status !== 'sent') continue;
        const type = log.billing_type as string;
        if (processedByType[type]) {
          processedByType[type].customerIds.add(log.customer_id);
          const phoneMatch = log.message?.match(/\[(\d+)\]/);
          if (phoneMatch) processedByType[type].phones.add(normalizePhone(phoneMatch[1]));
        }
      }

      const customersToProcess: any[] = [];
      let skipped = 0;

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
        if (processedByType[billingType].customerIds.has(customer.id) || processedByType[billingType].phones.has(normalizedPhone)) {
          skipped++;
          continue;
        }

        processedByType[billingType].customerIds.add(customer.id);
        processedByType[billingType].phones.add(normalizedPhone);
        customersToProcess.push({ ...customer, billingType });
      }

      const totalPending = customersToProcess.length;
      const batch = customersToProcess.slice(0, BATCH_SIZE);
      console.log(`[Scheduled CRM Oficial] Customers pending today: ${totalPending}. Processing batch of ${batch.length}.`);

      await supabase
        .from('crm_oficial_billing_schedule')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: `in_progress: ${totalPending} pendentes`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id);

      let sent = 0;
      let errors = 0;
      const minDelay = Math.max(1, Number(schedule.min_delay_seconds || 1)) * 1000;
      const maxDelay = Math.max(minDelay, Number(schedule.max_delay_seconds || 2) * 1000);

      for (let i = 0; i < batch.length; i++) {
        const customer = batch[i];
        const billingType = customer.billingType as 'D-1' | 'D0' | 'D+1';
        const templateName = templateNames[billingType];
        const templateConfig = templateConfigMap[templateName];
        const templateVars = filterVarsForTemplate(templateConfig, buildTemplateVars(customer));
        const headerImageUrl = extractHeaderImageUrl(templateConfig);
        const crmPayload = buildCrmTemplatePayload(
          templateConfig,
          customer,
          billSettings?.pix_key || '',
        );
        const params = crmPayload.params.length ? crmPayload.params : templateVars.map((v) => v.value);
        const lang = templateLangMap[templateName] || 'pt_BR';
        const phone = normalizePhone(customer.phone);

        console.log(`[Scheduled CRM Oficial] (${i + 1}/${batch.length}) Template "${templateName}" -> ${customer.name} (${phone})`);

        const { data: reservation, error: reserveError } = await supabase
          .from('billing_logs')
          .insert({
            customer_id: customer.id,
            billing_type: billingType,
            message: `[Agendado CRM] [${phone}] reservando envio...`,
            whatsapp_status: 'pending',
          })
          .select('id')
          .single();

        if (reserveError) {
          console.log(`[Scheduled CRM Oficial] SKIP duplicate ${customer.name} (${billingType}): ${reserveError.message}`);
          skipped++;
          continue;
        }

        let sendResult: { success: boolean; error?: string };
        try {
          const invokeRes = await supabase.functions.invoke('crm-oficial-sync', {
            body: {
              action: 'send-whatsapp',
              data: {
                apiKey: crmSettings.api_key,
                phone: customer.phone,
                name: customer.name,
                channel_id: schedule.channel_id || undefined,
                phone_number_id: schedule.phone_number_id || undefined,
                body: crmPayload.fallbackBody || templateName,
                template_name: templateName,
                template_language: lang,
                template_params: params,
                components: crmPayload.components,
              },
            },
          });
          const data: any = invokeRes.data;
          const send: any = data?.results?.send;
          const ok = !invokeRes.error && data?.success !== false && (send?.ok !== false);
          sendResult = ok
            ? { success: true }
            : { success: false, error: invokeRes.error?.message || data?.error || (send && typeof send.body === 'object' ? JSON.stringify(send.body).slice(0, 240) : `CRM status ${send?.status || '?'}`) };
        } catch (e: any) {
          sendResult = { success: false, error: `CRM Oficial: ${e?.message || e}` };
        }

        if (customer.extra_phone && String(customer.extra_phone).replace(/\D/g, '').length >= 10) {
          try {
            await supabase.functions.invoke('crm-oficial-sync', {
              body: {
                action: 'send-whatsapp',
                data: {
                  apiKey: crmSettings.api_key,
                  phone: customer.extra_phone,
                  name: customer.name,
                  channel_id: schedule.channel_id || undefined,
                  phone_number_id: schedule.phone_number_id || undefined,
                  body: crmPayload.fallbackBody || templateName,
                  template_name: templateName,
                  template_language: lang,
                  template_params: params,
                  components: crmPayload.components,
                },
              },
            });
          } catch (e) {
            console.error(`[Scheduled CRM Oficial] Extra phone send failed for ${customer.name}:`, e);
          }
        }

        await supabase.from('billing_logs').update({
          message: `[Agendado CRM] [${phone}] Template: crm:${templateName}`,
          whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
        }).eq('id', reservation.id);

        if (sendResult.success) sent++; else errors++;

        if (i < batch.length - 1) {
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          console.log(`[Scheduled CRM Oficial] Waiting ${(delay / 1000).toFixed(1)}s before next send...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      const remaining = totalPending - batch.length;
      const statusMessage = remaining > 0
        ? `in_progress: lote ${sent} enviados / ${remaining} restantes`
        : `completed: ${sent} enviados, ${errors} erros nesta execução`;

      await supabase
        .from('crm_oficial_billing_schedule')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: statusMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id);

      results.push({
        user_id: schedule.user_id,
        channel: 'crm_oficial',
        sent,
        errors,
        skipped,
        remaining,
      });

      console.log(`[Scheduled CRM Oficial] User ${schedule.user_id}: sent=${sent}, errors=${errors}, remaining=${remaining}`);
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