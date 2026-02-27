import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Save, Eye, EyeOff, AlertCircle, CheckCircle2, Key, Copy, ExternalLink } from 'lucide-react';

export default function ResellerApiSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  const [showCaktoSecret, setShowCaktoSecret] = useState(false);
  const [showCaktoClientSecret, setShowCaktoClientSecret] = useState(false);
  const [showNatvKey, setShowNatvKey] = useState(false);

  const [settings, setSettings] = useState({
    cakto_webhook_secret: '',
    cakto_client_id: '',
    cakto_client_secret: '',
    natv_api_key: '',
    natv_base_url: '',
  });

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-webhook`;

  useEffect(() => {
    if (user) fetchSettings();
  }, [user]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('reseller_api_settings' as any)
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasExisting(true);
        const d = data as any;
        setSettings({
          cakto_webhook_secret: d.cakto_webhook_secret || '',
          cakto_client_id: d.cakto_client_id || '',
          cakto_client_secret: d.cakto_client_secret || '',
          natv_api_key: d.natv_api_key || '',
          natv_base_url: d.natv_base_url || '',
        });
      }
    } catch (err) {
      console.error('Error fetching API settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        cakto_webhook_secret: settings.cakto_webhook_secret || '',
        cakto_client_id: settings.cakto_client_id || '',
        cakto_client_secret: settings.cakto_client_secret || '',
        natv_api_key: settings.natv_api_key || '',
        natv_base_url: settings.natv_base_url || '',
        updated_at: new Date().toISOString(),
      };

      if (hasExisting) {
        const { error } = await supabase
          .from('reseller_api_settings' as any)
          .update(payload)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reseller_api_settings' as any)
          .insert(payload);
        if (error) throw error;
        setHasExisting(true);
      }

      toast({ title: 'Sucesso', description: 'Configurações de API salvas!' });
    } catch (err: any) {
      console.error('Error saving API settings:', err);
      toast({ title: 'Erro', description: err.message || 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!', description: `${label} copiado para a área de transferência` });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const hasCakto = !!settings.cakto_webhook_secret;
  const hasNatv = !!settings.natv_api_key && !!settings.natv_base_url;

  return (
    <div className="space-y-6">
      {/* Cakto */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-orange-500" />
            Cakto (Webhook)
            {hasCakto && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Configure sua integração com a Cakto para renovação automática
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Como configurar:</strong>
              <ol className="list-decimal ml-4 mt-1 space-y-1 text-sm">
                <li>Acesse o painel da Cakto em <strong>Integrações &gt; Webhooks</strong></li>
                <li>Copie a <strong>URL do Webhook</strong> abaixo e cole na Cakto</li>
                <li>Copie o <strong>Client ID</strong>, <strong>Client Secret</strong> e <strong>Webhook Secret</strong> da Cakto e cole nos campos abaixo</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Webhook URL para copiar */}
          <div className="space-y-2">
            <Label>URL do Webhook (cole na Cakto)</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="bg-muted font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, 'URL do Webhook')}
                title="Copiar URL"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cole esta URL no campo de webhook da Cakto
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cakto_client_id">Client ID</Label>
              <Input
                id="cakto_client_id"
                value={settings.cakto_client_id}
                onChange={(e) => setSettings({ ...settings, cakto_client_id: e.target.value })}
                placeholder="Client ID da Cakto"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cakto_client_secret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="cakto_client_secret"
                  type={showCaktoClientSecret ? 'text' : 'password'}
                  value={settings.cakto_client_secret}
                  onChange={(e) => setSettings({ ...settings, cakto_client_secret: e.target.value })}
                  placeholder="Client Secret da Cakto"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowCaktoClientSecret(!showCaktoClientSecret)}
                >
                  {showCaktoClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cakto_secret">Webhook Secret</Label>
              <div className="relative">
                <Input
                  id="cakto_secret"
                  type={showCaktoSecret ? 'text' : 'password'}
                  value={settings.cakto_webhook_secret}
                  onChange={(e) => setSettings({ ...settings, cakto_webhook_secret: e.target.value })}
                  placeholder="Cole seu webhook secret da Cakto"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowCaktoSecret(!showCaktoSecret)}
                >
                  {showCaktoSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NATV */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-500" />
            NATV (Painel)
            {hasNatv && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Configure as credenciais do painel NATV para renovação automática
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="natv_key">API Key</Label>
            <div className="relative">
              <Input
                id="natv_key"
                type={showNatvKey ? 'text' : 'password'}
                value={settings.natv_api_key}
                onChange={(e) => setSettings({ ...settings, natv_api_key: e.target.value })}
                placeholder="Cole sua API Key do NATV"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowNatvKey(!showNatvKey)}
              >
                {showNatvKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="natv_url">URL Base da API</Label>
            <Input
              id="natv_url"
              value={settings.natv_base_url}
              onChange={(e) => setSettings({ ...settings, natv_base_url: e.target.value })}
              placeholder="https://revenda.pixbot.link/api"
            />
            <p className="text-xs text-muted-foreground">
              Ex: https://revenda.pixbot.link/api
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar APIs
        </Button>
      </div>
    </div>
  );
}
