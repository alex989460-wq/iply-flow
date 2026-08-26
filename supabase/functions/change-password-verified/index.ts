import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Alteração de senha da própria conta com confirmação por código de e-mail.
// action=send-code  → envia código de 6 dígitos para o e-mail da conta logada
// action=confirm    → valida o código e troca a senha
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const sha256 = async (value: string) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ success: false, error: 'Não autorizado' }, 401);

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
    if (userError || !userData?.user?.email) return json({ success: false, error: 'Não autorizado' }, 401);

    const userId = userData.user.id;
    const email = userData.user.email.toLowerCase();
    const purpose = 'password_change';

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');

    if (action === 'send-code') {
      const { data: recent } = await admin
        .from('auth_verification_codes')
        .select('created_at')
        .eq('email', email)
        .eq('purpose', purpose)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
        return json({ success: false, error: 'Aguarde 1 minuto para pedir um novo código.' }, 429);
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await admin.from('auth_verification_codes').insert({
        email,
        purpose,
        code_hash: await sha256(code),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });

      const { error: mailError } = await admin.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'security-code',
          recipientEmail: email,
          fromName: 'Super Gestor',
          templateData: {
            brandName: 'Super Gestor',
            code,
            minutes: 10,
            purposeLabel: 'Alteração de senha',
          },
        },
      });

      if (mailError) {
        console.error('send-code mail error', mailError);
        return json({ success: false, error: 'Não foi possível enviar o código por e-mail.' }, 500);
      }

      return json({ success: true, email });
    }

    if (action === 'confirm') {
      const code = String(body?.code ?? '').replace(/\D/g, '');
      const newPassword = String(body?.newPassword ?? '');
      if (code.length !== 6) return json({ success: false, error: 'Informe o código de 6 dígitos.' }, 400);
      if (newPassword.length < 8) return json({ success: false, error: 'A nova senha deve ter no mínimo 8 caracteres.' }, 400);

      const { data: row } = await admin
        .from('auth_verification_codes')
        .select('id, code_hash, expires_at, attempts')
        .eq('email', email)
        .eq('purpose', purpose)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) return json({ success: false, error: 'Nenhum código pendente. Solicite um novo.' }, 400);
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return json({ success: false, error: 'Código expirado. Solicite um novo.' }, 400);
      }
      if ((row.attempts ?? 0) >= 5) {
        return json({ success: false, error: 'Muitas tentativas. Solicite um novo código.' }, 429);
      }
      if ((await sha256(code)) !== row.code_hash) {
        await admin
          .from('auth_verification_codes')
          .update({ attempts: (row.attempts ?? 0) + 1 })
          .eq('id', row.id);
        return json({ success: false, error: 'Código incorreto.' }, 400);
      }

      await admin
        .from('auth_verification_codes')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', row.id);

      const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
      if (updateError) {
        console.error('update password error', updateError);
        return json({ success: false, error: updateError.message }, 500);
      }

      return json({ success: true });
    }

    return json({ success: false, error: 'Ação inválida.' }, 400);
  } catch (e) {
    console.error('change-password-verified error', e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
