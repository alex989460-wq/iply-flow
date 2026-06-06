import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizePhone(p: string) {
  const digits = String(p || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function normalizeChatPhone(p: string) {
  const digits = String(p || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') || digits.length <= 11) return normalizePhone(digits);
  return digits;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function evolutionHeaders(apiKey: string, contentType = false, instanceId = '') {
  const headers: Record<string, string> = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
  if (contentType) headers['Content-Type'] = 'application/json';
  if (instanceId) headers.instanceId = instanceId;
  return headers;
}

function jidPhone(value: unknown) {
  if (typeof value !== 'string') return '';
  const digits = value.split('@')[0].split(':')[0].replace(/\D/g, '');
  return digits.length >= 10 ? digits : '';
}

function jidTarget(value: unknown) {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  const digits = clean.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (/@lid\b/i.test(clean) && digits.length >= 10) return `${digits}@lid`;
  if (/@s\.whatsapp\.net\b/i.test(clean) && digits.length >= 10) return digits;
  return digits.length >= 10 ? digits : '';
}

function pushUniqueTarget(targets: Array<{ value: string; kind: 'lid' | 'phone' }>, raw: unknown) {
  const target = jidTarget(raw);
  if (!target) return;
  const kind = target.includes('@lid') ? 'lid' : 'phone';
  if (!targets.some((t) => t.value === target)) targets.push({ value: target, kind });
}

async function resolveSendPhone(admin: any, userId: string, phone: string) {
  if (phone.startsWith('55') && phone.length >= 12) return phone;
  const { data } = await admin
    .from('evolution_messages')
    .select('raw')
    .eq('user_id', userId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(20);
  for (const row of data || []) {
    const info = row?.raw?.data?.Info || row?.raw?.Info || {};
    const candidate = jidPhone(info.RecipientAlt) || jidPhone(info.SenderAlt) || jidPhone(info.Sender);
    if (candidate?.startsWith('55')) return candidate;
  }
  return phone;
}

async function resolveSendTargets(admin: any, userId: string, phone: string) {
  const targets: Array<{ value: string; kind: 'lid' | 'phone' }> = [];
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  const normalizedPhone = normalizeChatPhone(phoneDigits);

  const { data } = await admin
    .from('evolution_messages')
    .select('phone, raw')
    .eq('user_id', userId)
    .or(`phone.eq.${phoneDigits},phone.eq.${normalizedPhone}`)
    .order('created_at', { ascending: false })
    .limit(30);

  for (const row of data || []) {
    const info = row?.raw?.data?.Info || row?.raw?.Info || {};
    if (info?.IsFromMe === true) {
      pushUniqueTarget(targets, info.Chat);
      pushUniqueTarget(targets, info.RecipientAlt);
      pushUniqueTarget(targets, info.TargetJID || info.TargetID);
      pushUniqueTarget(targets, info.DeviceSentMeta?.DestinationJID);
    } else {
      pushUniqueTarget(targets, info.SenderAlt);
      pushUniqueTarget(targets, info.Sender);
      pushUniqueTarget(targets, info.Chat);
    }
  }

  pushUniqueTarget(targets, phoneDigits.includes('@') ? phone : phoneDigits);
  if (normalizedPhone) pushUniqueTarget(targets, normalizedPhone);

  const lids = targets.filter((t) => t.kind === 'lid');
  const phones = targets.filter((t) => t.kind === 'phone' && t.value.startsWith('55'));
  const otherPhones = targets.filter((t) => t.kind === 'phone' && !t.value.startsWith('55'));
  return [...lids, ...phones, ...otherPhones].filter((target, index, arr) => arr.findIndex((t) => t.value === target.value) === index);
}

function phoneFromJid(value: unknown) {
  if (typeof value !== 'string') return null;
  const digits = value.split('@')[0].split(':')[0].replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function extractInstancePhone(item: any, statusData: any = {}) {
  const candidates = [
    item?.ownerJid, item?.jid, item?.myJid, item?.phone, item?.number, item?.owner,
    item?.instance?.ownerJid, item?.instance?.jid, item?.instance?.myJid,
    item?.data?.ownerJid, item?.data?.jid, item?.data?.myJid,
    statusData?.ownerJid, statusData?.jid, statusData?.myJid, statusData?.phone, statusData?.number,
  ];
  for (const candidate of candidates) {
    const phone = phoneFromJid(candidate);
    if (phone) return phone;
  }
  return null;
}

function normalizeInstanceState(item: any, statusData: any = {}) {
  const rawState = String(item?.connectionStatus || item?.state || item?.instance?.state || item?.status || '').toLowerCase();
  if (/open|online|connected/.test(rawState)) return 'open';
  if (/connecting|qr|pair/.test(rawState)) return 'connecting';
  if (/close|disconnect|offline/.test(rawState)) return 'close';

  const loggedIn = statusData?.LoggedIn ?? statusData?.loggedIn ?? item?.LoggedIn ?? item?.loggedIn ?? item?.instance?.loggedIn;
  const connected = statusData?.Connected ?? statusData?.connected ?? item?.Connected ?? item?.connected ?? item?.instance?.connected;
  if (loggedIn === true) return 'open';
  if (connected === true) return 'connecting';
  if (loggedIn === false || connected === false) return 'close';
  return 'unknown';
}

async function getGoInstanceStatus(baseUrl: string, apiKey: string, instanceId = '') {
  const status = await fetchJson(`${baseUrl}/instance/status`, {
    headers: evolutionHeaders(apiKey, false, instanceId),
  }, 5000).catch(() => ({ ok: false, status: 0, data: {} as any }));
  return status?.data?.data || status?.data || {};
}

function publicMediaFromSignedUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function findUrlDeep(value: unknown): string | null {
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : null;
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const direct = obj.profilePictureUrl || obj.profilePicUrl || obj.profilePicture || obj.avatar || obj.url || obj.picture || obj.pictureUrl || obj.URL;
  if (typeof direct === 'string' && /^https?:\/\//i.test(direct)) return direct;
  for (const child of Object.values(obj)) {
    const found = findUrlDeep(child);
    if (found) return found;
  }
  return null;
}

async function insertOutgoingMessage(admin: any, row: Record<string, unknown>) {
  if (row.external_id) {
    const { data: existing } = await admin
      .from('evolution_messages')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('external_id', row.external_id)
      .maybeSingle();
    if (existing?.id && (row.raw as any)?.__quoted) {
      await admin.from('evolution_messages').update({ raw: row.raw }).eq('id', existing.id);
      return;
    }
    if (existing?.id) return;
  }
  const { error } = await admin.from('evolution_messages').insert(row);
  if (error && error.code !== '23505') console.error('[evolution-send] insert failed', error);
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 8000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function runInBackground(task: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task.catch((error) => console.error('[evolution-send] background send failed', error)));
  else task.catch((error) => console.error('[evolution-send] background send failed', error));
}

function getEvolutionErrorText(data: any) {
  const parts = [data?.error, data?.message, data?.response?.message, data?.data?.error, data?.data?.message]
    .flat()
    .filter(Boolean)
    .map((v) => typeof v === 'string' ? v : JSON.stringify(v));
  return parts.join(' | ');
}

function isEvolutionReachoutLock(data: any) {
  return /(^|\D)463(\D|$)|NackCallerReachoutTimelocked|reach[- ]?out|time[- ]?lock/i.test(getEvolutionErrorText(data));
}

async function resolveGoInstanceId(baseUrl: string, apiKey: string, instance: string) {
  if (isUuid(instance)) return instance;
  const r = await fetchJson(`${baseUrl}/instance/all`, {
    headers: evolutionHeaders(apiKey),
  }).catch(() => null);
  const rows = Array.isArray(r?.data?.data) ? r?.data?.data : Array.isArray(r?.data) ? r?.data : [];
  const wanted = String(instance || '').toLowerCase();
  const found = rows.find((item: any) =>
    String(item?.id || '').toLowerCase() === wanted ||
    String(item?.name || item?.instanceName || item?.instance?.instanceName || '').toLowerCase() === wanted
  ) || rows.find((item: any) => String(item?.token || item?.hash || '') === apiKey);
  return found?.id || '';
}

async function resolveGoInstance(baseUrl: string, apiKey: string, instance: string) {
  const wanted = String(instance || '').toLowerCase();
  const r = await fetchJson(`${baseUrl}/instance/all`, {
    headers: evolutionHeaders(apiKey),
  }).catch(() => null);
  const rows = Array.isArray(r?.data?.data) ? r?.data?.data : Array.isArray(r?.data) ? r?.data : [];
  return rows.find((item: any) =>
    String(item?.id || item?.instanceId || '').toLowerCase() === wanted ||
    String(item?.name || item?.instanceName || item?.instance?.instanceName || '').toLowerCase() === wanted
  ) || rows.find((item: any) => String(item?.token || item?.hash || '') === apiKey) || null;
}

async function resolveInstanceAuth(baseUrl: string, apiKey: string, instance: string) {
  const found = await resolveGoInstance(baseUrl, apiKey, instance);
  return {
    apiKey: found?.token || found?.hash || apiKey,
    instanceId: found?.id || found?.instanceId || instance,
    name: found?.name || found?.instanceName || found?.instance?.instanceName || instance,
    row: found,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'send';

    const { data: settings } = await admin
      .from('evolution_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings) {
      return jsonResponse({ error: 'Evolution não configurada' }, 200);
    }
    // Note: is_enabled gate removed — if the row exists and is configured, allow sending.
    // The toggle remains purely informational for bot/automation modules.
    const baseUrl = String(settings.base_url || '').replace(/\/$/, '');
    const apiKey = String(settings.api_key || '').trim();
    const instance = String(settings.instance_name || '').trim();
    if (!baseUrl || !apiKey) {
      return jsonResponse({ error: 'Informe URL Base e API Key em Configurações → Evolution.' }, 200);
    }

    // TEST PANEL LOGIN / CONNECTION
    if (action === 'test') {
      const adminEndpoints = [
        `${baseUrl}/instance/all`,
        `${baseUrl}/instance/fetchInstances`,
        `${baseUrl}/instance/list`,
      ];

      for (const url of adminEndpoints) {
        const list = await fetchJson(url, {
          headers: evolutionHeaders(apiKey),
        }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));

        if (!list.ok) continue;

        const rows = Array.isArray(list.data?.data) ? list.data.data : Array.isArray(list.data) ? list.data : [];
        if (!instance) {
          return jsonResponse({
            ok: true,
            status: list.status,
            mode: 'evolution-panel',
            data: { state: 'logged', instances: rows.length },
          });
        }

        const wanted = instance.toLowerCase();
        const found = rows.find((it: any) =>
          String(it?.name || it?.instanceName || it?.instance?.instanceName || '').toLowerCase() === wanted ||
          String(it?.id || it?.instanceId || '').toLowerCase() === wanted
        );

        if (!found) {
          return jsonResponse({
            ok: false,
            status: 404,
            mode: 'evolution-panel',
            data: { instance: { state: 'close' }, error: `Instância "${instance}" não encontrada. Adicione ou selecione em Conexões WhatsApp.` },
          });
        }

        const instToken = found.token || found.hash || apiKey;
        const goStatus = await fetchJson(`${baseUrl}/instance/status`, {
          headers: { apikey: instToken, instanceId: found.id || found.instanceId || '' },
        }).catch(() => ({ ok: false, status: 0, data: {} }));

        const sd = goStatus.data?.data || goStatus.data || {};
        const connected = sd.Connected ?? sd.connected ?? found.connected;
        const loggedIn = sd.LoggedIn ?? sd.loggedIn ?? found.loggedIn;
        const state = connected ? 'open' : loggedIn ? 'connecting' : 'close';

        return jsonResponse({
          ok: true,
          status: goStatus.status || 200,
          mode: 'evolution-panel',
          data: { instance: { state, name: found.name || found.instanceName, id: found.id || found.instanceId } },
        });
      }

      if (instance) {
        const classic = await fetchJson(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
          headers: evolutionHeaders(apiKey),
        }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        return jsonResponse({ ok: classic.ok, status: classic.status, mode: 'evolution-api', data: classic.data });
      }

      return jsonResponse({ ok: false, status: 401, mode: 'evolution-panel', error: 'Não foi possível entrar no painel Evolution. Confira URL Base e API Key global.' }, 200);
    }

    // SET WEBHOOK
    if (action === 'set-webhook') {
      const targetInstance = String(body.instance || instance || '').trim();
      if (!targetInstance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp antes de configurar o webhook.' }, 200);
      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook?token=${settings.webhook_token}`;
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, targetInstance);

      const classic = await fetchJson(`${baseUrl}/webhook/set/${encodeURIComponent(targetInstance)}`, {
        method: 'POST',
        headers: evolutionHeaders(apiKey, true),
        body: JSON.stringify({
          webhook: { enabled: true, url: webhookUrl, events: ['MESSAGES_UPSERT'], byEvents: false, base64: true },
        }),
      }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));

      if (classic.ok) {
        return jsonResponse({ ok: true, status: classic.status, mode: 'evolution-api', webhookUrl, data: classic.data, instance: targetInstance });
      }

      const go = await fetchJson(`${baseUrl}/instance/connect`, {
        method: 'POST',
        headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId),
        body: JSON.stringify({ webhookUrl, subscribe: ['MESSAGE', 'SEND_MESSAGE', 'CONNECTION', 'QRCODE'], immediate: true }),
      }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
      await fetchJson(`${baseUrl}/instance/${encodeURIComponent(instAuth.instanceId)}/advanced-settings`, {
        method: 'PUT',
        headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId),
        body: JSON.stringify({ ignoreStatus: false, readStatus: false }),
      }, 8000).catch(() => null);
      return jsonResponse({ ok: go.ok, status: go.status, mode: 'evolution-go', webhookUrl, data: go.data, instance: targetInstance });
    }

    // SET WEBHOOK ON ALL INSTANCES
    if (action === 'set-webhook-all') {
      const tries = [`${baseUrl}/instance/fetchInstances`, `${baseUrl}/instance/all`, `${baseUrl}/instance/list`];
      let arr: any[] = [];
      for (const url of tries) {
        const r = await fetchJson(url, { headers: evolutionHeaders(apiKey) }, 8000).catch(() => ({ ok: false, data: {} as any }));
        if (!r.ok) continue;
        const rows = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
        if (rows.length) { arr = rows; break; }
      }
      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook?token=${settings.webhook_token}`;
      const results: any[] = [];
      for (const inst of arr) {
        const nm = String(inst?.name || inst?.instanceName || inst?.instance?.instanceName || '').trim();
        if (!nm) continue;
        const instAuth = await resolveInstanceAuth(baseUrl, apiKey, nm);
        const classic = await fetchJson(`${baseUrl}/webhook/set/${encodeURIComponent(nm)}`, {
          method: 'POST', headers: evolutionHeaders(apiKey, true),
          body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, events: ['MESSAGES_UPSERT'], byEvents: false, base64: true } }),
        }).catch(() => ({ ok: false, status: 0 }));
        let ok = !!classic.ok;
        if (!ok) {
          const go = await fetchJson(`${baseUrl}/instance/connect`, {
            method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId),
            body: JSON.stringify({ webhookUrl, subscribe: ['MESSAGE', 'SEND_MESSAGE', 'CONNECTION', 'QRCODE'], immediate: true }),
          }).catch(() => ({ ok: false, status: 0 }));
          ok = !!go.ok;
        }
        await fetchJson(`${baseUrl}/instance/${encodeURIComponent(instAuth.instanceId)}/advanced-settings`, {
          method: 'PUT', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId),
          body: JSON.stringify({ ignoreStatus: false, readStatus: false }),
        }, 8000).catch(() => null);
        results.push({ instance: nm, ok });
      }
      return jsonResponse({ ok: results.every(r => r.ok), results, webhookUrl });
    }

    // SEND
    if (action === 'send') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp antes de enviar mensagens.' }, 200);
      const phone = normalizeChatPhone(body.phone);
      const text = String(body.text || '').trim();
      if (!phone || !text) {
        return jsonResponse({ error: 'phone e text obrigatórios' }, 400);
      }
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const sendTargets = await resolveSendTargets(admin, user.id, phone);
      const primaryTarget = sendTargets[0]?.value || await resolveSendPhone(admin, user.id, phone);

      // Build optional "quoted" payload (reply-to) compatible with both API flavors
      const quotedRaw = body.quoted as { messageId?: string; fromMe?: boolean; text?: string } | null | undefined;
      const quotedClassic = quotedRaw && quotedRaw.messageId ? {
        key: {
          remoteJid: primaryTarget.includes('@') ? primaryTarget : `${primaryTarget}@s.whatsapp.net`,
          fromMe: !!quotedRaw.fromMe,
          id: String(quotedRaw.messageId),
        },
        message: { conversation: String(quotedRaw.text || '') },
      } : null;
      const quotedGo = quotedRaw && quotedRaw.messageId ? {
        messageId: String(quotedRaw.messageId),
        participant: primaryTarget.includes('@') ? primaryTarget : `${primaryTarget}@s.whatsapp.net`,
      } : null;

      const attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [];
      for (const target of sendTargets) {
        const goBody: Record<string, unknown> = { number: target.value, text };
        const goBodyMsg: Record<string, unknown> = { number: target.value, message: text };
        const classicBody: Record<string, unknown> = { number: target.value, text };
        const classicBodyV1: Record<string, unknown> = { number: target.value, textMessage: { text } };
        if (quotedGo && quotedClassic) {
          goBody.quoted = quotedGo; goBodyMsg.quoted = quotedGo;
          classicBody.quoted = quotedClassic; classicBodyV1.quoted = quotedClassic;
        }
        attempts.push(
          { url: `${baseUrl}/send/text`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody, mode: `evolution-go-send-${target.kind}` },
          { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody, mode: `evolution-go-${target.kind}` },
          { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBodyMsg, mode: `evolution-go-msg-${target.kind}` },
          { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: classicBodyV1, mode: `evolution-api-v1-${target.kind}` },
          { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: classicBody, mode: `evolution-api-${target.kind}` },
        );
      }

      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'evolution-api-v1';
      const log: any[] = [];
      for (const att of attempts) {
        const timeout = att.mode.startsWith('evolution-go-send') ? 30000 : 8000;
        const r = await fetchJson(att.url, {
          method: 'POST',
          headers: att.headers,
          body: JSON.stringify(att.body),
        }, timeout).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ url: att.url, mode: att.mode, status: r.status, error: getEvolutionErrorText(r.data).slice(0, 180) });
        result = r; mode = att.mode;
        if (r.ok) break;
        if (isEvolutionReachoutLock(r.data)) continue;
        if (r.status !== 404 && r.status !== 405 && r.status !== 400 && r.status !== 0) break;
      }

      if (!result.ok) {
        console.error('[evolution-send] all attempts failed', log, result);
        const summary = log.map((a) => `${a.mode}:${a.status}${a.error ? ` (${a.error})` : ''}`).join(' | ');
        const locked = isEvolutionReachoutLock(result.data);
        return jsonResponse({
          ok: false,
          error: locked
            ? `A Evolution recusou o envio com erro 463/LID. Essa instância precisa atualizar/reconectar no painel Evolution para corrigir o envio por LID. Tentativas: ${summary}`
            : `Falha ao enviar pela Evolution: ${summary}`,
          attempts: log,
          lastResponse: result.data,
        }, 200);
      }

      const realExternalId = result.data?.key?.id || result.data?.messageId || result.data?.data?.Info?.ID || result.data?.Info?.ID;
      await insertOutgoingMessage(admin, {
        user_id: user.id,
        instance_name: instance,
        remote_jid: result.data?.data?.Info?.Chat || result.data?.Info?.Chat || (primaryTarget.includes('@') ? primaryTarget : `${primaryTarget}@s.whatsapp.net`),
        phone,
        direction: 'out',
        content: text,
        status: 'sent',
        external_id: realExternalId || `sent-${crypto.randomUUID()}`,
        raw: quotedRaw?.messageId ? { ...result.data, __mode: mode, __attempts: log, __quoted: { id: quotedRaw.messageId, text: quotedRaw.text || '', fromMe: !!quotedRaw.fromMe } } : { ...result.data, __mode: mode, __attempts: log },
      });

      return jsonResponse({ ok: true, mode, data: result.data, externalId: realExternalId });
    }

    // SEND STATUS (broadcast to status@broadcast - text status)
    if (action === 'send-status') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp antes de postar status.' }, 200);
      const text = String(body.text || '').trim();
      if (!text) return jsonResponse({ error: 'text obrigatório' }, 400);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);

      // Per Evolution API v2 docs all fields are required
      const classicBody: Record<string, unknown> = {
        type: 'text',
        content: text,
        caption: '',
        backgroundColor: '#075E54',
        font: 1,
        allContacts: true,
        statusJidList: [],
      };
      const goBody: Record<string, unknown> = { text, content: text, type: 'text', backgroundColor: '#075E54', font: 1, allContacts: true, statusJidList: [] };
      const goTextBody: Record<string, unknown> = { text, backgroundColor: '#075E54', font: 1, allContacts: true, statusJidList: [] };

      const attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [
        { url: `${baseUrl}/send/status/text`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goTextBody, mode: 'evolution-go-status-text' },
        { url: `${baseUrl}/message/sendStatus/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: classicBody, mode: 'evolution-api-status' },
        { url: `${baseUrl}/message/sendStatus`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody, mode: 'evolution-go-status' },
        { url: `${baseUrl}/send/status`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody, mode: 'evolution-go-send-status' },
      ];

      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'evolution-api-status';
      const log: any[] = [];
      for (const att of attempts) {
        const r = await fetchJson(att.url, {
          method: 'POST',
          headers: att.headers,
          body: JSON.stringify(att.body),
        }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ url: att.url, mode: att.mode, status: r.status });
        if (r.ok) { result = r; mode = att.mode; break; }
        if (r.status !== 404 && r.status !== 405 && r.status !== 400) { result = r; mode = att.mode; break; }
        result = r; mode = att.mode;
      }

      if (!result.ok) {
        const summary = log.map((a) => `${a.mode}:${a.status}`).join(' | ');
        return jsonResponse({ error: `Seu painel Evolution não permitiu publicar Status (${summary}). Alguns painéis exigem plano/recurso de Status habilitado.`, attempts: log }, 200);
      }

      await insertOutgoingMessage(admin, {
        user_id: user.id,
        instance_name: instance,
        remote_jid: 'status@broadcast',
            phone: 'status:me',
        direction: 'out',
        content: text,
        status: 'sent',
        external_id: result.data?.key?.id || result.data?.messageId || null,
        raw: result.data,
      });
      return jsonResponse({ ok: true, mode, data: result.data });
    }


    // FETCH PROFILE PICTURE
    if (action === 'fetch-profile-pic') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp.' }, 200);
      const phone = normalizePhone(body.phone);
      if (!phone) return jsonResponse({ error: 'phone obrigatório' }, 400);
      const number = `${phone}@s.whatsapp.net`;
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const tries = [
        { url: `${baseUrl}/user/avatar`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, preview: false } },
        { url: `${baseUrl}/user/avatar`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number, preview: false } },
        { url: `${baseUrl}/user/info`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: [phone] } },
        { url: `${baseUrl}/user/info`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: [number] } },
        { url: `${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true), body: { number: phone } },
        { url: `${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true), body: { number } },
        { url: `${baseUrl}/chat/getProfilePicture`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone } },
        { url: `${baseUrl}/chat/whatsappProfile/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true), body: { number: phone } },
      ];
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: t.method, headers: t.headers, body: JSON.stringify(t.body) }, 3000)
          .catch(() => ({ ok: false, status: 0, data: {} as any }));
        const url = findUrlDeep(r?.data);
        if (url) {
          await admin.from('evolution_contacts').upsert({
            user_id: user.id, phone, profile_pic_url: url, updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,phone' });
          return jsonResponse({ ok: true, url });
        }
      }
      return jsonResponse({ ok: false, url: null });
    }

    // SYNC CONTACTS FROM EVOLUTION GO
    if (action === 'sync-contacts') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp.' }, 200);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const r = await fetchJson(`${baseUrl}/user/contacts`, { headers: evolutionHeaders(instAuth.apiKey, false, instAuth.instanceId) }, 10000)
        .catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
      const rows = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
      const payload = rows.map((item: any) => {
        const rawPhone = String(item?.number || item?.phone || item?.jid || item?.id || '').split('@')[0];
        const phone = normalizePhone(rawPhone);
        if (!phone) return null;
        const row: Record<string, unknown> = {
          user_id: user.id,
          phone,
          name: item?.name || item?.pushName || item?.notify || item?.verifiedName || null,
          updated_at: new Date().toISOString(),
        };
        const avatar = findUrlDeep(item);
        if (avatar) row.profile_pic_url = avatar;
        return row;
      }).filter(Boolean);
      if (payload.length) {
        await admin.from('evolution_contacts').upsert(payload, { onConflict: 'user_id,phone' });
      }
      return jsonResponse({ ok: r.ok, count: payload.length, status: r.status });
    }

    // SEND REACTION — body: { phone, messageId, fromMe, emoji }
    if (action === 'send-reaction') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp.' }, 200);
      const phone = normalizePhone(body.phone);
      const messageId = String(body.messageId || '').trim();
      const emoji = String(body.emoji || '');
      const fromMe = !!body.fromMe;
      if (!phone || !messageId) return jsonResponse({ error: 'phone e messageId obrigatórios' }, 400);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const jid = `${phone}@s.whatsapp.net`;
      const key = { remoteJid: jid, fromMe, id: messageId };

      const attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [
        // Evolution API v2 (canonical, per docs)
        { url: `${baseUrl}/message/sendReaction/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { key, reaction: emoji }, mode: 'evo-api-v2' },
        // Evolution Go variants
        { url: `${baseUrl}/message/sendReaction`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { key, reaction: emoji }, mode: 'evo-go-msg' },
        { url: `${baseUrl}/message/react`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { id: messageId, number: phone, reaction: emoji }, mode: 'evo-go-react' },
        { url: `${baseUrl}/send/reaction`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { key, reaction: emoji }, mode: 'evo-go-send' },
        { url: `${baseUrl}/chat/sendReaction/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { key, reaction: emoji }, mode: 'evo-api-chat' },
      ];
      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'evo-api-v2';
      const log: any[] = [];
      for (const att of attempts) {
        const r = await fetchJson(att.url, { method: 'POST', headers: att.headers, body: JSON.stringify(att.body) })
          .catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ mode: att.mode, status: r.status, data: r.data });
        if (r.ok) { result = r; mode = att.mode; break; }
        result = r; mode = att.mode;
      }
      console.log('[evolution-send] send-reaction', { instance, phone, messageId, emoji, fromMe, ok: result.ok, attempts: log });
      if (!result.ok) {
        const summary = log.map((l) => `${l.mode}:${l.status}${l.data?.message ? ` (${typeof l.data.message === 'string' ? l.data.message : JSON.stringify(l.data.message).slice(0, 120)})` : ''}`).join(' | ');
        return jsonResponse({ ok: false, error: `A Evolution não entregou a reação (${summary}).`, attempts: log, lastResponse: result.data }, 200);
      }
      await insertOutgoingMessage(admin, {
        user_id: user.id,
        instance_name: instance,
        remote_jid: jid,
        phone,
        direction: 'out',
        content: '[reaction]',
        message_type: 'reaction',
        status: 'sent',
        external_id: result.data?.key?.id || result.data?.messageId || result.data?.data?.Info?.ID || `reaction-${messageId}-${Date.now()}`,
        raw: { message: { reactionMessage: { key, text: emoji } }, attempts: log },
      });
      return jsonResponse({ ok: true, mode, data: result.data });
    }

    // SEND MEDIA (audio / image / file) — body: { phone, mediaBase64, mimetype, filename, mediaType: 'audio'|'image'|'document', caption? }
    if (action === 'send-media') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp antes de enviar arquivos.' }, 200);
      const phone = normalizePhone(body.phone);
      const mediaType = String(body.mediaType || 'document');
      const mimetype = String(body.mimetype || 'application/octet-stream');
      const filename = String(body.filename || `media-${Date.now()}`);
      const caption = String(body.caption || '');
      const mediaBase64 = String(body.mediaBase64 || '');
      if (!phone || !mediaBase64) return jsonResponse({ error: 'phone e mediaBase64 obrigatórios' }, 400);

      // Upload to storage for our own preview
      let mediaUrl: string | null = null;
      try {
        const bin = Uint8Array.from(atob(mediaBase64), (c) => c.charCodeAt(0));
        const path = `${user.id}/${Date.now()}-${filename}`;
        const { error: upErr } = await admin.storage.from('evolution-media').upload(path, bin, { contentType: mimetype, upsert: false });
        if (!upErr) {
          const { data: signed } = await admin.storage.from('evolution-media').createSignedUrl(path, 60 * 60 * 24 * 365);
          mediaUrl = signed?.signedUrl || null;
        }
      } catch (e) {
        console.error('[evolution-send] storage upload failed', e);
      }

      const mediaForEvolution = publicMediaFromSignedUrl(mediaUrl) || `data:${mimetype};base64,${mediaBase64}`;
      const cleanMime = mimetype.split(';')[0] || mimetype;
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);

      let attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [];
      if (mediaType === 'audio') {
        attempts = [
          { url: `${baseUrl}/send/media`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, type: 'audio', url: mediaForEvolution, filename, caption }, mode: 'evolution-go-send-media-token' },
          { url: `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, audio: mediaForEvolution }, mode: 'evolution-api-audio-url' },
          { url: `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, audio: mediaBase64 }, mode: 'evolution-api-audio-base64' },
          { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, mediatype: 'audio', mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-api-media-audio' },
          { url: `${baseUrl}/send/media`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, type: 'audio', url: mediaForEvolution, filename, caption }, mode: 'evolution-go-send-media' },
          { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, type: 'audio', url: mediaForEvolution, filename, caption }, mode: 'evolution-go-message-media' },
        ];
      } else if (mediaType === 'sticker') {
        attempts = [
          { url: `${baseUrl}/send/sticker`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, sticker: mediaForEvolution }, mode: 'evolution-go-send-sticker-token' },
          { url: `${baseUrl}/message/sendSticker/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, sticker: mediaForEvolution }, mode: 'evolution-api-sticker-url' },
          { url: `${baseUrl}/message/sendSticker/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, sticker: mediaBase64 }, mode: 'evolution-api-sticker-base64' },
          { url: `${baseUrl}/send/sticker`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, sticker: mediaForEvolution }, mode: 'evolution-go-send-sticker' },
          { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, mediatype: 'sticker', mimetype: cleanMime, fileName: filename, media: mediaForEvolution }, mode: 'evolution-api-media-sticker' },
        ];
      } else {
        const isImg = mediaType === 'image';
        const goType = isImg ? 'image' : 'document';
        attempts = [
          { url: `${baseUrl}/send/media`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, type: goType, url: mediaForEvolution, filename, caption }, mode: 'evolution-go-send-media-token' },
          { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-api-url' },
          { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaBase64 }, mode: 'evolution-api-base64' },
          { url: `${baseUrl}/send/media`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, type: goType, url: mediaForEvolution, filename, caption }, mode: 'evolution-go-send-media' },
          { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, type: goType, url: mediaForEvolution, filename, caption }, mode: 'evolution-go-message-media' },
          { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-go-classic-body' },
        ];
      }

      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'evolution-api';
      const log: any[] = [];
      for (const att of attempts) {
        const r = await fetchJson(att.url, { method: 'POST', headers: att.headers, body: JSON.stringify(att.body) })
          .catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ url: att.url, mode: att.mode, status: r.status });
        if (r.ok) { result = r; mode = att.mode; break; }
        if (r.status !== 404 && r.status !== 405 && r.status !== 400) { result = r; mode = att.mode; break; }
        result = r; mode = att.mode;
      }

      if (!result.ok) {
        const summary = log.map((a) => `${a.mode}:${a.status}`).join(' | ');
        return jsonResponse({ error: `Falha ao enviar mídia (${summary})`, attempts: log, data: result.data }, 200);
      }

      await insertOutgoingMessage(admin, {
        user_id: user.id,
        instance_name: instance,
        remote_jid: `${phone}@s.whatsapp.net`,
        phone,
        direction: 'out',
        content: caption || (mediaType === 'audio' ? '🎤 Áudio' : mediaType === 'image' ? '📷 Imagem' : mediaType === 'sticker' ? '🌟 Sticker' : `📎 ${filename}`),
        message_type: mediaType,
        media_url: mediaUrl,
        media_mime: mimetype,
        status: 'sent',
        external_id: result.data?.key?.id || result.data?.messageId || result.data?.data?.Info?.ID || result.data?.Info?.ID || null,
        raw: result.data,
      });

      return jsonResponse({ ok: true, mode, mediaUrl, data: result.data });
    }

    // QR / CONNECT — returns a base64 QR (data URL) so the user can scan it in-app
    if (action === 'qr-connect') {
      const targetInstance = String(body.instance || instance).trim();
      if (!targetInstance) return jsonResponse({ error: 'Crie ou selecione uma instância em Conexões WhatsApp.' }, 200);
      const foundInstance = await resolveGoInstance(baseUrl, apiKey, targetInstance);
      const scopedApiKey = foundInstance?.token || foundInstance?.hash || apiKey;
      const scopedInstanceId = foundInstance?.id || foundInstance?.instanceId || targetInstance;

      // First check if already logged in. Evolution Go can report Connected=false while the number is already linked.
      const sd = await getGoInstanceStatus(baseUrl, scopedApiKey, scopedInstanceId);
      if (sd?.LoggedIn === true || sd?.loggedIn === true) {
        return jsonResponse({ ok: true, alreadyConnected: true, instance: targetInstance, phone: extractInstancePhone(foundInstance, sd) });
      }

      // Trigger reconnect for Evolution Go (re-binding webhook on every QR request)
      const webhookUrlForConnect = `${supabaseUrl}/functions/v1/evolution-webhook?token=${settings.webhook_token}`;
      await fetchJson(`${baseUrl}/instance/connect`, {
        method: 'POST', headers: evolutionHeaders(scopedApiKey, true, scopedInstanceId),
        body: JSON.stringify({ webhookUrl: webhookUrlForConnect, subscribe: ['MESSAGE','SEND_MESSAGE','CONNECTION','QRCODE'], immediate: true }),
      }, 8000).catch(() => null);


      const tries = [
        { url: `${baseUrl}/instance/${encodeURIComponent(targetInstance)}/qrcode`, method: 'GET', headers: evolutionHeaders(apiKey) },
        { url: `${baseUrl}/instance/${encodeURIComponent(scopedInstanceId)}/qrcode`, method: 'GET', headers: evolutionHeaders(scopedApiKey) },
        { url: `${baseUrl}/instance/qr`, method: 'GET', headers: evolutionHeaders(scopedApiKey, false, scopedInstanceId) },
        { url: `${baseUrl}/instance/connect`, method: 'POST', headers: evolutionHeaders(scopedApiKey, true, scopedInstanceId) },
        { url: `${baseUrl}/instance/connect/${encodeURIComponent(targetInstance)}`, method: 'GET', headers: evolutionHeaders(apiKey) },
        { url: `${baseUrl}/instance/qr/${encodeURIComponent(targetInstance)}`, method: 'GET', headers: evolutionHeaders(apiKey) },
        { url: `${baseUrl}/instance/qrcode/${encodeURIComponent(targetInstance)}`, method: 'GET', headers: evolutionHeaders(apiKey) },
      ];
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: t.method, headers: t.headers, body: t.method === 'POST' ? '{}' : undefined }, 10000)
          .catch(() => ({ ok: false, status: 0, data: {} as any }));
        if (!r.ok) continue;
        const data = r.data || {};
        const findQr = (v: any): string | null => {
          if (!v) return null;
          if (typeof v === 'string') {
            if (v.startsWith('data:image')) return v;
            if (/^[A-Za-z0-9+/=]{200,}$/.test(v)) return `data:image/png;base64,${v}`;
            return null;
          }
          if (typeof v !== 'object') return null;
          for (const key of ['base64', 'qrcode', 'qr', 'code', 'image']) {
            const found = findQr(v[key]);
            if (found) return found;
          }
          for (const child of Object.values(v)) {
            const found = findQr(child);
            if (found) return found;
          }
          return null;
        };
        const qr = findQr(data);
        const pairingCode = data?.pairingCode || data?.code || data?.qrcode?.pairingCode || null;
        if (qr) return jsonResponse({ ok: true, qr, pairingCode, instance: targetInstance });
      }
      return jsonResponse({ ok: false, error: 'Não foi possível obter o QR Code. A instância pode já estar conectada — clique em Atualizar.' }, 200);
    }

    // Helper: check if current user is admin
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdminUser = !!roleRow;

    // Helper: list of instance names this user owns (admins => null = all)
    const getOwnedNames = async (): Promise<Set<string> | null> => {
      if (isAdminUser) return null;
      const { data } = await admin
        .from('user_evolution_instances')
        .select('instance_name')
        .eq('user_id', user.id);
      return new Set((data || []).map((r: any) => String(r.instance_name).toLowerCase()));
    };

    // LIST INSTANCES
    if (action === 'list-instances') {
      const owned = await getOwnedNames();
      // Try admin-key endpoints first (Evolution API classic / Go with global key)
      const tries = [
        `${baseUrl}/instance/fetchInstances`,
        `${baseUrl}/instance/all`,
        `${baseUrl}/instance/list`,
      ];
      for (const url of tries) {
        const r = await fetchJson(url, { headers: evolutionHeaders(apiKey) }, 8000)
          .catch(() => ({ ok: false, status: 0, data: {} as any }));
        if (!r.ok) continue;
        const rows = Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [];
        if (rows.length === 0) continue;
        const filteredRows = owned
          ? rows.filter((item: any) => {
              const nm = String(item?.name || item?.instanceName || item?.instance?.instanceName || item?.id || '').toLowerCase();
              return owned.has(nm);
            })
          : rows;
        const list = await Promise.all(filteredRows.map(async (item: any) => {
          const id = item?.id || item?.instanceId || item?.name || '';
          const token = item?.token || item?.hash || null;
          const statusData = token ? await getGoInstanceStatus(baseUrl, token, id) : {};
          return {
            id,
            name: item?.name || item?.instanceName || item?.instance?.instanceName || item?.id || '',
            state: normalizeInstanceState(item, statusData),
            phone: extractInstancePhone(item, statusData),
            profile_name: item?.profileName || statusData?.Name || statusData?.name || null,
            profile_pic: item?.profilePictureUrl || item?.profilePicUrl || null,
            token,
          };
        }));
        return jsonResponse({ ok: true, instances: list, current: instance, adminMode: isAdminUser });
      }

      // Fallback: build a single entry from the instance-scoped /instance/status endpoint
      const status = await fetchJson(`${baseUrl}/instance/status`, {
        headers: evolutionHeaders(apiKey),
      }, 6000).catch(() => ({ ok: false, status: 0, data: {} as any }));

      if (status.ok) {
        const sd = status.data?.data || status.data || {};
        let phone: string | null = null;
        const conn = await fetchJson(`${baseUrl}/instance/connect`, {
          method: 'POST', headers: evolutionHeaders(apiKey, true), body: JSON.stringify({}),
        }, 5000).catch(() => ({ ok: false, status: 0, data: {} as any }));
        const jid = conn?.data?.data?.jid || conn?.data?.jid;
        phone = phoneFromJid(jid) || extractInstancePhone({}, sd);
        return jsonResponse({
          ok: true,
          adminMode: false,
          current: instance,
          instances: [{
            id: instance,
            name: sd.Name || instance,
            state: normalizeInstanceState({}, sd),
            phone,
            profile_name: sd.Name || null,
            profile_pic: null,
            token: null,
          }],
        });
      }

      // Final fallback: return the locally-owned instances so the UI can still
      // show them (and allow Excluir) even when the Evolution panel is offline
      // or the API key is wrong.
      let localOwned: any[] = [];
      if (isAdminUser) {
        const { data } = await admin
          .from('user_evolution_instances')
          .select('instance_name, instance_id');
        localOwned = data || [];
      } else {
        const { data } = await admin
          .from('user_evolution_instances')
          .select('instance_name, instance_id')
          .eq('user_id', user.id);
        localOwned = data || [];
      }
      const localList = localOwned
        .filter((r: any) => r?.instance_name)
        .map((r: any) => ({
          id: r.instance_id || r.instance_name,
          name: r.instance_name,
          state: 'unknown',
          phone: null,
          profile_name: null,
          profile_pic: null,
          token: null,
        }));
      if (localList.length > 0) {
        return jsonResponse({
          ok: true,
          instances: localList,
          current: instance,
          adminMode: isAdminUser,
          warning: 'Painel Evolution não respondeu — exibindo registro local. Algumas ações podem falhar.',
        });
      }
      return jsonResponse({
        ok: false,
        error: 'Não foi possível listar instâncias. Verifique URL/API Key em Configurações.',
        instances: [],
        current: instance,
      }, 200);
    }

    // CREATE INSTANCE
    if (action === 'create-instance') {
      const name = String(body.name || '').trim();
      if (!name) return jsonResponse({ error: 'name obrigatório' }, 400);

      // Enforce per-reseller limit (admins are unlimited)
      if (!isAdminUser) {
        const { data: owned } = await admin
          .from('user_evolution_instances')
          .select('id')
          .eq('user_id', user.id);
        const used = (owned || []).length;
        const { data: access } = await admin
          .from('reseller_access')
          .select('max_evolution_instances')
          .eq('user_id', user.id)
          .maybeSingle();
        const max = Number(access?.max_evolution_instances ?? 1);
        if (used >= max) {
          return jsonResponse({ ok: false, error: `Limite de ${max} instância(s) atingido. Peça ao administrador para aumentar.` }, 200);
        }
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook?token=${settings.webhook_token}`;
      const instToken = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const defaultAdvanced = {
        alwaysOnline: false,
        rejectCall: false,
        msgRejectCall: '',
        readMessages: false,
        ignoreGroups: false,
          ignoreStatus: false,
      };
      const defaultEvents = ['MESSAGE', 'SEND_MESSAGE', 'CONNECTION', 'QRCODE'];
      const payloads = [
        // Evolution GO format
        { url: `${baseUrl}/instance/create`, body: { name, token: instToken, advancedSettings: defaultAdvanced } },
        // Classic Evolution API fallback (also accepts inline webhook)
        { url: `${baseUrl}/instance/create`, body: { instanceName: name, token: instToken, qrcode: true, integration: 'WHATSAPP-BAILEYS', webhook: { url: webhookUrl, events: ['MESSAGES_UPSERT'] } } },
      ];
      let last: any = { ok: false, status: 0, data: {} };
      for (const p of payloads) {
        const r = await fetchJson(p.url, {
          method: 'POST',
          headers: evolutionHeaders(apiKey, true),
          body: JSON.stringify(p.body),
        }, 12000).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        last = r;
        if (r.ok) {
          // Register ownership
          const instId = r.data?.id || r.data?.instance?.instanceId || r.data?.data?.id || null;
          const issuedToken = r.data?.token || r.data?.hash || r.data?.instance?.token || instToken;
          await admin.from('user_evolution_instances').upsert(
            { user_id: user.id, instance_name: name, instance_id: instId },
            { onConflict: 'instance_name' }
          );

          // Configure webhook + advanced settings on the freshly created instance (Evolution GO)
          const postSetup: any[] = [];
          const scopedHeaders = evolutionHeaders(issuedToken, true, instId || name);
          // Bind webhook via /instance/connect (Evolution GO has no separate /webhook endpoint)
          postSetup.push(
            fetchJson(`${baseUrl}/instance/connect`, {
              method: 'POST',
              headers: scopedHeaders,
              body: JSON.stringify({ webhookUrl, subscribe: defaultEvents, immediate: false }),
            }, 8000).catch(() => null),
          );
          // Apply advanced settings explicitly
          if (instId) {
            postSetup.push(
              fetchJson(`${baseUrl}/instance/${encodeURIComponent(instId)}/advanced-settings`, {
                method: 'PUT',
                headers: scopedHeaders,
                body: JSON.stringify(defaultAdvanced),
              }, 8000).catch(() => null),
            );
          }
          // Classic Evolution API webhook fallback
          postSetup.push(
            fetchJson(`${baseUrl}/webhook/set/${encodeURIComponent(name)}`, {
              method: 'POST',
              headers: evolutionHeaders(apiKey, true),
              body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, events: ['MESSAGES_UPSERT'], byEvents: false, base64: true } }),
            }, 8000).catch(() => null),
          );
          await Promise.all(postSetup);

          return jsonResponse({ ok: true, data: r.data, name, token: issuedToken, webhookUrl });
        }
      }
      return jsonResponse({ ok: false, status: last.status, error: last.data?.message || last.data?.error || 'Falha ao criar instância.', data: last.data }, 200);
    }


    // DISCONNECT / LOGOUT INSTANCE
    if (action === 'logout-instance') {
      const targetInstance = String(body.instance || instance).trim();
      if (!targetInstance) return jsonResponse({ ok: false, error: 'instance obrigatória' }, 400);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, targetInstance);
      const tries = [
        { url: `${baseUrl}/instance/logout`, method: 'DELETE', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId) },
        { url: `${baseUrl}/instance/logout`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId) },
        { url: `${baseUrl}/instance/disconnect`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId) },
        { url: `${baseUrl}/instance/${encodeURIComponent(instAuth.instanceId)}/logout`, method: 'DELETE', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId) },
        { url: `${baseUrl}/instance/logout/${encodeURIComponent(targetInstance)}`, method: 'DELETE', headers: evolutionHeaders(apiKey, true) },
        { url: `${baseUrl}/instance/logout/${encodeURIComponent(targetInstance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true) },
        { url: `${baseUrl}/instance/disconnect/${encodeURIComponent(targetInstance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true) },
      ];
      const attempts: Array<{ url: string; method: string; status: number }> = [];
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: t.method, headers: t.headers, body: t.method === 'POST' ? '{}' : undefined }, 8000)
          .catch(() => ({ ok: false, status: 0, data: {} as any }));
        attempts.push({ url: t.url, method: t.method, status: r.status });
        if (r.ok) return jsonResponse({ ok: true, data: r.data });
      }
      return jsonResponse({ ok: false, error: 'Falha ao desconectar instância.', attempts }, 200);
    }

    // DELETE INSTANCE (remove from Evolution + ownership table)
    if (action === 'delete-instance') {
      const targetInstance = String(body.instance || '').trim();
      if (!targetInstance) return jsonResponse({ ok: false, error: 'instance obrigatória' }, 400);

      // Ownership check (admins bypass)
      if (!isAdminUser) {
        const { data: own } = await admin
          .from('user_evolution_instances')
          .select('user_id')
          .eq('instance_name', targetInstance)
          .maybeSingle();
        if (own && own.user_id !== user.id) {
          return jsonResponse({ ok: false, error: 'Você não é dono desta instância.' }, 403);
        }
      }

      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, targetInstance);
      // Try logout first (some panels require it before delete)
      const logoutTries = [
        { url: `${baseUrl}/instance/logout`, method: 'DELETE', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId) },
        { url: `${baseUrl}/instance/logout/${encodeURIComponent(targetInstance)}`, method: 'DELETE', headers: evolutionHeaders(apiKey, true) },
      ];
      for (const t of logoutTries) {
        await fetchJson(t.url, { method: t.method, headers: t.headers }, 5000).catch(() => null);
      }

      const tries = [
        // Evolution Go — DELETE /instance/delete/{instanceId} (global apikey)
        { url: `${baseUrl}/instance/delete/${encodeURIComponent(instAuth.instanceId)}`, method: 'DELETE', headers: evolutionHeaders(apiKey, true) },
        { url: `${baseUrl}/instance/delete/${encodeURIComponent(instAuth.instanceId)}`, method: 'DELETE', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId) },
        // Same endpoint but using the instance name (some panels treat name as id)
        { url: `${baseUrl}/instance/delete/${encodeURIComponent(targetInstance)}`, method: 'DELETE', headers: evolutionHeaders(apiKey, true) },
        // Classic Evolution API fallbacks
        { url: `${baseUrl}/instance/delete/${encodeURIComponent(targetInstance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true) },
        { url: `${baseUrl}/instance/${encodeURIComponent(instAuth.instanceId)}`, method: 'DELETE', headers: evolutionHeaders(apiKey, true) },
        { url: `${baseUrl}/manager/instance/delete/${encodeURIComponent(targetInstance)}`, method: 'DELETE', headers: evolutionHeaders(apiKey, true) },
      ];

      const attempts: Array<{ url: string; method: string; status: number; body?: any }> = [];
      let ok = false;
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: t.method, headers: t.headers, body: t.method === 'POST' ? '{}' : undefined }, 8000)
          .catch(() => ({ ok: false, status: 0, data: {} as any }));
        attempts.push({ url: t.url, method: t.method, status: r.status, body: r.data });
        if (r.ok || r.status === 404) { ok = true; break; } // 404 = already gone
      }

      // Remove ownership record regardless of remote outcome (so user isn't locked out of slot)
      const ownerDel = admin.from('user_evolution_instances').delete().eq('instance_name', targetInstance);
      if (!isAdminUser) ownerDel.eq('user_id', user.id);
      await ownerDel;

      // Clear active instance if it was the deleted one
      if (settings.instance_name === targetInstance) {
        await admin.from('evolution_settings').update({ instance_name: '' }).eq('user_id', user.id);
      }

      if (!ok) return jsonResponse({ ok: false, error: 'Falha ao excluir no painel Evolution. Registro local removido — tente novamente ou exclua manualmente no painel.', attempts }, 200);
      return jsonResponse({ ok: true, attempts });
    }



    // SET ACTIVE INSTANCE (saves to evolution_settings.instance_name)
    if (action === 'set-active-instance') {
      const name = String(body.name || '').trim();
      if (!name) return jsonResponse({ error: 'name obrigatório' }, 400);
      const { error } = await admin
        .from('evolution_settings')
        .update({ instance_name: name })
        .eq('user_id', user.id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    // UPDATE INSTANCE SETTINGS (Advanced + Webhook) — Evolution Go
    if (action === 'update-instance-settings') {
      const targetInstance = String(body.instance || instance).trim();
      if (!targetInstance) return jsonResponse({ error: 'instance obrigatório' }, 400);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, targetInstance);
      const advanced = body.advanced || null;
      const webhook = body.webhook || null;
      const results: Record<string, any> = {};

      if (advanced && typeof advanced === 'object') {
        const advBody = {
          alwaysOnline: !!advanced.alwaysOnline,
          rejectCall: !!advanced.rejectCall,
          msgRejectCall: advanced.msgCall || '',
          readMessages: !!advanced.readMessages,
          ignoreGroups: !!advanced.ignoreGroups,
          ignoreStatus: !!advanced.ignoreStatus,
          readStatus: !!advanced.readStatus,
          syncFullHistory: !!advanced.syncFullHistory,
          groupsOnly: !!advanced.groupsOnly,
        };
        const classicBody = {
          ...advBody,
          msgCall: advanced.msgCall || '',
          groupsIgnore: !!advanced.ignoreGroups,
        };
        const tries = [
          { url: `${baseUrl}/instance/${encodeURIComponent(instAuth.instanceId)}/advanced-settings`, method: 'PUT', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: advBody },
          { url: `${baseUrl}/instance/${encodeURIComponent(instAuth.instanceId)}/advanced-settings`, method: 'PUT', headers: evolutionHeaders(apiKey, true), body: advBody },
          { url: `${baseUrl}/settings/set/${encodeURIComponent(targetInstance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true), body: classicBody },
        ];
        for (const t of tries) {
          const r = await fetchJson(t.url, { method: t.method, headers: t.headers, body: JSON.stringify(t.body) }, 8000)
            .catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
          results.advanced = { ok: r.ok, status: r.status, url: t.url, method: t.method, data: r.data };
          if (r.ok) break;
          if (r.status !== 404 && r.status !== 405 && r.status !== 0) break;
        }
      }

      if (webhook && typeof webhook === 'object') {
        const webhookUrl = String(webhook.url || `${supabaseUrl}/functions/v1/evolution-webhook?token=${settings.webhook_token}`);
        const events: string[] = Array.isArray(webhook.events) ? webhook.events : [];
        const enabled = webhook.enabled !== false;
        // Evolution Go does NOT have a separate /webhook endpoint — webhook is set via /instance/connect with subscribe[]
        const goBody = { webhookUrl, subscribe: events, enabled, immediate: false };
        const classicBody = { webhook: { enabled, url: webhookUrl, events, byEvents: false, base64: true } };
        const tries = [
          { url: `${baseUrl}/instance/connect`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody },
          { url: `${baseUrl}/webhook/set/${encodeURIComponent(targetInstance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true), body: classicBody },
        ];
        for (const t of tries) {
          const r = await fetchJson(t.url, { method: t.method, headers: t.headers, body: JSON.stringify(t.body) }, 8000)
            .catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
          results.webhook = { ok: r.ok, status: r.status, url: t.url, method: t.method, data: r.data, webhookUrl };
          if (r.ok) break;
          if (r.status !== 404 && r.status !== 405 && r.status !== 0) break;
        }
      }

      const ok = (!advanced || results.advanced?.ok) && (!webhook || results.webhook?.ok);
      return jsonResponse({ ok, results });
    }

    return jsonResponse({ error: 'action inválida' }, 400);
  } catch (e) {
    console.error('[evolution-send]', e);
    return jsonResponse({ error: String((e as Error).message || e) }, 500);
  }
});
