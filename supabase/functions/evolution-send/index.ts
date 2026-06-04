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

function publicMediaFromSignedUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
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
    String(item?.name || '').toLowerCase() === wanted ||
    String(item?.token || '') === apiKey
  );
  return found?.id || '';
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
    const apiKey = settings.api_key;
    const instance = settings.instance_name;
    if (!baseUrl || !apiKey || !instance) {
      return jsonResponse({ error: 'Configuração incompleta' }, 400);
    }

    // TEST CONNECTION
    if (action === 'test') {
      const classic = await fetchJson(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
        headers: evolutionHeaders(apiKey),
      }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));

      if (classic.ok || classic.status !== 404) {
        return jsonResponse({ ok: classic.ok, status: classic.status, mode: 'evolution-api', data: classic.data });
      }

      const goStatus = await fetchJson(`${baseUrl}/instance/status`, {
        headers: evolutionHeaders(apiKey),
      }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
      const statusData = goStatus.data?.data || goStatus.data || {};
      const state = statusData.Connected || statusData.connected ? 'open' : statusData.LoggedIn || statusData.loggedIn ? 'connecting' : 'close';

      return jsonResponse({
        ok: goStatus.ok,
        status: goStatus.status,
        mode: 'evolution-go',
        data: { ...goStatus.data, instance: { state } },
        fallback: { status: classic.status, data: classic.data },
      });
    }

    // SET WEBHOOK
    if (action === 'set-webhook') {
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
      const phone = normalizePhone(body.phone);
      const text = String(body.text || '').trim();
      if (!phone || !text) {
        return jsonResponse({ error: 'phone e text obrigatórios' }, 400);
      }

      const instanceId = await resolveGoInstanceId(baseUrl, apiKey, instance).catch(() => '');

      // Try a list of known endpoint variants for both Evolution API (classic) and Evolution Go
      const attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [
        // Classic Evolution API (Node)
        { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, text }, mode: 'evolution-api' },
        { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, textMessage: { text } }, mode: 'evolution-api-v1' },
        // Evolution Go (global endpoint + instanceId header)
        { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, text }, mode: 'evolution-go' },
        { url: `${baseUrl}/message/sendText`, headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, message: text }, mode: 'evolution-go-msg' },
        // Evolution Go alt
        { url: `${baseUrl}/send/text`, headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, text }, mode: 'evolution-go-send' },
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
      await admin.from('evolution_messages').insert({
        user_id: user.id,
        remote_jid: `${phone}@s.whatsapp.net`,
        phone,
        direction: 'out',
        content: text,
        status: 'sent',
        external_id: result.data?.key?.id || result.data?.messageId || result.data?.data?.Info?.ID || null,
        raw: result.data,
      });
      return jsonResponse({ ok: true, mode, data: result.data });
    }

    // FETCH PROFILE PICTURE
    if (action === 'fetch-profile-pic') {
      const phone = normalizePhone(body.phone);
      if (!phone) return jsonResponse({ error: 'phone obrigatório' }, 400);
      const number = `${phone}@s.whatsapp.net`;
      const instanceId = await resolveGoInstanceId(baseUrl, apiKey, instance).catch(() => '');
      const tries = [
        { url: `${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true), body: { number: phone } },
        { url: `${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true), body: { number } },
        { url: `${baseUrl}/user/avatar`, method: 'POST', headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, preview: false } },
        { url: `${baseUrl}/user/info`, method: 'POST', headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: [phone] } },
        { url: `${baseUrl}/chat/getProfilePicture`, method: 'POST', headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone } },
        { url: `${baseUrl}/chat/whatsappProfile/${encodeURIComponent(instance)}`, method: 'POST', headers: evolutionHeaders(apiKey, true), body: { number: phone } },
      ];
      for (const t of tries) {
        const r = await fetchJson(t.url, { method: t.method, headers: t.headers, body: JSON.stringify(t.body) })
          .catch(() => ({ ok: false, status: 0, data: {} as any }));
        const row = Array.isArray(r?.data?.data) ? r.data.data[0] : Array.isArray(r?.data) ? r.data[0] : r?.data?.data || r?.data || {};
        const url = row?.profilePictureUrl || row?.profilePicture || row?.avatar || row?.url || row?.picture || row?.pictureUrl || null;
        if (url) {
          await admin.from('evolution_contacts').upsert({
            user_id: user.id, phone, profile_pic_url: url, updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,phone' });
          return jsonResponse({ ok: true, url });
        }
      }
      return jsonResponse({ ok: false, url: null });
    }

    // SEND MEDIA (audio / image / file) — body: { phone, mediaBase64, mimetype, filename, mediaType: 'audio'|'image'|'document', caption? }
    if (action === 'send-media') {
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

      const instanceId = await resolveGoInstanceId(baseUrl, apiKey, instance).catch(() => '');

      let attempts: Array<{ url: string; headers: Record<string, string>; body: any; mode: string }> = [];
      if (mediaType === 'audio') {
        attempts = [
          { url: `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, audio: mediaForEvolution }, mode: 'evolution-api-audio-url' },
          { url: `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, audio: mediaBase64 }, mode: 'evolution-api-audio-base64' },
          { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, mediatype: 'audio', mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-api-media-audio' },
          { url: `${baseUrl}/send/media`, headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, type: 'audio', url: mediaForEvolution, filename, caption }, mode: 'evolution-go-send-media' },
          { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, type: 'audio', url: mediaForEvolution, filename, caption }, mode: 'evolution-go-message-media' },
        ];
      } else {
        const isImg = mediaType === 'image';
        const goType = isImg ? 'image' : 'document';
        attempts = [
          { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-api-url' },
          { url: `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, headers: evolutionHeaders(apiKey, true), body: { number: phone, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaBase64 }, mode: 'evolution-api-base64' },
          { url: `${baseUrl}/send/media`, headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, type: goType, url: mediaForEvolution, filename, caption }, mode: 'evolution-go-send-media' },
          { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, type: goType, url: mediaForEvolution, filename, caption }, mode: 'evolution-go-message-media' },
          { url: `${baseUrl}/message/sendMedia`, headers: evolutionHeaders(apiKey, true, instanceId || instance), body: { number: phone, mediatype: goType, mimetype: cleanMime, fileName: filename, caption, media: mediaForEvolution }, mode: 'evolution-go-classic-body' },
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

      await admin.from('evolution_messages').insert({
        user_id: user.id,
        remote_jid: `${phone}@s.whatsapp.net`,
        phone,
        direction: 'out',
        content: caption || (mediaType === 'audio' ? '🎤 Áudio' : mediaType === 'image' ? '📷 Imagem' : `📎 ${filename}`),
        message_type: mediaType,
        media_url: mediaUrl,
        media_mime: mimetype,
        status: 'sent',
        external_id: result.data?.key?.id || result.data?.messageId || null,
        raw: result.data,
      });

      return jsonResponse({ ok: true, mode, mediaUrl, data: result.data });
    }

    return jsonResponse({ error: 'action inválida' }, 400);
  } catch (e) {
    console.error('[evolution-send]', e);
    return jsonResponse({ error: String((e as Error).message || e) }, 500);
  }
});
