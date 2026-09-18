import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  apiKey: string;
  channelId: string | null;
  channelName?: string;
  onClose: () => void;
  onConnected?: () => void;
}

async function call(action: string, apiKey: string, data: Record<string, unknown> = {}) {
  const { data: res, error } = await supabase.functions.invoke('crm-oficial-sync', {
    body: { action, data: { apiKey, ...data } },
  });
  if (error) throw new Error(error.message);
  return res;
}

export default function ReconnectQrDialog({ apiKey, channelId, channelName, onClose, onConnected }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setQr(null); setState(''); setErr(null); setLoading(true);
    (async () => {
      try {
        const res = await call('reconnect-channel', apiKey, { channel_id: channelId, force: true });
        const body = res?.results?.reconnect?.body || {};
        if (!cancelled) {
          if (body.qr) setQr(body.qr);
          if (body.state) setState(body.state);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [channelId, apiKey]);

  useEffect(() => {
    if (!channelId || state === 'open') return;
    let inFlight = false;
    const id = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await call('channel-qr', apiKey, { channel_id: channelId });
        const body = res?.results?.qr?.body || {};
        if (body.qr) setQr(body.qr);
        if (body.state) setState(body.state);
        if (body.state === 'open') {
          onConnected?.();
          setTimeout(onClose, 1500);
        }
      } catch { /* tenta novamente */ } finally {
        inFlight = false;
      }
    }, 4000);
    return () => clearInterval(id);
  }, [channelId, state, apiKey, onConnected, onClose]);

  return (
    <Dialog open={!!channelId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconectar {channelName || 'WhatsApp'}</DialogTitle>
          <DialogDescription>
            No celular, abra o WhatsApp em Aparelhos conectados e leia o código abaixo.
          </DialogDescription>
        </DialogHeader>

        {err && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{err}</div>}

        <div className="flex flex-col items-center gap-3 py-2">
          {state === 'open' ? (
            <>
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
              <div className="font-semibold">Conectado!</div>
            </>
          ) : qr ? (
            <img
              src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
              alt="QR Code"
              className="w-64 h-64 rounded-xl bg-white p-2"
            />
          ) : (
            <div className="w-64 h-64 rounded-xl border border-dashed grid place-items-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">Status: {loading ? 'gerando código...' : state || 'aguardando'}</p>
          <Button variant="outline" size="sm" onClick={() => setState('')}>
            <RefreshCw className="w-4 h-4 mr-2" /> Gerar novo código
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
