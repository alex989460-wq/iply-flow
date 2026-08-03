import { supabase } from '@/integrations/supabase/client';

type TurnstileRenderOptions = {
  sitekey: string;
  action: string;
  theme: 'auto';
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
}

let scriptPromise: Promise<void> | null = null;
let currentWidgetId: string | null = null;

// O widget da Cloudflare não é servido dentro do iframe de preview do editor
// (hostnames de preview / localhost). Nesses casos a verificação é ignorada.
function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.lovableproject.com') ||
    host.includes('id-preview--') ||
    host.includes('-preview--')
  );
}

export async function fetchTurnstileConfig(): Promise<TurnstileConfig> {
  if (isPreviewEnvironment()) return { enabled: false, siteKey: null };
  try {
    const { data } = await supabase
      .from('platform_settings')
      .select('recaptcha_enabled, recaptcha_site_key')
      .maybeSingle();


    return {
      enabled: Boolean(data?.recaptcha_enabled && data?.recaptcha_site_key),
      siteKey: data?.recaptcha_site_key ?? null,
    };
  } catch {
    return { enabled: false, siteKey: null };
  }
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile_load_failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile_load_failed'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function getTurnstileToken(
  config: TurnstileConfig,
  action: 'login' | 'signup',
  container: HTMLElement | null,
): Promise<string> {
  if (!config.enabled || !config.siteKey) throw new Error('Turnstile não configurado.');
  if (!container) throw new Error('Verificação de segurança indisponível. Recarregue a página.');

  await loadTurnstileScript();
  const turnstile = window.turnstile;
  if (!turnstile) throw new Error('Não foi possível carregar a proteção Cloudflare.');

  if (currentWidgetId) {
    try {
      turnstile.remove(currentWidgetId);
    } catch {
      // O widget anterior pode já ter expirado ou sido removido.
    }
    currentWidgetId = null;
  }
  container.replaceChildren();

  return await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('A verificação expirou. Tente novamente.')), 120_000);
    currentWidgetId = turnstile.render(container, {
      sitekey: config.siteKey as string,
      action,
      theme: 'auto',
      callback: (token) => {
        window.clearTimeout(timeout);
        resolve(token);
      },
      'error-callback': () => {
        window.clearTimeout(timeout);
        reject(new Error('A Cloudflare não conseguiu validar esta tentativa.'));
      },
      'expired-callback': () => {
        window.clearTimeout(timeout);
        reject(new Error('A verificação expirou. Tente novamente.'));
      },
    });
  });
}

export async function verifyTurnstile(token: string, action: 'login' | 'signup'): Promise<void> {
  const { data, error } = await supabase.functions.invoke('verify-recaptcha', {
    body: { token, action },
  });
  if (error) throw new Error('Não foi possível validar o Turnstile. Tente novamente.');
  if (data?.success === false) throw new Error(data.error || 'Falha na verificação do Turnstile.');
}