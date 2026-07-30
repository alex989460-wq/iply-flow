import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmail?: string;
  defaultUsername?: string;
  defaultPassword?: string;
  defaultHost?: string;
}

export default function SendPlaylistDialog({
  open,
  onOpenChange,
  defaultEmail = '',
  defaultUsername = '',
  defaultPassword = '',
  defaultHost = '',
}: Props) {
  const [templateId, setTemplateId] = useState<string>('');
  const [email, setEmail] = useState(defaultEmail);
  const [usuario, setUsuario] = useState(defaultUsername);
  const [senha, setSenha] = useState(defaultPassword);
  const [host, setHost] = useState(defaultHost);
  const [sendTv, setSendTv] = useState(true);
  const [sendVod, setSendVod] = useState(true);
  const [sending, setSending] = useState(false);

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
    setUsuario(defaultUsername);
    setSenha(defaultPassword);
    setHost(defaultHost);
  }, [open, defaultEmail, defaultUsername, defaultPassword, defaultHost]);

  useEffect(() => {
    if (!templates.length) return;
    if (templateId && templates.some((t) => t.id === templateId)) return;
    const first = templates.find((t) => t.is_default) || templates[0];
    setTemplateId(first.id);
    setSendTv(first.send_tv);
    setSendVod(first.send_vod);
    if (!host && first.default_host) setHost(first.default_host);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId],
  );

  const vars = { usuario, senha, host, email };
  const m3uUrl = template ? renderPlaylistUrl(template.m3u_url_template, vars) : '';
  const epgUrl = template ? renderPlaylistUrl(template.epg_url_template || '', vars) : '';

  const handleSend = async () => {
    if (!template) return toast.error('Cadastre um modelo de lista primeiro.');
    if (!email.trim()) return toast.error('Informe o e-mail do cliente.');
    if (!m3uUrl) return toast.error('URL da lista vazia — revise o modelo.');

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-playlist', {
        body: {
          provider: 'clouddy',
          email: email.trim(),
          m3u_url: m3uUrl,
          epg_url: epgUrl || undefined,
          send_tv: sendTv,
          send_vod: sendVod,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success((data as any)?.message || 'Lista enviada!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar a lista');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="w-4 h-4" /> Enviar lista para o app
          </DialogTitle>
          <DialogDescription>
            Usa o seu modelo de lista e as credenciais do painel Clouddy configuradas na sua conta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <Select value={templateId} onValueChange={(v) => {
              setTemplateId(v);
              const t = templates.find((x) => x.id === v);
              if (t) {
                setSendTv(t.send_tv);
                setSendVod(t.send_vod);
                if (t.default_host) setHost(t.default_host);
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder={templates.length ? 'Selecione' : 'Nenhum modelo cadastrado'} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>E-mail do cliente (conta no app)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Usuário</Label>
              <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Host / servidor</Label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="http://servidor.com" />
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

          {m3uUrl && (
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Prévia da URL enviada</p>
              <p className="text-[11px] break-all font-mono">{m3uUrl}</p>
              {epgUrl && <p className="text-[11px] break-all font-mono text-muted-foreground">EPG: {epgUrl}</p>}
            </div>
          )}

          <Button className="w-full" onClick={handleSend} disabled={sending || !template}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar lista
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
