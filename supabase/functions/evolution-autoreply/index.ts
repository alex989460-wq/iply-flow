// Auto-attendance with intent classification + knowledge base.
// 1. Loads user's KB entries (categories: renovacao, instalar_app, pagamento, suporte, outros).
// 2. Asks Lovable AI to classify the incoming message and pick a KB entry (or none).
// 3. Replies using the matched KB response_template. If the matched entry has
//    requires_human=true OR no good match was found, marks evolution_contacts.needs_human=true
//    and DOES NOT send any reply (so the human sees it in the "Suporte" tab).

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

// Cheap keyword-first pass — returns a matched KB entry without spending AI credits.
function matchByKeywords(content: string, kb: KbEntry[]): KbEntry | null {
  const text = content.toLowerCase();
  for (const e of kb) {
    if (!e.keywords?.length) continue;
    for (const kw of e.keywords) {
      const k = String(kw || '').trim().toLowerCase();
      if (k && text.includes(k)) return e;
    }
  }
  return null;
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

    // Anti-loop
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
      if (!baseUrl || !evoKey) return { sent: false, error: 'no_evolution_creds' };

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
            headers: { apikey: evoKey, Authorization: `Bearer ${evoKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(att.body),
          });
          sendData = await r.json().catch(() => ({}));
          if (r.ok) { sendOk = true; break; }
        } catch (e) {
          console.error('[autoreply] send attempt failed', e);
        }
      }
      if (!sendOk) return { sent: false, error: 'send_failed', sendData };

      const externalId = sendData?.key?.id || sendData?.messageId || sendData?.data?.Info?.ID || `auto-${crypto.randomUUID()}`;
      await admin.from('evolution_messages').insert({
        user_id, instance_name: instance, remote_jid: target, phone,
        direction: 'out', content: replyText, message_type: 'text', status: 'sent',
        external_id: externalId, raw: { ...sendData, __autoreply: true, __kb: kbId, __category: category },
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

    // PASS 1 — keyword shortcut (free, fast)
    const kwMatch = matchByKeywords(incomingContent, kb);
    if (kwMatch) {
      if (kwMatch.requires_human) {
        await flagHuman(kwMatch.category);
        return new Response(JSON.stringify({ ok: true, flagged_human: true, via: 'keyword', category: kwMatch.category }), { status: 200, headers: corsHeaders });
      }
      const r = await sendReply(kwMatch.response_template, kwMatch.category, kwMatch.id);
      return new Response(JSON.stringify({ ok: true, replied: r.sent, via: 'keyword', category: kwMatch.category }), { status: 200, headers: corsHeaders });
    }

    // PASS 2 — AI classification (only if no keyword matched and there's KB to choose from)
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      console.error('[autoreply] missing LOVABLE_API_KEY');
      await flagHuman(null);
      return new Response(JSON.stringify({ ok: true, flagged_human: true, reason: 'no_api_key' }), { status: 200, headers: corsHeaders });
    }

    const history = (recent || []).slice().reverse()
      .filter((m) => m.message_type === 'text')
      .slice(-6)
      .map((m) => ({ role: m.direction === 'out' ? 'assistant' : 'user', content: m.content || '' }));
    if (incomingContent && (history.length === 0 || history[history.length - 1]?.content !== incomingContent)) {
      history.push({ role: 'user', content: incomingContent });
    }

    const kbForPrompt = kb.map((e) => ({
      id: e.id, title: e.title, category: e.category,
      keywords: e.keywords?.slice(0, 10) || [],
      requires_human: e.requires_human,
      preview: (e.response_template || '').slice(0, 200),
    }));

    const systemPrompt = `${settings.autoreply_system_prompt || ''}

Você é um classificador de mensagens de clientes IPTV.
Categorias possíveis: "renovacao", "instalar_app", "pagamento", "suporte", "outros".

REGRAS:
- Se a mensagem combinar com algum item da base de conhecimento abaixo, retorne o id desse item em "kb_id".
- Se a pessoa pediu suporte humano (problema técnico, reclamação, dúvida que não está na base), retorne "needs_human": true e NÃO escolha nenhum kb_id.
- Se não tem certeza, prefira marcar "needs_human": true.
- Responda APENAS com JSON válido no formato:
{"category": "<uma das categorias>", "kb_id": "<id ou null>", "needs_human": <true|false>, "reason": "<curto>"}

BASE DE CONHECIMENTO DISPONÍVEL:
${JSON.stringify(kbForPrompt, null, 2)}
`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: settings.autoreply_model || 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      console.error('[autoreply] AI gateway', aiResp.status);
      await flagHuman(null);
      return new Response(JSON.stringify({ ok: true, flagged_human: true, reason: 'ai_limit' }), { status: 200, headers: corsHeaders });
    }
    if (!aiResp.ok) {
      console.error('[autoreply] AI failure', aiResp.status, await aiResp.text());
      await flagHuman(null);
      return new Response(JSON.stringify({ ok: true, flagged_human: true, reason: 'ai_error' }), { status: 200, headers: corsHeaders });
    }

    const aiJson = await aiResp.json();
    const rawContent = String(aiJson?.choices?.[0]?.message?.content || '').trim();
    let parsed: { category?: string; kb_id?: string | null; needs_human?: boolean; reason?: string } = {};
    try {
      // strip code fences if present
      const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[autoreply] parse failed', rawContent);
      await flagHuman(null);
      return new Response(JSON.stringify({ ok: true, flagged_human: true, reason: 'parse_failed' }), { status: 200, headers: corsHeaders });
    }

    const category = String(parsed.category || 'outros');
    const matched = parsed.kb_id ? kb.find((e) => e.id === parsed.kb_id) : null;

    if (parsed.needs_human || (!matched)) {
      await flagHuman(category);
      return new Response(JSON.stringify({ ok: true, flagged_human: true, via: 'ai', category, reason: parsed.reason }), { status: 200, headers: corsHeaders });
    }

    if (matched.requires_human) {
      await flagHuman(matched.category);
      return new Response(JSON.stringify({ ok: true, flagged_human: true, via: 'ai_kb', category: matched.category }), { status: 200, headers: corsHeaders });
    }

    const r = await sendReply(matched.response_template, matched.category, matched.id);
    return new Response(JSON.stringify({ ok: true, replied: r.sent, via: 'ai_kb', category: matched.category }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error('[evolution-autoreply]', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 200, headers: corsHeaders });
  }
});
