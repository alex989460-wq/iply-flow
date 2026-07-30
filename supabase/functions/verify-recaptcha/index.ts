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
      .select('recaptcha_enabled, recaptcha_min_score')
      .eq('singleton', true)
      .maybeSingle();

    // Desativado no painel admin: libera.
    if (!settings?.recaptcha_enabled) {
      return json({ success: true, skipped: true, reason: 'disabled' });
    }

    const secret = Deno.env.get('RECAPTCHA_SECRET_KEY') ?? '';
    if (!secret) {
      return json({ success: false, error: 'reCAPTCHA não configurado no servidor.' }, 400);
    }

    if (!token) {
      return json({ success: false, error: 'Token do reCAPTCHA ausente.' }, 400);
    }

    const params = new URLSearchParams({ secret, response: token });
    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const result = await resp.json().catch(() => ({}));

    const minScore = Number(settings?.recaptcha_min_score ?? 0.5);
    const score = typeof result?.score === 'number' ? result.score : 1;

    if (!result?.success) {
      return json(
        { success: false, error: 'Falha na verificação do reCAPTCHA.', codes: result?.['error-codes'] ?? [] },
        400,
      );
    }

    if (action && result?.action && result.action !== action) {
      return json({ success: false, error: 'Ação do reCAPTCHA inválida.' }, 400);
    }

    if (score < minScore) {
      return json({ success: false, error: 'Atividade suspeita detectada. Tente novamente.', score }, 400);
    }

    return json({ success: true, score });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
