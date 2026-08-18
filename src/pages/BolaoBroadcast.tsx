import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Send, Megaphone, RefreshCw, Image as ImageIcon, MessageSquare, CheckCircle, XCircle, Upload } from 'lucide-react';

const DEFAULT_IMAGE_URL = '';

const DEFAULT_TEXT = '';

interface Target {
  phone: string;
  name?: string;
}

type Source = 'window24h' | 'window48h';

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  // remove '55' prefix to dedupe; we'll add back on send
  const noCC = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  return noCC;
}

interface CrmChannel {
  id: string;
  name?: string;
  phone_number_id?: string;
  display_phone_number?: string;
  verified_name?: string;
  kind?: string;
}

function normalizeChannels(body: any): CrmChannel[] {
  const list = Array.isArray(body) ? body : Array.isArray(body?.channels) ? body.channels : [];
  const raw = list.length
    ? list
    : Array.isArray(body?.whatsapp)
      ? body.whatsapp
      : body?.whatsapp
        ? [body.whatsapp]
        : [];
  return raw.map((c: any, i: number) => ({
    ...c,
    id: String(c.id || c.phone_number_id || `channel-${i}`),
    name: c.name || c.title || c.verified_name || c.display_name || c.display_phone_number,
    verified_name: c.verified_name || c.business_name || c.name,
    display_phone_number: c.display_phone_number || c.phone_display || c.phone_number || c.phone,
    kind: c.kind || c.type || 'whatsapp_cloud',
  }));
}

export default function BolaoBroadcast() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [imageUrl, setImageUrl] = useState(DEFAULT_IMAGE_URL);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [source, setSource] = useState<Source>('window24h');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, errors: 0, total: 0 });
  const [logs, setLogs] = useState<{ phone: string; ok: boolean; error?: string }[]>([]);
  const [channels, setChannels] = useState<CrmChannel[]>([]);
  const [channelId, setChannelId] = useState<string>('');
  const [loadingChannels, setLoadingChannels] = useState(false);

  async function loadDepartment() {
    if (!user) return;
    const { data: zap } = await supabase
      .from('zap_responder_settings')
      .select('selected_department_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (zap?.selected_department_id) setDepartmentId(zap.selected_department_id);
  }

  async function loadChannels() {
    if (!user) return;
    setLoadingChannels(true);
    try {
      const { data: crm } = await supabase
        .from('crm_oficial_settings')
        .select('api_key, enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-channels', data: { apiKey: crm?.api_key } },
      });
      if (error) throw error;
      const list = normalizeChannels((data as any)?.results?.channels?.body);
      setChannels(list);
      setChannelId((prev) => prev || list[0]?.id || '');
    } catch (e: any) {
      console.error('[bolao] canais', e);
    } finally {
      setLoadingChannels(false);
    }
  }


  async function handleFileUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('crm_media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('crm_media')
        .getPublicUrl(filePath);

      setImageUrl(publicUrl);
      setImageFile(file);
      toast({ title: "Imagem carregada com sucesso" });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function loadTargets() {
    setLoading(true);
    try {
      const map = new Map<string, Target>();

      if (source === 'window24h' || source === 'window48h') {
        const hours = source === 'window24h' ? 24 : 48;
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        // Pagination — evolution_messages can be large
        const pageSize = 1000;
        for (let from = 0; from < 50000; from += pageSize) {
          const { data, error } = await supabase
            .from('evolution_messages')
            .select('phone, contact_name')
            .eq('direction', 'in')
            .gte('created_at', since)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const m of data) {
            const p = normalizePhone(m.phone);
            if (!p) continue;
            if (!map.has(p)) map.set(p, { phone: p, name: m.contact_name || undefined });
          }
          if (data.length < pageSize) break;
        }
      } else {
        // window48h
        const hours = 48;
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        const pageSize = 1000;
        for (let from = 0; from < 50000; from += pageSize) {
          const { data, error } = await supabase
            .from('evolution_messages')
            .select('phone, contact_name')
            .eq('direction', 'in')
            .gte('created_at', since)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const m of data) {
            const p = normalizePhone(m.phone);
            if (!p) continue;
            if (!map.has(p)) map.set(p, { phone: p, name: m.contact_name || undefined });
          }
          if (data.length < pageSize) break;
        }
      }

      const arr = Array.from(map.values());
      setTargets(arr);
      toast({ title: 'Lista carregada', description: `${arr.length} destinatários encontrados.` });
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Erro ao carregar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDepartment();
    loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  async function handleSend() {
    if (!departmentId && !channelId) {
      toast({ title: 'Canal não configurado', description: 'Selecione um canal do CRM Oficial ou configure o departamento em Configurações.', variant: 'destructive' });
      return;
    }
    if (targets.length === 0) {
      toast({ title: 'Sem destinatários', variant: 'destructive' });
      return;
    }
    if (!confirm(`Confirmar envio para ${targets.length} clientes?`)) return;

    setSending(true);
    setLogs([]);
    setProgress({ sent: 0, errors: 0, total: targets.length });

    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      const number = c.phone.startsWith('55') ? c.phone : `55${c.phone}`;
      try {
        const { data, error } = channelId
          ? await supabase.functions.invoke('crm-oficial-sync', {
              body: {
                action: 'send-whatsapp',
                data: {
                  phone: number,
                  name: c.name,
                  channel_id: channelId,
                  body: text || undefined,
                  media_url: imageUrl || undefined,
                  caption: imageUrl ? text || undefined : undefined,
                  media_type: imageUrl ? 'image' : undefined,
                },
              },
            })
          : await supabase.functions.invoke('zap-responder', {
              body: {
                action: 'enviar-mensagem',
                department_id: departmentId,
                number,
                text,
                image_url: imageUrl || undefined,
              },
            });
        const ok = !error && (channelId ? (data as any)?.results?.send?.ok !== false : (data as any)?.success);
        setLogs((prev) => [...prev, { phone: number, ok, error: error?.message || (data as any)?.error }]);
        setProgress((p) => ({ ...p, sent: p.sent + (ok ? 1 : 0), errors: p.errors + (ok ? 0 : 1) }));
      } catch (e: any) {

        setLogs((prev) => [...prev, { phone: number, ok: false, error: e.message }]);
        setProgress((p) => ({ ...p, errors: p.errors + 1 }));
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    setSending(false);
    toast({ title: 'Disparo concluído' });
  }

  const pct = progress.total > 0 ? ((progress.sent + progress.errors) / progress.total) * 100 : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-5xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-2xl mb-6">
          <div className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center shadow-lg shadow-sky-500/10">
              <Megaphone className="w-7 h-7 text-sky-500" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">Disparo Janela 24h</h1>
              <p className="text-muted-foreground text-sm font-medium">Reengajamento de contatos ativos no WhatsApp</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Origem dos destinatários</CardTitle>
            <CardDescription>
              Envia somente para contatos que interagiram com você nas últimas horas (janela ativa do WhatsApp),
              evitando bloqueios por mensagens fora da janela.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Select value={source} onValueChange={(v) => setSource(v as Source)}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="window24h">Janela ativa (últimas 24h)</SelectItem>
                  <SelectItem value="window48h">Janela ampliada (últimas 48h)</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadTargets} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Atualizar lista
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Select value={channelId} onValueChange={setChannelId} disabled={loadingChannels || channels.length === 0}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder={loadingChannels ? 'Carregando canais...' : 'Selecione o canal de envio'} />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      {ch.name || ch.verified_name || ch.id}
                      {ch.display_phone_number ? ` · ${ch.display_phone_number}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadChannels} disabled={loadingChannels}>
                {loadingChannels ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Atualizar canais
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-base px-3 py-1">
                {loading ? '...' : targets.length} destinatários
              </Badge>
              {channelId || departmentId ? (
                <span className="text-xs text-emerald-500">✓ Envio via API Oficial (CRM Oficial)</span>
              ) : (
                <span className="text-xs text-destructive">⚠ Nenhum canal encontrado — cadastre em CRM Oficial → Canais</span>
              )}
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Imagem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>URL da Imagem</Label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Ou suba do seu PC</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label 
                  htmlFor="file-upload" 
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border/50 rounded-xl bg-background/50 hover:bg-background/80 hover:border-primary/50 transition-all cursor-pointer group"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                    <p className="text-sm text-muted-foreground group-hover:text-primary transition-colors font-medium">Clique para subir do PC</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG ou WEBP</p>
                  </div>
                  <Input 
                    id="file-upload"
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    disabled={uploading}
                  />
                </Label>
                {uploading && (
                  <div className="flex items-center gap-2 text-xs text-primary font-bold animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Fazendo upload para o servidor...
                  </div>
                )}
              </div>

            </div>

            {imageUrl && (
              <div className="relative group">
                <img src={imageUrl} alt="Preview" className="max-h-72 w-full object-contain rounded-lg border bg-secondary/20" />
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => { setImageUrl(''); setImageFile(null); }}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Mensagem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={sending || loading || targets.length === 0} size="lg">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para {targets.length} clientes
          </Button>
        </div>

        {(sending || progress.total > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progresso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={pct} />
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="w-4 h-4" /> {progress.sent} enviadas
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="w-4 h-4" /> {progress.errors} erros
                </span>
                <span className="text-muted-foreground">
                  {progress.sent + progress.errors} / {progress.total}
                </span>
              </div>
              <div className="max-h-60 overflow-auto border rounded text-xs">
                {logs.slice(-200).reverse().map((l, idx) => (
                  <div
                    key={idx}
                    className={`flex justify-between px-2 py-1 border-b ${l.ok ? 'text-green-600' : 'text-destructive'}`}
                  >
                    <span>{l.phone}</span>
                    <span>{l.ok ? 'OK' : l.error || 'erro'}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
