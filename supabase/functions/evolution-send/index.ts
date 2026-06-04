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
  const headers: Record<string, string> = { apikey: apiKey };
  if (contentType) headers['Content-Type'] = 'application/json';
  if (instanceId) headers.instanceId = instanceId;
  return headers;
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
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp antes de configurar o webhook.' }, 200);
      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook?token=${settings.webhook_token}`;
      const classic = await fetchJson(`${baseUrl}/webhook/set/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: evolutionHeaders(apiKey, true),
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            events: ['MESSAGES_UPSERT'],
            byEvents: false,
            base64: false,
          },
        }),
      }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));

      if (classic.ok || classic.status !== 404) {
        return jsonResponse({ ok: classic.ok, status: classic.status, mode: 'evolution-api', webhookUrl, data: classic.data });
      }

      const instanceId = await resolveGoInstanceId(baseUrl, apiKey, instance);

      const go = await fetchJson(`${baseUrl}/instance/connect`, {
        method: 'POST',
        headers: evolutionHeaders(apiKey, true, instanceId),
        body: JSON.stringify({
          webhookUrl,
          subscribe: ['MESSAGE', 'SEND_MESSAGE', 'CONNECTION'],
          immediate: true,
        }),
      }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
      return jsonResponse({ ok: go.ok, status: go.status, mode: 'evolution-go', webhookUrl, data: go.data });
    }

    // SEND
    if (action === 'send') {
      if (!instance) return jsonResponse({ error: 'Escolha uma instância em Conexões WhatsApp antes de enviar mensagens.' }, 200);
      const phone = normalizePhone(body.phone);
      const text = String(body.text || '').trim();
      if (!phone || !text) {
        return jsonResponse({ error: 'phone e text obrigatórios' }, 400);
      }
      const instAuth = await resolveInstanceAuth(baseUrl, apiKey, instance);

      // Try a list of known endpoint variants for both Evolution API (classic) and Evolution Go
      const attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [
        // Evolution Go (instance token endpoint) — fastest path for this project
        { url: `${baseUrl}/send/text`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, text }, mode: 'evolution-go-send' },
        { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, text }, mode: 'evolution-go' },
        { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(instAuth.apiKey, true, instAuth.instanceId), body: { number: phone, message: text }, mode: 'evolution-go-msg' },
        // Classic Evolution API (Node)
        { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, text }, mode: 'evolution-api' },
        { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, textMessage: { text } }, mode: 'evolution-api-v1' },
      ];

      let result: any = { ok: false, status: 0, data: {} };
      let mode = 'evolution-api';
      const log: any[] = [];
      for (const att of attempts) {
        const r = await fetchJson(att.url, {
          method: 'POST',
          headers: att.headers,
          body: JSON.stringify(att.body),
        }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        log.push({ url: att.url, mode: att.mode, status: r.status });
        if (r.ok) { result = r; mode = att.mode; break; }
        // Only continue when it's a routing-style failure
        if (r.status !== 404 && r.status !== 405 && r.status !== 400) {
          result = r; mode = att.mode; break;
        }
        result = r; mode = att.mode;
      }

      if (!result.ok) {
        console.error('[evolution-send] all attempts failed', log, result);
        const summary = log.map((a) => `${a.mode}:${a.status}`).join(' | ');
        return jsonResponse({ error: `Falha ao enviar (${summary})`, status: result.status, mode, data: result.data, attempts: log }, 200);
      }
      await insertOutgoingMessage(admin, {
        user_id: user.id,
        remote_jid: `${phone}@s.whatsapp.net`,
        phone,
        direction: 'out',
        content: text,
        status: 'sent',
        external_id: result.data?.key?.id || result.data?.messageId || result.data?.data?.Info?.ID || result.data?.Info?.ID || null,
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

      // Trigger reconnect for Evolution Go so a QR is generated, then fetch /instance/qr
      await fetchJson(`${baseUrl}/instance/reconnect`, {
        method: 'POST', headers: evolutionHeaders(scopedApiKey, true, scopedInstanceId), body: '{}',
      }, 5000).catch(() => null);

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

    // LIST INSTANCES
    if (action === 'list-instances') {
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
        const list = await Promise.all(rows.map(async (item: any) => {
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
        return jsonResponse({ ok: true, instances: list, current: instance, adminMode: true });
      }

      // Fallback: build a single entry from the instance-scoped /instance/status endpoint
      // (the API key the user provided is an instance token, not the global admin key)
      const status = await fetchJson(`${baseUrl}/instance/status`, {
        headers: evolutionHeaders(apiKey),
      }, 6000).catch(() => ({ ok: false, status: 0, data: {} as any }));

      if (status.ok) {
        const sd = status.data?.data || status.data || {};
        let phone: string | null = null;
        // try /instance/connect to capture jid even when disconnected
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
      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook?token=${settings.webhook_token}`;
      const instToken = (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payloads = [
        // Evolution Go style (requires token)
        { url: `${baseUrl}/instance/create`, body: { name, token: instToken, webhookUrl, subscribe: ['MESSAGE','SEND_MESSAGE','CONNECTION'], immediate: true } },
        // Evolution API classic
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
        if (r.ok) return jsonResponse({ ok: true, data: r.data, name });
      }
      return jsonResponse({ ok: false, status: last.status, error: last.data?.message || last.data?.error || 'Falha ao criar instância.', data: last.data }, 200);
    }

    // DISCONNECT / LOGOUT INSTANCE
    if (action === 'logout-instance') {
      const targetInstance = String(body.instance || instance).trim();
      const tries = [
        // Evolution Go (instance-scoped, no path id)
        { url: `${baseUrl}/instance/logout`, method: 'DELETE' },
        { url: `${baseUrl}/instance/disconnect`, method: 'POST' },
        // Evolution API classic
        { url: `${baseUrl}/instance/logout/${encodeURIComponent(targetInstance)}`, method: 'DELETE' },
        { url: `${baseUrl}/instance/logout/${encodeURIComponent(targetInstance)}`, method: 'POST' },
      ];
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: t.method, headers: evolutionHeaders(apiKey, true, targetInstance) }, 8000)
          .catch(() => ({ ok: false, status: 0, data: {} as any }));
        if (r.ok) return jsonResponse({ ok: true, data: r.data });
      }
      return jsonResponse({ ok: false, error: 'Falha ao desconectar instância.' }, 200);
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

    return jsonResponse({ error: 'action inválida' }, 400);
  } catch (e) {
    console.error('[evolution-send]', e);
    return jsonResponse({ error: String((e as Error).message || e) }, 500);
  }
});
