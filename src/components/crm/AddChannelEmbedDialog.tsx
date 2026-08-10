import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink, Loader2, Plus, RefreshCw } from 'lucide-react';

const CRM_BASE = 'https://zapcrm.top';

interface Props {
  apiKey: string;
  onCreated?: () => void;
  trigger?: ReactNode;
}

/**
 * Alguns navegadores (Safari, Brave, Firefox com proteção reforçada e
 * qualquer um com cookies de terceiros bloqueados) não conseguem renderizar
 * o painel do CRM dentro de um iframe — o resultado é uma "tela preta".
 * Detectamos isso e oferecemos a abertura em nova aba como alternativa.
 */
function thirdPartyCookiesLikelyBlocked() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  const isBrave = Boolean((navigator as any).brave);
  const isFirefox = /firefox|fxios/i.test(ua);
  return isSafari || isBrave || isFirefox;
}

export default function AddChannelEmbedDialog({ apiKey, onCreated, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const timerRef = useRef<number | null>(null);

  const url = `${CRM_BASE}/embed/channels?token=${encodeURIComponent(apiKey)}`;

  const openInNewTab = useCallback(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
    onCreated?.();
  }, [url, onCreated]);

  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes('zapcrm.top')) return;
      const type = String((event.data as any)?.type || (event.data as any)?.event || '');
      if (/channel|connected|created|updated|deleted/i.test(type)) onCreated?.();
      if (/close/i.test(type)) setOpen(false);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, onCreated]);

  // Timeout de segurança: se o iframe não carregar, mostra alternativa.
  useEffect(() => {
    if (!open || !apiKey) return;
    setLoaded(false);
    setFailed(thirdPartyCookiesLikelyBlocked());
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setLoaded((isLoaded) => {
        if (!isLoaded) setFailed(true);
        return isLoaded;
      });
    }, 8000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [open, apiKey, reloadKey]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) onCreated?.();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-primary-foreground" disabled={!apiKey}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar canal
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-background">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="text-xl">Conectar WhatsApp</DialogTitle>
          <DialogDescription>
            Escolha entre a API Oficial (Meta) ou a conexão via QR Code direto no painel do CRM.
          </DialogDescription>
        </DialogHeader>

        {!apiKey ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Configure sua chave de API do CRM Oficial em Configurações antes de adicionar canais.
          </p>
        ) : failed && !loaded ? (
          <div className="px-6 pb-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Seu navegador bloqueou a janela do CRM</p>
                <p>
                  Navegadores como Safari, Firefox e Brave bloqueiam cookies de terceiros, o que deixa esta
                  área em branco/preta. Abra a conexão em uma nova aba para concluir normalmente.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={openInNewTab} className="bg-emerald-500 hover:bg-emerald-600 text-primary-foreground">
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir em nova aba
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFailed(false);
                  setLoaded(false);
                  setReloadKey((k) => k + 1);
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar novamente aqui
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-[75vh] bg-background">
            {!loaded && (
              <div className="absolute inset-0 grid place-items-center bg-background">
                <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Carregando painel de conexão…
                  <Button variant="ghost" size="sm" onClick={openInNewTab}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Abrir em nova aba
                  </Button>
                </div>
              </div>
            )}
            <iframe
              key={reloadKey}
              src={url}
              title="Canais WhatsApp"
              className="w-full h-full border-0 bg-background"
              allow="camera; clipboard-write"
              referrerPolicy="no-referrer"
              onLoad={() => {
                setLoaded(true);
                setFailed(false);
              }}
              onError={() => setFailed(true)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
