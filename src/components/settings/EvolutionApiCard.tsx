import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Plug, Webhook, Zap, Copy, ExternalLink, QrCode } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function EvolutionApiCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [hasRow, setHasRow] = useState(false);
  const [form, setForm] = useState({
    is_enabled: false,
    base_url: '',
    api_key: '',
    instance_name: '',
    webhook_token: '',
  });
  const [connState, setConnState] = useState<string | null>(null);

  const supaUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
  const webhookUrl = form.webhook_token
    ? `${supaUrl}/functions/v1/evolution-webhook?token=${form.webhook_token}`
    : '';

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('evolution_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setHasRow(true);
        setForm({
          is_enabled: data.is_enabled,
          base_url: data.base_url || '',
          api_key: data.api_key || '',
          instance_name: data.instance_name || '',
          webhook_token: data.webhook_token || '',
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      is_enabled: form.is_enabled,
      base_url: form.base_url.trim().replace(/\/$/, ''),
      api_key: form.api_key.trim(),
      instance_name: form.instance_name.trim(),
    };
    const q = hasRow
      ? supabase.from('evolution_settings').update(payload).eq('user_id', user.id)
      : supabase.from('evolution_settings').insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setHasRow(true);
    toast({ title: 'Salvo', description: 'Configurações da Evolution salvas.' });
    // reload to grab webhook_token if just created
    const { data } = await supabase
      .from('evolution_settings')
      .select('webhook_token')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.webhook_token) setForm((f) => ({ ...f, webhook_token: data.webhook_token }));
  };

  const test = async () => {
    setTesting(true);
    setConnState(null);
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'test' },
    });
    setTesting(false);
    if (error) {
      toast({ title: 'Falha no teste', description: error.message, variant: 'destructive' });
      return;
    }
    const state = data?.data?.instance?.state || data?.data?.state || (data?.ok ? 'open' : 'erro');
    setConnState(state);
    toast({
      title: data?.ok ? 'Conectado' : 'Resposta recebida',
      description: data?.ok
        ? `Estado: ${state} (${data?.mode || 'Evolution'})`
        : `Estado: ${state} • HTTP ${data?.status || 'sem resposta'}`,
      variant: data?.ok ? 'default' : 'destructive',
    });
  };

  const configureWebhook = async () => {
    setSettingWebhook(true);
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'set-webhook' },
    });
    setSettingWebhook(false);
    if (error) {
      toast({ title: 'Falha', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: data?.ok ? 'Webhook configurado' : 'Resposta recebida',
      description: data?.ok
        ? `${data?.mode || 'Evolution'}: ${data?.webhookUrl}`
        : data?.error || `Evolution respondeu HTTP ${data?.status || 'sem resposta'}`,
      variant: data?.ok ? 'default' : 'destructive',
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Login do Painel Evolution
              {form.is_enabled && <Badge variant="default">Ativo</Badge>}
            </CardTitle>
            <CardDescription>
              Salve a URL e a API Key global para manter o painel conectado. As instâncias ficam em Conexões WhatsApp.
            </CardDescription>
          </div>
          <Switch
            checked={form.is_enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>URL Base</Label>
            <Input
              placeholder="https://evolution.seudominio.com"
              value={form.base_url}
              onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Instância ativa <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input
              placeholder="será preenchida em Conexões WhatsApp"
              value={form.instance_name}
              onChange={(e) => setForm((f) => ({ ...f, instance_name: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              Com API Key global, deixe vazio aqui. Depois adicione ou selecione a instância em <a href="/evolution-instances" className="underline text-primary">Conexões WhatsApp</a>.
            </p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>API Key (apikey)</Label>
            <Input
              type="password"
              placeholder="API Key global do painel Evolution"
              value={form.api_key}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
            />
          </div>
        </div>

        {webhookUrl && (
          <Alert>
            <Webhook className="w-4 h-4" />
            <AlertDescription className="space-y-2">
              <div className="text-xs font-medium">Webhook (configurado automaticamente ao clicar abaixo):</div>
              <div className="flex items-center gap-2">
                <code className="text-[11px] flex-1 break-all bg-muted p-2 rounded">{webhookUrl}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    toast({ title: 'Copiado' });
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar login
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || !hasRow}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plug className="w-4 h-4 mr-2" />}
            Verificar painel
          </Button>
          {form.instance_name.trim() && (
            <Button variant="outline" onClick={configureWebhook} disabled={settingWebhook || !hasRow}>
              {settingWebhook ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Webhook className="w-4 h-4 mr-2" />}
              Configurar webhook
            </Button>
          )}
          <Button variant="ghost" asChild>
            <a href="/evolution-instances" className="flex items-center">
              <QrCode className="w-4 h-4 mr-2" /> Ir para Conexões WhatsApp
            </a>
          </Button>
        </div>

        {connState && (
          <div className="text-xs text-muted-foreground">
Status do painel/instância: <span className="font-medium text-foreground">{connState}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
