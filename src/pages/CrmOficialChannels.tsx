import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Globe, Loader2, MessageCircle, Plus, RefreshCw, Zap } from 'lucide-react';

interface WhatsAppChannel {
  id: string;
  kind: 'whatsapp_cloud';
  name?: string;
  phone_number_id?: string;
  waba_id?: string;
  is_active?: boolean;
}
interface WebchatChannel {
  id: string;
  kind: 'webchat';
  widget_key?: string;
  title?: string;
  enabled?: boolean;
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

  // WhatsApp form
  const [wa, setWa] = useState({
    name: '',
    phone_number_id: '',
    system_user_token: '',
    waba_id: '',
    verify_token: '',
  });

  // Webchat form
  const [wc, setWc] = useState({
    title: 'Fale conosco',
    brand_color: '#3b82f6',
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

  const createWhatsapp = async () => {
    if (!wa.name || !wa.phone_number_id || !wa.system_user_token) {
      toast({ title: 'Campos obrigatórios', description: 'Nome, Phone Number ID e System User Token são obrigatórios.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: {
          action: 'create-channel',
          data: { apiKey, channel: { kind: 'whatsapp_cloud', ...wa } },
        },
      });
      if (error) throw error;
      const ok = !!data?.results?.channel?.ok;
      toast({
        title: ok ? 'Canal WhatsApp criado' : 'Falha ao criar',
        description: ok ? 'Canal sincronizado no CRM Oficial.' : `Status ${data?.results?.channel?.status}`,
        variant: ok ? 'default' : 'destructive',
      });
      if (ok) {
        setWa({ name: '', phone_number_id: '', system_user_token: '', waba_id: '', verify_token: '' });
        loadChannels(apiKey);
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const createWebchat = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: {
          action: 'create-channel',
          data: { apiKey, channel: { kind: 'webchat', ...wc } },
        },
      });
      if (error) throw error;
      const ok = !!data?.results?.channel?.ok;
      toast({
        title: ok ? 'Webchat configurado' : 'Falha',
        description: ok ? 'Widget pronto para uso.' : `Status ${data?.results?.channel?.status}`,
        variant: ok ? 'default' : 'destructive',
      });
      if (ok) loadChannels(apiKey);
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
      <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-emerald-500" />
              Canais do CRM Oficial
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure canais WhatsApp Cloud e Webchat sincronizados com o CRM Oficial.
            </p>
          </div>
          <Button variant="outline" onClick={() => loadChannels(apiKey)} disabled={!apiKey || refreshing}>
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

        {/* Existing channels */}
        <Card>
          <CardHeader>
            <CardTitle>Canais existentes</CardTitle>
            <CardDescription>Lista sincronizada via GET /api/public/v1/channels</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {whatsapp.length === 0 && !webchat && (
              <p className="text-sm text-muted-foreground">Nenhum canal encontrado.</p>
            )}
            {whatsapp.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="font-medium">{ch.name || 'WhatsApp'}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      phone_number_id: {ch.phone_number_id || '—'} {ch.waba_id ? `· waba_id: ${ch.waba_id}` : ''}
                    </p>
                  </div>
                </div>
                <Badge variant={ch.is_active ? 'default' : 'secondary'}>
                  {ch.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            ))}
            {webchat && (
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="font-medium">{webchat.title || 'Webchat'}</p>
                    <p className="text-xs text-muted-foreground font-mono">widget_key: {webchat.widget_key || '—'}</p>
                  </div>
                </div>
                <Badge variant={webchat.enabled ? 'default' : 'secondary'}>
                  {webchat.enabled ? 'Habilitado' : 'Desabilitado'}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create channel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Criar novo canal
            </CardTitle>
            <CardDescription>POST /api/public/v1/channels (escopo channels:write)</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="whatsapp">
              <TabsList>
                <TabsTrigger value="whatsapp"><MessageCircle className="w-4 h-4 mr-2" />WhatsApp Cloud</TabsTrigger>
                <TabsTrigger value="webchat"><Globe className="w-4 h-4 mr-2" />Webchat</TabsTrigger>
              </TabsList>

              <TabsContent value="whatsapp" className="space-y-4 pt-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nome do canal *</Label>
                    <Input value={wa.name} onChange={(e) => setWa({ ...wa, name: e.target.value })} placeholder="Atendimento Comercial" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number ID *</Label>
                    <Input value={wa.phone_number_id} onChange={(e) => setWa({ ...wa, phone_number_id: e.target.value })} placeholder="123456789012345" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>System User Token *</Label>
                    <Input
                      type="password"
                      value={wa.system_user_token}
                      onChange={(e) => setWa({ ...wa, system_user_token: e.target.value })}
                      placeholder="EAAG..."
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>WABA ID</Label>
                    <Input value={wa.waba_id} onChange={(e) => setWa({ ...wa, waba_id: e.target.value })} placeholder="987654321" />
                  </div>
                  <div className="space-y-2">
                    <Label>Verify Token (webhook)</Label>
                    <Input value={wa.verify_token} onChange={(e) => setWa({ ...wa, verify_token: e.target.value })} placeholder="meu_token_webhook" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={createWhatsapp} disabled={saving || !apiKey}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                    Criar canal WhatsApp
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="webchat" className="space-y-4 pt-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Título do widget</Label>
                    <Input value={wc.title} onChange={(e) => setWc({ ...wc, title: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cor (hex)</Label>
                    <div className="flex gap-2">
                      <Input type="color" value={wc.brand_color} onChange={(e) => setWc({ ...wc, brand_color: e.target.value })} className="w-16 p-1" />
                      <Input value={wc.brand_color} onChange={(e) => setWc({ ...wc, brand_color: e.target.value })} placeholder="#3b82f6" />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Mensagem de boas-vindas</Label>
                    <Textarea value={wc.welcome_message} onChange={(e) => setWc({ ...wc, welcome_message: e.target.value })} rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label>Posição</Label>
                    <Select value={wc.position} onValueChange={(v) => setWc({ ...wc, position: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Inferior direito</SelectItem>
                        <SelectItem value="bottom-left">Inferior esquerdo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <Label>Widget ativo</Label>
                    <Switch checked={wc.enabled} onCheckedChange={(v) => setWc({ ...wc, enabled: v })} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={createWebchat} disabled={saving || !apiKey}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                    Criar/atualizar Webchat
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
