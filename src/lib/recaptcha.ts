import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

export interface RecaptchaConfig {
  enabled: boolean;
  siteKey: string | null;
}

export async function fetchRecaptchaConfig(): Promise<RecaptchaConfig> {
  try {
    const { data } = await supabase
      .from('platform_settings')
      .select('recaptcha_enabled, recaptcha_site_key')
      .eq('singleton', true)
      .maybeSingle();
    return {
      enabled: !!data?.recaptcha_enabled && !!data?.recaptcha_site_key,
      siteKey: data?.recaptcha_site_key ?? null,
    };
  } catch {
    return { enabled: false, siteKey: null };
  }
}

function loadScript(siteKey: string): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('recaptcha_load_failed')));
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    s.async = true;
    s.defer = true;
    s.dataset.recaptcha = 'true';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('recaptcha_load_failed'));
    document.head.appendChild(s);
  });
}

/** Retorna null se o reCAPTCHA estiver desativado ou indisponível. */
export async function getRecaptchaToken(config: RecaptchaConfig, action: string): Promise<string | null> {
  if (!config.enabled || !config.siteKey) return null;
  try {
    await loadScript(config.siteKey);
    const grecaptcha = window.grecaptcha;
    if (!grecaptcha) return null;
    await new Promise<void>((resolve) => grecaptcha.ready(() => resolve()));
    return await grecaptcha.execute(config.siteKey, { action });
  } catch {
    return null;
  }
}

/** Valida o token no servidor. Lança erro se a verificação falhar. */
export async function verifyRecaptcha(token: string | null, action: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('verify-recaptcha', {
    body: { token, action },
  });
  if (error) throw new Error('Não foi possível validar o reCAPTCHA. Tente novamente.');
  if (data && data.success === false) {
    throw new Error(data.error || 'Falha na verificação do reCAPTCHA.');
  }
}
