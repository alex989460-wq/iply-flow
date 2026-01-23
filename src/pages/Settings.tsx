import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Save, AlertCircle, CheckCircle2, Copy, ExternalLink, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

type ApiType = 'zap_responder' | 'evolution' | 'meta_cloud';

interface ConnectionStatus {
  connected: boolean;
  phone?: string;
  name?: string;
  status?: string;
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [apiType, setApiType] = useState<ApiType>('evolution');
  const [settings, setSettings] = useState({
    api_base_url: 'https://api.zapresponder.com.br/api',
    zap_api_token: '',
    instance_name: '',
    selected_session_id: '',
    selected_session_name: '',
    selected_session_phone: '',
    selected_department_id: '',
    selected_department_name: '',
  });
  const [hasExistingSettings, setHasExistingSettings] = useState(false);

  const evolutionWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;
  const metaWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-webhook`;
  const metaVerifyToken = 'supergestor_webhook_2024';

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
        setApiType((data.api_type as ApiType) || 'evolution');
        setSettings({
          api_base_url: data.api_base_url || 'https://api.zapresponder.com.br/api',
          zap_api_token: data.zap_api_token || '',
          instance_name: data.instance_name || '',
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
        api_type: apiType,
        api_base_url: settings.api_base_url,
        zap_api_token: settings.zap_api_token || null,
        instance_name: settings.instance_name || null,
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

  const checkEvolutionConnection = async () => {
    if (!settings.api_base_url || !settings.zap_api_token || !settings.instance_name) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha URL, API Key e Nome da Instância',
        variant: 'destructive',
      });
      return;
    }

    setCheckingConnection(true);
    try {
      const response = await fetch(
        `${settings.api_base_url}/instance/connectionState/${settings.instance_name}`,
        {
          headers: {
            'apikey': settings.zap_api_token,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Falha ao verificar conexão');
      }

      const data = await response.json();
      const isConnected = data?.instance?.state === 'open' || data?.state === 'open';
      
      setConnectionStatus({
        connected: isConnected,
        status: data?.instance?.state || data?.state || 'unknown',
      });

      toast({
        title: isConnected ? 'Conectado!' : 'Desconectado',
        description: isConnected 
          ? 'Evolution API está conectada ao WhatsApp' 
          : 'Instância não está conectada. Escaneie o QR Code no Evolution.',
        variant: isConnected ? 'default' : 'destructive',
      });
    } catch (error: any) {
      console.error('Error checking connection:', error);
      setConnectionStatus({ connected: false, status: 'error' });
      toast({
        title: 'Erro',
        description: 'Não foi possível verificar a conexão. Verifique as credenciais.',
        variant: 'destructive',
      });
    } finally {
      setCheckingConnection(false);
    }
  };

  const copyWebhookUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: 'Copiado!',
      description: 'URL do webhook copiada para a área de transferência',
    });
  };

  const copyVerifyToken = () => {
    navigator.clipboard.writeText(metaVerifyToken);
    toast({
      title: 'Copiado!',
      description: 'Token de verificação copiado',
    });
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
            Configure sua integração com WhatsApp
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Tipo de API</span>
            </CardTitle>
            <CardDescription>
              Escolha qual API de WhatsApp você deseja usar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={apiType} onValueChange={(v) => setApiType(v as ApiType)}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evolution">
                  <div className="flex items-center gap-2">
                    <span>🚀 Evolution API</span>
                    <Badge variant="secondary" className="text-xs">Recomendado</Badge>
                  </div>
                </SelectItem>
                <SelectItem value="meta_cloud">
                  <div className="flex items-center gap-2">
                    <span>📘 WhatsApp Cloud API (Meta/Facebook)</span>
                    <Badge variant="outline" className="text-xs">Oficial</Badge>
                  </div>
                </SelectItem>
                <SelectItem value="zap_responder">
                  <span>📱 Zap Responder</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {apiType === 'evolution' && (
          <Tabs defaultValue="config" className="space-y-4">
            <TabsList>
              <TabsTrigger value="config">Configuração</TabsTrigger>
              <TabsTrigger value="webhook">Webhook</TabsTrigger>
              <TabsTrigger value="guide">Guia de Instalação</TabsTrigger>
            </TabsList>

            <TabsContent value="config">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>Evolution API</span>
                    {connectionStatus?.connected && (
                      <Badge className="bg-green-500">
                        <Wifi className="w-3 h-3 mr-1" />
                        Conectado
                      </Badge>
                    )}
                    {connectionStatus && !connectionStatus.connected && (
                      <Badge variant="destructive">
                        <WifiOff className="w-3 h-3 mr-1" />
                        Desconectado
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Configure sua instância Evolution API para enviar mensagens via WhatsApp
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      A Evolution API é gratuita e open source. Você pode hospedar no seu próprio servidor.
                      Cada revendedor deve ter sua própria instância configurada.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="evo_base_url">URL Base da API *</Label>
                      <Input
                        id="evo_base_url"
                        value={settings.api_base_url}
                        onChange={(e) => setSettings({ ...settings, api_base_url: e.target.value })}
                        placeholder="https://sua-evolution-api.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        URL onde sua Evolution API está hospedada (ex: https://api.seudominio.com)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="evo_apikey">API Key *</Label>
                      <div className="relative">
                        <Input
                          id="evo_apikey"
                          type={showToken ? 'text' : 'password'}
                          value={settings.zap_api_token}
                          onChange={(e) => setSettings({ ...settings, zap_api_token: e.target.value })}
                          placeholder="Sua API Key da Evolution"
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

                    <div className="space-y-2">
                      <Label htmlFor="instance_name">Nome da Instância *</Label>
                      <Input
                        id="instance_name"
                        value={settings.instance_name}
                        onChange={(e) => setSettings({ ...settings, instance_name: e.target.value })}
                        placeholder="minha-instancia"
                      />
                      <p className="text-xs text-muted-foreground">
                        Nome que você deu à instância no Evolution
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salvar Configurações
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={checkEvolutionConnection}
                      disabled={checkingConnection}
                    >
                      {checkingConnection ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Testar Conexão
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="webhook">
              <Card>
                <CardHeader>
                  <CardTitle>Configurar Webhook</CardTitle>
                  <CardDescription>
                    Configure o webhook na sua Evolution API para receber mensagens e ativar respostas automáticas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      Configure este webhook na sua Evolution API para habilitar respostas automáticas e receber mensagens.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label>URL do Webhook</Label>
                    <div className="flex gap-2">
                      <Input
                        value={evolutionWebhookUrl}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button variant="outline" size="icon" onClick={() => copyWebhookUrl(evolutionWebhookUrl)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium">Como configurar:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Acesse o painel da sua Evolution API</li>
                      <li>Vá em Configurações &gt; Webhook</li>
                      <li>Cole a URL acima no campo de Webhook</li>
                      <li>Ative os eventos: <code className="bg-muted px-1 rounded">messages.upsert</code></li>
                      <li>Salve as configurações</li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <Label>Eventos recomendados:</Label>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">messages.upsert</Badge>
                      <Badge variant="outline">messages.update</Badge>
                      <Badge variant="outline">connection.update</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="guide">
              <Card>
                <CardHeader>
                  <CardTitle>Guia de Instalação da Evolution API</CardTitle>
                  <CardDescription>
                    Siga este guia para instalar sua própria Evolution API
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                        Requisitos
                      </h4>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        <li>VPS com no mínimo 1GB RAM e 1 vCPU</li>
                        <li>Ubuntu 20.04 ou superior</li>
                        <li>Docker e Docker Compose instalados</li>
                        <li>Domínio apontando para seu servidor (opcional, mas recomendado)</li>
                      </ul>
                    </div>

                    <div className="p-4 border rounded-lg space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                        Instalação Rápida (Docker)
                      </h4>
                      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`# Clone o repositório
git clone https://github.com/EvolutionAPI/evolution-api.git
cd evolution-api

# Copie o arquivo de exemplo
cp .env.example .env

# Edite as configurações
nano .env

# Inicie com Docker Compose
docker-compose up -d`}
                      </pre>
                    </div>

                    <div className="p-4 border rounded-lg space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
                        Configuração Inicial
                      </h4>
                      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                        <li>Acesse <code className="bg-muted px-1 rounded">http://seu-servidor:8080</code></li>
                        <li>Crie uma nova instância (ex: minha-instancia)</li>
                        <li>Escaneie o QR Code com seu WhatsApp</li>
                        <li>Copie a API Key gerada</li>
                        <li>Configure aqui no Super Gestor</li>
                      </ol>
                    </div>

                    <div className="flex gap-3">
                      <Button variant="outline" asChild>
                        <a 
                          href="https://doc.evolution-api.com/v2/pt/get-started/introduction" 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Documentação Oficial
                        </a>
                      </Button>
                      <Button variant="outline" asChild>
                        <a 
                          href="https://github.com/EvolutionAPI/evolution-api" 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          GitHub
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {apiType === 'meta_cloud' && (
          <Tabs defaultValue="config" className="space-y-4">
            <TabsList>
              <TabsTrigger value="config">Configuração</TabsTrigger>
              <TabsTrigger value="webhook">Webhook (Facebook)</TabsTrigger>
              <TabsTrigger value="guide">Guia Passo a Passo</TabsTrigger>
            </TabsList>

            <TabsContent value="config">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>WhatsApp Cloud API (Meta)</span>
                    <Badge variant="outline">API Oficial</Badge>
                  </CardTitle>
                  <CardDescription>
                    Configure sua integração com a API oficial do WhatsApp via Meta Business
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Esta é a API oficial da Meta/Facebook. Requer conta no Meta Business e aprovação.
                      Há custos por mensagem enviada, mas é a opção mais estável e confiável.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="meta_access_token">Access Token (Permanente) *</Label>
                      <div className="relative">
                        <Input
                          id="meta_access_token"
                          type={showToken ? 'text' : 'password'}
                          value={settings.zap_api_token}
                          onChange={(e) => setSettings({ ...settings, zap_api_token: e.target.value })}
                          placeholder="EAAxxxxxxx..."
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
                      <p className="text-xs text-muted-foreground">
                        Token de acesso permanente gerado no Meta Business
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone_number_id">Phone Number ID *</Label>
                      <Input
                        id="phone_number_id"
                        value={settings.instance_name}
                        onChange={(e) => setSettings({ ...settings, instance_name: e.target.value })}
                        placeholder="1234567890123456"
                      />
                      <p className="text-xs text-muted-foreground">
                        ID do número de telefone no Meta Business
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="display_phone">Número de Telefone</Label>
                      <Input
                        id="display_phone"
                        value={settings.selected_session_phone}
                        onChange={(e) => setSettings({ ...settings, selected_session_phone: e.target.value })}
                        placeholder="+55 11 99999-9999"
                      />
                      <p className="text-xs text-muted-foreground">
                        Número do WhatsApp Business (para identificação)
                      </p>
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
            </TabsContent>

            <TabsContent value="webhook">
              <Card>
                <CardHeader>
                  <CardTitle>Configurar Webhook no Facebook</CardTitle>
                  <CardDescription>
                    Configure o webhook no Meta Business para receber mensagens
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      Configure estes dados no painel do Meta for Developers para habilitar respostas automáticas.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>URL de Callback (Webhook URL)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={metaWebhookUrl}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button variant="outline" size="icon" onClick={() => copyWebhookUrl(metaWebhookUrl)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Token de Verificação (Verify Token)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={metaVerifyToken}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button variant="outline" size="icon" onClick={copyVerifyToken}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium">Como configurar no Facebook:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">developers.facebook.com</a></li>
                      <li>Vá em seu App &gt; WhatsApp &gt; Configuração</li>
                      <li>Na seção "Webhook", clique em "Editar"</li>
                      <li>Cole a <strong>URL de Callback</strong> acima</li>
                      <li>Cole o <strong>Token de Verificação</strong> acima</li>
                      <li>Clique em "Verificar e Salvar"</li>
                      <li>Após verificar, clique em "Gerenciar" e ative o evento <code className="bg-muted px-1 rounded">messages</code></li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <Label>Eventos obrigatórios:</Label>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">messages</Badge>
                      <Badge variant="outline">message_status</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="guide">
              <Card>
                <CardHeader>
                  <CardTitle>Guia: Configurar WhatsApp Cloud API</CardTitle>
                  <CardDescription>
                    Passo a passo para configurar a API oficial do WhatsApp
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                        Criar Conta Meta Business
                      </h4>
                      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                        <li>Acesse <a href="https://business.facebook.com" target="_blank" className="text-primary underline">business.facebook.com</a></li>
                        <li>Crie uma conta Business (se ainda não tiver)</li>
                        <li>Verifique sua empresa (pode levar alguns dias)</li>
                      </ol>
                    </div>

                    <div className="p-4 border rounded-lg space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                        Criar App no Meta for Developers
                      </h4>
                      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                        <li>Acesse <a href="https://developers.facebook.com" target="_blank" className="text-primary underline">developers.facebook.com</a></li>
                        <li>Clique em "Meus Apps" &gt; "Criar App"</li>
                        <li>Selecione "Empresa" como tipo</li>
                        <li>Adicione o produto "WhatsApp"</li>
                      </ol>
                    </div>

                    <div className="p-4 border rounded-lg space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
                        Obter Credenciais
                      </h4>
                      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                        <li>No App, vá em WhatsApp &gt; Configuração da API</li>
                        <li>Copie o <strong>Phone Number ID</strong></li>
                        <li>Em "Tokens de Acesso", gere um token permanente</li>
                        <li>Cole as credenciais na aba "Configuração" acima</li>
                      </ol>
                    </div>

                    <div className="p-4 border rounded-lg space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">4</span>
                        Configurar Webhook
                      </h4>
                      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                        <li>Vá na aba "Webhook (Facebook)" acima</li>
                        <li>Copie a URL de Callback e o Token</li>
                        <li>Configure no painel do Meta</li>
                        <li>Ative o evento "messages"</li>
                      </ol>
                    </div>

                    <div className="flex gap-3">
                      <Button variant="outline" asChild>
                        <a 
                          href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Documentação Meta
                        </a>
                      </Button>
                      <Button variant="outline" asChild>
                        <a 
                          href="https://business.facebook.com/settings/whatsapp-business-accounts" 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Meta Business
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {apiType === 'zap_responder' && (
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
        )}
      </div>
    </DashboardLayout>
  );
}
