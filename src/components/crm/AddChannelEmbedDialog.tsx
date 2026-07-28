import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';

const CRM_BASE = 'https://zapcrm.top';

interface Props {
  apiKey: string;
  onCreated?: () => void;
  trigger?: ReactNode;
}

export default function AddChannelEmbedDialog({ apiKey, onCreated, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes('zapcrm.top')) return;
      const type = String((event.data as any)?.type || (event.data as any)?.event || '');
      if (/channel|connected|created|updated|deleted/i.test(type)) {
        onCreated?.();
      }
      if (/close/i.test(type)) setOpen(false);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, onCreated]);

  const url = `${CRM_BASE}/embed/channels?token=${encodeURIComponent(apiKey)}`;

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
          <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" disabled={!apiKey}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar canal
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-5xl p-0 overflow-hidden">
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
        ) : (
          <div className="relative w-full h-[75vh] bg-background">
            {!loaded && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <iframe
              src={url}
              title="Canais WhatsApp"
              className="w-full h-full border-0"
              allow="camera; clipboard-write"
              onLoad={() => setLoaded(true)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
