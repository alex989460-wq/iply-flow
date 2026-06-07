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
      .select('user_id, base_url, api_key, instance_name, autoreply_enabled, autoreply_only_outside_hours, autoreply_business_start, autoreply_business_end, autoreply_disabled_phones')
      .eq('user_id', user_id)
      .maybeSingle();

    if (!settings?.autoreply_enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: 'disabled' }), { status: 200, headers: corsHeaders });
    }
    if ((settings.autoreply_disabled_phones || []).includes(phone)) {
      return new Response(JSON.stringify({ ok: true, skipped: 'opted_out' }), { status: 200, headers: corsHeaders });
    }
    if (settings.autoreply_only_outside_hours && isWithinBusinessHours(settings.autoreply_business_start, settings.autoreply_business_end)) {
      return new Response(JSON.stringify({ ok: true, skipped: 'business_hours' }), { status: 200, headers: corsHeaders });
    }

    // Anti-loop
    const { data: recent } = await admin
      .from('evolution_messages')
      .select('id, external_id, direction, content, created_at, message_type, status, raw')
      .eq('user_id', user_id)
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(20);

    const lastOut = recent?.find((m) => m.direction === 'out' && m.status !== 'failed');
    if (lastOut && Date.now() - new Date(lastOut.created_at).getTime() < 20000) {
      return new Response(JSON.stringify({ ok: true, skipped: 'cooldown' }), { status: 200, headers: corsHeaders });
    }
    const lastIn = recent?.find((m) => m.direction === 'in');
    if (lastIn && lastOut && new Date(lastOut.created_at).getTime() > new Date(lastIn.created_at).getTime()) {
      return new Response(JSON.stringify({ ok: true, skipped: 'human_replied' }), { status: 200, headers: corsHeaders });
    }

    // Load knowledge base
    const { data: kbRows } = await admin
      .from('ai_knowledge_entries')
      .select('id, title, category, keywords, response_template, requires_human')
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

    const sendReply = async (replyText: string, category: string | null, kbId: string | null) => {
      const baseUrl = (settings.base_url || '').replace(/\/+$/, '');
      const evoKey = settings.api_key || '';
      const instance = settings.instance_name || '';
      if (!baseUrl || !evoKey || !instance) return { sent: false, error: 'no_evolution_creds' };

      const instAuth = await resolveInstanceAuth(baseUrl, evoKey, instance);
      const sendTargets = await resolveSendTargets(admin, user_id, phone);
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
      for (const target of sendTargets) {
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
        const timeout = att.mode.startsWith('evolution-go-send') ? 30000 : 8000;
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
          phone, direction: 'out', content: replyText, message_type: 'text', status: 'failed',
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
        direction: 'out', content: replyText, message_type: 'text', status: 'sent',
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

    // Only pass — knowledge-base keyword match (free, predictable)
    const kwMatch = matchByKeywords(incomingContent, kb);
    if (kwMatch) {
      if (kwMatch.requires_human) {
        await flagHuman(kwMatch.category);
        return new Response(JSON.stringify({ ok: true, flagged_human: true, via: 'knowledge_base', category: kwMatch.category }), { status: 200, headers: corsHeaders });
      }
      const r = await sendReply(kwMatch.response_template, kwMatch.category, kwMatch.id);
      if (!r.sent) await flagHuman(kwMatch.category);
      return new Response(JSON.stringify({ ok: true, replied: r.sent, via: 'knowledge_base', category: kwMatch.category, error: r.error || null }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, skipped: 'no_knowledge_base_keyword_match' }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error('[evolution-autoreply]', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 200, headers: corsHeaders });
  }
});
