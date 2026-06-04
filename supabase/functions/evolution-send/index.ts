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
      return jsonResponse({ error: 'Evolution não configurada' }, 400);
    }
    if (action === 'send' && !settings.is_enabled) {
      return jsonResponse({ error: 'Evolution não está ativada' }, 400);
    }
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
      const classic = await fetchJson(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: evolutionHeaders(apiKey, true),
        body: JSON.stringify({ number: phone, text }),
      }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));

      let result = classic;
      let mode = 'evolution-api';
      if (!classic.ok && classic.status === 404) {
        const go = await fetchJson(`${baseUrl}/send/text`, {
          method: 'POST',
          headers: evolutionHeaders(apiKey, true),
          body: JSON.stringify({ number: phone, text }),
        }).catch((error) => ({ ok: false, status: 0, data: { error: String(error?.message || error) } }));
        result = go;
        mode = 'evolution-go';
      }

      if (!result.ok) {
        return jsonResponse({ error: 'Falha ao enviar', status: result.status, mode, data: result.data }, 502);
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

    return jsonResponse({ error: 'action inválida' }, 400);
  } catch (e) {
    console.error('[evolution-send]', e);
    return jsonResponse({ error: String((e as Error).message || e) }, 500);
  }
});
