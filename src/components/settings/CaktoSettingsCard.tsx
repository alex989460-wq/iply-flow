import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Save, Eye, EyeOff, AlertCircle, CheckCircle2, Zap } from 'lucide-react';
import MaskedUrlField from '@/components/ui/masked-url';

export default function CaktoSettingsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  
  const [settings, setSettings] = useState({
    cakto_webhook_secret: '',
    cakto_client_id: '',
    cakto_client_secret: '',
  });

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-webhook`;

  useEffect(() => {
    if (user) fetchSettings();
  }, [user]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('reseller_api_settings' as any)
        .select('cakto_webhook_secret, cakto_client_id, cakto_client_secret')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          cakto_webhook_secret: (data as any).cakto_webhook_secret || '',
          cakto_client_id: (data as any).cakto_client_id || '',
          cakto_client_secret: (data as any).cakto_client_secret || '',
        });
      }
    } catch (err) {
      console.error('Error fetching Cakto settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('reseller_api_settings' as any)
        .upsert({
          user_id: user.id,
          cakto_webhook_secret: settings.cakto_webhook_secret,
          cakto_client_id: settings.cakto_client_id,
          cakto_client_secret: settings.cakto_client_secret,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Configurações Cakto salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
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

  const hasCakto = !!settings.cakto_webhook_secret && !!settings.cakto_client_id;

  return (
    <Card className="border-orange-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-500" />
          </div>
          Cakto (Integração)
          {hasCakto && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto" />}
        </CardTitle>
        <CardDescription>
          Automatize a renovação de contas através dos webhooks da Cakto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-orange-500/5 border-orange-500/20">
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <AlertDescription className="text-xs text-orange-200/80">
            <strong>Como configurar:</strong>
            <ol className="list-decimal ml-4 mt-2 space-y-1">
              <li>Acesse <strong>Integrações &gt; Webhooks</strong> no painel Cakto.</li>
              <li>Cadastre a <strong>URL do Webhook</strong> abaixo.</li>
              <li>Insira as credenciais da API para liberação automática.</li>
            </ol>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">URL do Webhook</Label>
          <MaskedUrlField url={webhookUrl} label="Webhook URL" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Client ID</Label>
            <Input
              value={settings.cakto_client_id}
              onChange={(e) => setSettings({ ...settings, cakto_client_id: e.target.value })}
              placeholder="Ex: drLCC..."
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Client Secret</Label>
            <div className="relative">
              <Input
                type={showClientSecret ? 'text' : 'password'}
                value={settings.cakto_client_secret}
                onChange={(e) => setSettings({ ...settings, cakto_client_secret: e.target.value })}
                placeholder="••••••••"
                className="bg-background/50 pr-10"
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowClientSecret(!showClientSecret)}
              >
                {showClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Webhook Secret</Label>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={settings.cakto_webhook_secret}
              onChange={(e) => setSettings({ ...settings, cakto_webhook_secret: e.target.value })}
              placeholder="Chave secreta para validar assinaturas do webhook"
              className="bg-background/50 pr-10"
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-0 top-0 h-full"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-orange-600 hover:bg-orange-500 text-white font-bold"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Integração
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
