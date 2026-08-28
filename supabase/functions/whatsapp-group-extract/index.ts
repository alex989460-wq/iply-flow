import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-extract-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function digits(value: unknown) {
  return String(value ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function inviteCodeFrom(link: string) {
  const raw = String(link || '').trim();
  const m = raw.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
  return '';
}

async function evoFetch(base: string, path: string, apiKey: string, init: RequestInit = {}) {
  const url = `${base.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body.action || '');

    // ---- Auth: JWT (painel) ou token da extensão -------------------------
    let userId = '';
    const extToken = req.headers.get('x-extract-token') || body.token || '';
    if (extToken) {
      const { data: row } = await admin
        .from('whatsapp_extract_tokens')
        .select('user_id')
        .eq('token', extToken)
        .maybeSingle();
      if (!row) return json({ error: 'token inválido' }, 401);
      userId = row.user_id;
    } else {
      const authHeader = req.headers.get('Authorization') || '';
      if (!authHeader) return json({ error: 'unauthorized' }, 401);
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
      );
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user) return json({ error: 'unauthorized' }, 401);
      userId = user.id;
    }

    // Ferramenta restrita a administradores.
    const { data: isAdminRow } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!isAdminRow) return json({ error: 'Apenas administradores podem usar esta ferramenta' }, 403);

    // ---- Token da extensão ----------------------------------------------
    if (action === 'get-token') {
      let { data: row } = await admin
        .from('whatsapp_extract_tokens')
        .select('token')
        .eq('user_id', userId)
        .maybeSingle();
      if (!row) {
        const { data: created, error } = await admin
          .from('whatsapp_extract_tokens')
          .insert({ user_id: userId })
          .select('token')
          .single();
        if (error) return json({ error: error.message }, 500);
        row = created;
      }
      return json({ token: row!.token });
    }

    // ---- Importação vinda da extensão do WhatsApp Web --------------------
    if (action === 'import') {
      const groupName = String(body.group_name || '').slice(0, 200) || null;
      const groupJid = String(body.group_jid || groupName || 'web').slice(0, 200);
      const contacts: any[] = Array.isArray(body.contacts) ? body.contacts : [];
      const dedup = new Map<string, any>();
      for (const c of contacts) {
        const phone = digits(c?.phone || c?.number || c);
        if (phone.length < 10 || phone.length > 15) continue;
        const name = c?.name ? String(c.name).slice(0, 200) : null;
        const prev = dedup.get(phone);
        if (prev && !name) continue;
        dedup.set(phone, {
          user_id: userId,
          group_jid: groupJid,
          group_name: groupName,
          phone,
          name: name || prev?.name || null,
          source: 'extension',
        });
      }
      const rows = Array.from(dedup.values());
      if (!rows.length) return json({ imported: 0, message: 'Nenhum telefone válido recebido' });
      const { error } = await admin
        .from('whatsapp_group_contacts')
        .upsert(rows, { onConflict: 'user_id,group_jid,phone', ignoreDuplicates: true });
      if (error) return json({ error: error.message }, 500);
      return json({ imported: rows.length });

    }

    // ---- Ações que exigem Evolution --------------------------------------
    const { data: settings } = await admin
      .from('evolution_settings')
      .select('base_url, api_key, instance_name')
      .eq('user_id', userId)
      .maybeSingle();
    const baseUrl = settings?.base_url || '';
    const apiKey = settings?.api_key || '';
    const instance = String(body.instance || settings?.instance_name || '');
    if (!baseUrl || !apiKey || !instance) {
      return json({ error: 'Evolution API não configurada (URL, chave e instância).' }, 400);
    }

    if (action === 'join') {
      const code = inviteCodeFrom(body.invite || '');
      if (!code) return json({ error: 'Link de convite inválido' }, 400);
      const info = await evoFetch(baseUrl, `/group/inviteInfo/${encodeURIComponent(instance)}?inviteCode=${code}`, apiKey);
      const joined = await evoFetch(baseUrl, `/group/acceptInviteCode/${encodeURIComponent(instance)}?inviteCode=${code}`, apiKey);
      const groupJid = joined.body?.groupJid || joined.body?.id || info.body?.id || null;
      if (!joined.ok && !groupJid) {
        return json({ error: 'Falha ao entrar no grupo', detail: joined.body }, 200);
      }
      return json({ ok: true, group_jid: groupJid, group_name: info.body?.subject || null });
    }

    if (action === 'groups') {
      const res = await evoFetch(baseUrl, `/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`, apiKey);
      if (!res.ok) return json({ error: 'Falha ao listar grupos', detail: res.body }, 200);
      const list = Array.isArray(res.body) ? res.body : (res.body?.groups || []);
      return json({
        groups: list.map((g: any) => ({
          id: g?.id,
          subject: g?.subject || g?.name || g?.id,
          size: g?.size ?? g?.participants?.length ?? null,
        })).filter((g: any) => g.id),
      });
    }

    if (action === 'extract') {
      const groupJid = String(body.group_jid || '');
      if (!groupJid) return json({ error: 'Grupo não informado' }, 400);
      const res = await evoFetch(baseUrl, `/group/participants/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`, apiKey);
      if (!res.ok) return json({ error: 'Falha ao extrair participantes', detail: res.body }, 200);
      const participants: any[] = res.body?.participants || res.body?.data?.participants || (Array.isArray(res.body) ? res.body : []);
      const rows = participants
        .map((p: any) => ({
          user_id: userId,
          group_jid: groupJid,
          group_name: String(body.group_name || '').slice(0, 200) || null,
          phone: digits(p?.id || p?.jid || p),
          name: p?.name || p?.pushName || null,
          is_admin_member: !!p?.admin,
          source: 'evolution',
        }))
        .filter((r) => r.phone.length >= 10);
      if (rows.length) {
        const { error } = await admin
          .from('whatsapp_group_contacts')
          .upsert(rows, { onConflict: 'user_id,group_jid,phone', ignoreDuplicates: true });
        if (error) return json({ error: error.message }, 500);
      }
      return json({ extracted: rows.length });
    }

    return json({ error: 'ação desconhecida' }, 400);
  } catch (e) {
    console.error('[whatsapp-group-extract]', e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
