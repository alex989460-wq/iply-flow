import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const REDIRECT_URL = 'https://www.google.com';

// Ambientes de desenvolvimento/preview nunca são bloqueados.
function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.lovableproject.com') ||
    host.includes('-preview--')
  );
}

/**
 * Quando o administrador ativa a proteção, o site bloqueia atalhos de
 * ferramentas de desenvolvedor (F12, Ctrl+Shift+I/J/C, Ctrl+U), o menu de
 * contexto e, se detectar o DevTools aberto, redireciona para o Google.
 */
export function useDevtoolsGuard() {
  useEffect(() => {
    if (isPreviewEnvironment()) return;

    let active = true;
    let cleanup: (() => void) | null = null;

    const leave = () => {
      try {
        window.location.replace(REDIRECT_URL);
      } catch {
        window.location.href = REDIRECT_URL;
      }
    };

    const enable = () => {
      const onKeyDown = (e: KeyboardEvent) => {
        const key = (e.key || '').toLowerCase();
        const blockedCombo =
          key === 'f12' ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
          ((e.ctrlKey || e.metaKey) && key === 'u');
        if (blockedCombo) {
          e.preventDefault();
          e.stopPropagation();
          leave();
        }
      };

      const onContextMenu = (e: MouseEvent) => e.preventDefault();

      // Detecção por diferença de tamanho da janela (DevTools acoplado).
      const interval = window.setInterval(() => {
        const widthGap = window.outerWidth - window.innerWidth;
        const heightGap = window.outerHeight - window.innerHeight;
        if (widthGap > 200 || heightGap > 220) leave();
      }, 1000);

      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('contextmenu', onContextMenu);

      cleanup = () => {
        window.clearInterval(interval);
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('contextmenu', onContextMenu);
      };
    };

    supabase.functions
      .invoke('auth-security', { body: { action: 'config' } })
      .then(({ data }) => {
        if (active && data?.devtoolsProtection) enable();
      })
      .catch(() => undefined);

    return () => {
      active = false;
      cleanup?.();
    };
  }, []);
}
