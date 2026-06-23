import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Bot, CheckCircle2, Eye, EyeOff, ExternalLink, FileText, Loader2, MessageCircleMore, Save, XCircle, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';


interface CrmOficialSettings {
  api_key: string;
  enabled: boolean;
  auto_signup: boolean;
  auto_test_chat: boolean;
  auto_renew_notify: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
}

const DEFAULTS: CrmOficialSettings = {
  api_key: '',
  enabled: false,
  auto_signup: true,
  auto_test_chat: true,
  auto_renew_notify: true,
  last_test_at: null,
  last_test_ok: null,
};

export default function CrmOficialCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [exists, setExists] = useState(false);
  const [settings, setSettings] = useState<CrmOficialSettings>(DEFAULTS);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('crm_oficial_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) console.error(error);
      if (data) {
        setExists(true);
        setSettings({
          api_key: data.api_key ?? '',
          enabled: data.enabled,
          auto_signup: data.auto_signup,
          auto_test_chat: data.auto_test_chat,
          auto_renew_notify: data.auto_renew_notify,
          last_test_at: data.last_test_at,
          last_test_ok: data.last_test_ok,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        api_key: settings.api_key || null,
        enabled: settings.enabled,
        auto_signup: settings.auto_signup,
        auto_test_chat: settings.auto_test_chat,
        auto_renew_notify: settings.auto_renew_notify,
      };
      const { error } = exists
        ? await supabase.from('crm_oficial_settings').update(payload).eq('user_id', user.id)
        : await supabase.from('crm_oficial_settings').insert(payload);
      if (error) throw error;
      setExists(true);
      toast({ title: 'Salvo', description: 'Configurações do CRM Oficial atualizadas.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!settings.api_key) {
      toast({ title: 'Informe a chave', description: 'Cole sua chave de API antes de testar.', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'ping', data: { apiKey: settings.api_key } },
      });
      if (error) throw error;
      const ok = !!data?.results?.ping?.ok;
      await supabase
        .from('crm_oficial_settings')
        .update({ last_test_at: new Date().toISOString(), last_test_ok: ok })
        .eq('user_id', user!.id);
      setSettings(s => ({ ...s, last_test_at: new Date().toISOString(), last_test_ok: ok }));
      toast({
        title: ok ? 'Conexão OK' : 'Falha',
        description: ok ? 'Chave de API válida.' : `Status: ${data?.results?.ping?.status}`,
        variant: ok ? 'default' : 'destructive',
      });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-500" />
          <span>CRM Oficial</span>
          {settings.enabled && settings.api_key && (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 ml-2">Ativo</Badge>
          )}
          {settings.last_test_ok === true && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          {settings.last_test_ok === false && <XCircle className="w-4 h-4 text-red-500" />}
        </CardTitle>
        <CardDescription>
          Integre com{' '}
          <a href="https://crmapioficial.lovable.app" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
            crmapioficial.lovable.app <ExternalLink className="w-3 h-3" />
          </a>{' '}
          para sincronizar contas, chats de teste e notificações de renovação automaticamente.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Gere sua chave no painel do CRM Oficial em <strong>Integrações → Gerar chave</strong> e cole abaixo.
            Quando ativo, ao criar/renovar um sub-revendedor aqui, a ação correspondente é disparada lá automaticamente.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="crm_key">Chave da API *</Label>
          <div className="relative">
            <Input
              id="crm_key"
              type={showKey ? 'text' : 'password'}
              value={settings.api_key}
              onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
              placeholder="Cole sua chave Bearer do CRM Oficial"
              className="pr-10 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full"
              onClick={() => setShowKey(v => !v)}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="font-semibold">Ativar integração</Label>
              <p className="text-xs text-muted-foreground">Liga/desliga todas as automações do CRM Oficial</p>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Criar conta no CRM ao criar revendedor</Label>
              <p className="text-xs text-muted-foreground">Dispara /signup com o mesmo email/senha</p>
            </div>
            <Switch
              checked={settings.auto_signup}
              disabled={!settings.enabled}
              onCheckedChange={(v) => setSettings({ ...settings, auto_signup: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Criar chat de teste</Label>
              <p className="text-xs text-muted-foreground">Cria contato + mensagem inicial no inbox</p>
            </div>
            <Switch
              checked={settings.auto_test_chat}
              disabled={!settings.enabled}
              onCheckedChange={(v) => setSettings({ ...settings, auto_test_chat: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Notificar renovação</Label>
              <p className="text-xs text-muted-foreground">Envia mensagem com nova validade no inbox</p>
            </div>
            <Switch
              checked={settings.auto_renew_notify}
              disabled={!settings.enabled}
              onCheckedChange={(v) => setSettings({ ...settings, auto_renew_notify: v })}
            />
          </div>
        </div>

        {settings.last_test_at && (
          <p className="text-xs text-muted-foreground">
            Último teste: {new Date(settings.last_test_at).toLocaleString('pt-BR')} —{' '}
            {settings.last_test_ok ? (
              <span className="text-emerald-500">sucesso</span>
            ) : (
              <span className="text-red-500">falhou</span>
            )}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link to="/chat-crm-oficial">
              <MessageCircleMore className="w-4 h-4 mr-2" />
              Abrir Chat
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/crm-oficial-channels">
              <Zap className="w-4 h-4 mr-2" />
              Gerenciar Canais
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/crm-oficial-templates">
              <FileText className="w-4 h-4 mr-2" />
              Templates
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/crm-oficial-chatbots">
              <Bot className="w-4 h-4 mr-2" />
              Chatbots
            </Link>
          </Button>

          <Button variant="outline" onClick={testConnection} disabled={testing || !settings.api_key}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Testar conexão
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
