import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jidToPhone(jid: string) {
  return String(jid || '').split('@')[0].replace(/\D/g, '');
}

function messageText(message: any) {
  return message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    '';
}

function messageType(message: any, fallback = '') {
  return message?.imageMessage ? 'image'
    : message?.videoMessage ? 'video'
    : message?.audioMessage ? 'audio'
    : message?.documentMessage ? 'document'
    : fallback || 'text';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return new Response('missing token', { status: 401, headers: corsHeaders });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: settings } = await admin
      .from('evolution_settings')
      .select('user_id, instance_name')
      .eq('webhook_token', token)
      .maybeSingle();

    if (!settings) return new Response('invalid token', { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({} as any));
    const event = body?.event || body?.type || '';
    const data = body?.data || body;

    if (event === 'Message' && data?.Info) {
      const info = data.Info;
      const remoteJid = info.Chat || '';
      if (remoteJid && !remoteJid.includes('@g.us')) {
        const phone = jidToPhone(remoteJid);
        const msg = data.Message || {};
        const type = messageType(msg, String(info.MediaType || info.Type || '').toLowerCase());
        if (phone) {
          await admin.from('evolution_messages').insert({
            user_id: settings.user_id,
            remote_jid: remoteJid,
            phone,
            contact_name: info.PushName || null,
            direction: info.IsFromMe ? 'out' : 'in',
            content: messageText(msg) || `[${type}]`,
            message_type: type,
            external_id: info.ID || null,
            status: info.IsFromMe ? 'sent' : 'received',
            raw: body,
          });
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize messages.upsert
    const msgs: any[] = Array.isArray(data?.messages) ? data.messages
      : Array.isArray(data) ? data
      : data?.key ? [data]
      : [];

    for (const m of msgs) {
      const key = m?.key || {};
      const remoteJid = key.remoteJid || m?.remoteJid || '';
      if (!remoteJid || remoteJid.includes('@g.us')) continue; // skip groups
      const phone = jidToPhone(remoteJid);
      if (!phone) continue;
      const fromMe = !!key.fromMe;
      const msg = m?.message || {};
      const content = messageText(msg);
      const type = messageType(msg);

      await admin.from('evolution_messages').insert({
        user_id: settings.user_id,
        remote_jid: remoteJid,
        phone,
        contact_name: m?.pushName || null,
        direction: fromMe ? 'out' : 'in',
        content: content || `[${type}]`,
        message_type: type,
        external_id: key.id || null,
        status: fromMe ? 'sent' : 'received',
        raw: m,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[evolution-webhook]', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
