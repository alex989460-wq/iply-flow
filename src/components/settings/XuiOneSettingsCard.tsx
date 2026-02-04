import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Save, Server, CheckCircle2, AlertCircle, TestTube } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface XuiOneSettings {
  id?: string;
  base_url: string;
  api_key: string;
  access_code: string;
  is_enabled: boolean;
}

export default function XuiOneSettingsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  
  const [settings, setSettings] = useState<XuiOneSettings>({
    base_url: '',
    api_key: '',
    access_code: '',
    is_enabled: false,
  });

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('xui_one_settings')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasExisting(true);
        setSettings({
          id: data.id,
          base_url: data.base_url || '',
          api_key: data.api_key || '',
          access_code: data.access_code || '',
          is_enabled: data.is_enabled || false,
        });
      }
    } catch (error) {
      console.error('Error fetching XUI One settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (!settings.base_url.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha a URL do painel',
        variant: 'destructive',
      });
      return;
    }

    if (!settings.access_code.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha o usuário do revendedor',
        variant: 'destructive',
      });
      return;
    }

    if (!settings.api_key.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha a API Key',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        base_url: settings.base_url.trim().replace(/\/$/, ''), // Remove trailing slash
        api_key: settings.api_key.trim(),
        access_code: settings.access_code.trim(),
        is_enabled: settings.is_enabled,
        updated_at: new Date().toISOString(),
      };

      if (hasExisting) {
        const { error } = await supabase
          .from('xui_one_settings')
          .update(payload)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('xui_one_settings')
          .insert(payload);

        if (error) throw error;
        setHasExisting(true);
      }

      toast({
        title: 'Sucesso',
        description: 'Configuração salva com sucesso!',
      });
    } catch (error: any) {
      console.error('Error saving XUI One settings:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configurações',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings.base_url || !settings.api_key || !settings.access_code) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos antes de testar',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    try {
      // Test the connection by calling the edge function with a test action
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('xui-renew-line', {
        body: { 
          username: '__test_connection__',
          action: 'test'
        }
      });

      // If we get a 404 with "not found", it means the API is working (just no user found)
      if (response.error) {
        const errorMsg = response.error.message || '';
        if (errorMsg.includes('não encontrado') || errorMsg.includes('not found')) {
          toast({
            title: 'Conexão OK!',
            description: 'API conectada com sucesso. Suas credenciais estão funcionando.',
          });
          return;
        }
        throw new Error(errorMsg);
      }

      toast({
        title: 'Conexão OK!',
        description: 'API conectada com sucesso.',
      });
    } catch (error: any) {
      console.error('Test connection error:', error);
      toast({
        title: 'Erro na Conexão',
        description: error.message || 'Não foi possível conectar. Verifique as credenciais.',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isConfigured = settings.base_url.trim() && settings.api_key.trim() && settings.access_code.trim();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <CardTitle>Integração XUI One</CardTitle>
        </div>
        <CardDescription>
          Configure suas credenciais do painel XUI One para renovar clientes automaticamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        {isConfigured && settings.is_enabled ? (
          <Alert className="border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Integração XUI One configurada e ativa
            </AlertDescription>
          </Alert>
        ) : isConfigured ? (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-700 dark:text-yellow-400">
              Integração configurada mas desativada
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Preencha suas credenciais do painel XUI One para ativar a renovação automática
            </AlertDescription>
          </Alert>
        )}

        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="font-medium">Ativar Integração</Label>
            <p className="text-sm text-muted-foreground">
              Permite renovar clientes diretamente no painel XUI One
            </p>
          </div>
          <Switch
            checked={settings.is_enabled}
            onCheckedChange={(checked) => setSettings({ ...settings, is_enabled: checked })}
          />
        </div>

        {/* Base URL */}
        <div className="space-y-2">
          <Label htmlFor="xui-base-url">URL do Painel</Label>
          <Input
            id="xui-base-url"
            type="url"
            placeholder="https://seupainel.com"
            value={settings.base_url}
            onChange={(e) => setSettings({ ...settings, base_url: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            URL base do seu painel XUI One (ex: https://panel22.gestorvplay.com)
          </p>
        </div>

        {/* Access Code (username do revendedor) */}
        <div className="space-y-2">
          <Label htmlFor="xui-access-code">Usuário Revendedor</Label>
          <Input
            id="xui-access-code"
            type="text"
            placeholder="seu_usuario"
            value={settings.access_code}
            onChange={(e) => setSettings({ ...settings, access_code: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Seu nome de usuário de revendedor no XUI One (ex: dream6192)
          </p>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="xui-api-key">API Key</Label>
          <div className="relative">
            <Input
              id="xui-api-key"
              type={showApiKey ? 'text' : 'password'}
              placeholder="Sua API Key do painel"
              value={settings.api_key}
              onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sua API Key pessoal do XUI One (encontre em Configurações no painel)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleTestConnection} 
            disabled={testing || !isConfigured}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <TestTube className="mr-2 h-4 w-4" />
                Testar
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
