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
      return new Response(JSON.stringify({ error: 'Evolution não configurada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (action === 'send' && !settings.is_enabled) {
      return new Response(JSON.stringify({ error: 'Evolution não está ativada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const baseUrl = String(settings.base_url || '').replace(/\/$/, '');
    const apiKey = settings.api_key;
    const instance = settings.instance_name;
    if (!baseUrl || !apiKey || !instance) {
      return new Response(JSON.stringify({ error: 'Configuração incompleta' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // TEST CONNECTION
    if (action === 'test') {
      const r = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
        headers: { apikey: apiKey },
      });
      const json = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, data: json }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SET WEBHOOK
    if (action === 'set-webhook') {
      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook?token=${settings.webhook_token}`;
      const r = await fetch(`${baseUrl}/webhook/set/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            events: ['MESSAGES_UPSERT'],
            byEvents: false,
            base64: false,
          },
        }),
      });
      const json = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ ok: r.ok, webhookUrl, data: json }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SEND
    if (action === 'send') {
      const phone = normalizePhone(body.phone);
      const text = String(body.text || '').trim();
      if (!phone || !text) {
        return new Response(JSON.stringify({ error: 'phone e text obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const r = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone, text }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        return new Response(JSON.stringify({ error: 'Falha ao enviar', status: r.status, data: json }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await admin.from('evolution_messages').insert({
        user_id: user.id,
        remote_jid: `${phone}@s.whatsapp.net`,
        phone,
        direction: 'out',
        content: text,
        status: 'sent',
        external_id: json?.key?.id || json?.messageId || null,
        raw: json,
      });
      return new Response(JSON.stringify({ ok: true, data: json }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'action inválida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[evolution-send]', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
