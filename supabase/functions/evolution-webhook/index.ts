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
    message?.documentMessage?.caption ||
    '';
}

function messageType(message: any, fallback = '') {
  return message?.imageMessage ? 'image'
    : message?.videoMessage ? 'video'
    : message?.audioMessage ? 'audio'
    : message?.documentMessage ? 'document'
    : message?.stickerMessage ? 'sticker'
    : fallback || 'text';
}

function mediaUrlFrom(message: any) {
  return message?.imageMessage?.url || message?.imageMessage?.URL || message?.imageMessage?.staticURL
    || message?.videoMessage?.url || message?.videoMessage?.URL
    || message?.audioMessage?.url || message?.audioMessage?.URL
    || message?.documentMessage?.url || message?.documentMessage?.URL
    || message?.stickerMessage?.url || message?.stickerMessage?.URL
    || null;
}

function mediaMimeFrom(message: any) {
  return message?.imageMessage?.mimetype
    || message?.videoMessage?.mimetype
    || message?.audioMessage?.mimetype
    || message?.documentMessage?.mimetype
    || message?.stickerMessage?.mimetype
    || null;
}

function mediaBase64From(message: any) {
  return message?.base64 || message?.imageMessage?.base64 || message?.videoMessage?.base64 || message?.audioMessage?.base64 || message?.documentMessage?.base64 || message?.stickerMessage?.base64 || null;
}

function defaultMime(type: string) {
  if (type === 'image') return 'image/jpeg';
  if (type === 'sticker') return 'image/webp';
  if (type === 'audio') return 'audio/ogg';
  if (type === 'video') return 'video/mp4';
  return 'application/octet-stream';
}

function extensionFrom(mime: string, type: string) {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return type === 'audio' ? 'm4a' : 'mp4';
  return type === 'sticker' ? 'webp' : type;
}

async function storeIncomingMedia(admin: any, userId: string, externalId: string | null, type: string, mime: string | null, base64: string | null, fallbackUrl: string | null) {
  if (fallbackUrl) return fallbackUrl;
  if (!base64) return null;
  try {
    const clean = base64.includes(',') ? base64.split(',').pop()! : base64;
    const contentType = mime || defaultMime(type);
    const ext = extensionFrom(contentType, type);
    const path = `${userId}/incoming-${externalId || Date.now()}.${ext}`;
    const bin = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
    const { error } = await admin.storage.from('evolution-media').upload(path, bin, { contentType, upsert: true });
    if (error) return null;
    const { data } = await admin.storage.from('evolution-media').createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl || null;
  } catch (error) {
    console.error('[evolution-webhook] media storage failed', error);
    return null;
  }
}

function profilePicFrom(...items: any[]) {
  for (const item of items) {
    const url = item?.ProfilePicURL || item?.profilePictureUrl || item?.profilePicUrl || item?.profilePicture || item?.avatar || item?.picture || item?.pictureUrl;
    if (url) return url;
  }
  return null;
}

function contactPayload(userId: string, phone: string, name?: string | null, profilePicUrl?: string | null) {
  const row: Record<string, unknown> = { user_id: userId, phone, updated_at: new Date().toISOString() };
  if (name) row.name = name;
  if (profilePicUrl) row.profile_pic_url = profilePicUrl;
  return row;
}

async function insertMessageOnce(admin: any, row: Record<string, unknown>) {
  if (row.external_id) {
    const { data: existing } = await admin
      .from('evolution_messages')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('external_id', row.external_id)
      .maybeSingle();
    if (existing?.id) return;
    if (row.direction === 'out') {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: pendingOut } = await admin
        .from('evolution_messages')
        .select('id')
        .eq('user_id', row.user_id)
        .eq('phone', row.phone)
        .eq('direction', 'out')
        .eq('message_type', row.message_type)
        .is('external_id', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingOut?.id) {
        await admin.from('evolution_messages').update({
          external_id: row.external_id,
          status: row.status,
          raw: row.raw,
          media_url: row.media_url || undefined,
          media_mime: row.media_mime || undefined,
        }).eq('id', pendingOut.id);
        return;
      }
    }
  }
  const { error } = await admin.from('evolution_messages').insert(row);
  if (error && error.code !== '23505') console.error('[evolution-webhook] insert failed', error);
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

    // Resolve which instance this event belongs to (Evolution Go + classic variants)
    const instanceName: string | null =
      data?.Info?.Instance || data?.instance || data?.instanceName ||
      body?.instance || body?.instanceName || body?.instanceId ||
      data?.instanceId || settings.instance_name || null;

    // Evolution Go "Message" event format
    if (event === 'Message' && data?.Info) {
      const info = data.Info;
      const remoteJid = info.Chat || '';
      if (remoteJid && !remoteJid.includes('@g.us')) {
        const phone = jidToPhone(remoteJid);
        const msg = data.Message || {};
        const type = messageType(msg, String(info.MediaType || info.Type || '').toLowerCase());
        const mediaMime = mediaMimeFrom(msg);
        const mediaUrl = await storeIncomingMedia(admin, settings.user_id, info.ID || null, type, mediaMime, mediaBase64From(data) || mediaBase64From(msg), mediaUrlFrom(msg));
        if (phone) {
          await insertMessageOnce(admin, {
            user_id: settings.user_id,
            instance_name: instanceName,
            remote_jid: remoteJid,
            phone,
            contact_name: info.PushName || null,
            direction: info.IsFromMe ? 'out' : 'in',
            content: messageText(msg) || `[${type}]`,
            message_type: type,
            media_url: mediaUrl,
            media_mime: mediaMime,
            external_id: info.ID || null,
            status: info.IsFromMe ? 'sent' : 'received',
            raw: body,
          });
          const profilePicUrl = profilePicFrom(info, data, body);
          if (info.PushName || profilePicUrl) {
            await admin.from('evolution_contacts').upsert(
              contactPayload(settings.user_id, phone, info.PushName, profilePicUrl),
              { onConflict: 'user_id,phone' }
            );
          }
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize messages.upsert from classic Evolution API
    const msgs: any[] = Array.isArray(data?.messages) ? data.messages
      : Array.isArray(data) ? data
      : data?.key ? [data]
      : [];

    for (const m of msgs) {
      const key = m?.key || {};
      const remoteJid = key.remoteJid || m?.remoteJid || '';
      if (!remoteJid || remoteJid.includes('@g.us')) continue;
      const phone = jidToPhone(remoteJid);
      if (!phone) continue;
      const fromMe = !!key.fromMe;
      const msg = m?.message || {};
      const content = messageText(msg);
      const type = messageType(msg);
      const mediaMime = mediaMimeFrom(msg);
      const mediaUrl = await storeIncomingMedia(admin, settings.user_id, key.id || null, type, mediaMime, mediaBase64From(m) || mediaBase64From(msg), mediaUrlFrom(msg));

      await insertMessageOnce(admin, {
        user_id: settings.user_id,
        instance_name: instanceName,
        remote_jid: remoteJid,
        phone,
        contact_name: m?.pushName || null,
        direction: fromMe ? 'out' : 'in',
        content: content || `[${type}]`,
        message_type: type,
        media_url: mediaUrl,
        media_mime: mediaMime,
        external_id: key.id || null,
        status: fromMe ? 'sent' : 'received',
        raw: m,
      });
      const profilePicUrl = profilePicFrom(m, m?.message, m?.contact, body);
      if (m?.pushName || profilePicUrl) {
        await admin.from('evolution_contacts').upsert(
          contactPayload(settings.user_id, phone, m?.pushName, profilePicUrl),
          { onConflict: 'user_id,phone' }
        );
      }
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
