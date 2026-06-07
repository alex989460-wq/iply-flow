// Auto-attendance: receives an incoming message via internal call from
// evolution-webhook, generates an AI reply using Lovable AI Gateway and
// sends it back through the Evolution Go panel.

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
  // crosses midnight
  return cur >= s || cur < e;
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

    // 1. Load settings
    const { data: settings } = await admin
      .from('evolution_settings')
      .select('user_id, base_url, api_key, instance_name, autoreply_enabled, autoreply_system_prompt, autoreply_only_outside_hours, autoreply_business_start, autoreply_business_end, autoreply_disabled_phones, autoreply_model')
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

    // 2. Anti-loop: if last outgoing message to this phone was very recent (< 20s) skip,
    // and if the human already replied after the incoming, skip.
    const { data: recent } = await admin
      .from('evolution_messages')
      .select('id, direction, content, created_at, message_type')
      .eq('user_id', user_id)
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(20);

    const lastOut = recent?.find((m) => m.direction === 'out');
    if (lastOut && Date.now() - new Date(lastOut.created_at).getTime() < 20000) {
      return new Response(JSON.stringify({ ok: true, skipped: 'cooldown' }), { status: 200, headers: corsHeaders });
    }
    // If a human reply (out) happened after the last incoming, don't auto-answer
    const lastIn = recent?.find((m) => m.direction === 'in');
    if (lastIn && lastOut && new Date(lastOut.created_at).getTime() > new Date(lastIn.created_at).getTime()) {
      return new Response(JSON.stringify({ ok: true, skipped: 'human_replied' }), { status: 200, headers: corsHeaders });
    }

    // 3. Build chat history (oldest first)
    const history = (recent || []).slice().reverse()
      .filter((m) => m.message_type === 'text' || m.message_type === 'image' || m.message_type === 'audio' || m.message_type === 'document')
      .slice(-12)
      .map((m) => ({
        role: m.direction === 'out' ? 'assistant' : 'user',
        content: m.content || (m.message_type !== 'text' ? `[${m.message_type}]` : ''),
      }));

    // Ensure the just-arrived message is the last user turn
    if (incomingContent && (history.length === 0 || history[history.length - 1]?.role !== 'user' || history[history.length - 1]?.content !== incomingContent)) {
      history.push({ role: 'user', content: incomingContent });
    }

    // 4. Call Lovable AI
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      console.error('[evolution-autoreply] missing LOVABLE_API_KEY');
      return new Response(JSON.stringify({ error: 'missing LOVABLE_API_KEY' }), { status: 500, headers: corsHeaders });
    }

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: settings.autoreply_model || 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: settings.autoreply_system_prompt },
          ...history,
        ],
      }),
    });

    if (aiResp.status === 429) {
      console.error('[evolution-autoreply] rate limited');
      return new Response(JSON.stringify({ error: 'rate_limit' }), { status: 200, headers: corsHeaders });
    }
    if (aiResp.status === 402) {
      console.error('[evolution-autoreply] credits exhausted');
      return new Response(JSON.stringify({ error: 'credits' }), { status: 200, headers: corsHeaders });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('[evolution-autoreply] AI failure', aiResp.status, t);
      return new Response(JSON.stringify({ error: 'ai_failed', status: aiResp.status }), { status: 200, headers: corsHeaders });
    }

    const aiJson = await aiResp.json();
    const replyText = String(aiJson?.choices?.[0]?.message?.content || '').trim();
    if (!replyText) {
      return new Response(JSON.stringify({ ok: true, skipped: 'empty_ai_reply' }), { status: 200, headers: corsHeaders });
    }

    // 5. Send via Evolution
    const baseUrl = (settings.base_url || '').replace(/\/+$/, '');
    const evoKey = settings.api_key || '';
    const instance = settings.instance_name || '';
    if (!baseUrl || !evoKey) {
      console.error('[evolution-autoreply] missing evolution credentials');
      return new Response(JSON.stringify({ ok: true, skipped: 'no_evolution_creds' }), { status: 200, headers: corsHeaders });
    }

    const target = `${phone}@s.whatsapp.net`;
    const sendAttempts = [
      { url: `${baseUrl}/send/text`, body: { number: target, text: replyText } },
      { url: `${baseUrl}/send/text`, body: { number: phone, text: replyText } },
      { url: `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, body: { number: phone, text: replyText } },
    ];
    let sendOk = false;
    let sendData: any = null;
    for (const att of sendAttempts) {
      try {
        const r = await fetch(att.url, {
          method: 'POST',
          headers: {
            apikey: evoKey,
            Authorization: `Bearer ${evoKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(att.body),
        });
        sendData = await r.json().catch(() => ({}));
        if (r.ok) { sendOk = true; break; }
      } catch (e) {
        console.error('[evolution-autoreply] send attempt failed', e);
      }
    }

    if (!sendOk) {
      console.error('[evolution-autoreply] all send attempts failed', sendData);
      return new Response(JSON.stringify({ ok: false, error: 'send_failed' }), { status: 200, headers: corsHeaders });
    }

    // 6. Insert outgoing message so it shows up in the UI immediately
    const externalId = sendData?.key?.id || sendData?.messageId || sendData?.data?.Info?.ID || `auto-${crypto.randomUUID()}`;
    await admin.from('evolution_messages').insert({
      user_id,
      instance_name: instance,
      remote_jid: target,
      phone,
      direction: 'out',
      content: replyText,
      message_type: 'text',
      status: 'sent',
      external_id: externalId,
      raw: { ...sendData, __autoreply: true },
    });

    return new Response(JSON.stringify({ ok: true, replied: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[evolution-autoreply]', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 200, headers: corsHeaders,
    });
  }
});
