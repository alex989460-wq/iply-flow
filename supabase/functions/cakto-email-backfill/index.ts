import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Job diário: percorre os contatos arquivados dos pagamentos da Cakto
// (tabela cakto_contacts) e preenche o e-mail dos clientes que ainda estão sem.
// Nunca sobrescreve um e-mail já cadastrado.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let days = 30;
  try {
    const body = await req.json();
    const d = Number(body?.days);
    if (Number.isFinite(d) && d > 0 && d <= 365) days = Math.floor(d);
  } catch (_) { /* sem body */ }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let updated = 0;
  let scanned = 0;

  try {
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data: contacts, error } = await supabase
        .from('cakto_contacts')
        .select('owner_id, email, phone, username')
        .gte('last_seen_at', since)
        .order('last_seen_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!contacts || contacts.length === 0) break;
      scanned += contacts.length;

      for (const c of contacts) {
        const email = String(c.email || '').trim().toLowerCase();
        if (!email.includes('@')) continue;

        const applyFilters = (q: any) => {
          let query = q.update({ email }).is('email', null);
          if (c.owner_id) query = query.eq('created_by', c.owner_id);
          return query;
        };

        // 1) por username exato
        if (c.username) {
          const { data, error: e1 } = await applyFilters(supabase.from('customers'))
            .ilike('username', c.username)
            .select('id');
          if (!e1 && data) updated += data.length;
        }

        // 2) por telefone (últimos 8 dígitos)
        const digits = String(c.phone || '').replace(/\D/g, '');
        if (digits.length >= 10) {
          const tail = digits.slice(-8);
          const { data, error: e2 } = await applyFilters(supabase.from('customers'))
            .like('phone', `%${tail}`)
            .select('id');
          if (!e2 && data) updated += data.length;
        }
      }

      if (contacts.length < pageSize) break;
    }

    console.log(`[cakto-email-backfill] contatos=${scanned} clientes_atualizados=${updated} janela=${days}d`);
    return new Response(JSON.stringify({ success: true, scanned, updated, days }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[cakto-email-backfill] erro', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
