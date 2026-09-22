import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, CheckCircle2, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { MetaLogo } from '@/components/ui/meta-logo';
import whatsappLogo from '@/assets/whatsapp-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Props {
  apiKey: string;
  onCreated?: () => void;
  trigger?: ReactNode;
}

type Mode = null | 'meta-pick' | 'cloud' | 'qr';

declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}

function loadFbSdk(appId: string, graphVersion = 'v21.0') {
  return new Promise<void>((resolve, reject) => {
    if (window.FB) {
      try { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion }); } catch { /* já iniciado */ }
      return resolve();
    }
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      resolve();
    };
    const s = document.createElement('script');
    s.src = `https://connect.facebook.net/pt_BR/sdk.js`;
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('Não foi possível carregar o login da Meta.'));
    document.body.appendChild(s);
  });
}

// A Meta espera este identificador para o fluxo de coexistência
// (usar um número que já está no app WhatsApp Business).
const COEXISTENCE_FEATURE = 'whatsapp_business_app_onboarding';


async function call(action: string, apiKey: string, data: Record<string, unknown> = {}) {
  const { data: res, error } = await supabase.functions.invoke('crm-oficial-sync', {
    body: { action, data: { apiKey, ...data } },
  });
  if (error) throw new Error(error.message);
  return res;
}

export default function AddChannelDialog({ apiKey, onCreated, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Meta
  const [signupStep, setSignupStep] = useState<'idle' | 'waiting' | 'saving' | 'done'>('idle');
  const signupRef = useRef<Record<string, unknown>>({});

  // QR
  const [qrName, setQrName] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [qrChannelId, setQrChannelId] = useState<string | null>(null);
  const [qrState, setQrState] = useState<string>('');

  const reset = useCallback(() => {
    setMode(null); setErr(null); setBusy(false);
    setSignupStep('idle'); signupRef.current = {};
    setQrName(''); setQr(null); setQrChannelId(null); setQrState('');
  }, []);

  useEffect(() => { if (!open) reset(); }, [open, reset]);

  // Polling do QR Code até conectar
  useEffect(() => {
    if (mode !== 'qr' || !qrChannelId || qrState === 'open') return;
    let inFlight = false;
    const id = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await call('channel-qr', apiKey, { channel_id: qrChannelId });
        const body = res?.results?.qr?.body || {};
        if (body.state) setQrState(body.state);
        if (body.qr) setQr(body.qr);
        if (body.state === 'open') {
          setQr(null);
          onCreated?.();
          setTimeout(() => setOpen(false), 1500);
        }
      } catch { /* tenta de novo no próximo ciclo */ } finally {
        inFlight = false;
      }
    }, 4000);
    return () => clearInterval(id);
  }, [mode, qrChannelId, qrState, apiKey, onCreated]);

  async function startMetaSignup(kind: 'coexistence' | 'new' = 'coexistence') {
    setMode('cloud'); setErr(null); setSignupStep('waiting');
    signupRef.current = {};
    try {
      // Uma falha momentânea de rede não deve bloquear o cadastro: tenta de novo.
      let cfg: any = {};
      let lastDetail = '';
      for (let attempt = 0; attempt < 2 && !(cfg.app_id && cfg.config_id); attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 1500));
        try {
          const res = await call('meta-embed-config', apiKey);
          const wrapper = res?.results?.config ?? res?.config ?? {};
          cfg = wrapper?.body ?? wrapper ?? {};
          if (!cfg.app_id) lastDetail = wrapper?.body?.error || `HTTP ${wrapper?.status ?? '?'}`;
        } catch (e: any) {
          lastDetail = e?.message || '';
        }
      }
      if (!cfg.app_id || !cfg.config_id) {
        throw new Error(`Cadastro da Meta indisponível no momento.${lastDetail ? ` (${lastDetail})` : ''}`);
      }
      await loadFbSdk(cfg.app_id, cfg.graph_version || 'v21.0');
      if (!window.FB) throw new Error('Não foi possível carregar o login da Meta.');

      window.FB.login(
        (resp: any) => {
          const code = resp?.authResponse?.code;
          if (!code) {
            setSignupStep('idle');
            setErr('Cadastro cancelado ou não concluído na Meta.');
            return;
          }
          signupRef.current.code = code;
          void (async () => {
            await new Promise((r) => setTimeout(r, 1200));
            setSignupStep('saving');
            try {
              const out = await call('meta-signup', apiKey, { signup: signupRef.current });
              const body = out?.results?.signup;
              if (body && body.ok === false) throw new Error(body?.body?.error || 'Falha ao salvar o número.');
              setSignupStep('done');
              onCreated?.();
              setTimeout(() => setOpen(false), 1500);
            } catch (e: any) {
              setSignupStep('idle');
              setErr(e.message);
            }
          })();
        },
        {
          config_id: cfg.config_id,
          response_type: 'code',
          override_default_response_type: true,
          extras: kind === 'coexistence'
            ? {
                setup: {},
                featureType: COEXISTENCE_FEATURE,
                sessionInfoVersion: cfg.session_info_version || '3',
              }
            : {
                setup: {},
                featureType: '',
                sessionInfoVersion: cfg.session_info_version || '3',
              },

        },
      );
    } catch (e: any) {
      setSignupStep('idle');
      setErr(e.message);
    }
  }

  async function createQrChannel() {
    if (!qrName.trim()) { setErr('Dê um nome para a conexão.'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await call('create-channel', apiKey, {
        channel: { kind: 'whatsapp_evolution', name: qrName.trim() },
      });
      const created = res?.results?.channel;
      if (created && created.ok === false) throw new Error(created?.body?.error || 'Não foi possível criar a conexão.');
      const body = created?.body || {};
      setQrChannelId(body.channel?.id || body.id || null);
      setQr(body.qr || null);
      setQrState('connecting');
      onCreated?.();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <QrCode className="w-4 h-4 mr-2" /> Adicionar canal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'cloud' || mode === 'meta-pick' ? 'Conectar API Oficial (Meta)' : mode === 'qr' ? 'Conectar por QR Code' : 'Como você quer conectar seu WhatsApp?'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'meta-pick'
              ? 'O número já é usado no app WhatsApp Business ou é um número novo?'
              : mode === 'cloud'
                ? 'Conclua o login na janela da Meta — o número é cadastrado automaticamente.'
                : mode === 'qr'
                  ? 'Leia o código com o WhatsApp do celular em Aparelhos conectados.'
                  : 'Escolha entre a API oficial da Meta ou a conexão por QR Code.'}
          </DialogDescription>

        </DialogHeader>

        {err && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{err}</div>}

        {!mode && (
          <div className="grid sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={startMetaSignup}
              className="text-left rounded-2xl border border-border bg-card/40 p-5 hover:border-blue-500/60 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl grid place-items-center bg-blue-500/10 ring-1 ring-border">
                  <MetaLogo className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-semibold">API Oficial (Meta)</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">Recomendado</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">Login na Meta, escolha do número e pronto. Permite modelos e disparos.</p>
              <span className="text-xs text-blue-400 inline-flex items-center mt-3">Conectar <ArrowRight className="w-3.5 h-3.5 ml-1" /></span>
            </button>

            <button
              type="button"
              onClick={() => { setMode('qr'); setErr(null); }}
              className="text-left rounded-2xl border border-border bg-card/40 p-5 hover:border-emerald-500/60 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl grid place-items-center bg-emerald-500/10 ring-1 ring-border">
                  <img src={whatsappLogo} alt="WhatsApp" className="w-7 h-7 object-contain" />
                </div>
                <div>
                  <div className="font-semibold">QR Code</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">Rápido</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">Conecte lendo o QR Code. Envio livre e suporte a grupos.</p>
              <span className="text-xs text-emerald-400 inline-flex items-center mt-3">Ler QR Code <QrCode className="w-3.5 h-3.5 ml-1" /></span>
            </button>
          </div>
        )}

        {mode === 'cloud' && (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            {signupStep === 'done' ? (
              <>
                <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                <div className="font-semibold">Número conectado!</div>
              </>
            ) : (
              <>
                <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {signupStep === 'saving' ? 'Salvando o número...' : 'Conclua o cadastro na janela da Meta.'}
                </p>
                <Button variant="outline" size="sm" onClick={() => { setMode(null); setErr(null); }}>Voltar</Button>
              </>
            )}
          </div>
        )}

        {mode === 'qr' && (
          <div className="space-y-4">
            {!qrChannelId ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="qr-name">Nome da conexão</Label>
                  <Input id="qr-name" value={qrName} onChange={(e) => setQrName(e.target.value)} placeholder="Ex.: Atendimento 2" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={createQrChannel} disabled={busy}>
                    {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                    Gerar QR Code
                  </Button>
                  <Button variant="ghost" onClick={() => { setMode(null); setErr(null); }}>Voltar</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {qrState === 'open' ? (
                  <>
                    <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                    <div className="font-semibold">WhatsApp conectado!</div>
                  </>
                ) : qr ? (
                  <img
                    src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                    alt="QR Code"
                    className={cn('w-64 h-64 rounded-xl bg-white p-2')}
                  />
                ) : (
                  <div className="w-64 h-64 rounded-xl border border-dashed grid place-items-center">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Status: {qrState || 'aguardando'}</p>
                <Button variant="outline" size="sm" onClick={() => setQrState('')}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Atualizar código
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
