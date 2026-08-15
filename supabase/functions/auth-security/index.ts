import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Função pública de segurança da conta:
//  - action=config      → devolve configuração global (Turnstile, 2FA, confirmação de e-mail)
//  - action=send-code   → gera e envia código de 6 dígitos por e-mail
//  - action=verify-code → valida o código
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const sha256 = async (value: string) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'config');

    const { data: settings } = await supabase
      .from('platform_settings')
      .select('recaptcha_enabled, recaptcha_site_key, two_factor_enabled, require_email_confirmation, devtools_protection_enabled')
      .is('user_id', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (action === 'config') {
      return json({
        turnstile: {
          enabled: Boolean(settings?.recaptcha_enabled && settings?.recaptcha_site_key),
          siteKey: settings?.recaptcha_site_key ?? null,
        },
        twoFactorEnabled: Boolean(settings?.two_factor_enabled),
        requireEmailConfirmation: Boolean(settings?.require_email_confirmation),
        devtoolsProtection: Boolean(settings?.devtools_protection_enabled),
      });
    }


    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: 'E-mail inválido.' }, 400);
    }
    const purpose = ['login', 'activation'].includes(String(body?.purpose)) ? String(body.purpose) : 'login';

    if (action === 'send-code') {
      // Anti-spam: no máximo 1 código por minuto por e-mail/propósito
      const { data: recent } = await supabase
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
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

      await supabase.from('auth_verification_codes').insert({
        email,
        purpose,
        code_hash: await sha256(code),
        expires_at: expiresAt,
      });

      const { error: mailError } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'security-code',
          recipientEmail: email,
          fromName: 'Super Gestor',
          templateData: {
            brandName: 'Super Gestor',
            code,
            minutes: 10,
            purposeLabel: purpose === 'activation' ? 'Ativação de conta' : 'Verificação em duas etapas',
          },
        },
      });

      if (mailError) {
        console.error('send-code mail error', mailError);
        return json({ success: false, error: 'Não foi possível enviar o código por e-mail.' }, 500);
      }

      return json({ success: true });
    }

    if (action === 'verify-code') {
      const code = String(body?.code ?? '').replace(/\D/g, '');
      if (code.length !== 6) return json({ success: false, error: 'Informe o código de 6 dígitos.' }, 400);

      const { data: row } = await supabase
        .from('auth_verification_codes')
        .select('id, code_hash, expires_at, consumed_at, attempts')
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
        await supabase
          .from('auth_verification_codes')
          .update({ attempts: (row.attempts ?? 0) + 1 })
          .eq('id', row.id);
        return json({ success: false, error: 'Código incorreto.' }, 400);
      }

      await supabase
        .from('auth_verification_codes')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', row.id);

      // Ativação de conta: confirma o e-mail no sistema de autenticação
      if (purpose === 'activation') {
        const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const user = list?.users?.find((u) => (u.email ?? '').toLowerCase() === email);
        if (user) {
          await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
        }
      }

      return json({ success: true });
    }

    return json({ success: false, error: 'Ação inválida.' }, 400);
  } catch (e) {
    console.error('auth-security error', e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
