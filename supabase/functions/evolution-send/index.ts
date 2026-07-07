import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizePhone(p: string) {
  const digits = String(p || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  // Foreign numbers already include their own DDI (length >= 11).
  // Only auto-prepend BR "55" for short legacy stored numbers (DDD+number, 10-11 dígitos).
  if (digits.length >= 12) return digits;
  return `55${digits}`;
}

function normalizeChatPhone(p: string) {
  const digits = String(p || '').replace(/\D/g, '');
  if (!digits) return '';
  // Foreign DDI already present → keep as-is
  if (!digits.startsWith('55') && digits.length >= 11) return digits;
  return normalizePhone(digits);
}

function whatsappPhoneCandidates(phone: string | null | undefined) {
  const d = String(phone || '').replace(/\D/g, '');
  const candidates = new Set<string>();
  if (d) candidates.add(d);
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') candidates.add(`${d.slice(0, 4)}${d.slice(5)}`);
  if (d.startsWith('55') && d.length === 12) candidates.add(`${d.slice(0, 4)}9${d.slice(4)}`);
  return Array.from(candidates).filter(Boolean);
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
  if (/@s\.whatsapp\.net\b/i.test(clean) && digits.length >= 10) return `${digits}@s.whatsapp.net`;
  return digits.length >= 10 ? digits : '';
}

function pushUniqueTarget(targets: Array<{ value: string; kind: 'lid' | 'jid' | 'phone' }>, raw: unknown) {
  const target = jidTarget(raw);
  if (!target) return;
  const kind = target.includes('@lid') ? 'lid' : target.includes('@s.whatsapp.net') ? 'jid' : 'phone';
  if (!targets.some((t) => t.value === target)) targets.push({ value: target, kind });
}

function collectJidsDeep(value: unknown, out: string[] = []) {
  if (typeof value === 'string') {
    if (/@(lid|s\.whatsapp\.net)\b/i.test(value)) out.push(value);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  for (const child of Object.values(value as Record<string, unknown>)) collectJidsDeep(child, out);
  return out;
}

async function resolveValidatedTargets(baseUrl: string, apiKey: string, instanceId: string, phone: string) {
  const targets: Array<{ value: string; kind: 'lid' | 'jid' | 'phone' }> = [];
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return targets;
  const jid = `${digits}@s.whatsapp.net`;
  const headers = evolutionHeaders(apiKey, true, instanceId);
  const probes = [
    { url: `${baseUrl}/user/check`, body: { number: [digits], formatJid: true } },
    { url: `${baseUrl}/user/check`, body: { number: [jid], formatJid: true } },
    { url: `${baseUrl}/user/info`, body: { number: [digits], formatJid: true } },
    { url: `${baseUrl}/user/info`, body: { number: [jid], formatJid: true } },
  ];
  for (const probe of probes) {
    const r = await fetchJson(probe.url, { method: 'POST', headers, body: JSON.stringify(probe.body) }, 5000).catch(() => null);
    for (const found of collectJidsDeep(r?.data)) pushUniqueTarget(targets, found);
  }
  return targets;
}

async function resolveSendPhone(admin: any, userId: string, phone: string) {
  if (phone.startsWith('55') && phone.length >= 12) return phone;
  // Foreign numbers (any non-55 DDI with full length) are returned as-is.
  if (!phone.startsWith('55') && phone.length >= 11) return phone;
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
  const targets: Array<{ value: string; kind: 'lid' | 'jid' | 'phone'; fromInbound?: boolean }> = [];
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  const normalizedPhone = normalizeChatPhone(phoneDigits);

  const pushInbound = (raw: unknown) => {
    const target = jidTarget(raw);
    if (!target) return;
    const kind = target.includes('@lid') ? 'lid' : target.includes('@s.whatsapp.net') ? 'jid' : 'phone';
    const existing = targets.find((t) => t.value === target);
    if (existing) { existing.fromInbound = true; return; }
    targets.push({ value: target, kind, fromInbound: true });
  };

  const { data } = await admin
    .from('evolution_messages')
    .select('phone, raw, remote_jid, direction, created_at')
    .eq('user_id', userId)
    .or(`phone.eq.${phoneDigits},phone.eq.${normalizedPhone}`)
    .order('created_at', { ascending: false })
    .limit(50);

  // First pass: prioritize JIDs from the most recent INBOUND messages — those
  // chats are already "open" with WhatsApp so they bypass the 463 reachout lock.
  for (const row of data || []) {
    const info = row?.raw?.data?.Info || row?.raw?.Info || {};
    const isInbound = row?.direction === 'in' || info?.IsFromMe === false;
    if (!isInbound) continue;
    pushInbound(row?.remote_jid);
    pushInbound(info.Chat);
    pushInbound(info.Sender);
    pushInbound(info.SenderAlt);
  }

  // Second pass: outbound history (last known good targets we used before).
  for (const row of data || []) {
    const info = row?.raw?.data?.Info || row?.raw?.Info || {};
    const isOutbound = row?.direction === 'out' || info?.IsFromMe === true;
    if (!isOutbound) continue;
    pushUniqueTarget(targets, row?.remote_jid);
    pushUniqueTarget(targets, info.RecipientAlt);
    pushUniqueTarget(targets, info.TargetJID || info.TargetID);
    pushUniqueTarget(targets, info.DeviceSentMeta?.DestinationJID);
    pushUniqueTarget(targets, info.Chat);
  }

  pushUniqueTarget(targets, phoneDigits.includes('@') ? phone : phoneDigits);
  if (normalizedPhone) pushUniqueTarget(targets, normalizedPhone);
  if (normalizedPhone) pushUniqueTarget(targets, `${normalizedPhone}@s.whatsapp.net`);

  if (normalizedPhone.startsWith('55') && normalizedPhone.length >= 12) {
    const ddd = normalizedPhone.slice(2, 4);
    const rest = normalizedPhone.slice(4);
    if (rest.length === 9 && rest.startsWith('9')) {
      const without9 = `55${ddd}${rest.slice(1)}`;
      pushUniqueTarget(targets, without9);
      pushUniqueTarget(targets, `${without9}@s.whatsapp.net`);
    } else if (rest.length === 8) {
      const with9 = `55${ddd}9${rest}`;
      pushUniqueTarget(targets, with9);
      pushUniqueTarget(targets, `${with9}@s.whatsapp.net`);
    }
  }

  // Inbound JIDs first — they bypass the WhatsApp 463 "reachout time lock"
  // because the conversation is already established. Then inbound LIDs, then
  // raw phone fallbacks.
  const inboundJids = targets.filter((t) => t.fromInbound && t.kind === 'jid');
  const inboundLids = targets.filter((t) => t.fromInbound && t.kind === 'lid');
  const otherLids = targets.filter((t) => !t.fromInbound && t.kind === 'lid');
  const brPhones = targets.filter((t) => t.kind === 'phone' && t.value.startsWith('55'));
  const otherJids = targets.filter((t) => !t.fromInbound && t.kind === 'jid' && t.value.startsWith('55'));
  const otherPhones = targets.filter((t) => t.kind === 'phone' && !t.value.startsWith('55'));
  const ordered = [...inboundJids, ...inboundLids, ...otherLids, ...brPhones, ...otherJids, ...otherPhones];
  return ordered.filter((target, index, arr) => arr.findIndex((t) => t.value === target.value) === index);
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

function templateText(value: unknown, vars: Record<string, unknown>) {
  return String(value || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function evalCondition(op: string, left: string, right: string) {
  if (op === 'contains') return left.toLowerCase().includes(right.toLowerCase());
  if (op === 'starts') return left.toLowerCase().startsWith(right.toLowerCase());
  if (op === 'regex') { try { return new RegExp(right, 'i').test(left); } catch { return false; } }
  return left.toLowerCase() === right.toLowerCase();
}

function randomAccessCode(len = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

const DEFAULT_WEBHOOK_EVENTS = ['MESSAGE', 'SEND_MESSAGE', 'CONNECTION', 'QRCODE', 'PRESENCE', 'CHAT_PRESENCE', 'MESSAGE_RECEIPT', 'MESSAGES_UPDATE', 'RECEIPT'];

function normalizeWebhookEvents(value: unknown) {
  const raw = Array.isArray(value) ? value : DEFAULT_WEBHOOK_EVENTS;
  const events = raw.map((event) => String(event || '').trim().toUpperCase()).filter(Boolean);
  if (events.includes('ALL')) return ['ALL'];
  return Array.from(new Set(events.length ? events : DEFAULT_WEBHOOK_EVENTS));
}

function classicWebhookEvents(events: string[]) {
  return events.includes('ALL') ? ['MESSAGES_UPSERT'] : events;
}

function evolutionSubscribeEvents(events: string[]) {
  return events.includes('ALL') ? DEFAULT_WEBHOOK_EVENTS : events;
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

async function primeEvolutionContact(baseUrl: string, apiKey: string, instanceId: string, phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return;
  const jid = `${digits}@s.whatsapp.net`;
  const headers = evolutionHeaders(apiKey, true, instanceId);
  const probes = [
    { url: `${baseUrl}/user/info`, body: { number: [digits] } },
    { url: `${baseUrl}/user/info`, body: { number: [jid] } },
    { url: `${baseUrl}/user/avatar`, body: { number: digits, preview: false } },
    { url: `${baseUrl}/user/avatar`, body: { number: jid, preview: false } },
  ];
  await Promise.all(probes.map((probe) =>
    fetchJson(probe.url, { method: 'POST', headers, body: JSON.stringify(probe.body) }, 3000).catch(() => null)
  ));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const internalToken = req.headers.get('x-internal-token') || '';
    const internalUserId = String(body.user_id || '').trim();
    let user: { id: string } | null = null;
    if (internalToken === serviceKey && isUuid(internalUserId)) {
      user = { id: internalUserId };
    } else {
      const authHeader = req.headers.get('Authorization') || '';
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: authUser }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !authUser) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = { id: authUser.id };
    }
    const action = body.action || 'send';

    let { data: settings } = await admin
      .from('evolution_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Fallback: resellers share the admin's global Evolution server (URL + API Key).
    // Their per-user row only customizes the active instance_name.
    if (!settings || !settings.base_url || !settings.api_key) {
      const { data: adminRole } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();
      if (adminRole?.user_id && adminRole.user_id !== user.id) {
        const { data: adminSettings } = await admin
          .from('evolution_settings')
          .select('*')
          .eq('user_id', adminRole.user_id)
          .maybeSingle();
        if (adminSettings?.base_url && adminSettings?.api_key) {
          settings = {
            ...adminSettings,
            ...(settings || {}),
            base_url: settings?.base_url || adminSettings.base_url,
            api_key: settings?.api_key || adminSettings.api_key,
            webhook_token: settings?.webhook_token || adminSettings.webhook_token,
          };
        }
      }
    }

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

    // SERVER-SIDE UPLOAD FALLBACK — when the client cannot upload directly to storage
    // (browser extension blocking the storage domain, corporate firewall, RLS issue, etc.)
    if (action === 'upload-media') {
      try {
        const mediaBase64 = String(body.mediaBase64 || '');
        const mimetype = String(body.mimetype || 'application/octet-stream');
        const rawFilename = String(body.filename || `media-${Date.now()}`);
        const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || `media-${Date.now()}`;
        if (!mediaBase64) return jsonResponse({ error: 'mediaBase64 obrigatório' }, 200);
        const bin = Uint8Array.from(atob(mediaBase64), (c) => c.charCodeAt(0));
        const path = `${user.id}/${Date.now()}-${filename}`;
        const { error: upErr } = await admin.storage.from('evolution-media').upload(path, bin, { contentType: mimetype, upsert: true });
        if (upErr) return jsonResponse({ error: `Upload falhou: ${upErr.message || upErr}` }, 200);
        const { data: signed } = await admin.storage.from('evolution-media').createSignedUrl(path, 60 * 60 * 24 * 365);
        return jsonResponse({ ok: true, mediaUrl: signed?.signedUrl || null, path });
      } catch (e) {
        return jsonResponse({ error: `Upload falhou: ${e instanceof Error ? e.message : String(e)}` }, 200);
      }
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
        body: JSON.stringify({ webhookUrl, subscribe: DEFAULT_WEBHOOK_EVENTS, immediate: true }),
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
            body: JSON.stringify({ webhookUrl, subscribe: DEFAULT_WEBHOOK_EVENTS, immediate: true }),
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
      const primaryTarget = await resolveSendPhone(admin, user.id, phone);

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
      const dbTargets = await resolveSendTargets(admin, user.id, phone);
      const phoneVariants = [...dbTargets.map((target) => target.value), primaryTarget, phone]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      if (phone.startsWith('55') && phone.length >= 12) {
        const ddd = phone.slice(2, 4);
        const rest = phone.slice(4);
        if (rest.length === 9 && rest.startsWith('9')) phoneVariants.push(`55${ddd}${rest.slice(1)}`);
        if (rest.length === 8) phoneVariants.push(`55${ddd}9${rest}`);
      }
      const targets = Array.from(new Set(phoneVariants));
      for (const target of targets) {
        const isJid = /@(lid|s\.whatsapp\.net)\b/i.test(target);
        const targetDigits = target.split('@')[0].replace(/\D/g, '');
        if (!isJid && targetDigits.length < 10) continue;
        const goNumber = isJid ? target : targetDigits;
        const classicNumber = targetDigits || target;
        const goBody: Record<string, unknown> = { number: goNumber, text };
        const goBodyMsg: Record<string, unknown> = { number: goNumber, message: text };
        const classicBody: Record<string, unknown> = { number: classicNumber, text };
        const classicBodyV1: Record<string, unknown> = { number: classicNumber, textMessage: { text } };
        if (quotedGo && quotedClassic) {
          goBody.quoted = quotedGo; goBodyMsg.quoted = quotedGo;
          classicBody.quoted = quotedClassic; classicBodyV1.quoted = quotedClassic;
        }
        attempts.push(
          { url: `${baseUrl}/send/text`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { ...goBody, formatJid: !isJid }, mode: isJid ? 'evolution-go-send-jid' : 'evolution-go-send' },
          { url: `${baseUrl}/send/text`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { ...goBody, formatJid: false }, mode: 'evolution-go-send-raw' },
          { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody, mode: 'evolution-go' },
          { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBodyMsg, mode: 'evolution-go-msg' },
          { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: classicBodyV1, mode: 'evolution-api-v1' },
          { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: classicBody, mode: 'evolution-api' },
        );
      }

      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'evolution-api-v1';
      const log: any[] = [];
      await primeEvolutionContact(baseUrl, instAuth.apiKey, instAuth.instanceId, phone).catch(() => undefined);
      for (const att of attempts) {
        const timeout = 8000;
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
        const locked = isEvolutionReachoutLock(result.data) || log.some((a) => /(^|\D)463(\D|$)|NackCallerReachoutTimelocked|reach[- ]?out|time[- ]?lock/i.test(String(a.error || '')));
        if (locked) {
          await insertOutgoingMessage(admin, {
            user_id: user.id,
            instance_name: instance,
            remote_jid: primaryTarget.includes('@') ? primaryTarget : `${primaryTarget}@s.whatsapp.net`,
            phone,
            direction: 'out',
            content: text,
            status: 'failed',
            external_id: `failed-${crypto.randomUUID()}`,
            raw: { __mode: 'failed-463', __attempts: log, __error: 'whatsapp_reachout_locked_463', __retry_on_inbound: true, __bot_flow: !!body.bot_flow, lastResponse: result.data },
          });
        }
        return jsonResponse({
          ok: false,
          error: locked
            ? `Número novo bloqueado pelo WhatsApp/Evolution (erro 463). Quando esse cliente mandar qualquer mensagem primeiro, clique no ⚠️ para reenviar pela conversa já aberta. Se continuar, a instância pc-2 precisa ser atualizada/reconectada no painel Evolution. Tentativas: ${summary}`
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
        raw: quotedRaw?.messageId ? { ...result.data, __mode: mode, __attempts: log, __bot_flow: !!body.bot_flow, __quoted: { id: quotedRaw.messageId, text: quotedRaw.text || '', fromMe: !!quotedRaw.fromMe } } : { ...result.data, __mode: mode, __attempts: log, __bot_flow: !!body.bot_flow },
      });

      return jsonResponse({ ok: true, mode, data: result.data, externalId: realExternalId });
    }

    if (action === 'send-menu') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp antes de enviar menus.' }, 200);
      const phone = normalizeChatPhone(body.phone);
      const text = String(body.text || '').trim();
      const buttons = Array.isArray(body.buttons) ? body.buttons.slice(0, 10).map((b: any, i: number) => ({ id: String(b?.id || `opt-${i + 1}`), label: String(b?.label || `Opção ${i + 1}`).slice(0, 60) })) : [];
      const menuMode = String(body.mode || 'buttons');
      if (!phone || !buttons.length) return jsonResponse({ error: 'phone e buttons obrigatórios' }, 400);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const dbTargets = await resolveSendTargets(admin, user.id, phone);
      const targets = Array.from(new Set([...dbTargets.map((target) => target.value), phone]));
      const attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [];
      for (const target of targets) {
        const title = text || 'Escolha uma opção:';
        const rows = buttons.map((b) => ({ title: b.label, description: '', rowId: b.id }));
        const cleanReply = buttons.slice(0, 3).map((b) => ({ type: 'reply', displayText: b.label, id: b.id }));
        const isJid = /@(lid|s\.whatsapp\.net)\b/i.test(target);
        const number = isJid ? target : target.split('@')[0].replace(/\D/g, '');
        const forceList = menuMode === 'list' || buttons.length > 3;
        if (forceList) {
          attempts.push(
            { url: `${baseUrl}/message/sendList/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number, title, description: title, buttonText: 'Ver opções', footerText: ' ', sections: [{ title: 'Opções', rows }] }, mode: 'evo-v2-list' },
            { url: `${baseUrl}/message/sendList/${encodeURIComponent(instance)}`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number, title, description: title, buttonText: 'Ver opções', footerText: ' ', sections: [{ title: 'Opções', rows }] }, mode: 'evo-v2-list-instkey' },
            { url: `${baseUrl}/send/list`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number, title, description: title, buttonText: 'Ver opções', footerText: ' ', sections: [{ title: 'Opções', rows: rows.map((r) => ({ id: r.rowId, rowId: r.rowId, title: r.title, description: '' })) }], formatJid: !isJid }, mode: 'evo-go-send-list' },
          );
        } else {
          attempts.push(
            { url: `${baseUrl}/message/sendButtons/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number, title, description: title, footer: ' ', buttons: cleanReply }, mode: 'evo-v2-buttons' },
            { url: `${baseUrl}/message/sendButtons/${encodeURIComponent(instance)}`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number, title, description: title, footer: ' ', buttons: cleanReply }, mode: 'evo-v2-buttons-instkey' },
            { url: `${baseUrl}/send/button`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number, title, description: title, footer: ' ', buttons: cleanReply.map((b) => ({ id: b.id, displayText: b.displayText, type: 'reply' })), formatJid: !isJid }, mode: 'evo-go-send-button' },
            { url: `${baseUrl}/message/sendList/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number, title, description: title, buttonText: 'Ver opções', footerText: ' ', sections: [{ title: 'Opções', rows }] }, mode: 'evo-v2-list-fallback' },
          );
        }
      }
      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'menu';
      const log: any[] = [];
      for (const att of attempts) {
        const r = await fetchJson(att.url, { method: 'POST', headers: att.headers, body: JSON.stringify(att.body) }, 8000).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ mode: att.mode, status: r.status, error: getEvolutionErrorText(r.data).slice(0, 200) });
        console.log('[send-menu]', att.mode, 'status=', r.status, 'err=', getEvolutionErrorText(r.data).slice(0, 200));
        result = r; mode = att.mode;
        if (r.ok) break;
        if (isEvolutionReachoutLock(r.data)) continue;
        if (r.status !== 404 && r.status !== 405 && r.status !== 400 && r.status !== 0) break;
      }
      if (!result.ok) {
        console.log('[send-menu] all interactive attempts failed, falling back to numbered text');
        const fallbackText = `${text}\n\n${buttons.map((b, i) => `${i + 1}️⃣ ${b.label}`).join('\n')}`.trim();
        const sendRes = await fetchJson(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, { method: 'POST', headers: evolutionHeaders(apiKey, true), body: JSON.stringify({ number: targets[0], text: fallbackText, textMessage: { text: fallbackText } }) }, 8000).catch((e) => ({ ok: false, status: 0, data: { error: String(e?.message || e) } }));
        if (sendRes.ok) {
          await insertOutgoingMessage(admin, { user_id: user.id, instance_name: instance, remote_jid: `${phone}@s.whatsapp.net`, phone, direction: 'out', content: fallbackText, message_type: 'text', status: 'sent', external_id: sendRes.data?.key?.id || `menu-${crypto.randomUUID()}`, raw: { ...sendRes.data, __bot_menu: true, __bot_flow: true, __mode: 'text-fallback', __attempts: log } });
          return jsonResponse({ ok: true, mode: 'text-fallback', fallback: true, attempts: log });
        }
        return jsonResponse({ ok: false, error: `Falha ao enviar menu (${log.map((l) => `${l.mode}:${l.status}`).join(' | ')})`, attempts: log, data: result.data }, 200);
      }
      const content = `${text}\n\n${buttons.map((b, i) => `${i + 1}️⃣ ${b.label}`).join('\n')}`.trim();
      await insertOutgoingMessage(admin, { user_id: user.id, instance_name: instance, remote_jid: `${phone}@s.whatsapp.net`, phone, direction: 'out', content, message_type: 'text', status: 'sent', external_id: result.data?.key?.id || result.data?.messageId || result.data?.data?.Info?.ID || `menu-${crypto.randomUUID()}`, raw: { ...result.data, __bot_menu: true, __bot_flow: true, __mode: mode, __attempts: log } });
      return jsonResponse({ ok: true, mode, data: result.data });
    }

    if (action === 'run-flow-step') {
      const step = body.step || {};
      const incoming = String(body.incoming || '');
      const vars = { ...(typeof body.variables === 'object' && body.variables ? body.variables : {}), ultima_mensagem: incoming, ultima_resposta: incoming } as Record<string, unknown>;
      const type = String(step.type || '');
      if (type === 'api_call') {
        const apiUrl = templateText(step.api_url, vars);
        if (apiUrl === 'internal:generate-access-code') {
          const { data: roleRow } = await admin.from('user_roles').select('user_id').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
          if (!roleRow) {
            const { data: access } = await admin.from('reseller_access').select('id,credits').eq('user_id', user.id).maybeSingle();
            const credits = Number(access?.credits || 0);
            if (!access || credits < 1) return jsonResponse({ ok: false, error: 'Crédito insuficiente para gerar chave automática' }, 200);
            const { error: debitErr } = await admin.from('reseller_access').update({ credits: credits - 1 }).eq('id', access.id);
            if (debitErr) return jsonResponse({ ok: false, error: debitErr.message }, 200);
          }
          let code = randomAccessCode(10);
          for (let i = 0; i < 5; i++) {
            const { data: exists } = await admin.from('reseller_access_codes').select('id').eq('code', code).maybeSingle();
            if (!exists) break;
            code = randomAccessCode(10);
          }
          const { error: codeErr } = await admin.from('reseller_access_codes').insert({
            code,
            days: Number(step.days || 30) || 30,
            created_by: user.id,
          });
          if (codeErr) return jsonResponse({ ok: false, error: codeErr.message }, 200);
          const replyText = templateText(step.text || 'Perfeito. Sua chave de acesso é: {{chave_acesso}}', { ...vars, chave_acesso: code });
          return jsonResponse({ ok: true, replyText, variables: { [String(step.variable || 'chave_acesso')]: code, chave_acesso: code }, nextStepId: step.buttons?.[0]?.next_step_id || null });
        }
        if (!/^https?:\/\//i.test(apiUrl)) return jsonResponse({ ok: false, error: 'URL de API inválida' }, 200);
        let headers: Record<string, string> = {};
        try { headers = step.api_headers ? JSON.parse(templateText(step.api_headers, vars)) : {}; } catch { return jsonResponse({ ok: false, error: 'Headers da API não são JSON válido' }, 200); }
        const method = String(step.api_method || 'POST').toUpperCase();
        const apiRes = await fetch(apiUrl, { method, headers, body: method === 'GET' ? undefined : templateText(step.api_body || '{}', vars), signal: AbortSignal.timeout(8000) });
        const text = await apiRes.text();
        return jsonResponse({ ok: apiRes.ok, status: apiRes.status, replyText: '', variables: { [String(step.variable || 'api_response')]: text }, nextStepId: step.buttons?.[0]?.next_step_id || null });
      }
      if (type === 'gpt') {
        const key = Deno.env.get('LOVABLE_API_KEY');
        if (!key) return jsonResponse({ ok: false, error: 'IA não configurada' }, 200);
        const prompt = templateText(step.gpt_prompt || 'Responda: {{ultima_mensagem}}', vars);
        const ai = await fetch('https://ai-gateway.lovable.dev/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: step.gpt_model || 'google/gemini-2.5-flash', messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch((e) => ({ error: String(e?.message || e) }));
        const replyText = String(ai?.choices?.[0]?.message?.content || ai?.message || '').trim();
        return jsonResponse({ ok: !!replyText, replyText, variables: { [String(step.variable || 'gpt_resposta')]: replyText }, nextStepId: step.buttons?.[0]?.next_step_id || null, error: replyText ? null : (ai?.error || 'IA não respondeu') });
      }
      if (type === 'condition') {
        const variable = String(step.condition_variable || 'ultima_resposta');
        const left = String(vars[variable] ?? incoming);
        const rule = (Array.isArray(step.condition_rules) ? step.condition_rules : []).find((r: any) => evalCondition(String(r.op || 'eq'), left, String(r.value || '')));
        return jsonResponse({ ok: true, nextStepId: rule?.next_step_id || step.buttons?.find((b: any) => b.id === 'default')?.next_step_id || null });
      }
      return jsonResponse({ ok: true, nextStepId: step.buttons?.[0]?.next_step_id || null });
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
        raw: { ...result.data, __bot_flow: !!body.bot_flow },
      });
      return jsonResponse({ ok: true, mode, data: result.data });
    }


    // FETCH PROFILE PICTURE
    if (action === 'fetch-profile-pic') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp.' }, 200);
      const phone = normalizePhone(body.phone);
      if (!phone) return jsonResponse({ error: 'phone obrigatório' }, 400);
      const candidates = whatsappPhoneCandidates(phone);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const tries = candidates.flatMap((candidate) => {
        const jid = `${candidate}@s.whatsapp.net`;
        return [
          { url: `${baseUrl}/user/avatar`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: candidate, preview: false }, phone: candidate },
          { url: `${baseUrl}/user/avatar`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: jid, preview: false }, phone: candidate },
          { url: `${baseUrl}/user/info`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: [candidate] }, phone: candidate },
          { url: `${baseUrl}/user/info`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: [jid] }, phone: candidate },
          { url: `${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true), body: { number: candidate }, phone: candidate },
          { url: `${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true), body: { number: jid }, phone: candidate },
          { url: `${baseUrl}/chat/getProfilePicture`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: candidate }, phone: candidate },
          { url: `${baseUrl}/chat/whatsappProfile/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(instAuth.apiKey, true), body: { number: candidate }, phone: candidate },
        ];
      });
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: t.method, headers: t.headers, body: JSON.stringify(t.body) }, 3000)
          .catch(() => ({ ok: false, status: 0, data: {} as any }));
        const url = findUrlDeep(r?.data);
        const name = r?.data?.name || r?.data?.pushName || r?.data?.profileName || r?.data?.data?.name || r?.data?.data?.pushName || null;
        if (url) {
          await admin.from('evolution_contacts').upsert({
            user_id: user.id, phone: t.phone || phone, name: name || undefined, profile_pic_url: url, updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,phone' });
          return jsonResponse({ ok: true, url, name, phone: t.phone || phone });
        }
      }
      return jsonResponse({ ok: false, url: null });
    }

    // SAVE CONTACT CREATED MANUALLY IN CHAT
    if (action === 'save-contact') {
      const phone = normalizeChatPhone(body.phone);
      if (!phone) return jsonResponse({ error: 'phone obrigatório' }, 400);
      const { error } = await admin.from('evolution_contacts').upsert({
        user_id: user.id,
        phone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,phone' });
      if (error) return jsonResponse({ error: error.message }, 200);
      return jsonResponse({ ok: true, phone });
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
      const rawFilename = String(body.filename || `media-${Date.now()}`);
      const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || `media-${Date.now()}`;
      const caption = String(body.caption || '');
      const mediaBase64 = String(body.mediaBase64 || '');
      const mediaUrlInput = String(body.mediaUrl || '');
      if (!phone || (!mediaBase64 && !mediaUrlInput)) return jsonResponse({ error: 'phone e mediaBase64/mediaUrl obrigatórios' }, 400);

      // Resolve preview URL: client may have uploaded already
      let mediaUrl: string | null = mediaUrlInput || null;
      let uploadErrMsg: string | null = null;
      if (!mediaUrl && mediaBase64) {
        try {
          const bin = Uint8Array.from(atob(mediaBase64), (c) => c.charCodeAt(0));
          const path = `${user.id}/${Date.now()}-${filename}`;
          const { error: upErr } = await admin.storage.from('evolution-media').upload(path, bin, { contentType: mimetype, upsert: true });
          if (!upErr) {
            const { data: signed } = await admin.storage.from('evolution-media').createSignedUrl(path, 60 * 60 * 24 * 365);
            mediaUrl = signed?.signedUrl || null;
          } else {
            uploadErrMsg = upErr.message || String(upErr);
            console.error('[evolution-send] storage upload failed', upErr);
          }
        } catch (e) {
          uploadErrMsg = e instanceof Error ? e.message : String(e);
          console.error('[evolution-send] storage upload threw', e);
        }
      }

      const dataUrl = mediaBase64 ? `data:${mimetype};base64,${mediaBase64}` : '';
      const mediaForEvolution = publicMediaFromSignedUrl(mediaUrl) || dataUrl;
      if (!mediaForEvolution) {
        return jsonResponse({ error: `Falha ao preparar mídia${uploadErrMsg ? `: ${uploadErrMsg}` : ''}` }, 200);
      }
      const cleanMime = mimetype.split(';')[0] || mimetype;
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const phoneVariants = [phone];
      if (phone.startsWith('55') && phone.length >= 12) {
        const ddd = phone.slice(2, 4);
        const rest = phone.slice(4);
        if (rest.length === 9 && rest.startsWith('9')) phoneVariants.push(`55${ddd}${rest.slice(1)}`);
        if (rest.length === 8) phoneVariants.push(`55${ddd}9${rest}`);
      }
      const targets = Array.from(new Set(phoneVariants));

      let attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [];
      for (const target of targets) {
        if (mediaType === 'audio') {
          attempts.push(
            { url: `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: target, audio: mediaForEvolution }, mode: 'evolution-api-audio-url' },
            { url: `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: target, audio: mediaBase64 }, mode: 'evolution-api-audio-base64' },
            { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: target, mediatype: 'audio', mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-api-media-audio' },
            { url: `${baseUrl}/send/media`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: target, type: 'audio', url: mediaForEvolution, filename, caption, formatJid: true }, mode: 'evolution-go-send-media-token' },
            { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: target, type: 'audio', url: mediaForEvolution, filename, caption }, mode: 'evolution-go-message-media' },
          );
        } else if (mediaType === 'sticker') {
          attempts.push(
            { url: `${baseUrl}/message/sendSticker/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: target, sticker: mediaForEvolution }, mode: 'evolution-api-sticker-url' },
            { url: `${baseUrl}/message/sendSticker/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: target, sticker: mediaBase64 }, mode: 'evolution-api-sticker-base64' },
            { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: target, mediatype: 'sticker', mimetype: cleanMime, fileName: filename, media: mediaForEvolution }, mode: 'evolution-api-media-sticker' },
            { url: `${baseUrl}/send/sticker`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: target, sticker: mediaForEvolution, formatJid: true }, mode: 'evolution-go-send-sticker-token' },
          );
        } else {
          const isImg = mediaType === 'image';
          const goType = isImg ? 'image' : mediaType === 'video' ? 'video' : 'document';
          attempts.push(
            { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: target, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-api-url' },
            { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: target, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaBase64 }, mode: 'evolution-api-base64' },
            { url: `${baseUrl}/send/media`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: target, type: goType, url: mediaForEvolution, filename, caption, formatJid: true }, mode: 'evolution-go-send-media-token' },
            { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: target, type: goType, url: mediaForEvolution, filename, caption }, mode: 'evolution-go-message-media' },
            { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: target, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-go-classic-body' },
          );
        }
      }

      // If client uploaded directly (no base64 was sent), drop attempts that try to send raw base64.
      if (!mediaBase64) {
        attempts = attempts.filter((a) => {
          const b = a.body as Record<string, unknown>;
          const v = (b.media ?? b.audio ?? b.sticker ?? b.url) as string | undefined;
          return !!v && v === mediaForEvolution;
        });
      }

      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'evolution-api';
      const log: any[] = [];
      for (const att of attempts) {
        // Media uploads (prints, images, audio, video, docs) can take longer than text.
        // Use a 45s timeout so prints aren't dropped by the default 8s ceiling.
        const r = await fetchJson(att.url, { method: 'POST', headers: att.headers, body: JSON.stringify(att.body) }, 45000)
          .catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ url: att.url, mode: att.mode, status: r.status });
        if (r.ok) { result = r; mode = att.mode; break; }
        if (isEvolutionReachoutLock(r.data)) { result = r; mode = att.mode; continue; }
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
        content: caption || (mediaType === 'audio' ? '🎤 Áudio' : mediaType === 'image' ? '📷 Imagem' : mediaType === 'video' ? '🎬 Vídeo' : mediaType === 'sticker' ? '🌟 Sticker' : `📎 ${filename}`),
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
        body: JSON.stringify({ webhookUrl: webhookUrlForConnect, subscribe: DEFAULT_WEBHOOK_EVENTS, immediate: true }),
      }, 8000).catch(() => null);

      // Mark history cutoff: ignore any message older than this on webhook (avoids importing
      // the entire chat history after a fresh QR scan / session reset).
      try { await admin.from('evolution_settings').update({ history_cutoff_at: new Date().toISOString() }).eq('user_id', user.id); } catch (_) {}


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

    // Helper: list of instance names this user owns. Each user (including admins)
    // only sees the instances they personally registered, for privacy isolation.
    const getOwnedNames = async (): Promise<Set<string> | null> => {
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
          const instanceName = item?.name || item?.instanceName || item?.instance?.instanceName || item?.id || '';
          const statusData = token ? await getGoInstanceStatus(baseUrl, token, id) : {};
          const phone = extractInstancePhone(item, statusData);
          let profilePic: string | null =
            item?.profilePictureUrl || item?.profilePicUrl || item?.profilePicture ||
            item?.profile?.picture || item?.profile?.pictureUrl ||
            item?.Instance?.profilePicUrl || item?.instance?.profilePicUrl ||
            statusData?.profilePictureUrl || statusData?.profilePicUrl || null;
          if (!profilePic) profilePic = findUrlDeep(item) || findUrlDeep(statusData);

          console.log(`[list-instances] ${instanceName}: phone=${phone} initial_pic=${profilePic ? 'yes' : 'no'} item_keys=${Object.keys(item || {}).join(',')}`);

          if (!profilePic && phone && instanceName) {
            // BR: tentar com e sem o 9º dígito
            const candidates = whatsappPhoneCandidates(phone);

            const authKey = token || apiKey;
            const encInst = encodeURIComponent(instanceName);

            for (const number of candidates) {
              const attempts: Array<{ label: string; url: string; init: RequestInit }> = [
                // v2 POST
                { label: 'POST fetchProfilePictureUrl', url: `${baseUrl}/chat/fetchProfilePictureUrl/${encInst}`,
                  init: { method: 'POST', headers: evolutionHeaders(authKey, true), body: JSON.stringify({ number }) } },
                // v1 GET com query
                { label: 'GET fetchProfilePictureUrl?number', url: `${baseUrl}/chat/fetchProfilePictureUrl/${encInst}?number=${number}`,
                  init: { method: 'GET', headers: evolutionHeaders(authKey) } },
                // fetchProfile (dono da instância)
                { label: 'POST fetchProfile', url: `${baseUrl}/chat/fetchProfile/${encInst}`,
                  init: { method: 'POST', headers: evolutionHeaders(authKey, true), body: JSON.stringify({ number }) } },
                // Go fork
                { label: 'GET getProfilePicture', url: `${baseUrl}/chat/getProfilePicture/${encInst}?number=${number}`,
                  init: { method: 'GET', headers: evolutionHeaders(authKey) } },
              ];

              for (const a of attempts) {
                const res = await fetchJson(a.url, a.init, 5000).catch((e) => ({ ok: false, status: 0, data: { err: String(e) } }));
                const url = res?.data?.profilePictureUrl || res?.data?.profilePicUrl || res?.data?.picture
                  || res?.data?.url || res?.data?.data?.profilePictureUrl || findUrlDeep(res?.data);
                console.log(`[list-instances]   ${a.label} n=${number} status=${res?.status} url=${url ? 'HIT' : 'miss'} body=${JSON.stringify(res?.data).slice(0, 200)}`);
                if (url) { profilePic = url; break; }
              }
              if (profilePic) break;
            }
          }
          return {
            id,
            name: instanceName,
            state: normalizeInstanceState(item, statusData),
            phone,
            profile_name: item?.profileName || statusData?.Name || statusData?.name || null,
            profile_pic: profilePic,
            token,
          };
        }));

        // Fill in profile_pic/profile_name from DB cache (populated by evolution-webhook)
        // whenever the live API didn't return them.
        const missingNames = list.filter(x => !x.profile_pic || !x.profile_name).map(x => x.name).filter(Boolean);
        if (missingNames.length) {
          const { data: cached } = await admin
            .from('user_evolution_instances')
            .select('instance_name, profile_pic_url, profile_name, owner_phone')
            .in('instance_name', missingNames);
          const byName = new Map((cached || []).map((r: any) => [String(r.instance_name).toLowerCase(), r]));
          for (const x of list) {
            const c = byName.get(String(x.name).toLowerCase());
            if (!c) continue;
            if (!x.profile_pic && c.profile_pic_url) x.profile_pic = c.profile_pic_url;
            if (!x.profile_name && c.profile_name) x.profile_name = c.profile_name;
            if (!x.phone && c.owner_phone) x.phone = c.owner_phone;
          }
        }

        // Second fallback: evolution_contacts already has the owner's avatar/name
        // because chat messages (fromMe) upsert a contact row keyed by the owner's phone.
        const stillMissing = list.filter(x => (!x.profile_pic || !x.profile_name) && x.phone);
        if (stillMissing.length) {
          const phones = Array.from(new Set(stillMissing.flatMap(x => whatsappPhoneCandidates(String(x.phone)))));
          const { data: contacts } = await admin
            .from('evolution_contacts')
            .select('phone, profile_pic_url, name, user_id')
            .eq('user_id', user.id)
            .in('phone', phones);
          const byPhone = new Map<string, any>();
          for (const r of contacts || []) {
            const keys = whatsappPhoneCandidates(String(r.phone));
            for (const key of keys) {
              const cur = byPhone.get(key);
              if (!cur || (!cur.profile_pic_url && r.profile_pic_url) || (!cur.name && r.name)) byPhone.set(key, r);
            }
          }
          for (const x of stillMissing) {
            const c = whatsappPhoneCandidates(String(x.phone)).map((p) => byPhone.get(p)).find((row) => row?.profile_pic_url) ||
              whatsappPhoneCandidates(String(x.phone)).map((p) => byPhone.get(p)).find(Boolean);
            if (!c) continue;
            if (!x.profile_pic && c.profile_pic_url) x.profile_pic = c.profile_pic_url;
            if (!x.profile_name && c.name) x.profile_name = c.name;
          }
        }


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
      {
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

      // Global uniqueness: no two resellers may share the same instance name
      const { data: existingName } = await admin
        .from('user_evolution_instances')
        .select('user_id')
        .eq('instance_name', name)
        .maybeSingle();
      if (existingName && existingName.user_id !== user.id) {
        return jsonResponse({
          ok: false,
          error: `O nome "${name}" já está em uso por outra revenda. Escolha outro nome (ex: ${name}-2, ${name}-vendas).`,
        }, 200);
      }


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
      const defaultEvents = DEFAULT_WEBHOOK_EVENTS;
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
            {
              user_id: user.id,
              instance_name: name,
              instance_id: instId,
              advanced_settings: defaultAdvanced,
              webhook_events: defaultEvents,
              webhook_enabled: true,
              settings_updated_at: new Date().toISOString(),
            },
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
        .upsert({ user_id: user.id, instance_name: name }, { onConflict: 'user_id' });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    // GET SAVED INSTANCE SETTINGS
    if (action === 'get-instance-settings') {
      const targetInstance = String(body.instance || instance).trim();
      if (!targetInstance) return jsonResponse({ error: 'instance obrigatório' }, 400);
      const { data: saved } = await admin
        .from('user_evolution_instances')
        .select('advanced_settings,webhook_events,webhook_enabled,settings_updated_at')
        .eq('instance_name', targetInstance)
        .maybeSingle();
      return jsonResponse({
        ok: true,
        advanced: saved?.advanced_settings || {},
        webhook: {
          events: normalizeWebhookEvents(saved?.webhook_events),
          enabled: saved?.webhook_enabled !== false,
          updatedAt: saved?.settings_updated_at || null,
        },
      });
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
        const events = normalizeWebhookEvents(webhook.events);
        const enabled = webhook.enabled !== false;
        // Evolution Go does NOT have a separate /webhook endpoint — webhook is set via /instance/connect with subscribe[]
        const goBody = { webhookUrl, subscribe: evolutionSubscribeEvents(events), enabled, immediate: false };
        const classicBody = { webhook: { enabled, url: webhookUrl, events: classicWebhookEvents(events), byEvents: false, base64: true } };
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

      const savedAdvanced = advanced && typeof advanced === 'object' ? {
        alwaysOnline: !!advanced.alwaysOnline,
        rejectCall: !!advanced.rejectCall,
        msgCall: String(advanced.msgCall || ''),
        readMessages: !!advanced.readMessages,
        ignoreGroups: !!advanced.ignoreGroups,
        ignoreStatus: !!advanced.ignoreStatus,
        readStatus: !!advanced.readStatus,
        syncFullHistory: !!advanced.syncFullHistory,
        groupsOnly: !!advanced.groupsOnly,
      } : {};
      const savedEvents = normalizeWebhookEvents(webhook?.events);
      const { error: saveError } = await admin.from('user_evolution_instances').upsert({
        user_id: user.id,
        instance_name: targetInstance,
        instance_id: instAuth.instanceId,
        advanced_settings: savedAdvanced,
        webhook_events: savedEvents,
        webhook_enabled: webhook?.enabled !== false,
        settings_updated_at: new Date().toISOString(),
      }, { onConflict: 'instance_name' });

      const remoteOk = (!advanced || results.advanced?.ok) && (!webhook || results.webhook?.ok);
      if (saveError) return jsonResponse({ ok: false, error: saveError.message, results }, 200);
      return jsonResponse({ ok: true, saved: true, remoteOk, results });
    }

    // SEND PRESENCE (digitando…) — body: { phone, presence: 'composing'|'paused'|'available' }
    if (action === 'send-presence') {
      if (!instance) return jsonResponse({ ok: false }, 200);
      const phone = normalizePhone(body.phone);
      const presence = String(body.presence || 'composing');
      if (!phone) return jsonResponse({ ok: false }, 200);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const jid = `${phone}@s.whatsapp.net`;
      const tries = [
        { url: `${baseUrl}/chat/sendPresence/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, presence, delay: 1200 } },
        { url: `${baseUrl}/chat/presence`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, presence } },
        { url: `${baseUrl}/chat/sendPresence`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: jid, presence } },
      ];
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: 'POST', headers: t.headers, body: JSON.stringify(t.body) }, 5000)
          .catch(() => ({ ok: false, status: 0, data: {} }));
        if (r.ok) return jsonResponse({ ok: true });
      }
      return jsonResponse({ ok: false }, 200);
    }

    // SUBSCRIBE PRESENCE — body: { phone } — asks Evolution to push presence updates for that chat
    if (action === 'subscribe-presence') {
      if (!instance) return jsonResponse({ ok: false }, 200);
      const phone = normalizePhone(body.phone);
      if (!phone) return jsonResponse({ ok: false }, 200);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const jid = `${phone}@s.whatsapp.net`;
      const tries = [
        { url: `${baseUrl}/chat/presenceSubscribe`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone } },
        { url: `${baseUrl}/chat/presenceSubscribe`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: jid } },
        { url: `${baseUrl}/chat/presenceSubscribe/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone } },
        { url: `${baseUrl}/chat/subscribePresence`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone } },
      ];
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: 'POST', headers: t.headers, body: JSON.stringify(t.body) }, 5000)
          .catch(() => ({ ok: false, status: 0, data: {} }));
        if (r.ok) return jsonResponse({ ok: true });
      }
      return jsonResponse({ ok: false }, 200);
    }

    // MARK READ / UNREAD — shared across browsers/attendants
    if (action === 'mark-read' || action === 'mark-unread') {
      const phone = normalizeChatPhone(body.phone);
      if (!phone) return jsonResponse({ error: 'phone obrigatório' }, 400);
      const readAt = action === 'mark-read' ? String(body.readAt || new Date().toISOString()) : null;
      await admin.from('evolution_conversation_state').upsert({
        user_id: user.id,
        phone,
        last_read_at: readAt,
        manual_unread: action === 'mark-unread',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,phone' });

      if (action === 'mark-read') {
        await admin.from('evolution_messages')
          .update({ status: 'read' })
          .eq('user_id', user.id)
          .eq('phone', phone)
          .eq('direction', 'in')
          .neq('status', 'read');

        if (instance) {
          const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
          const jid = `${phone}@s.whatsapp.net`;
          const tries = [
            { url: `${baseUrl}/chat/markMessageAsRead/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { readMessages: [{ remoteJid: jid, fromMe: false }] } },
            { url: `${baseUrl}/chat/markMessageAsRead`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, read: true } },
            { url: `${baseUrl}/chat/read`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone } },
          ];
          for (const t of tries) {
            const r = await fetchJson(t.url, { method: 'POST', headers: t.headers, body: JSON.stringify(t.body) }, 4000)
              .catch(() => ({ ok: false, status: 0, data: {} }));
            if (r.ok) break;
          }
        }
      }
      return jsonResponse({ ok: true });
    }

    // SYNC HISTORY — body: { phone?, limit? } — fetch historical messages from Evolution Go and import into evolution_messages
    if (action === 'sync-history') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp.' }, 200);
      const phone = body.phone ? normalizePhone(body.phone) : '';
      const limit = Math.min(Number(body.limit) || 200, 500);
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);
      const jid = phone ? `${phone}@s.whatsapp.net` : '';

      const where: Record<string, unknown> = phone ? { key: { remoteJid: jid } } : {};
      const tries = [
        { url: `${baseUrl}/chat/findMessages/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { where, limit, page: 1 } },
        { url: `${baseUrl}/chat/findMessages`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { where, limit, page: 1 } },
        { url: `${baseUrl}/chat/messages`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: phone ? { number: phone, limit } : { limit } },
        { url: `${baseUrl}/chat/getMessages`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: phone ? { number: phone, count: limit } : { count: limit } },
      ];

      let rows: any[] = [];
      const log: any[] = [];
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: 'POST', headers: t.headers, body: JSON.stringify(t.body) }, 20000)
          .catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ url: t.url, status: r.status });
        if (r.ok) {
          const d = r.data;
          const candidates = [d?.messages?.records, d?.data?.messages?.records, d?.records, d?.data, d?.messages, d];
          for (const c of candidates) {
            if (Array.isArray(c) && c.length) { rows = c; break; }
          }
          if (rows.length) break;
        }
      }

      if (!rows.length) {
        return jsonResponse({ ok: false, imported: 0, attempts: log, error: 'Esta versão do servidor Evolution não retornou histórico. Só novas mensagens aparecerão via webhook.' }, 200);
      }

      let imported = 0;
      for (const m of rows) {
        try {
          const key = m?.key || m?.Key || {};
          const remoteJid = String(key?.remoteJid || key?.RemoteJID || m?.remoteJid || '');
          const isStatus = remoteJid === 'status@broadcast' || remoteJid.startsWith('status@');
          if (!remoteJid || (remoteJid.includes('@g.us') && !isStatus)) continue;
          const fromMe = !!(key?.fromMe ?? key?.FromMe);
          const participantJid = String(key?.participant || key?.Participant || m?.participant || '');
          const participantPhone = participantJid ? participantJid.split('@')[0].replace(/\D/g, '') : '';
          let phoneN: string;
          if (isStatus) {
            phoneN = fromMe ? 'status:me' : (participantPhone ? `status:${participantPhone}` : 'status:unknown');
          } else {
            phoneN = String(remoteJid).split('@')[0].replace(/\D/g, '');
          }
          if (!phoneN) continue;
          const msg = m?.message || m?.Message || {};
          const content = msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.videoMessage?.caption || msg?.documentMessage?.caption || (msg?.audioMessage ? '🎤 Áudio' : '') || '';
          const type = msg?.imageMessage ? 'image' : msg?.videoMessage ? 'video' : msg?.audioMessage ? 'audio' : msg?.documentMessage ? 'document' : msg?.stickerMessage ? 'sticker' : msg?.reactionMessage ? 'reaction' : 'text';
          const externalId = String(key?.id || key?.ID || m?.id || '');
          const createdAt = m?.messageTimestamp || m?.MessageTimestamp || m?.timestamp || null;
          let createdIso: string | null = null;
          if (createdAt) {
            const n = Number(createdAt);
            if (Number.isFinite(n) && n > 0) createdIso = new Date(n < 1e12 ? n * 1000 : n).toISOString();
          }
          if (externalId) {
            const { data: exists } = await admin
              .from('evolution_messages')
              .select('id')
              .eq('user_id', user.id)
              .eq('external_id', externalId)
              .maybeSingle();
            if (exists?.id) continue;
          }
          const row: Record<string, unknown> = {
            user_id: user.id,
            instance_name: instance,
            remote_jid: remoteJid,
            phone: phoneN,
            contact_name: m?.pushName || null,
            direction: fromMe ? 'out' : 'in',
            content: content || `[${type}]`,
            message_type: type,
            external_id: externalId || null,
            status: fromMe ? (Number(m?.status) >= 4 ? 'read' : Number(m?.status) >= 3 ? 'delivered' : 'sent') : 'received',
            raw: isStatus ? { ...m, __participantPhone: participantPhone, __participantJid: participantJid } : m,
          };
          if (createdIso) row.created_at = createdIso;
          const { error } = await admin.from('evolution_messages').insert(row);
          if (!error) imported++;
        } catch (e) {
          console.error('[evolution-send] sync-history row failed', e);
        }
      }
      return jsonResponse({ ok: true, imported, total: rows.length });
    }

    // DELETE MESSAGES — body: { ids?: string[], id?: string, phone?: string (limpar conversa), all?: boolean (limpar tudo) }
    if (action === 'delete-messages') {
      if (body.all === true) {
        const { error, count } = await admin.from('evolution_messages').delete({ count: 'exact' }).eq('user_id', user.id);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true, deleted: count || 0 });
      }
      const ids: string[] = Array.isArray(body.ids) ? body.ids : (body.id ? [String(body.id)] : []);
      if (body.phone && !ids.length) {
        const phone = normalizeChatPhone(body.phone);
        const { error, count } = await admin.from('evolution_messages').delete({ count: 'exact' }).eq('user_id', user.id).eq('phone', phone);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true, deleted: count || 0 });
      }
      if (!ids.length) return jsonResponse({ error: 'id obrigatório' }, 400);
      const { error, count } = await admin.from('evolution_messages').delete({ count: 'exact' }).eq('user_id', user.id).in('id', ids);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true, deleted: count || 0 });
    }


    return jsonResponse({ error: 'action inválida' }, 400);
  } catch (e) {
    console.error('[evolution-send]', e);
    return jsonResponse({ error: String((e as Error).message || e) }, 500);
  }
});
