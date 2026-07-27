import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Plus, QrCode, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MetaLogo } from '@/components/ui/meta-logo';
import whatsappLogo from '@/assets/whatsapp-logo.png.asset.json';


interface Props {
  apiKey: string;
  onCreated?: () => void;
  trigger?: ReactNode;
}

type Step = 'choose' | 'cloud' | 'qr';

export default function AddChannelEmbedDialog({ apiKey, onCreated, trigger }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('choose');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cloud, setCloud] = useState({ name: '', phone_number_id: '', waba_id: '', system_user_token: '', verify_token: '' });
  const [qrName, setQrName] = useState('');
  const [qrChannelId, setQrChannelId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrState, setQrState] = useState('connecting');
  const pollRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setStep('choose');
    setError(null);
    setSaving(false);
    setCloud({ name: '', phone_number_id: '', waba_id: '', system_user_token: '', verify_token: '' });
    setQrName('');
    setQrChannelId(null);
    setQrImage(null);
    setQrState('connecting');
  }, []);

  const call = useCallback(async (action: string, data: Record<string, unknown>) => {
    const { data: res, error: err } = await supabase.functions.invoke('crm-oficial-sync', { body: { action, data: { apiKey, ...data } } });
    if (err) throw new Error(err.message);
    return res;
  }, [apiKey]);

  const submitCloud = async () => {
    if (!cloud.name || !cloud.phone_number_id || !cloud.system_user_token) {
      setError('Preencha nome, Phone Number ID e System User Token.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await call('create-channel', { channel: { kind: 'whatsapp_cloud', ...cloud } });
      if (!res?.results?.channel?.ok) throw new Error(`Falha ao criar canal (status ${res?.results?.channel?.status ?? '?'})`);
      toast({ title: 'Canal oficial conectado', description: 'WhatsApp Cloud API sincronizado com sucesso.' });
      onCreated?.();
      setOpen(false);
      reset();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const submitQr = async () => {
    if (!qrName.trim()) { setError('Dê um nome ao canal.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await call('create-channel', { channel: { kind: 'whatsapp_evolution', name: qrName.trim() } });
      const body = res?.results?.channel?.body;
      if (!res?.results?.channel?.ok) throw new Error(`Falha ao gerar QR (status ${res?.results?.channel?.status ?? '?'})`);
      setQrChannelId(body?.channel?.id ?? body?.id ?? null);
      setQrImage(body?.qr ?? null);
      setQrState('connecting');
      onCreated?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Polling do QR até conectar
  useEffect(() => {
    if (step !== 'qr' || !qrChannelId || qrState === 'open') return;
    const id = window.setInterval(async () => {
      try {
        const res = await call('channel-qr', { channel_id: qrChannelId });
        const body = res?.results?.qr?.body;
        if (!body) return;
        if (body.state) setQrState(String(body.state));
        if (body.qr) setQrImage(body.qr);
        if (body.state === 'open') {
          onCreated?.();
          window.setTimeout(() => { setOpen(false); reset(); }, 1500);
        }
      } catch { /* silencioso */ }
    }, 3000);
    pollRef.current = id;
    return () => window.clearInterval(id);
  }, [step, qrChannelId, qrState, call, onCreated, reset]);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
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

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {step === 'choose' && 'Como você quer conectar seu WhatsApp?'}
            {step === 'cloud' && 'Novo canal WhatsApp Cloud (API Oficial)'}
            {step === 'qr' && 'Conectar WhatsApp via QR Code'}
          </DialogTitle>
          <DialogDescription>
            {step === 'choose' && 'Escolha entre a API oficial da Meta ou a conexão não oficial via QR Code.'}
            {step === 'cloud' && 'API oficial da Meta — templates aprovados, alta escala e qualidade monitorada.'}
            {step === 'qr' && 'Leia o QR com o WhatsApp do celular em Aparelhos conectados.'}
          </DialogDescription>
        </DialogHeader>

        {!apiKey ? (
          <p className="text-sm text-muted-foreground">
            Configure sua chave de API do CRM Oficial em Configurações antes de adicionar canais.
          </p>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
            )}

            {step === 'choose' && (
              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => { setStep('cloud'); setError(null); }}
                  className="group text-left rounded-2xl border border-border bg-background/60 p-5 hover:border-blue-500/60 hover:bg-blue-500/5 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl grid place-items-center bg-muted ring-1 ring-border">
                      <MetaLogo className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-semibold">API Oficial (Meta)</div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">Recomendado</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    WhatsApp Business Cloud API. Requer Phone Number ID, WABA ID e token do sistema.
                  </p>
                  <span className="text-xs text-blue-400 inline-flex items-center mt-3">
                    Conectar <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('qr'); setError(null); }}
                  className="group text-left rounded-2xl border border-border bg-background/60 p-5 hover:border-emerald-500/60 hover:bg-emerald-500/5 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl grid place-items-center bg-muted ring-1 ring-border overflow-hidden">
                      <img src={whatsappLogo.url} alt="WhatsApp" className="size-7 object-contain" />
                    </div>
                    <div>
                      <div className="font-semibold">Não oficial (QR Code)</div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">Rápido</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Conecte lendo o QR Code. Sem templates, envio livre e suporte a grupos.
                  </p>
                  <span className="text-xs text-emerald-400 inline-flex items-center mt-3">
                    Ler QR Code <QrCode className="w-3.5 h-3.5 ml-1" />
                  </span>
                </button>
              </div>
            )}

            {step === 'cloud' && (
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nome interno *</Label>
                    <Input value={cloud.name} onChange={(e) => setCloud({ ...cloud, name: e.target.value })} placeholder="ex: Suporte BR" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone Number ID *</Label>
                    <Input value={cloud.phone_number_id} onChange={(e) => setCloud({ ...cloud, phone_number_id: e.target.value })} placeholder="123456789012345" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>WABA ID</Label>
                    <Input value={cloud.waba_id} onChange={(e) => setCloud({ ...cloud, waba_id: e.target.value })} placeholder="987654321" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Verify Token (webhook)</Label>
                    <Input value={cloud.verify_token} onChange={(e) => setCloud({ ...cloud, verify_token: e.target.value })} placeholder="opcional" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>System User Token *</Label>
                    <Input type="password" className="font-mono text-xs" value={cloud.system_user_token} onChange={(e) => setCloud({ ...cloud, system_user_token: e.target.value })} placeholder="EAAG..." />
                  </div>
                </div>
                <div className="flex justify-between gap-2 pt-1">
                  <Button variant="ghost" onClick={() => { setStep('choose'); setError(null); }}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                  </Button>
                  <Button onClick={submitCloud} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    Salvar canal
                  </Button>
                </div>
              </div>
            )}

            {step === 'qr' && (
              <div className="space-y-3">
                {!qrChannelId ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>Nome do canal *</Label>
                      <Input value={qrName} onChange={(e) => setQrName(e.target.value)} placeholder="ex: Vendas WhatsApp" />
                    </div>
                    <div className="flex justify-between gap-2 pt-1">
                      <Button variant="ghost" onClick={() => { setStep('choose'); setError(null); }}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                      </Button>
                      <Button onClick={submitQr} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                        Gerar QR
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-2">
                    {qrState === 'open' ? (
                      <div className="text-center py-8">
                        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
                        <div className="mt-2 font-semibold">Conectado!</div>
                      </div>
                    ) : qrImage ? (
                      <img
                        src={qrImage.startsWith('data:') ? qrImage : `data:image/png;base64,${qrImage}`}
                        alt="QR Code do WhatsApp"
                        className="w-64 h-64 rounded-xl border border-border bg-white p-2"
                      />
                    ) : (
                      <div className="w-64 h-64 grid place-items-center border border-border rounded-xl">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Status: <span className="font-mono">{qrState}</span>
                    </p>
                    <Button variant="outline" size="sm" onClick={() => { setOpen(false); reset(); }}>
                      {qrState === 'open' ? 'Fechar' : 'Cancelar'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
