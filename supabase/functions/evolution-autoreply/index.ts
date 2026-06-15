// Auto-attendance based ONLY on the user's knowledge base.
// It never calls external AI models: incoming text must match an enabled KB keyword.
// Entries marked requires_human=true are routed to the Support tab without auto-reply.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function nowInSaoPaulo(): { h: number; m: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { h, m };
}

function parseHM(s: string): number {
  const [h, m] = String(s || '08:00').split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function isWithinBusinessHours(start: string, end: string) {
  const t = nowInSaoPaulo();
  const cur = t.h * 60 + t.m;
  const s = parseHM(start);
  const e = parseHM(end);
  if (s <= e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

interface KbEntry {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  response_template: string;
  media_url?: string | null;
  media_mime?: string | null;
  media_type?: string | null;
  media_filename?: string | null;
  requires_human: boolean;
}

function normalizeText(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Keyword-only matching — no AI/model calls, no credit usage.
function matchByKeywords(content: string, kb: KbEntry[]): KbEntry | null {
  const text = ` ${normalizeText(content)} `;
  for (const e of kb) {
    if (!e.keywords?.length) continue;
    for (const kw of e.keywords) {
      const k = normalizeText(String(kw || ''));
      if (k && text.includes(` ${k} `)) return e;
    }
  }
  return null;
}

function evolutionHeaders(apiKey: string, contentType = false, instanceId = '') {
  const headers: Record<string, string> = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
  if (contentType) headers['Content-Type'] = 'application/json';
  if (instanceId) headers.instanceId = instanceId;
  return headers;
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 8000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function normalizeChatPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
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

async function resolveSendTargets(admin: any, userId: string, phone: string) {
  const targets: Array<{ value: string; kind: 'lid' | 'jid' | 'phone' }> = [];
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
      pushUniqueTarget(targets, info.RecipientAlt);
      pushUniqueTarget(targets, info.TargetJID || info.TargetID);
      pushUniqueTarget(targets, info.DeviceSentMeta?.DestinationJID);
      pushUniqueTarget(targets, info.Chat);
    } else {
      pushUniqueTarget(targets, info.Sender);
      pushUniqueTarget(targets, info.Chat);
      pushUniqueTarget(targets, info.SenderAlt);
    }
  }
  pushUniqueTarget(targets, phoneDigits);
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
  const lids = targets.filter((t) => t.kind === 'lid');
  const jids = targets.filter((t) => t.kind === 'jid' && t.value.startsWith('55'));
  const phones = targets.filter((t) => t.kind === 'phone' && t.value.startsWith('55'));
  const otherPhones = targets.filter((t) => t.kind === 'phone' && !t.value.startsWith('55'));
  return [...lids, ...phones, ...jids, ...otherPhones].filter((target, index, arr) => arr.findIndex((t) => t.value === target.value) === index);
}

async function resolveGoInstance(baseUrl: string, apiKey: string, instance: string) {
  const wanted = String(instance || '').toLowerCase();
  const r = await fetchJson(`${baseUrl}/instance/all`, { headers: evolutionHeaders(apiKey) }).catch(() => null);
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
  };
}

async function primeEvolutionContact(baseUrl: string, apiKey: string, instanceId: string, phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return;
  const jid = `${digits}@s.whatsapp.net`;
  const headers = evolutionHeaders(apiKey, true, instanceId);
  await Promise.all([
    fetchJson(`${baseUrl}/user/info`, { method: 'POST', headers, body: JSON.stringify({ number: [digits] }) }, 3000).catch(() => null),
    fetchJson(`${baseUrl}/user/info`, { method: 'POST', headers, body: JSON.stringify({ number: [jid] }) }, 3000).catch(() => null),
  ]);
}

function getEvolutionErrorText(data: any) {
  return [data?.error, data?.message, data?.response?.message, data?.data?.error, data?.data?.message]
    .flat().filter(Boolean).map((v) => typeof v === 'string' ? v : JSON.stringify(v)).join(' | ');
}

function isEvolutionReachoutLock(data: any) {
  return /(^|\D)463(\D|$)|NackCallerReachoutTimelocked|reach[- ]?out|time[- ]?lock/i.test(getEvolutionErrorText(data));
}

function stepType(type: unknown) {
  const map: Record<string, string> = { message: 'text', buttons: 'menu', list: 'menu', wait: 'delay', webhook: 'api_call', human: 'transfer', finish: 'end' };
  const t = String(type || 'text');
  return map[t] || t;
}

function nextStepId(step: any) {
  return Array.isArray(step?.buttons) && step.buttons[0]?.next_step_id ? step.buttons[0].next_step_id : null;
}

function menuChoice(step: any, incoming: string) {
  const clean = normalizeText(incoming);
  const digit = String(incoming || '').match(/\d+/)?.[0];
  const buttons = Array.isArray(step?.buttons) ? step.buttons : [];
  if (digit) {
    const byIndex = buttons[Number(digit) - 1];
    if (byIndex) return byIndex;
  }
  return buttons.find((b: any) => normalizeText(String(b?.label || '')) === clean || normalizeText(String(b?.label || '')).includes(clean));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const internalToken = req.headers.get('x-internal-token') || '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (internalToken !== serviceRole) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const user_id: string = String(body?.user_id || '');
    const phone: string = String(body?.phone || '').replace(/\D/g, '');
    const incomingContent: string = String(body?.content || '').trim();
    if (!user_id || !phone) {
      return new Response(JSON.stringify({ error: 'missing user_id/phone' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRole);

    const { data: settings } = await admin
      .from('evolution_settings')
      .select('user_id, base_url, api_key, instance_name, autoreply_enabled, autoreply_only_outside_hours, autoreply_business_start, autoreply_business_end, autoreply_disabled_phones, autoreply_absence_enabled, autoreply_absence_message, autoreply_absence_cooldown_hours')
      .eq('user_id', user_id)
      .maybeSingle();

    if (!settings) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_settings' }), { status: 200, headers: corsHeaders });
    }
    const kbEnabled = !!settings.autoreply_enabled;
    const absenceEnabled = !!settings.autoreply_absence_enabled;
    const disabledPhones = new Set((settings.autoreply_disabled_phones || []).map((p: string) => normalizeChatPhone(p)));
    if (disabledPhones.has(normalizeChatPhone(phone))) {
      return new Response(JSON.stringify({ ok: true, skipped: 'opted_out' }), { status: 200, headers: corsHeaders });
    }
    const outsideHours = !isWithinBusinessHours(settings.autoreply_business_start, settings.autoreply_business_end);
    const kbAllowedNow = kbEnabled && (!settings.autoreply_only_outside_hours || outsideHours);

    // Anti-double-fire: ignore very recent autoreply outs (3s) to avoid duplicate fires on same incoming
    const { data: recent } = await admin
      .from('evolution_messages')
      .select('id, external_id, direction, content, created_at, message_type, status, raw')
      .eq('user_id', user_id)
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(20);

    const lastOut = recent?.find((m) => m.direction === 'out' && m.status !== 'failed');
    if (lastOut && Date.now() - new Date(lastOut.created_at).getTime() < 3000) {
      return new Response(JSON.stringify({ ok: true, skipped: 'cooldown' }), { status: 200, headers: corsHeaders });
    }
    const lastIn = recent?.find((m) => m.direction === 'in');
    // If the last OUT was a manual human reply (not autoreply) AND it came after lastIn,
    // stop replying. Autoreply outs do NOT count as "human took over".
    const lastOutIsAutoreply = !!(lastOut?.raw && (lastOut.raw as any).__autoreply === true);
    if (lastOut && !lastOutIsAutoreply && lastIn && new Date(lastOut.created_at).getTime() > new Date(lastIn.created_at).getTime()) {
      return new Response(JSON.stringify({ ok: true, skipped: 'human_replied' }), { status: 200, headers: corsHeaders });
    }

    const callEvolution = async (payload: Record<string, unknown>) => {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const r = await fetch(`${supabaseUrl}/functions/v1/evolution-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRole}`, apikey: serviceRole, 'x-internal-token': serviceRole },
        body: JSON.stringify({ ...payload, user_id }),
      });
      return await r.json().catch(() => ({}));
    };

    const sendBotMedia = async (step: any) => {
      const mediaUrl = String(step.media_url || '').trim();
      if (!mediaUrl) return { ok: true };
      if (String(step.text || '').trim()) await callEvolution({ action: 'send', phone, text: String(step.text).trim() });
      const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { ok: false, error: `media_fetch_${res.status}` };
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (const b of buf) bin += String.fromCharCode(b);
      const mediaBase64 = btoa(bin);
      const type = stepType(step.type);
      const mediaType = type === 'image' ? 'image' : type === 'video' ? 'video' : type === 'audio' ? 'audio' : 'document';
      return callEvolution({ action: 'send-media', phone, mediaType, mimetype: res.headers.get('content-type') || 'application/octet-stream', filename: `bot-${Date.now()}`, mediaBase64, caption: String(step.caption || '') });
    };

    const runBotFlow = async () => {
      const { data: session } = await admin.from('bot_flow_sessions').select('*').eq('owner_id', user_id).eq('phone', phone).gt('expires_at', new Date().toISOString()).maybeSingle();
      const { data: flows } = await admin.from('bot_flows').select('id,name,start_step_id,steps,trigger_keywords,enabled').eq('owner_id', user_id).eq('enabled', true).order('updated_at', { ascending: false });
      let flow = session ? (flows || []).find((f: any) => f.id === session.flow_id) : null;
      let startId: string | null = session?.current_step_id || null;
      const incomingNorm = normalizeText(incomingContent);
      if (!flow) {
        flow = (flows || []).find((f: any) => {
          const keys = Array.isArray(f.trigger_keywords) ? f.trigger_keywords : [];
          return keys.some((k: string) => {
            const kk = normalizeText(k);
            return kk && (incomingNorm === kk || incomingNorm.includes(kk));
          });
        }) || null;
        startId = flow?.start_step_id || flow?.steps?.[0]?.id || null;
      } else {
        const waiting = (flow.steps || []).find((s: any) => s?.id === startId);
        if (stepType(waiting?.type) === 'menu') {
          const choice = menuChoice(waiting, incomingContent);
          if (!choice?.next_step_id) {
            await callEvolution({ action: 'send', phone, text: 'Escolha uma das opções do menu, por favor.' });
            return { handled: true, waiting: true };
          }
          startId = choice.next_step_id;
        } else if (stepType(waiting?.type) === 'question' || stepType(waiting?.type) === 'rating') {
          const vars = { ...(session?.variables || {}), [waiting.variable || 'ultima_resposta']: incomingContent, ultima_resposta: incomingContent, ultima_mensagem: incomingContent };
          await admin.from('bot_flow_sessions').update({ variables: vars }).eq('id', session.id);
          startId = nextStepId(waiting);
        }
      }
      if (!flow || !startId) return { handled: false };
      const stepsById = new Map<string, any>((flow.steps || []).map((s: any) => [s.id, s]));
      const variables = { ...(session?.variables || {}), ultima_mensagem: incomingContent, ultima_resposta: incomingContent };
      let curId: string | null = startId;
      const visited = new Set<string>();
      while (curId && !visited.has(curId)) {
        visited.add(curId);
        const step = stepsById.get(curId);
        if (!step) break;
        const type = stepType(step.type);
        if (type === 'text' || type === 'ig_comment' || type === 'wa_template' || type === 'wa_flow') {
          const text = String(step.text || step.title || '').trim();
          if (text) await callEvolution({ action: 'send', phone, text });
          curId = nextStepId(step);
        } else if (type === 'menu') {
          await callEvolution({ action: 'send-menu', phone, text: String(step.text || step.title || ''), buttons: (step.buttons || []).map((b: any) => ({ id: b.id, label: b.label })), mode: step.menu_style || 'buttons' });
          await admin.from('bot_flow_sessions').upsert({ owner_id: user_id, phone, flow_id: flow.id, current_step_id: step.id, variables, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }, { onConflict: 'owner_id,phone' });
          return { handled: true, waiting: true };
        } else if (type === 'image' || type === 'video' || type === 'audio' || type === 'file') {
          await sendBotMedia(step);
          curId = nextStepId(step);
        } else if (type === 'delay') {
          await new Promise((r) => setTimeout(r, Math.max(0, Math.min(15000, Number(step.delay_ms) || 800))));
          curId = nextStepId(step);
        } else if (type === 'api_call' || type === 'gpt' || type === 'condition' || type === 'ab_test' || type === 'tags' || type === 'save_contact' || type === 'save_card') {
          const r = await callEvolution({ action: 'run-flow-step', phone, step, incoming: incomingContent, variables });
          Object.assign(variables, r?.variables || {});
          if (r?.replyText) await callEvolution({ action: 'send', phone, text: String(r.replyText) });
          curId = r?.nextStepId || nextStepId(step);
        } else if (type === 'question' || type === 'rating') {
          const text = String(step.text || step.title || '').trim();
          if (text) await callEvolution({ action: 'send', phone, text });
          await admin.from('bot_flow_sessions').upsert({ owner_id: user_id, phone, flow_id: flow.id, current_step_id: step.id, variables, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }, { onConflict: 'owner_id,phone' });
          return { handled: true, waiting: true };
        } else if (type === 'transfer') {
          await flagHuman(step.transfer_department || 'suporte');
          if (String(step.text || '').trim()) await callEvolution({ action: 'send', phone, text: String(step.text).trim() });
          curId = null;
        } else {
          curId = null;
        }
      }
      await admin.from('bot_flow_sessions').delete().eq('owner_id', user_id).eq('phone', phone);
      return { handled: true, waiting: false };
    };

    const botResult = await runBotFlow();
    if (botResult.handled) {
      return new Response(JSON.stringify({ ok: true, via: 'bot_flow', waiting: botResult.waiting }), { status: 200, headers: corsHeaders });
    }

    if (!kbEnabled && !absenceEnabled) {
      return new Response(JSON.stringify({ ok: true, skipped: 'disabled_no_bot_match' }), { status: 200, headers: corsHeaders });
    }


    // Load knowledge base
    const { data: kbRows } = await admin
      .from('ai_knowledge_entries')
      .select('id, title, category, keywords, response_template, media_url, media_mime, media_type, media_filename, requires_human')
      .eq('user_id', user_id)
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });
    const kb: KbEntry[] = (kbRows || []) as KbEntry[];

    const flagHuman = async (category: string | null) => {
      await admin.from('evolution_contacts').upsert({
        user_id, phone,
        needs_human: true,
        ai_category: category || 'suporte',
        last_classified_at: new Date().toISOString(),
      }, { onConflict: 'user_id,phone' as any });
    };

    const alreadyRepliedIn24h = async (kbId: string, replyText: string) => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await admin
        .from('evolution_messages')
        .select('id, content, raw')
        .eq('user_id', user_id)
        .eq('phone', phone)
        .eq('direction', 'out')
        .neq('status', 'failed')
        .gte('created_at', since)
        .limit(30);
      return (data || []).some((row: any) => row?.raw?.__autoreply === true && row?.raw?.__kb === kbId || String(row?.content || '') === replyText);
    };

    const sendReply = async (entry: KbEntry) => {
      const replyText = String(entry.response_template || '').trim();
      const category = entry.category || null;
      const kbId = entry.id || null;
      const baseUrl = (settings.base_url || '').replace(/\/+$/, '');
      const evoKey = settings.api_key || '';
      const instance = settings.instance_name || '';
      if (!baseUrl || !evoKey || !instance) return { sent: false, error: 'no_evolution_creds' };

      const instAuth = await resolveInstanceAuth(baseUrl, evoKey, instance);
      const validatedTargets = await resolveValidatedTargets(baseUrl, instAuth.apiKey, instAuth.instanceId, phone);
      const historyTargets = await resolveSendTargets(admin, user_id, phone);
      const sendTargets = [...validatedTargets, ...historyTargets]
        .filter((target, index, arr) => arr.findIndex((t) => t.value === target.value) === index);
      const primaryTarget = sendTargets[0]?.value || normalizeChatPhone(phone);
      await primeEvolutionContact(baseUrl, instAuth.apiKey, instAuth.instanceId, phone);
      const quotedRaw = lastIn?.external_id ? {
        messageId: String(lastIn.external_id),
        fromMe: false,
        text: String(lastIn.content || incomingContent || ''),
      } : null;
      const quotedClassic = quotedRaw ? {
        key: {
          remoteJid: primaryTarget.includes('@') ? primaryTarget : `${primaryTarget}@s.whatsapp.net`,
          fromMe: false,
          id: quotedRaw.messageId,
        },
        message: { conversation: quotedRaw.text },
      } : null;
      const quotedGo = quotedRaw ? {
        messageId: quotedRaw.messageId,
        participant: primaryTarget.includes('@') ? primaryTarget : `${primaryTarget}@s.whatsapp.net`,
      } : null;

      const attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [];
      const mediaUrl = String(entry.media_url || '').trim();
      const mediaType = String(entry.media_type || (entry.media_mime?.startsWith('image/') ? 'image' : 'document') || 'document');
      const mime = String(entry.media_mime || (mediaType === 'image' ? 'image/jpeg' : 'application/octet-stream'));
      const filename = String(entry.media_filename || `resposta-${Date.now()}`);

      for (const target of sendTargets) {
        if (mediaUrl) {
          const goType = mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : 'document';
          attempts.push(
            { url: `${baseUrl}/send/media`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: target.value, type: goType, url: mediaUrl, filename, caption: replyText, formatJid: target.kind !== 'jid' }, mode: `evolution-go-media-${target.kind}` },
            { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: target.value, type: goType, url: mediaUrl, filename, caption: replyText }, mode: `evolution-go-message-media-${target.kind}` },
            { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(evoKey, true), body: { number: target.value, mediatype: goType, mimetype: mime, fileName: filename, caption: replyText, media: mediaUrl }, mode: `evolution-api-media-${target.kind}` },
          );
          continue;
        }
        const goBody: Record<string, unknown> = { number: target.value, text: replyText };
        const goBodyMsg: Record<string, unknown> = { number: target.value, message: replyText };
        const classicBody: Record<string, unknown> = { number: target.value, text: replyText };
        const classicBodyV1: Record<string, unknown> = { number: target.value, textMessage: { text: replyText } };
        if (quotedGo && quotedClassic) {
          goBody.quoted = quotedGo; goBodyMsg.quoted = quotedGo;
          classicBody.quoted = quotedClassic; classicBodyV1.quoted = quotedClassic;
        }
        const sendTextAttempts = [
          { url: `${baseUrl}/send/text`, headers: evolutionHeaders(evoKey, true, instAuth.instanceId), body: { ...goBody, formatJid: target.kind !== 'jid' }, mode: `evolution-go-send-global-${target.kind}` },
          { url: `${baseUrl}/send/text`, headers: evolutionHeaders(evoKey, true, instAuth.instanceId), body: { ...goBody, formatJid: false }, mode: `evolution-go-send-global-raw-${target.kind}` },
          { url: `${baseUrl}/send/text`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { ...goBody, formatJid: target.kind !== 'jid' }, mode: `evolution-go-send-${target.kind}` },
          { url: `${baseUrl}/send/text`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { ...goBody, formatJid: false }, mode: `evolution-go-send-raw-${target.kind}` },
          { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBody, mode: `evolution-go-${target.kind}` },
          { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: goBodyMsg, mode: `evolution-go-msg-${target.kind}` },
          { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(evoKey, true), body: classicBodyV1, mode: `evolution-api-v1-${target.kind}` },
          { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(evoKey, true), body: classicBody, mode: `evolution-api-${target.kind}` },
        ];
        attempts.push(...(target.kind === 'lid'
          ? [sendTextAttempts[0], sendTextAttempts[2], sendTextAttempts[1], sendTextAttempts[3], ...sendTextAttempts.slice(4)]
          : sendTextAttempts));
      }

      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'evolution-api-v1';
      const log: any[] = [];
      for (const att of attempts) {
        const timeout = 8000;
        const r = await fetchJson(att.url, { method: 'POST', headers: att.headers, body: JSON.stringify(att.body) }, timeout)
          .catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ mode: att.mode, status: r.status, error: getEvolutionErrorText(r.data).slice(0, 180) });
        result = r; mode = att.mode;
        const returnedChat = String(r.data?.data?.Info?.Chat || r.data?.Info?.Chat || '');
        const hasMappedLid = sendTargets.some((target) => target.kind === 'lid');
        const rawPhoneFalsePositive = r.ok && hasMappedLid && /raw-(phone|jid)$/.test(att.mode) && !/@lid\b/i.test(returnedChat);
        if (r.ok && !rawPhoneFalsePositive) break;
        if (rawPhoneFalsePositive) continue;
        if (isEvolutionReachoutLock(r.data)) continue;
        if (r.status === 401 && att.mode.includes('-global-')) continue;
        if (r.status !== 404 && r.status !== 405 && r.status !== 400 && r.status !== 0) break;
      }
      if (!result.ok) {
        console.error('[autoreply] all send attempts failed', log, result.data);
        await admin.from('evolution_messages').insert({
          user_id, instance_name: instance,
          remote_jid: primaryTarget.includes('@') ? primaryTarget : `${primaryTarget}@s.whatsapp.net`,
          phone, direction: 'out', content: replyText || (mediaUrl ? `📎 ${filename}` : ''), message_type: mediaUrl ? mediaType : 'text', status: 'failed', media_url: mediaUrl || null, media_mime: mediaUrl ? mime : null,
          external_id: `failed-auto-${crypto.randomUUID()}`,
          raw: {
            __autoreply: true,
            __autoreply_failed: true,
            __kb: kbId,
            __category: category,
            __mode: 'failed',
            __attempts: log,
            __error: isEvolutionReachoutLock(result.data) ? 'whatsapp_reachout_locked_463' : 'send_failed',
            __lastResponse: result.data,
          },
        });
        return { sent: false, error: 'send_failed', sendData: result.data, attempts: log };
      }

      const sendData = result.data;
      const externalId = sendData?.key?.id || sendData?.messageId || sendData?.data?.Info?.ID || sendData?.Info?.ID || `auto-${crypto.randomUUID()}`;
      await admin.from('evolution_messages').insert({
        user_id, instance_name: instance, remote_jid: sendData?.data?.Info?.Chat || sendData?.Info?.Chat || (primaryTarget.includes('@') ? primaryTarget : `${primaryTarget}@s.whatsapp.net`), phone,
        direction: 'out', content: replyText || (mediaUrl ? `📎 ${filename}` : ''), message_type: mediaUrl ? mediaType : 'text', media_url: mediaUrl || null, media_mime: mediaUrl ? mime : null, status: 'sent',
        external_id: externalId, raw: { ...sendData, __autoreply: true, __kb: kbId, __category: category, __mode: mode, __attempts: log },
      });
      // Mark contact category, but not needs_human (we answered it)
      await admin.from('evolution_contacts').upsert({
        user_id, phone,
        ai_category: category,
        needs_human: false,
        last_classified_at: new Date().toISOString(),
      }, { onConflict: 'user_id,phone' as any });
      return { sent: true };
    };

    let skippedKbRepeat = false;

    // Knowledge-base keyword match (free, predictable)
    if (kbAllowedNow) {
      const kwMatch = matchByKeywords(incomingContent, kb);
      if (kwMatch) {
        if (kwMatch.requires_human) {
          await flagHuman(kwMatch.category);
          return new Response(JSON.stringify({ ok: true, flagged_human: true, via: 'knowledge_base', category: kwMatch.category }), { status: 200, headers: corsHeaders });
        }
        if (await alreadyRepliedIn24h(kwMatch.id, kwMatch.response_template || '')) {
          skippedKbRepeat = true;
        } else {
          const r = await sendReply(kwMatch);
          if (!r.sent) await flagHuman(kwMatch.category);
          return new Response(JSON.stringify({ ok: true, replied: r.sent, via: 'knowledge_base', category: kwMatch.category, error: r.error || null }), { status: 200, headers: corsHeaders });
        }
      }
    }

    // Absence message — sent when absent is enabled and no KB matched.
    // If "only outside hours" is enabled, respect business hours; otherwise treat absence as a manual away mode.
    const absenceMsg = String(settings.autoreply_absence_message || '').trim();
    const absenceAllowedNow = absenceEnabled && (!settings.autoreply_only_outside_hours || outsideHours);
    if (absenceAllowedNow && absenceMsg) {
      const cooldownH = Math.max(1, Number(settings.autoreply_absence_cooldown_hours) || 6);
      const since = new Date(Date.now() - cooldownH * 60 * 60 * 1000).toISOString();
      const { data: prior } = await admin
        .from('evolution_messages')
        .select('id, raw')
        .eq('user_id', user_id)
        .eq('phone', phone)
        .eq('direction', 'out')
        .neq('status', 'failed')
        .gte('created_at', since)
        .limit(30);
      const alreadySent = (prior || []).some((row: any) => row?.raw?.__autoreply === true && (row?.raw?.__absence === true || row?.raw?.__kb === 'absence'));
      if (alreadySent) {
        return new Response(JSON.stringify({ ok: true, skipped: 'absence_already_sent', via: 'absence' }), { status: 200, headers: corsHeaders });
      }
      const absenceEntry: KbEntry = {
        id: 'absence',
        title: 'Mensagem de ausência',
        category: 'ausencia',
        keywords: [],
        response_template: absenceMsg,
        requires_human: false,
      } as any;
      const r = await sendReply(absenceEntry);
      return new Response(JSON.stringify({ ok: true, replied: r.sent, via: 'absence' }), { status: 200, headers: corsHeaders });
    }


    return new Response(JSON.stringify({ ok: true, skipped: skippedKbRepeat ? 'already_replied_24h' : 'no_knowledge_base_keyword_match' }), { status: 200, headers: corsHeaders });

  } catch (e) {
    console.error('[evolution-autoreply]', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 200, headers: corsHeaders });
  }
});
