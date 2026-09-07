import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ListPlus, Send, Loader2, RefreshCw, X, Minus, Maximize2, Cloud, Tv, Play, Cast, MonitorPlay, Sparkle } from 'lucide-react';
import { getErrorMessage } from '@/lib/error-message';

export type PlaylistTemplate = {
  id: string;
  name: string;
  playlist_name: string;
  m3u_url_template: string;
  epg_url_template: string | null;
  default_host: string | null;
  send_tv: boolean;
  send_vod: boolean;
  pin: string | null;
  is_default: boolean;
};

export function renderPlaylistUrl(
  template: string,
  vars: { usuario?: string; senha?: string; host?: string; email?: string },
) {
  return (template || '')
    .replace(/\{\{\s*usuario\s*\}\}/gi, vars.usuario ?? '')
    .replace(/\{\{\s*senha\s*\}\}/gi, vars.senha ?? '')
    .replace(/\{\{\s*host\s*\}\}/gi, (vars.host ?? '').replace(/\/+$/, ''))
    .replace(/\{\{\s*email\s*\}\}/gi, vars.email ?? '')
    .trim();
}

async function extractFnError(error: any, data: any): Promise<string | null> {
  const payloadError = (data as any)?.error || ((data as any)?.success === false ? (data as any)?.message : null);
  if (payloadError) return String(payloadError);
  if (!error) return null;
  return getErrorMessage(error, data, 'Falha ao enviar a lista.');
}

export function formatMac(raw: string) {
  const clean = (raw || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase().slice(0, 12);
  return clean.replace(/(.{2})(?=.)/g, '$1:');
}

type ProviderTab = 'clouddy' | 'ibopro' | 'iboplayer' | 'duplecast' | 'bobplayer' | 'smartersmax';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmail?: string;
  defaultUsername?: string;
  defaultPassword?: string;
  defaultHost?: string;
  defaultListUrl?: string;
  defaultMac?: string;
}

export default function SendPlaylistDialog({
  open,
  onOpenChange,
  defaultEmail = '',
  defaultUsername = '',
  defaultPassword = '',
  defaultHost = '',
  defaultListUrl = '',
  defaultMac = '',
}: Props) {
  const [tab, setTab] = useState<ProviderTab>('clouddy');
  const [listUrl, setListUrl] = useState(defaultListUrl);
  const [epgUrl, setEpgUrl] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [sendTv, setSendTv] = useState(true);
  const [sendVod, setSendVod] = useState(true);
  const [sending, setSending] = useState(false);

  // Dispositivo (IBO Pro / IBO Player / Duplecast / Bob Player)
  const [mac, setMac] = useState(defaultMac);
  const [deviceKey, setDeviceKey] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [pin, setPin] = useState('');

  // Captcha (Bob Player / IBO Player)
  const [captcha, setCaptcha] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaCookie, setCaptchaCookie] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);

  const [templateId, setTemplateId] = useState<string>('');
  const [minimized, setMinimized] = useState(false);

  const needsCaptcha = tab === 'bobplayer' || tab === 'iboplayer';

  const loadCaptcha = async (provider: 'bobplayer' | 'iboplayer' = tab as any) => {
    setLoadingCaptcha(true);
    setCaptcha('');
    setCaptchaSvg('');
    try {
      const { data, error } = await supabase.functions.invoke('send-playlist', {
        body: { provider, action: 'bob-captcha' },
      });
      const msg = await extractFnError(error, data);
      if (msg) throw new Error(msg);
      setCaptchaSvg((data as any).svg || '');
      setCaptchaToken((data as any).token || '');
      setCaptchaCookie((data as any).cookie || '');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao carregar o captcha');
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    if (open && needsCaptcha) loadCaptcha(tab as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  // O captcha expira no servidor; renova sozinho a cada 90s enquanto o painel está aberto
  useEffect(() => {
    if (!open || !needsCaptcha || minimized) return;
    const id = setInterval(() => {
      if (!sending) loadCaptcha(tab as any);
    }, 90_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, needsCaptcha, minimized, sending]);

  const { data: templates = [] } = useQuery({
    queryKey: ['playlist-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playlist_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as PlaylistTemplate[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setEmail(defaultEmail);
    setListUrl(defaultListUrl);
    setMac(formatMac(defaultMac));
  }, [open, defaultEmail, defaultListUrl, defaultMac]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const vars = {
      usuario: defaultUsername,
      senha: defaultPassword,
      host: defaultHost || t.default_host || '',
      email,
    };
    const url = renderPlaylistUrl(t.m3u_url_template, vars);
    if (url && !/\{\{/.test(url)) setListUrl(url);
    const epg = renderPlaylistUrl(t.epg_url_template || '', vars);
    if (epg && !/\{\{/.test(epg)) setEpgUrl(epg);
    setSendTv(t.send_tv);
    setSendVod(t.send_vod);
    if (t.playlist_name) setPlaylistName(t.playlist_name);
    if (t.pin) setPin(t.pin);
  };

  const canSend = useMemo(() => {
    if (!listUrl.trim()) return false;
    if (tab === 'clouddy') return !!email.trim();
    const macOk = mac.replace(/[^0-9a-f]/gi, '').length === 12 && !!deviceKey.trim();
    if (needsCaptcha) return macOk && !!captcha.trim() && !!captchaToken;
    return macOk;
  }, [tab, listUrl, email, mac, deviceKey, captcha, captchaToken, needsCaptcha]);

  const handleSend = async () => {
    if (!listUrl.trim()) return toast.error('Informe a URL M3U da lista.');
    if (tab === 'clouddy' && !email.trim()) return toast.error('Informe o e-mail cadastrado no Clouddy.');
    if (tab !== 'clouddy' && mac.replace(/[^0-9a-f]/gi, '').length !== 12) return toast.error('Informe um MAC válido com 12 caracteres.');
    if (tab !== 'clouddy' && !deviceKey.trim()) return toast.error('Informe a Device Key (senha exibida no aplicativo).');
    if (needsCaptcha && (!captcha.trim() || !captchaToken)) return toast.error('Digite o captcha exibido para continuar.');
    if (!canSend) return toast.error('Revise os campos obrigatórios antes de enviar.');
    setSending(true);
    try {
      const body =
        needsCaptcha
          ? {
              provider: tab,
              mac: formatMac(mac),
              device_key: deviceKey.trim(),
              playlist_name: playlistName.trim() || 'Lista',
              m3u_url: listUrl.trim(),
              epg_url: epgUrl.trim() || undefined,
              pin: pin.trim() || undefined,
              captcha: captcha.trim(),
              captcha_token: captchaToken,
              captcha_cookie: captchaCookie,
            }
          : tab === 'duplecast'
          ? {
              provider: 'duplecast',
              mac: formatMac(mac).toUpperCase(),
              device_key: deviceKey.trim(),
              playlist_name: playlistName.trim() || 'Lista',
              m3u_url: listUrl.trim(),
              epg_url: epgUrl.trim() || undefined,
              pin: pin.trim() || undefined,
            }
          : tab === 'clouddy'
          ? {
              provider: 'clouddy',
              email: email.trim(),
              m3u_url: listUrl.trim(),
              epg_url: epgUrl.trim() || undefined,
              send_tv: sendTv,
              send_vod: sendVod,
            }
          : {
              provider: 'ibopro',
              mac: formatMac(mac),
              device_key: deviceKey.trim(),
              playlist_name: playlistName.trim() || 'Lista',
              m3u_url: listUrl.trim(),
              pin: pin.trim() || undefined,
              is_protected: !!pin.trim(),
            };

      const { data, error } =
        tab === 'smartersmax'
          ? await supabase.functions.invoke('smartersmax', {
              body: {
                action: 'playlist',
                mac: formatMac(mac),
                device_key: deviceKey.trim(),
                playlist_name: playlistName.trim() || 'Lista',
                m3u_url: listUrl.trim(),
                pin: pin.trim() || undefined,
              },
            })
          : await supabase.functions.invoke('send-playlist', { body });
      const msg = await extractFnError(error, data);
      if (msg) throw new Error(msg);
      toast.success((data as any)?.message || 'Lista enviada!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar a lista');
      if (needsCaptcha) loadCaptcha(tab as any);
    } finally {
      setSending(false);
    }
  };

  const listField = (
    <div className="space-y-1.5">
      <Label>Lista (URL M3U)</Label>
      <Textarea
        value={listUrl}
        onChange={(e) => setListUrl(e.target.value)}
        placeholder="Cole aqui a lista completa: http://servidor.com/get.php?username=...&password=...&type=m3u_plus"
        className="min-h-[70px] font-mono text-[11px]"
      />
      {!!templates.length && (
        <Select value={templateId} onValueChange={applyTemplate}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Usar um modelo salvo (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  const deviceFields = (keyPlaceholder: string) => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>MAC do aparelho</Label>
          <Input
            value={mac}
            onChange={(e) => setMac(formatMac(e.target.value))}
            placeholder="aa:bb:cc:dd:ee:ff"
            className="font-mono"
            inputMode="text"
            autoCapitalize="none"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Device Key</Label>
          <Input value={deviceKey} onChange={(e) => setDeviceKey(e.target.value)} placeholder={keyPlaceholder} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Nome da lista</Label>
          <Input value={playlistName} onChange={(e) => setPlaylistName(e.target.value)} placeholder="Minha Lista" />
        </div>
        <div className="space-y-1.5">
          <Label>PIN (opcional)</Label>
          <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="ex: 102030" inputMode="numeric" />
        </div>
      </div>
    </>
  );

  const epgField = (placeholder: string) => (
    <div className="space-y-1.5">
      <Label>EPG (opcional)</Label>
      <Input
        value={epgUrl}
        onChange={(e) => setEpgUrl(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-[11px]"
      />
    </div>
  );

  const captchaField = (brand: string) => (
    <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-3">
      <Label>Código de verificação do {brand}</Label>
      <div className="flex items-center gap-2">
        <div className="h-[62px] w-[150px] shrink-0 rounded-lg border border-border/60 bg-background overflow-hidden flex items-center justify-center [&>svg]:h-full [&>svg]:w-full">
          {loadingCaptcha ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : captchaSvg ? (
            <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: captchaSvg }} />
          ) : (
            <span className="text-[11px] text-muted-foreground">sem código</span>
          )}
        </div>
        <Button type="button" size="icon" variant="outline" onClick={() => loadCaptcha(tab as any)} disabled={loadingCaptcha} title="Gerar novo código">
          <RefreshCw className={loadingCaptcha ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
        </Button>
        <Input
          value={captcha}
          onChange={(e) => setCaptcha(e.target.value.replace(/\s+/g, ''))}
          placeholder="digite o código"
          className="font-mono tracking-widest"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Digite exatamente como aparece (respeitando maiúsculas e minúsculas). O código expira rápido — ele é renovado
        automaticamente a cada 90 segundos e sempre que um envio falha.
      </p>
    </div>
  );

  if (!open) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-border/60 bg-card/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-xl hover:bg-card"
      >
        <ListPlus className="w-4 h-4 text-primary" /> Enviar lista
        <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-xl',
        'inset-x-2 bottom-2 top-16 sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-4 sm:w-[420px]',
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border/60 bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ListPlus className="w-4 h-4" />
            </span>
            Enviar lista para o app
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            O chat continua liberado — você pode copiar dados enquanto preenche.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMinimized(true)} title="Minimizar">
            <Minus className="w-4 h-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => onOpenChange(false)} title="Fechar">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as ProviderTab)}>
            <TabsList className="grid grid-cols-3 h-auto w-full gap-2 p-2 bg-muted/40 rounded-xl">
              {([
                { value: 'clouddy', label: 'Clouddy', icon: Cloud },
                { value: 'ibopro', label: 'IBO Pro', icon: Tv },
                { value: 'iboplayer', label: 'IBO Player', icon: Play },
                { value: 'duplecast', label: 'Duplecast', icon: Cast },
                { value: 'bobplayer', label: 'Bob Player', icon: MonitorPlay },
                { value: 'smartersmax', label: 'Smarters Max', icon: Sparkle },
              ] as const).map((app) => (
                <TabsTrigger
                  key={app.value}
                  value={app.value}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-medium leading-tight data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all"
                >
                  <app.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate w-full text-center">{app.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="clouddy" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label>E-mail do cliente (conta no app)</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  type="email"
                  autoCapitalize="none"
                />
              </div>
              {listField}
              {epgField('Deixe vazio para usar a mesma URL da lista')}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={sendTv} onCheckedChange={setSendTv} />
                  <Label className="text-sm">Canais (TV)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={sendVod} onCheckedChange={setSendVod} />
                  <Label className="text-sm">Filmes (VOD)</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ibopro" className="space-y-3 pt-3">
              {deviceFields('senha exibida no app')}
              {listField}
            </TabsContent>

            <TabsContent value="iboplayer" className="space-y-3 pt-3">
              {deviceFields('senha exibida no app')}
              {listField}
              {epgField('Deixe vazio para usar a mesma URL da lista')}
              {captchaField('IBO Player')}
            </TabsContent>

            <TabsContent value="duplecast" className="space-y-3 pt-3">
              {deviceFields('código exibido no aparelho')}
              {listField}
              {epgField('Deixe vazio para não enviar EPG')}
              <p className="text-[11px] text-muted-foreground">
                Usa o login do seu painel Duplecast salvo em Ativação de Apps → Painéis.
              </p>
            </TabsContent>

            <TabsContent value="smartersmax" className="space-y-3 pt-3">
              {deviceFields('device key exibida no app')}
              {listField}
              <p className="text-[11px] text-muted-foreground">
                Envia direto pelo login do aparelho (MAC + Device Key) no Smarters Max.
              </p>
            </TabsContent>

            <TabsContent value="bobplayer" className="space-y-3 pt-3">
              {deviceFields('senha exibida no app')}
              {listField}
              {epgField('Deixe vazio para usar a mesma URL da lista')}
              {captchaField('Bob Player')}
            </TabsContent>
          </Tabs>
        </div>

      <div className="border-t border-border/60 bg-background/60 p-3">
        <Button className="w-full h-10 rounded-xl" onClick={handleSend} disabled={sending || !canSend}>
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Enviar lista
        </Button>
      </div>
    </div>
  );
}
