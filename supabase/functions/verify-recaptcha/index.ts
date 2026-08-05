import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const action = typeof body?.action === 'string' ? body.action.slice(0, 60) : '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: settings } = await supabase
      .from('platform_settings')
      .select('recaptcha_enabled, recaptcha_secret_key')
      .is('user_id', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Desativado no painel admin: libera.
    if (!settings?.recaptcha_enabled) {
      return json({ success: true, skipped: true, reason: 'disabled' });
    }

    const secret = (settings?.recaptcha_secret_key ?? '').trim() || (Deno.env.get('TURNSTILE_SECRET_KEY') ?? '');
    if (!secret) {
      return json({ success: false, error: 'Cloudflare Turnstile não configurado no servidor.' }, 503);
    }

    if (!token) {
      return json({ success: false, error: 'Token do Turnstile ausente.' }, 400);
    }

    const remoteIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim();
    const requestId = crypto.randomUUID();
    const params = new URLSearchParams({ secret, response: token, idempotency_key: requestId });
    if (remoteIp) params.set('remoteip', remoteIp);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const result = await resp.json().catch(() => ({}));

    if (!result?.success) {
      return json(
        { success: false, error: 'Falha na verificação do Cloudflare Turnstile.', codes: result?.['error-codes'] ?? [] },
        400,
      );
    }

    if (action && result?.action && result.action !== action) {
      return json({ success: false, error: 'Ação do Turnstile inválida.' }, 400);
    }

    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
