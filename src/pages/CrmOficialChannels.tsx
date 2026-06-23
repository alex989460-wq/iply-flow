import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, ArrowRight, Globe, Loader2, Plus, RefreshCw, Star, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhatsAppChannel {
  id: string;
  kind: 'whatsapp_cloud';
  name?: string;
  phone_number?: string;
  display_phone_number?: string;
  verified_name?: string;
  phone_number_id?: string;
  waba_id?: string;
  quality_rating?: string;
  is_active?: boolean;
  primary?: boolean;
  is_primary?: boolean;
  avatar_url?: string | null;
}
interface WebchatChannel {
  id: string;
  kind: 'webchat';
  widget_key?: string;
  title?: string;
  enabled?: boolean;
}

function qualityClass(q?: string) {
  const v = (q || '').toUpperCase();
  if (v === 'GREEN') return 'text-emerald-400';
  if (v === 'YELLOW') return 'text-amber-400';
  if (v === 'RED') return 'text-red-400';
  return 'text-muted-foreground';
}

export default function CrmOficialChannels() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppChannel[]>([]);
  const [webchat, setWebchat] = useState<WebchatChannel | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<'whatsapp_cloud' | 'webchat'>('whatsapp_cloud');

  const [wa, setWa] = useState({
    name: '',
    phone_number_id: '',
    system_user_token: '',
    waba_id: '',
    verify_token: '',
  });
  const [wc, setWc] = useState({
    title: 'Fale conosco',
    brand_color: '#10b981',
    welcome_message: 'Olá! Como podemos te ajudar?',
    position: 'bottom-right',
    enabled: true,
  });

  const loadChannels = useCallback(async (key: string) => {
    if (!key) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-channels', data: { apiKey: key } },
      });
      if (error) throw error;
      const body = data?.results?.channels?.body;
      if (data?.results?.channels?.ok && body) {
        setWhatsapp(Array.isArray(body.whatsapp) ? body.whatsapp : []);
        setWebchat(body.webchat || null);
      } else {
        toast({
          title: 'Não foi possível listar canais',
          description: `Status ${data?.results?.channels?.status ?? '?'}`,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('crm_oficial_settings')
        .select('api_key, enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      const key = data?.api_key ?? '';
      setApiKey(key);
      setEnabled(!!data?.enabled);
      setLoading(false);
      if (key) loadChannels(key);
    })();
  }, [user, loadChannels]);

  const openCreate = (kind: 'whatsapp_cloud' | 'webchat') => {
    setModalKind(kind);
    setModalOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const channel =
        modalKind === 'whatsapp_cloud'
          ? { kind: 'whatsapp_cloud', ...wa }
          : { kind: 'webchat', ...wc };
      if (modalKind === 'whatsapp_cloud') {
        if (!wa.name || !wa.phone_number_id || !wa.system_user_token) {
          toast({ title: 'Campos obrigatórios', description: 'Nome, Phone Number ID e System User Token.', variant: 'destructive' });
          setSaving(false);
          return;
        }
      }
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'create-channel', data: { apiKey, channel } },
      });
      if (error) throw error;
      const ok = !!data?.results?.channel?.ok;
      toast({
        title: ok ? 'Canal salvo' : 'Falha',
        description: ok ? 'Canal sincronizado no CRM Oficial.' : `Status ${data?.results?.channel?.status}`,
        variant: ok ? 'default' : 'destructive',
      });
      if (ok) {
        setModalOpen(false);
        if (modalKind === 'whatsapp_cloud') {
          setWa({ name: '', phone_number_id: '', system_user_token: '', waba_id: '', verify_token: '' });
        }
        loadChannels(apiKey);
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-emerald-500" />
              Canais
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie seus canais WhatsApp Cloud e Webchat sincronizados com o CRM Oficial.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadChannels(apiKey)} disabled={!apiKey || refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
        </div>

        {!apiKey && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Configure sua chave de API em <strong>Configurações → CRM Oficial</strong> antes de gerenciar canais.
            </AlertDescription>
          </Alert>
        )}

        {apiKey && !enabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A integração está desativada. As automações não dispararão até você ativá-la em Configurações.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {whatsapp.map((ch) => (
            <div
              key={ch.id}
              className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-5 space-y-4 hover:border-emerald-500/40 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {ch.avatar_url ? (
                      <img src={ch.avatar_url} alt={ch.name || 'WhatsApp'} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-600/40 flex items-center justify-center text-emerald-300 font-bold">
                        {(ch.name || 'W').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{ch.name || 'WhatsApp'}</h3>
                      {ch.is_primary && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                          <Star className="w-2.5 h-2.5 fill-amber-400" /> Principal
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{ch.phone_number || '—'}</p>
                  </div>
                </div>
                <span className={cn(
                  'text-xs font-medium flex items-center gap-1.5 shrink-0',
                  ch.is_active ? 'text-emerald-400' : 'text-muted-foreground'
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', ch.is_active ? 'bg-emerald-400' : 'bg-muted-foreground')} />
                  {ch.is_active ? 'Conectado' : 'Inativo'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Phone ID</p>
                  <p className="font-mono text-xs truncate">{ch.phone_number_id || '—'}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Qualidade</p>
                  <p className={cn('font-bold text-sm', qualityClass(ch.quality_rating))}>
                    {(ch.quality_rating || '—').toUpperCase()}
                  </p>
                </div>
              </div>

              <Button variant="outline" className="w-full justify-between" onClick={() => openCreate('whatsapp_cloud')}>
                Gerenciar acima
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ))}

          {/* Webchat card */}
          <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-5 space-y-4 hover:border-blue-500/40 transition flex flex-col">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/30 flex items-center justify-center">
                <Globe className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold">{webchat?.title || 'Webchat'}</h3>
                <p className="text-xs text-muted-foreground">Widget para o seu site</p>
              </div>
              {webchat?.enabled && (
                <span className="ml-auto text-xs font-medium flex items-center gap-1.5 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ativo
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              className="justify-start text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 mt-auto -ml-3"
              onClick={() => openCreate('webchat')}
            >
              Configurar →
            </Button>
          </div>

          {/* Add new channel tile */}
          <button
            type="button"
            onClick={() => openCreate('whatsapp_cloud')}
            disabled={!apiKey}
            className="rounded-2xl border-2 border-dashed border-border/60 bg-card/20 p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/5 transition min-h-[180px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-8 h-8" />
            <span className="font-medium">Adicionar novo canal</span>
          </button>
        </div>

        {/* Create/edit modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Adicionar canal</DialogTitle>
              <DialogDescription>POST /api/public/v1/channels — escopo channels:write</DialogDescription>
            </DialogHeader>

            <Tabs value={modalKind} onValueChange={(v) => setModalKind(v as any)}>
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="whatsapp_cloud">WhatsApp Cloud</TabsTrigger>
                <TabsTrigger value="webchat">Webchat</TabsTrigger>
              </TabsList>

              <TabsContent value="whatsapp_cloud" className="space-y-3 pt-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nome do canal *</Label>
                    <Input value={wa.name} onChange={(e) => setWa({ ...wa, name: e.target.value })} placeholder="Atendimento Comercial" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone Number ID *</Label>
                    <Input value={wa.phone_number_id} onChange={(e) => setWa({ ...wa, phone_number_id: e.target.value })} placeholder="123456789012345" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>System User Token *</Label>
                    <Input type="password" value={wa.system_user_token} onChange={(e) => setWa({ ...wa, system_user_token: e.target.value })} placeholder="EAAG..." className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>WABA ID</Label>
                    <Input value={wa.waba_id} onChange={(e) => setWa({ ...wa, waba_id: e.target.value })} placeholder="987654321" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Verify Token</Label>
                    <Input value={wa.verify_token} onChange={(e) => setWa({ ...wa, verify_token: e.target.value })} placeholder="meu_token_webhook" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="webchat" className="space-y-3 pt-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Título</Label>
                    <Input value={wc.title} onChange={(e) => setWc({ ...wc, title: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cor</Label>
                    <div className="flex gap-2">
                      <Input type="color" value={wc.brand_color} onChange={(e) => setWc({ ...wc, brand_color: e.target.value })} className="w-16 p-1" />
                      <Input value={wc.brand_color} onChange={(e) => setWc({ ...wc, brand_color: e.target.value })} placeholder="#10b981" />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Mensagem de boas-vindas</Label>
                    <Textarea value={wc.welcome_message} onChange={(e) => setWc({ ...wc, welcome_message: e.target.value })} rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Posição</Label>
                    <Select value={wc.position} onValueChange={(v) => setWc({ ...wc, position: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Inferior direito</SelectItem>
                        <SelectItem value="bottom-left">Inferior esquerdo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
                    <Label>Widget ativo</Label>
                    <Switch checked={wc.enabled} onCheckedChange={(v) => setWc({ ...wc, enabled: v })} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={saving || !apiKey} className="bg-emerald-500 hover:bg-emerald-600">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Salvar canal
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
