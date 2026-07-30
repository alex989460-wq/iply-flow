import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X, Share, Plus, Smartphone } from 'lucide-react';

const STORAGE_KEY = 'install_app_prompt_last_shown';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function shownToday() {
  const last = localStorage.getItem(STORAGE_KEY);
  if (!last) return false;
  return new Date(last).toDateString() === new Date().toDateString();
}

function markShown() {
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

export default function InstallAppFloat() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (isStandalone() || shownToday()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS nunca dispara beforeinstallprompt: mostramos as instruções manuais.
    let t: number | undefined;
    if (isIos) {
      t = window.setTimeout(() => setVisible(true), 2500);
    }

    const onInstalled = () => {
      setVisible(false);
      markShown();
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (t) clearTimeout(t);
    };
  }, [isIos]);

  const dismiss = () => {
    markShown();
    setVisible(false);
    setShowIosHelp(false);
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      dismiss();
      return;
    }
    setShowIosHelp(true);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[340px] z-[60]">
      <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl p-4 space-y-3">
        <button
          onClick={dismiss}
          aria-label="Fechar"
          className="absolute -top-2 -right-2 sm:top-2 sm:right-2 rounded-full bg-muted p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Instale o app no seu celular</p>
            <p className="text-xs text-muted-foreground">
              Acesso rápido pelo ícone na tela inicial (Android e iOS).
            </p>
          </div>
        </div>

        {showIosHelp || (isIos && !deferred) ? (
          <div className="text-xs text-muted-foreground space-y-1 rounded-lg bg-muted/40 p-2">
            <p className="flex items-center gap-1">
              1. Toque em <Share className="inline h-3.5 w-3.5" /> Compartilhar
            </p>
            <p className="flex items-center gap-1">
              2. Escolha <Plus className="inline h-3.5 w-3.5" /> “Adicionar à Tela de Início”
            </p>
          </div>
        ) : null}

        <div className="flex gap-2">
          {!isIos && (
            <Button size="sm" className="flex-1 gap-2" onClick={install}>
              <Download className="h-4 w-4" /> Instalar agora
            </Button>
          )}
          <Button size="sm" variant="ghost" className={isIos ? 'flex-1' : ''} onClick={dismiss}>
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}
