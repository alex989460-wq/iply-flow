import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const EMAIL = 'inativos@supergestor.top';
const PASSWORD = '@Admin123';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    let userId: string | null = null;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Auditoria Inativos' },
    });

    if (created?.user) {
      userId = created.user.id;
    } else {
      // already exists -> find it and reset password
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users?.find((u) => u.email?.toLowerCase() === EMAIL);
      if (!found) throw createErr ?? new Error('Falha ao criar conta de auditoria');
      userId = found.id;
      await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    }

    await admin.from('audit_accounts').upsert(
      { user_id: userId, note: 'Conta interna de auditoria de inativos 60+ dias' },
      { onConflict: 'user_id' },
    );

    // ensure it is not treated as reseller
    await admin.from('reseller_access').delete().eq('user_id', userId);

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
