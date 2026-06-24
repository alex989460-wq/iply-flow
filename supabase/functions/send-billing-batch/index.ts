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
  extra_phone?: string | null;
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

// Format BRL price (35 -> "35,00")
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
// Variables: name, user, price, weak (plano), serv (servidor), data (vencimento)
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

// Filter vars to only those actually used by the template body (avoids Meta #132000).
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
  const order = new Map<string, number>();
  tokens.forEach((t, i) => { if (!order.has(t)) order.set(t, i); });
  filtered.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
  return filtered;
}

// Send WhatsApp template message via Meta Cloud API
async function sendWhatsAppTemplateMeta(
  phone: string, 
  templateName: string,
  accessToken: string,
  phoneNumberId: string,
  vars: Array<{ name: string; value: string }> = [],
  headerImageUrl?: string,
  language: string = 'pt_BR'
): Promise<{ success: boolean; error?: string; isBillingError?: boolean }> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    
    console.log(`[Meta Cloud] Sending template "${templateName}" to ${formattedPhone}`);
    
    let url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    if (META_APP_SECRET) {
      const proof = await generateAppSecretProof(accessToken, META_APP_SECRET);
      url += `?appsecret_proof=${proof}`;
    }
    
    const templateBlock: Record<string, unknown> = {
      name: templateName,
      language: { code: language || 'pt_BR' },
    };
    const components: any[] = [];
    if (headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: headerImageUrl } }],
      });
    }
    if (vars.length > 0) {
      const isPositional = vars.every(v => /^\d+$/.test(v.name));
      components.push({
        type: 'body',
        parameters: vars.map(v => isPositional
          ? { type: 'text', text: v.value }
          : { type: 'text', parameter_name: v.name, text: v.value }),
      });
    }
    if (components.length > 0) templateBlock.components = components;
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'template',
      template: templateBlock,
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
      const errorCode = result.error?.code;
      const errorMessage = result.error?.message || '';
      const errorSubcode = result.error?.error_subcode;
      
      console.error(`[Meta Cloud] API error:`, { 
        code: errorCode, 
        subcode: errorSubcode, 
        message: errorMessage,
        full: result.error 
      });
      
      // Detect billing/payment related errors from Meta
      // Common Meta billing error codes: 130472, 131000-131999, or messages containing billing/payment terms
      const isBillingError = 
        errorCode === 130472 ||
        (errorCode >= 131000 && errorCode <= 131999) ||
        errorCode === 368 || // Account disabled for policy violation (often payment related)
        errorSubcode === 2494090 || // Ad account billing issue
        errorMessage.toLowerCase().includes('billing') ||
        errorMessage.toLowerCase().includes('payment') ||
        errorMessage.toLowerCase().includes('charge') ||
        errorMessage.toLowerCase().includes('credit') ||
        errorMessage.toLowerCase().includes('pagamento') ||
        errorMessage.toLowerCase().includes('cobrança') ||
        errorMessage.includes('spending limit') ||
        errorMessage.includes('cannot be sent') && (errorCode === 131047 || errorCode === 131026);
      
      if (isBillingError) {
        return { 
          success: false, 
          error: `⚠️ ERRO DE PAGAMENTO META: Mensagem não enviada. Verifique se o cartão de crédito da sua conta Meta está ativo e com pagamento automático habilitado. (Código: ${errorCode || response.status})`,
          isBillingError: true
        };
      }
      
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
  departmentId: string,
  vars: Array<{ name: string; value: string }> = [],
  language: string = 'pt_BR',
  headerImageUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    
    console.log(`[Zap Responder] Sending template "${templateName}" to ${formattedPhone} via dept ${departmentId} with ${vars.length} vars`);
    
    const positional = vars.map(v => v.value);

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

      return {
        name: `template + variables.body_text [${lang}]`,
        body: body as Record<string, unknown>,
      };
    };

    // If caller explicitly passed a language (resolved from Meta template list), don't iterate others.
    const langCandidates = language
      ? [language]
      : Array.from(new Set(['pt_BR', 'en', 'en_US', 'pt_PT']));
    let lastError = 'Falha ao enviar template';
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    for (const lang of langCandidates) {
      const payload = buildPayloadForLang(lang);
      console.log(`[Zap Responder] Sending with ${payload.name}`);

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
        lastError = `Template "${templateName}" não existe no idioma ${lang} (132001). Tentando próximo idioma...`;
        console.warn(`[Zap Responder] ${lastError}`);
        continue;
      }

      if (!response.ok) {
        console.error(`[Zap Responder] API error: ${response.status} - ${responseText}`);
        try {
          const errorJson = JSON.parse(responseText);
          lastError = errorJson.message || errorJson.error || `HTTP ${response.status}`;
        } catch {
          lastError = `HTTP ${response.status}: ${responseText.substring(0, 100)}`;
        }
        break;
      }

      if (!responseText.trim()) {
        lastError = 'API respondeu sem confirmação';
        break;
      }

      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch {
        if (responseText.trim().toLowerCase() === 'ok') return { success: true };
        lastError = `Resposta inválida da API: ${responseText.substring(0, 100)}`;
        break;
      }

      if (result.error || result.success === false) {
        const message = result.message || result.error || 'Erro retornado pela API';
        const body = JSON.stringify(result);
        if (body.includes('#132001') || body.includes('does not exist') || body.includes('translation')) {
          lastError = `Template "${templateName}" não existe no idioma ${lang} (132001). Tentando próximo idioma...`;
          console.warn(`[Zap Responder] ${lastError}`);
          continue;
        }
        console.error(`[Zap Responder] API returned error in body:`, result);
        lastError = message;
        break;
      }

      const statusValue = result.status;
      if (statusValue && typeof statusValue === 'string') {
        const statusLower = statusValue.toLowerCase();
        if (!['queued', 'sent', 'delivered', 'read'].includes(statusLower)) {
          console.warn(`[Zap Responder] Unexpected status: ${statusValue}`, result);
        }
      }

      console.log(`[Zap Responder] Template sent successfully to ${formattedPhone} using ${payload.name}`, result);
      return { success: true };
    }

    return { success: false, error: lastError };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Zap Responder] Error sending template to ${phone}:`, error);
    return { success: false, error: errorMessage };
  }
}

// Send free text via Evolution API
async function sendEvolutionText(
  baseUrl: string,
  apiKey: string,
  instance: string,
  phone: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone;
    }
    const cleanBase = baseUrl.replace(/\/$/, '');
    const numbers = new Set([formattedPhone]);
    if (formattedPhone.startsWith('55') && formattedPhone.length >= 12) {
      const ddd = formattedPhone.slice(2, 4);
      const rest = formattedPhone.slice(4);
      if (rest.length === 9 && rest.startsWith('9')) numbers.add(`55${ddd}${rest.slice(1)}`);
      if (rest.length === 8) numbers.add(`55${ddd}9${rest}`);
    }
    const attempts = Array.from(numbers).flatMap((number) => [
      { url: `${cleanBase}/send/text`, body: { number, text, formatJid: true } },
      { url: `${cleanBase}/send/text`, body: { number, text, formatJid: false } },
      { url: `${cleanBase}/message/sendText/${encodeURIComponent(instance)}`, body: { number, text } },
      { url: `${cleanBase}/message/sendText/${encodeURIComponent(instance)}`, body: { number, textMessage: { text } } },
    ]);
    let lastErr = '';
    for (const a of attempts) {
      try {
        const r = await fetch(a.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey, Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(a.body),
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) return { success: true };
        const body = await r.text().catch(() => '');
        lastErr = `HTTP ${r.status}${body ? ` - ${body.slice(0, 180)}` : ''}`;
        if (/(^|\D)463(\D|$)|NackCallerReachoutTimelocked|reach[- ]?out|time[- ]?lock/i.test(lastErr)) continue;
        if (r.status !== 404 && r.status !== 405 && r.status !== 400) break;
      } catch (e: any) {
        lastErr = String(e?.message || e);
      }
    }
    return { success: false, error: `Evolution: ${lastErr || 'falhou'}` };
  } catch (e: any) {
    return { success: false, error: String(e?.message || e) };
  }
}

function renderEvolutionTemplate(tpl: string, c: Customer & Record<string, any>, extras: Record<string, any>): string {
  const map: Record<string, string> = {
    nome: c.name || '',
    vencimento: c.due_date || '',
    usuario: extras.usuario || (c as any).username || '',
    plano: extras.plano || '',
    valor: extras.valor || '',
    servidor: extras.servidor || '',
    pix: extras.pix || '',
    telefone: c.phone || '',
  };
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => map[k] ?? '');
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

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    const { data: userSettings, error: settingsError } = await supabase
      .from('zap_responder_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (settingsError) {
      console.error('[Billing Batch] Error loading settings:', settingsError);
    }

    let zapSettings: any = userSettings;
    console.log(`[Billing Batch] User settings for ${userId}:`, {
      api_type: zapSettings?.api_type,
      meta_connected: !!zapSettings?.meta_connected_at,
      meta_phone_id: zapSettings?.meta_phone_number_id,
      zap_dept: zapSettings?.selected_department_id,
    });

    if (!zapSettings && isAdminUser) {
      const { data } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .is('user_id', null)
        .limit(1)
        .maybeSingle();
      zapSettings = data;
      console.log('[Billing Batch] Using fallback admin settings');
    }

    // Load billing_settings to check whether Evolution should be the channel
    const { data: billSettings } = await supabase
      .from('billing_settings')
      .select('use_evolution_billing, evolution_instance, evolution_msg_d_minus_1, evolution_msg_d0, evolution_msg_d_plus_1, pix_key')
      .eq('user_id', userId)
      .maybeSingle();

    // Load CRM Oficial settings + schedule (highest priority channel when enabled)
    const { data: crmSettings } = await supabase
      .from('crm_oficial_settings')
      .select('enabled, api_key')
      .eq('user_id', userId)
      .maybeSingle();
    const { data: crmSchedule } = await supabase
      .from('crm_oficial_billing_schedule')
      .select('is_enabled, template_d_minus_1, template_d0, template_d_plus_1, template_lang_d_minus_1, template_lang_d0, template_lang_d_plus_1, channel_id, phone_number_id')
      .eq('user_id', userId)
      .maybeSingle();

    const isCrmOficial = !!(crmSettings?.enabled && crmSettings?.api_key && crmSchedule?.is_enabled);
    const crmTemplateLang: Record<string, string> = {
      'D-1': (crmSchedule as any)?.template_lang_d_minus_1 || 'pt_BR',
      'D0': (crmSchedule as any)?.template_lang_d0 || 'pt_BR',
      'D+1': (crmSchedule as any)?.template_lang_d_plus_1 || 'pt_BR',
    };

    if (isCrmOficial) {
      if ((crmSchedule as any)?.template_d_minus_1) TEMPLATE_MAPPING['D-1'] = (crmSchedule as any).template_d_minus_1;
      if ((crmSchedule as any)?.template_d0) TEMPLATE_MAPPING['D0'] = (crmSchedule as any).template_d0;
      if ((crmSchedule as any)?.template_d_plus_1) TEMPLATE_MAPPING['D+1'] = (crmSchedule as any).template_d_plus_1;
      console.log('[Billing Batch] CRM Oficial channel ACTIVE — templates:', TEMPLATE_MAPPING);
    } else {
      // Load custom template names from billing_schedule (overrides defaults)
      const { data: scheduleCfg } = await supabase
        .from('billing_schedule')
        .select('template_d_minus_1, template_d0, template_d_plus_1')
        .eq('user_id', userId)
        .maybeSingle();
      if (scheduleCfg?.template_d_minus_1) TEMPLATE_MAPPING['D-1'] = scheduleCfg.template_d_minus_1;
      if (scheduleCfg?.template_d0) TEMPLATE_MAPPING['D0'] = scheduleCfg.template_d0;
      if (scheduleCfg?.template_d_plus_1) TEMPLATE_MAPPING['D+1'] = scheduleCfg.template_d_plus_1;
      console.log('[Billing Batch] Active template mapping:', TEMPLATE_MAPPING);
    }

    const useEvolution = !isCrmOficial && !!(billSettings as any)?.use_evolution_billing;
    let evoSettings: any = null;
    if (useEvolution) {
      const { data: evo } = await supabase
        .from('evolution_settings')
        .select('base_url, api_key, instance_name')
        .eq('user_id', userId)
        .maybeSingle();
      evoSettings = evo;
    }

    // Detect API type - CRM Oficial > Evolution > Meta Cloud > Zap Responder
    const apiType = isCrmOficial ? 'crm_oficial' : (useEvolution ? 'evolution' : (zapSettings?.api_type || 'zap_responder'));
    const isMetaCloud = !isCrmOficial && !useEvolution && apiType === 'meta_cloud' && !!zapSettings?.meta_connected_at;
    const isEvolution = useEvolution;

    console.log(`[Billing Batch] API detection: apiType=${apiType}, isCrmOficial=${isCrmOficial}, isEvolution=${isEvolution}, isMetaCloud=${isMetaCloud}`);

    // Validate configuration based on API type
    if (isCrmOficial) {
      console.log('[Billing Batch] CRM Oficial configured — channel:', (crmSchedule as any)?.channel_id || 'auto');
    } else if (isEvolution) {
      if (!evoSettings?.base_url || !evoSettings?.api_key) {
        return new Response(
          JSON.stringify({ success: false, error: 'Evolution não configurada. Configure URL e API Key em Conexões WhatsApp.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`[Billing Batch] Evolution configured: instance=${(billSettings as any)?.evolution_instance || evoSettings.instance_name}`);
    } else if (isMetaCloud) {
      if (!zapSettings?.meta_access_token) {
        console.error('[Billing Batch] Meta Cloud: Missing access token');
        return new Response(
          JSON.stringify({ success: false, error: 'Meta Cloud API: Token de acesso não encontrado. Reconecte seu WhatsApp Oficial em Configurações.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!zapSettings?.meta_phone_number_id) {
        console.error('[Billing Batch] Meta Cloud: Missing phone number ID');
        return new Response(
          JSON.stringify({ success: false, error: 'Meta Cloud API: Nenhum número selecionado. Selecione um número em Configurações.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`[Billing Batch] Meta Cloud configured: phone=${zapSettings.meta_display_phone}`);
    } else {
      const zapToken = zapSettings?.zap_api_token || (isAdminUser ? Deno.env.get('ZAP_RESPONDER_TOKEN') : null);
      if (!zapToken) {
        console.error('[Billing Batch] Zap Responder: Missing API token');
        return new Response(
          JSON.stringify({ success: false, error: 'Token da API não configurado. Configure em Configurações.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const departmentId = zapSettings?.selected_department_id;
      if (!departmentId) {
        console.error('[Billing Batch] Zap Responder: Missing department ID');
        return new Response(
          JSON.stringify({ success: false, error: 'Departamento não selecionado. Selecione um departamento em Configurações.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`[Billing Batch] Zap Responder configured: dept=${departmentId}`);
    }

    const today = getRelativeDateSaoPaulo(0);
    const yesterday = getRelativeDateSaoPaulo(-1);
    const tomorrow = getRelativeDateSaoPaulo(1);

    // ACTION: START - Get list of customers to process
    if (action === 'start') {
      const filterBillingType = body?.billing_type || null;
      const forceResend = body?.force === true; // Force resend bypasses duplicate check
      console.log('[Billing Batch] Starting - filter:', filterBillingType, 'force:', forceResend);

      // Fetch customers
      let customerQuery = supabase
        .from('customers')
        .select('id, name, phone, extra_phone, due_date, status, username, custom_price, plan:plans(plan_name, price), server:servers(server_name)')
        .in('status', ['ativa', 'inativa'])
        .in('due_date', [yesterday, today, tomorrow]);
      
      // SEMPRE filtrar por created_by, mesmo para admin.
      // Cada revenda (incluindo admin) só pode disparar cobranças dos clientes da PRÓPRIA base.
      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Usuário não autenticado' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      customerQuery = customerQuery.eq('created_by', userId);
      
      const { data: customers, error: customersError } = await customerQuery;

      if (customersError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao buscar clientes' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Pre-fetch billing logs for today (skip if force resend)
      let sentByCustomerAndType = new Set<string>();
      let sentByPhoneAndType = new Set<string>();

      if (!forceResend) {
        const { data: existingLogs } = await supabase
          .from('billing_logs')
          .select('customer_id, billing_type, message, whatsapp_status')
          .gte('sent_at', `${today}T00:00:00`)
          .lte('sent_at', `${today}T23:59:59`);

        // Build sets for deduplication
        for (const log of existingLogs || []) {
          if (log.whatsapp_status !== 'sent') continue;
          sentByCustomerAndType.add(`${log.customer_id}:${log.billing_type}`);
          const phoneMatch = log.message?.match(/\[(\d+)\]/);
          if (phoneMatch) {
            const normalizedLogPhone = normalizePhone(phoneMatch[1]);
            sentByPhoneAndType.add(`${normalizedLogPhone}:${log.billing_type}`);
          }
        }
        console.log(`[Billing Batch] Found ${sentByCustomerAndType.size} existing logs to skip`);
      } else {
        console.log('[Billing Batch] FORCE RESEND enabled - ignoring existing logs');
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

        // Skip duplicate check only if NOT force resend
        if (!forceResend) {
          if (sentByCustomerAndType.has(`${customer.id}:${billingType}`)) {
            skippedCount++;
            continue;
          }

          const normalizedPhone = normalizePhone(customer.phone);
          if (sentByPhoneAndType.has(`${normalizedPhone}:${billingType}`)) {
            skippedCount++;
            continue;
          }
        }

        const normalizedPhone = normalizePhone(customer.phone);
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
      const forceResend = body?.force === true;
      const effectiveApiType = isCrmOficial ? 'crm_oficial' : (isEvolution ? 'evolution' : (isMetaCloud ? 'meta_cloud' : 'zap_responder'));
      console.log(`[Billing Batch] Processing batch of ${batch.length} customers via ${effectiveApiType} (force=${forceResend})`);

      const results: any[] = [];

      const evoInstance = (billSettings as any)?.evolution_instance || evoSettings?.instance_name || '';
      const evoMsgMap: Record<string, string> = {
        'D-1': (billSettings as any)?.evolution_msg_d_minus_1 || 'Olá {{nome}}, seu plano vence amanhã ({{vencimento}}). PIX: {{pix}}',
        'D0': (billSettings as any)?.evolution_msg_d0 || 'Olá {{nome}}, seu plano vence hoje ({{vencimento}}). PIX: {{pix}}',
        'D+1': (billSettings as any)?.evolution_msg_d_plus_1 || 'Olá {{nome}}, seu plano venceu em {{vencimento}}. PIX: {{pix}}',
      };

      const templateLangMap: Record<string, string> = {};
      const templateConfigMap: Record<string, any> = {};
      if (isMetaCloud) {
        try {
          const accessToken = zapSettings?.meta_access_token;
          const businessId = zapSettings?.meta_business_id;
          const proofParam = (accessToken && META_APP_SECRET)
            ? `&appsecret_proof=${await generateAppSecretProof(accessToken, META_APP_SECRET)}`
            : '';
          const wabaIds: string[] = [];
          if (businessId) {
            const r = await fetch(`https://graph.facebook.com/v21.0/${businessId}/owned_whatsapp_business_accounts?fields=id,name&limit=100${proofParam ? '?' + proofParam.slice(1) : ''}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (r.ok) {
              const j = await r.json();
              for (const w of (j?.data || [])) if (w?.id) wabaIds.push(w.id);
            }
          }
          for (const wId of wabaIds) {
            const fields = 'name,language,status,category,components';
            const r = await fetch(`https://graph.facebook.com/v21.0/${wId}/message_templates?limit=200&fields=${fields}${proofParam}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!r.ok) continue;
            const j = await r.json();
            for (const t of (j?.data || [])) {
              const name = t?.name;
              const lang = t?.language;
              const status = String(t?.status || '').toUpperCase();
              if (!name) continue;
              const existing = templateConfigMap[name];
              if (!existing || status === 'APPROVED') {
                templateLangMap[name] = lang || 'pt_BR';
                templateConfigMap[name] = t;
              }
            }
          }
          console.log(`[Billing Batch] Loaded ${Object.keys(templateConfigMap).length} Meta templates`);
        } catch (e) {
          console.error('[Billing Batch] Error fetching Meta templates:', e);
        }
      } else if (isCrmOficial) {
        // CRM Oficial: use the languages defined in crm_oficial_billing_schedule
        for (const [bt, name] of Object.entries(TEMPLATE_MAPPING)) {
          if (name) templateLangMap[name] = crmTemplateLang[bt] || 'pt_BR';
        }
      } else if (!isEvolution) {
        try {
          const zapToken = zapSettings?.zap_api_token || Deno.env.get('ZAP_RESPONDER_TOKEN');
          const apiBaseUrl = zapSettings?.api_base_url || 'https://api.zapresponder.com.br/api';
          const departmentId = zapSettings?.selected_department_id;
          const tplRes = await fetch(`${apiBaseUrl}/whatsapp/templates/${departmentId}`, {
            headers: { Authorization: `Bearer ${zapToken}`, Accept: 'application/json' },
          });
          if (tplRes.ok) {
            const tplJson = await tplRes.json();
            const list = Array.isArray(tplJson) ? tplJson : (tplJson.data || tplJson.templates || []);
            for (const t of list) {
              const name = t?.name || t?.template_name;
              const lang = t?.language || t?.language_code || t?.lang;
              const status = (t?.status || '').toString().toUpperCase();
              if (!name || !lang) continue;
              const existing = templateLangMap[name];
              if (!existing || status === 'APPROVED') {
                templateLangMap[name] = lang;
                templateConfigMap[name] = t;
              }
            }
          }
        } catch (e) {
          console.error('[Billing Batch] Error fetching template metadata:', e);
        }
      }

      for (const customer of batch) {
        const billingType = customer.billingType as 'D-1' | 'D0' | 'D+1';
        const templateName = TEMPLATE_MAPPING[billingType];
        const normalizedPhone = customer.normalizedPhone || normalizePhone(customer.phone);

        // ANTI-DUPLICATE: re-check billing_logs right before sending to prevent
        // double sends from concurrent runs (manual + scheduled, double-click, etc.)
        if (!forceResend) {
          const { data: dupCheck } = await supabase
            .from('billing_logs')
            .select('id')
            .eq('customer_id', customer.id)
            .eq('billing_type', billingType)
            .eq('whatsapp_status', 'sent')
            .gte('sent_at', `${today}T00:00:00`)
            .lte('sent_at', `${today}T23:59:59`)
            .limit(1);
          if (dupCheck && dupCheck.length > 0) {
            console.log(`[Billing Batch] SKIP duplicate ${customer.name} (${billingType}) - already sent today`);
            results.push({
              customerId: customer.id,
              customer: customer.name,
              phone: normalizedPhone,
              billingType,
              template: templateName,
              status: 'skipped',
              error: 'Já enviado hoje',
            });
            continue;
          }
        }

        const templateConfig = templateConfigMap[templateName];
        const templateVars = filterVarsForTemplate(templateConfig, buildTemplateVars(customer));
        const exactLang = templateLangMap[templateName] || 'pt_BR';
        const headerImageUrl = extractHeaderImageUrl(templateConfig);

        const { data: reservation, error: reserveError } = await supabase
          .from('billing_logs')
          .insert({
            customer_id: customer.id,
            billing_type: billingType,
            message: `[${normalizedPhone}] reservando envio via ${effectiveApiType}...`,
            whatsapp_status: 'pending',
          })
          .select('id')
          .single();

        if (reserveError) {
          console.log(`[Billing Batch] SKIP duplicate reservation ${customer.name} (${billingType}): ${reserveError.message}`);
          results.push({
            customerId: customer.id,
            customer: customer.name,
            phone: normalizedPhone,
            billingType,
            template: templateName,
            status: 'skipped',
            error: 'Já enviado hoje',
          });
          continue;
        }

        let sendResult: { success: boolean; error?: string };
        let outboundLabel = templateName;

        if (isCrmOficial) {
          const lang = crmTemplateLang[billingType] || 'pt_BR';
          const params = buildTemplateVars(customer).map(v => v.value);
          outboundLabel = `crm:${templateName}`;
          console.log(`[CRM Oficial] Sending ${templateName} to ${normalizedPhone} via channel ${(crmSchedule as any)?.channel_id || 'auto'}`);
          try {
            const invokeRes = await supabase.functions.invoke('crm-oficial-sync', {
              body: {
                action: 'send-whatsapp',
                data: {
                  apiKey: (crmSettings as any).api_key,
                  phone: customer.phone,
                  name: customer.name,
                  channel_id: (crmSchedule as any)?.channel_id || undefined,
                  phone_number_id: (crmSchedule as any)?.phone_number_id || undefined,
                  template_name: templateName,
                  template_language: lang,
                  template_params: params,
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
        } else if (isEvolution) {
          const tpl = evoMsgMap[billingType];
          const text = renderEvolutionTemplate(tpl, customer, { pix: (billSettings as any)?.pix_key || '' });
          outboundLabel = `evo:${billingType}`;
          console.log(`[Evolution] Sending ${billingType} to ${normalizedPhone} via instance ${evoInstance}`);
          sendResult = await sendEvolutionText(evoSettings.base_url, evoSettings.api_key, evoInstance, customer.phone, text);
        } else if (isMetaCloud) {
          console.log(`[Meta Cloud] Sending ${templateName} to ${normalizedPhone} via phone ${zapSettings.meta_phone_number_id}`);
          sendResult = await sendWhatsAppTemplateMeta(
            customer.phone,
            templateName,
            zapSettings.meta_access_token,
            zapSettings.meta_phone_number_id,
            templateVars,
            headerImageUrl,
            exactLang
          );
        } else {
          const zapToken = zapSettings?.zap_api_token || Deno.env.get('ZAP_RESPONDER_TOKEN');
          const apiBaseUrl = zapSettings?.api_base_url || 'https://api.zapresponder.com.br/api';
          const departmentId = zapSettings?.selected_department_id;

          console.log(`[Zap Responder] Sending ${templateName} to ${normalizedPhone} via dept ${departmentId}`);
          sendResult = await sendWhatsAppTemplateZap(
            customer.phone,
            templateName,
            zapToken!,
            apiBaseUrl,
            departmentId!,
            templateVars,
            exactLang,
            headerImageUrl
          );
        }

        // Also send to extra_phone if configured
        if (customer.extra_phone && String(customer.extra_phone).replace(/\D/g, '').length >= 10) {
          try {
            if (isEvolution) {
              const tpl = evoMsgMap[billingType];
              const text = renderEvolutionTemplate(tpl, customer, { pix: (billSettings as any)?.pix_key || '' });
              await sendEvolutionText(evoSettings.base_url, evoSettings.api_key, evoInstance, customer.extra_phone, text);
            } else if (isMetaCloud) {
              await sendWhatsAppTemplateMeta(
                customer.extra_phone,
                templateName,
                zapSettings.meta_access_token,
                zapSettings.meta_phone_number_id,
                templateVars,
                headerImageUrl,
                exactLang
              );
            } else {
              const zapToken = zapSettings?.zap_api_token || Deno.env.get('ZAP_RESPONDER_TOKEN');
              const apiBaseUrl = zapSettings?.api_base_url || 'https://api.zapresponder.com.br/api';
              const departmentId = zapSettings?.selected_department_id;
              await sendWhatsAppTemplateZap(customer.extra_phone, templateName, zapToken!, apiBaseUrl, departmentId!, templateVars, exactLang, headerImageUrl);
            }
            console.log(`[Billing Batch] Extra phone notified for ${customer.name}: ${customer.extra_phone}`);
          } catch (e) {
            console.error(`[Billing Batch] Extra phone send failed for ${customer.name}:`, e);
          }
        }

        // Log to database with effective API type
        const logMessage = `[${normalizedPhone}] Template: ${outboundLabel} via ${effectiveApiType}`;
        await supabase
          .from('billing_logs')
          .update({
            message: logMessage,
            whatsapp_status: sendResult.success ? 'sent' : `error: ${sendResult.error}`,
          })
          .eq('id', reservation.id);

        console.log(`[Billing Batch] ${customer.name}: ${sendResult.success ? 'SENT' : 'ERROR'} - ${sendResult.error || 'OK'}`);

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
          skipped: results.filter(r => r.status === 'skipped').length,
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
