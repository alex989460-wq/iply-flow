import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jidToPhone(jid: string) {
  const raw = String(jid || '').split('@')[0];
  if (raw === 'status') return 'status';
  return raw.replace(/\D/g, '');
}

function unwrapMessage(message: any): any {
  return message?.ephemeralMessage?.message
    || message?.viewOnceMessage?.message
    || message?.viewOnceMessageV2?.message
    || message?.documentWithCaptionMessage?.message
    || message?.editedMessage?.message
    || message;
}

function parseVcardSummary(vcard: string): { name: string; phones: string[] } {
  const text = String(vcard || '');
  const fnMatch = text.match(/(?:^|\n)FN[^:]*:(.+)/i);
  const name = fnMatch ? fnMatch[1].trim() : '';
  const phones: string[] = [];
  const telRegex = /(?:^|\n)TEL[^:]*:([^\r\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = telRegex.exec(text)) !== null) {
    const digits = m[1].replace(/[^\d+]/g, '');
    if (digits) phones.push(digits);
  }
  return { name, phones };
}

function summarizeContacts(msg: any): string {
  const list: Array<{ vcard?: string; displayName?: string }> = [];
  if (msg?.contactMessage) list.push(msg.contactMessage);
  if (Array.isArray(msg?.contactsArrayMessage?.contacts)) list.push(...msg.contactsArrayMessage.contacts);
  if (!list.length) return '';
  const parts = list.map(c => {
    const v = parseVcardSummary(c?.vcard || '');
    const name = v.name || c?.displayName || 'Contato';
    const phones = v.phones.join(', ');
    return `👤 ${name}${phones ? `\n📞 ${phones}` : ''}`;
  });
  return parts.join('\n\n');
}

function summarizeLocation(msg: any): string {
  const loc = msg?.locationMessage || msg?.liveLocationMessage;
  if (!loc) return '';
  const lat = loc.degreesLatitude ?? loc.latitude;
  const lng = loc.degreesLongitude ?? loc.longitude;
  const name = loc.name || loc.address || '';
  const coords = (lat != null && lng != null) ? `${lat}, ${lng}` : '';
  return `📍 Localização${name ? `: ${name}` : ''}${coords ? `\n${coords}` : ''}`;
}

function messageText(message: any) {
  const msg = unwrapMessage(message);
  const contacts = summarizeContacts(msg);
  if (contacts) return contacts;
  const location = summarizeLocation(msg);
  if (location) return location;
  return msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.documentMessage?.caption ||
    msg?.buttonsResponseMessage?.selectedDisplayText ||
    msg?.listResponseMessage?.title ||
    msg?.templateButtonReplyMessage?.selectedDisplayText ||
    (msg?.audioMessage ? '🎤 Áudio' : '') ||
    '';
}

function messageType(message: any, fallback = '') {
  const msg = unwrapMessage(message);
  if (msg?.reactionMessage) return 'reaction';
  if (msg?.contactMessage || msg?.contactsArrayMessage) return 'contact';
  if (msg?.locationMessage || msg?.liveLocationMessage) return 'location';
  return msg?.imageMessage ? 'image'
    : msg?.videoMessage ? 'video'
    : msg?.audioMessage ? 'audio'
    : msg?.documentMessage ? 'document'
    : msg?.stickerMessage ? 'sticker'
    : fallback || 'text';
}

function isProtocolOnlyMessage(message: any) {
  const msg = unwrapMessage(message) || {};
  return !messageText(msg) && !!(msg.protocolMessage || msg.messageContextInfo || msg.senderKeyDistributionMessage);
}

function extractQuoted(message: any) {
  const ctx = message?.extendedTextMessage?.contextInfo
    || message?.imageMessage?.contextInfo
    || message?.videoMessage?.contextInfo
    || message?.audioMessage?.contextInfo
    || message?.documentMessage?.contextInfo
    || message?.stickerMessage?.contextInfo
    || message?.contextInfo;
  if (!ctx?.stanzaId && !ctx?.quotedMessage) return null;
  const qm = ctx?.quotedMessage || {};
  const text = qm?.conversation
    || qm?.extendedTextMessage?.text
    || qm?.imageMessage?.caption
    || qm?.videoMessage?.caption
    || qm?.documentMessage?.caption
    || (qm?.audioMessage ? '🎤 Áudio' : '')
    || (qm?.imageMessage ? '📷 Imagem' : '')
    || (qm?.stickerMessage ? '🌟 Sticker' : '')
    || (qm?.documentMessage ? '📎 Documento' : '')
    || '';
  return {
    id: ctx?.stanzaId || ctx?.StanzaID || null,
    participant: ctx?.participant || null,
    text,
  };
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

function mimeFromFileName(name: string | null): string | null {
  if (!name) return null;
  const ext = String(name).toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', csv: 'text/csv', zip: 'application/zip', rar: 'application/vnd.rar',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  };
  return map[ext] || null;
}

function docFileName(message: any): string | null {
  return message?.documentMessage?.fileName || message?.documentMessage?.FileName || message?.documentMessage?.title || null;
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

function isUsableMediaUrl(url: string | null) {
  if (!url) return false;
  // WhatsApp's mmg/mms URLs are encrypted and can't be loaded directly
  if (/mmg\.whatsapp\.net|mms\.whatsapp\.net|whatsapp\.net\/.+\.enc/i.test(url)) return false;
  return /^https?:\/\//i.test(url) || url.startsWith('data:');
}

async function storeIncomingMedia(admin: any, userId: string, externalId: string | null, type: string, mime: string | null, base64: string | null, fallbackUrl: string | null) {
  // Prefer uploading base64 to storage — WhatsApp's raw media URLs are encrypted and won't render
  if (base64) {
    try {
      const clean = base64.includes(',') ? base64.split(',').pop()! : base64;
      const contentType = mime || defaultMime(type);
      const ext = extensionFrom(contentType, type);
      const path = `${userId}/incoming-${externalId || Date.now()}.${ext}`;
      const bin = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
      const { error } = await admin.storage.from('evolution-media').upload(path, bin, { contentType, upsert: true });
      if (!error) {
        const { data } = await admin.storage.from('evolution-media').createSignedUrl(path, 60 * 60 * 24 * 365);
        if (data?.signedUrl) return data.signedUrl;
      } else {
        console.error('[evolution-webhook] media storage upload failed', error);
      }
    } catch (error) {
      console.error('[evolution-webhook] media storage failed', error);
    }
  }
  if (isUsableMediaUrl(fallbackUrl)) return fallbackUrl;
  return null;
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

function bestConversationPhone(info: any, remoteJid: string) {
  const candidates = info?.IsFromMe
    ? [info?.RecipientAlt, info?.TargetJID, info?.TargetID, info?.Chat]
    : [info?.Sender, info?.Chat, info?.SenderAlt];
  for (const candidate of candidates) {
    const raw = String(candidate || '');
    if (/@lid\b/i.test(raw)) continue;
    const phone = jidToPhone(raw);
    if (phone && phone.length >= 10) return phone;
  }
  for (const candidate of candidates) {
    const phone = jidToPhone(String(candidate || ''));
    if (phone && phone.length >= 10) return phone;
  }
  return jidToPhone(remoteJid);
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
          instance_name: row.instance_name || undefined,
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

// Fire the auto-reply edge function in the background (no await on caller side).
function fireAutoReply(userId: string, phone: string, content: string) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const p = fetch(`${supabaseUrl}/functions/v1/evolution-autoreply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        'x-internal-token': serviceRole,
      },
      body: JSON.stringify({ user_id: userId, phone, content }),
    }).then((r) => r.text()).catch((e) => {
      console.error('[evolution-webhook] autoreply fetch failed', e);
    });
    // Keep the function alive until the autoreply completes
    // @ts-ignore — EdgeRuntime is available in Supabase Edge runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(p);
    }
  } catch (e) {
    console.error('[evolution-webhook] fireAutoReply error', e);
  }
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
      .select('user_id, instance_name, autoreply_enabled')
      .eq('webhook_token', token)
      .maybeSingle();

    if (!settings) return new Response('invalid token', { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({} as any));
    const event = body?.event || body?.type || '';
    const data = body?.data || body;

    // Resolve which instance this event belongs to (Evolution Go + classic variants)
    const instanceName: string | null =
      data?.Info?.Instance || data?.instance || data?.instanceName ||
      body?.instance || body?.instanceName ||
      data?.instanceId || body?.instanceId || settings.instance_name || null;

    // Presence (digitando…, online, visto por último) — Evolution Go: 'PresenceUpdate' / classic: 'presence.update'
    {
      const lower = String(event).toLowerCase();
      if (lower.includes('presence')) {
        const presData = (data?.presences || data?.Presences || {}) as Record<string, any>;
        let chatJid: string = String(data?.id || data?.Chat || data?.chat || data?.From || data?.JID || '');
        let presence: string = String(data?.Presence || data?.presence || data?.lastKnownPresence || '');
        let lastSeenRaw: any = data?.LastSeen || data?.lastSeen || data?.last_seen || null;
        if (!presence && presData && typeof presData === 'object') {
          for (const k of Object.keys(presData)) {
            const v = presData[k] || {};
            const p = v?.lastKnownPresence || v?.presence;
            if (p) { presence = String(p); if (!chatJid) chatJid = k; if (!lastSeenRaw) lastSeenRaw = v?.lastSeen || v?.LastSeen; break; }
          }
        }
        const phone = jidToPhone(chatJid);
        if (phone && presence) {
          const lower2 = presence.toLowerCase();
          const normalized = /compos|typing/.test(lower2) ? 'composing'
            : /record|audio/.test(lower2) ? 'recording'
            : /paus/.test(lower2) ? 'paused'
            : /unavail|offline/.test(lower2) ? 'unavailable'
            : /avail|online/.test(lower2) ? 'available'
            : lower2;
          let lastSeenAt: string | null = null;
          if (lastSeenRaw) {
            const n = Number(lastSeenRaw);
            if (Number.isFinite(n) && n > 0) lastSeenAt = new Date(n < 1e12 ? n * 1000 : n).toISOString();
            else if (typeof lastSeenRaw === 'string') lastSeenAt = lastSeenRaw;
          }
          if (normalized === 'available') lastSeenAt = new Date().toISOString();
          const row: Record<string, unknown> = {
            user_id: settings.user_id,
            phone,
            presence: normalized,
            updated_at: new Date().toISOString(),
          };
          if (lastSeenAt) row.last_seen_at = lastSeenAt;
          await admin.from('evolution_presence').upsert(row, { onConflict: 'user_id,phone' });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Message receipts (✓✓ blue) — Evolution Go: 'MessageReceipt'/'Receipt' / classic: 'messages.update'
      if (lower.includes('receipt') || lower === 'messages.update' || lower === 'message.update' || lower === 'messages.update'.toLowerCase()) {
        // Possible shapes:
        // Go: { Type: 'read'|'delivered', MessageIDs: [...], Sender, Chat }
        // Classic: [{ key:{id}, update:{ status:'READ'|'DELIVERED'|3|4 } }]
        const receiptType = String(data?.Type || data?.type || data?.receiptType || '').toLowerCase();
        const ids: string[] = [];
        if (Array.isArray(data?.MessageIDs)) ids.push(...data.MessageIDs.map(String));
        if (Array.isArray(data?.messageIds)) ids.push(...data.messageIds.map(String));
        if (Array.isArray(data?.ids)) ids.push(...data.ids.map(String));
        if (data?.MessageID) ids.push(String(data.MessageID));
        if (data?.id) ids.push(String(data.id));
        const updates: Array<{ id: string; status: string }> = [];
        const items = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : Array.isArray(data?.updates) ? data.updates : [];
        for (const it of items) {
          const id = it?.key?.id || it?.id || it?.messageId;
          const st = String(it?.update?.status ?? it?.status ?? '').toLowerCase();
          if (!id) continue;
          let mapped = '';
          if (st === 'read' || st === '4' || st === 'played' || st === '5') mapped = 'read';
          else if (st === 'delivered' || st === '3') mapped = 'delivered';
          else if (st === 'sent' || st === '2') mapped = 'sent';
          if (mapped) updates.push({ id: String(id), status: mapped });
        }
        if (ids.length) {
          const mapped = /read|played/.test(receiptType) ? 'read'
            : /deliver/.test(receiptType) ? 'delivered'
            : '';
          if (mapped) for (const id of ids) updates.push({ id, status: mapped });
        }
        const receiptPhone = jidToPhone(String(data?.Chat || data?.chat || data?.Sender || data?.sender || data?.remoteJid || data?.key?.remoteJid || ''));
        // Apply: only upgrade status (don't downgrade)
        const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
        for (const u of updates) {
          const { data: existing } = await admin
            .from('evolution_messages')
            .select('id,status')
            .eq('user_id', settings.user_id)
            .eq('external_id', u.id)
            .maybeSingle();
          if (!existing) continue;
          if ((rank[u.status] || 0) > (rank[existing.status as string] || 0)) {
            await admin.from('evolution_messages').update({ status: u.status }).eq('id', existing.id);
          }
        }
        if (!updates.length && receiptPhone && /read|played/.test(receiptType)) {
          await admin
            .from('evolution_messages')
            .update({ status: 'read' })
            .eq('user_id', settings.user_id)
            .eq('phone', receiptPhone)
            .eq('direction', 'in')
            .neq('status', 'read');
        }
        return new Response(JSON.stringify({ ok: true, updates: updates.length }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    // Evolution Go "Message" event format
    if (event === 'Message' && data?.Info) {
      const info = data.Info;
      const remoteJid = info.Chat || '';
      const isStatus = remoteJid === 'status@broadcast' || remoteJid.startsWith('status@');
      if (remoteJid && (!remoteJid.includes('@g.us') || isStatus)) {
        // For status events: use the participant's phone so we can group per-contact
        const participantJid = info.Sender || info.Participant || info.SenderJID || info.SenderJid || '';
        const participantPhone = participantJid ? jidToPhone(participantJid) : '';
        const phone = isStatus
          ? (info.IsFromMe ? 'status:me' : (participantPhone ? `status:${participantPhone}` : 'status:unknown'))
          : bestConversationPhone(info, remoteJid);
        const msg = data.Message || {};
        if (isProtocolOnlyMessage(msg)) {
          return new Response(JSON.stringify({ ok: true, skipped: 'protocol-message' }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const type = messageType(msg, String(info.MediaType || info.Type || '').toLowerCase());
        const mediaMime = mediaMimeFrom(msg) || (type === 'document' ? mimeFromFileName(docFileName(msg)) : null);
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
            raw: isStatus ? { ...body, __participantPhone: participantPhone, __participantJid: participantJid } : body,
          });
          // Also upsert contact entry for the participant so avatar/name shows
          if (isStatus && participantPhone) {
            const profilePicUrl = profilePicFrom(info, data, body);
            if (info.PushName || profilePicUrl) {
              await admin.from('evolution_contacts').upsert(
                contactPayload(settings.user_id, participantPhone, info.PushName, profilePicUrl),
                { onConflict: 'user_id,phone' }
              );
            }
          } else {
            const profilePicUrl = profilePicFrom(info, data, body);
            if (info.PushName || profilePicUrl) {
              await admin.from('evolution_contacts').upsert(
                contactPayload(settings.user_id, phone, info.PushName, profilePicUrl),
                { onConflict: 'user_id,phone' }
              );
            }
          }
          // Trigger AI auto-reply for direct, non-status, non-group, non-channel incoming TEXT
          if (settings.autoreply_enabled && !info.IsFromMe && !isStatus && phone && phone.length <= 14 && type === 'text') {
            const content = messageText(msg) || '';
            if (content) fireAutoReply(settings.user_id, phone, content);
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
      const isStatus = remoteJid === 'status@broadcast' || remoteJid.startsWith('status@');
      if (!remoteJid || (remoteJid.includes('@g.us') && !isStatus)) continue;
      const fromMe = !!key.fromMe;
      const participantJid = key?.participant || m?.participant || '';
      const participantPhone = participantJid ? jidToPhone(participantJid) : '';
      const phone = isStatus
        ? (fromMe ? 'status:me' : (participantPhone ? `status:${participantPhone}` : 'status:unknown'))
        : jidToPhone(remoteJid);
      if (!phone) continue;
      const msg = m?.message || {};
      if (isProtocolOnlyMessage(msg)) continue;
      const content = messageText(msg);
      const type = messageType(msg);
      const mediaMime = mediaMimeFrom(msg) || (type === 'document' ? mimeFromFileName(docFileName(msg)) : null);
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
        raw: isStatus ? { ...m, __participantPhone: participantPhone, __participantJid: participantJid } : m,
      });
      const profilePicUrl = profilePicFrom(m, m?.message, m?.contact, body);
      const contactKey = isStatus && participantPhone ? participantPhone : phone;
      if (m?.pushName || profilePicUrl) {
        await admin.from('evolution_contacts').upsert(
          contactPayload(settings.user_id, contactKey, m?.pushName, profilePicUrl),
          { onConflict: 'user_id,phone' }
        );
      }
      // Trigger AI auto-reply for direct, non-status, non-group, non-channel incoming TEXT
      if (settings.autoreply_enabled && !fromMe && !isStatus && phone && phone.length <= 14 && type === 'text' && content) {
        fireAutoReply(settings.user_id, phone, content);
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
