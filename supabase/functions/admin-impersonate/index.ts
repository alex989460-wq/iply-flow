import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Gera um link de acesso direto (magic link) para o painel de um revendedor.
// Somente administradores podem usar.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ success: false, error: 'Não autorizado' }, 401);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ success: false, error: 'Não autorizado' }, 401);

    const { data: adminRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) return json({ success: false, error: 'Apenas administradores' }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.targetUserId ?? '').trim();
    const redirectTo = String(body?.redirectTo ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      return json({ success: false, error: 'Revendedor inválido' }, 400);
    }
    if (!/^https?:\/\//.test(redirectTo)) {
      return json({ success: false, error: 'Destino inválido' }, 400);
    }

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
    if (targetError || !target?.user?.email) {
      return json({ success: false, error: 'Usuário do revendedor não encontrado' }, 404);
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: target.user.email,
      options: { redirectTo },
    });

    if (linkError || !link?.properties?.action_link) {
      console.error('generateLink error', linkError);
      return json({ success: false, error: linkError?.message || 'Falha ao gerar link' }, 500);
    }

    console.log(`Admin ${userData.user.id} impersonando ${targetUserId}`);
    return json({ success: true, url: link.properties.action_link, email: target.user.email });
  } catch (e) {
    console.error('admin-impersonate error', e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
