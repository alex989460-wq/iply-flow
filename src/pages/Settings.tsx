import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [settings, setSettings] = useState({
    api_base_url: 'https://api.zapresponder.com.br/api',
    zap_api_token: '',
    selected_session_id: '',
    selected_session_name: '',
    selected_session_phone: '',
    selected_department_id: '',
    selected_department_name: '',
  });
  const [hasExistingSettings, setHasExistingSettings] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasExistingSettings(true);
        setSettings({
          api_base_url: data.api_base_url || 'https://api.zapresponder.com.br/api',
          zap_api_token: data.zap_api_token || '',
          selected_session_id: data.selected_session_id || '',
          selected_session_name: data.selected_session_name || '',
          selected_session_phone: data.selected_session_phone || '',
          selected_department_id: data.selected_department_id || '',
          selected_department_name: data.selected_department_name || '',
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar configurações',
        variant: 'destructive',
      });
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
        api_base_url: settings.api_base_url,
        zap_api_token: settings.zap_api_token || null,
        selected_session_id: settings.selected_session_id || null,
        selected_session_name: settings.selected_session_name || null,
        selected_session_phone: settings.selected_session_phone || null,
        selected_department_id: settings.selected_department_id || null,
        selected_department_name: settings.selected_department_name || null,
        updated_at: new Date().toISOString(),
      };

      if (hasExistingSettings) {
        const { error } = await supabase
          .from('zap_responder_settings')
          .update(payload)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('zap_responder_settings')
          .insert(payload);

        if (error) throw error;
        setHasExistingSettings(true);
      }

      toast({
        title: 'Sucesso',
        description: 'Configurações salvas com sucesso!',
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configurações',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">
            Configure suas credenciais de API para integração com o Zap Responder
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Integração Zap Responder</span>
              {settings.zap_api_token && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
            </CardTitle>
            <CardDescription>
              Configure seu token de API para enviar mensagens e cobranças automáticas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Você pode obter seu token de API no painel do Zap Responder em Configurações &gt; API.
                Cada revendedor deve configurar suas próprias credenciais.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="api_token">Token da API *</Label>
                <div className="relative">
                  <Input
                    id="api_token"
                    type={showToken ? 'text' : 'password'}
                    value={settings.zap_api_token}
                    onChange={(e) => setSettings({ ...settings, zap_api_token: e.target.value })}
                    placeholder="Cole seu token de API aqui"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="api_base_url">URL Base da API</Label>
                <Input
                  id="api_base_url"
                  value={settings.api_base_url}
                  onChange={(e) => setSettings({ ...settings, api_base_url: e.target.value })}
                  placeholder="https://api.zapresponder.com.br/api"
                />
                <p className="text-xs text-muted-foreground">
                  Deixe o valor padrão a menos que você tenha uma URL personalizada
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="session_id">ID da Sessão</Label>
                <Input
                  id="session_id"
                  value={settings.selected_session_id}
                  onChange={(e) => setSettings({ ...settings, selected_session_id: e.target.value })}
                  placeholder="ID da sessão selecionada"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="session_name">Nome da Sessão</Label>
                <Input
                  id="session_name"
                  value={settings.selected_session_name}
                  onChange={(e) => setSettings({ ...settings, selected_session_name: e.target.value })}
                  placeholder="Nome para identificação"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="session_phone">Telefone da Sessão</Label>
                <Input
                  id="session_phone"
                  value={settings.selected_session_phone}
                  onChange={(e) => setSettings({ ...settings, selected_session_phone: e.target.value })}
                  placeholder="Número do WhatsApp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department_id">ID do Departamento</Label>
                <Input
                  id="department_id"
                  value={settings.selected_department_id}
                  onChange={(e) => setSettings({ ...settings, selected_department_id: e.target.value })}
                  placeholder="ID do departamento"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="department_name">Nome do Departamento</Label>
                <Input
                  id="department_name"
                  value={settings.selected_department_name}
                  onChange={(e) => setSettings({ ...settings, selected_department_name: e.target.value })}
                  placeholder="Nome do departamento"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Configurações
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
