import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jidToPhone(jid: string) {
  return String(jid || '').split('@')[0].replace(/\D/g, '');
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
      const content =
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.imageMessage?.caption ||
        msg?.videoMessage?.caption ||
        '';
      const messageType = msg?.imageMessage ? 'image'
        : msg?.videoMessage ? 'video'
        : msg?.audioMessage ? 'audio'
        : msg?.documentMessage ? 'document'
        : 'text';

      await admin.from('evolution_messages').insert({
        user_id: settings.user_id,
        remote_jid: remoteJid,
        phone,
        contact_name: m?.pushName || null,
        direction: fromMe ? 'out' : 'in',
        content: content || `[${messageType}]`,
        message_type: messageType,
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
