import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Plus, RefreshCw } from 'lucide-react';

interface Props {
  apiKey: string;
  onCreated?: () => void;
  trigger?: ReactNode;
}

const EMBED_BASE = 'https://zapcrm.top/embed/channels';

export default function AddChannelEmbedDialog({ apiKey, onCreated, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  const src = apiKey ? `${EMBED_BASE}?token=${encodeURIComponent(apiKey)}&v=${nonce}` : '';

  // O embed avisa via postMessage quando um canal é criado/conectado.
  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      if (!event.origin?.includes('zapcrm.top')) return;
      const data = typeof event.data === 'string' ? (() => { try { return JSON.parse(event.data); } catch { return null; } })() : event.data;
      const type = String(data?.type || data?.event || '');
      if (/channel/i.test(type) && /(created|connected|updated|ready)/i.test(type)) {
        onCreated?.();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, onCreated]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) onCreated?.();
        if (v) setNonce((n) => n + 1);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" disabled={!apiKey}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar canal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Adicionar canal WhatsApp</DialogTitle>
          <DialogDescription>
            Escolha entre API Oficial (Meta) ou Não oficial (QR Code). A conexão é feita direto no CRM Oficial.
          </DialogDescription>
        </DialogHeader>

        {apiKey ? (
          <>
            <iframe
              key={nonce}
              src={src}
              title="Adicionar canal — CRM Oficial"
              className="w-full border-0 bg-background"
              style={{ height: 560 }}
              allow="clipboard-write; camera"
            />
            <div className="flex items-center justify-end gap-2 px-6 pb-4">
              <Button variant="ghost" size="sm" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw className="w-4 h-4 mr-2" /> Recarregar
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(src, '_blank')}>
                <ExternalLink className="w-4 h-4 mr-2" /> Abrir em nova aba
              </Button>
            </div>
          </>
        ) : (
          <div className="px-6 pb-6 text-sm text-muted-foreground">
            Configure sua chave de API do CRM Oficial em Configurações antes de adicionar canais.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
