import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ListPlus, Send, Loader2 } from 'lucide-react';

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

export function formatMac(raw: string) {
  const clean = (raw || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase().slice(0, 12);
  return clean.replace(/(.{2})(?=.)/g, '$1:');
}

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
  const [tab, setTab] = useState<'clouddy' | 'ibopro' | 'duplecast' | 'bobplayer'>('clouddy');
  const [listUrl, setListUrl] = useState(defaultListUrl);
  const [epgUrl, setEpgUrl] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [sendTv, setSendTv] = useState(true);
  const [sendVod, setSendVod] = useState(true);
  const [sending, setSending] = useState(false);

  // IBO Pro
  const [mac, setMac] = useState(defaultMac);
  const [deviceKey, setDeviceKey] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [pin, setPin] = useState('');

  // Bob Player (captcha)
  const [captcha, setCaptcha] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);

  const [templateId, setTemplateId] = useState<string>('');

  const loadCaptcha = async () => {
    setLoadingCaptcha(true);
    setCaptcha('');
    try {
      const { data, error } = await supabase.functions.invoke('send-playlist', {
        body: { provider: 'bobplayer', action: 'bob-captcha' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setCaptchaSvg((data as any).svg || '');
      setCaptchaToken((data as any).token || '');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao carregar o captcha');
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    if (open && tab === 'bobplayer' && !captchaSvg) loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);


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
    if (tab === 'bobplayer') return macOk && !!captcha.trim() && !!captchaToken;
    return macOk;
  }, [tab, listUrl, email, mac, deviceKey, captcha, captchaToken]);

  const handleSend = async () => {
    if (!canSend) return toast.error('Preencha os campos obrigatórios.');
    setSending(true);
    try {
      const body =
        tab === 'bobplayer'
          ? {
              provider: 'bobplayer',
              mac: formatMac(mac),
              device_key: deviceKey.trim(),
              playlist_name: playlistName.trim() || 'Lista',
              m3u_url: listUrl.trim(),
              epg_url: epgUrl.trim() || undefined,
              pin: pin.trim() || undefined,
              captcha: captcha.trim(),
              captcha_token: captchaToken,
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


      const { data, error } = await supabase.functions.invoke('send-playlist', { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.success === false) throw new Error((data as any)?.message || 'Falha no envio');
      toast.success((data as any)?.message || 'Lista enviada!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar a lista');
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="w-4 h-4" /> Enviar lista para o app
          </DialogTitle>
          <DialogDescription>
            Cole a lista pronta e envie direto para o app do cliente.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="clouddy">Clouddy</TabsTrigger>
            <TabsTrigger value="ibopro">IBO Pro</TabsTrigger>
            <TabsTrigger value="duplecast">Duplecast</TabsTrigger>
          </TabsList>

          <TabsContent value="clouddy" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>E-mail do cliente (conta no app)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" />
            </div>
            {listField}
            <div className="space-y-1.5">
              <Label>EPG (opcional)</Label>
              <Input
                value={epgUrl}
                onChange={(e) => setEpgUrl(e.target.value)}
                placeholder="Deixe vazio para usar a mesma URL da lista"
                className="font-mono text-[11px]"
              />
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>MAC do aparelho</Label>
                <Input
                  value={mac}
                  onChange={(e) => setMac(formatMac(e.target.value))}
                  placeholder="aa:bb:cc:dd:ee:ff"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Device Key</Label>
                <Input
                  value={deviceKey}
                  onChange={(e) => setDeviceKey(e.target.value)}
                  placeholder="senha exibida no app"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome da lista</Label>
                <Input value={playlistName} onChange={(e) => setPlaylistName(e.target.value)} placeholder="Minha Lista" />
              </div>
              <div className="space-y-1.5">
                <Label>PIN (opcional)</Label>
                <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="ex: 102030" />
              </div>
            </div>
            {listField}
          </TabsContent>

          <TabsContent value="duplecast" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>MAC do aparelho</Label>
                <Input
                  value={mac}
                  onChange={(e) => setMac(formatMac(e.target.value))}
                  placeholder="aa:bb:cc:dd:ee:ff"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Device Key</Label>
                <Input
                  value={deviceKey}
                  onChange={(e) => setDeviceKey(e.target.value)}
                  placeholder="código exibido no aparelho"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome da lista</Label>
                <Input value={playlistName} onChange={(e) => setPlaylistName(e.target.value)} placeholder="Minha Lista" />
              </div>
              <div className="space-y-1.5">
                <Label>PIN (opcional)</Label>
                <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="ex: 102030" />
              </div>
            </div>
            {listField}
            <div className="space-y-1.5">
              <Label>EPG (opcional)</Label>
              <Input
                value={epgUrl}
                onChange={(e) => setEpgUrl(e.target.value)}
                placeholder="Deixe vazio para não enviar EPG"
                className="font-mono text-[11px]"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Usa o login do seu painel Duplecast salvo em Ativação de Apps → Painéis.
            </p>
          </TabsContent>
        </Tabs>

        <Button className="w-full" onClick={handleSend} disabled={sending || !canSend}>
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Enviar lista
        </Button>
      </DialogContent>
    </Dialog>
  );
}
