import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Save, AlertCircle, CheckCircle2, Copy, ExternalLink, Wifi, WifiOff, RefreshCw, Phone, Plus, Check, Facebook, Unplug, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

interface MetaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  waba_id: string;
  waba_name: string;
  business_id: string;
  business_name: string;
}

interface MetaConnectionStatus {
  connected: boolean;
  expired?: boolean;
  user_id?: string;
  phone_number_id?: string;
  display_phone?: string;
  connected_at?: string;
  expires_at?: string;
}

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
  
  // Meta Cloud specific states
  const [metaPhones, setMetaPhones] = useState<MetaPhoneNumber[]>([]);
  const [loadingMetaPhones, setLoadingMetaPhones] = useState(false);
  const [metaConnectionStatus, setMetaConnectionStatus] = useState<MetaConnectionStatus | null>(null);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const [testingMetaSend, setTestingMetaSend] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  
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

  const checkMetaConnectionStatus = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) return;

      const response = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'get_connection_status' },
      });

      if (response.data) {
        setMetaConnectionStatus(response.data);
      }
    } catch (error) {
      console.error('Error checking Meta connection:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
  }, [user]);

  useEffect(() => {
    if (user && apiType === 'meta_cloud') {
      checkMetaConnectionStatus();
    }
  }, [user, apiType, checkMetaConnectionStatus]);

  // Listen for OAuth callback
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'META_OAUTH_SUCCESS') {
        toast({
          title: 'Conectado com sucesso!',
          description: 'Sua conta do Facebook foi conectada. Agora carregue seus números.',
        });
        checkMetaConnectionStatus();
        setConnectingMeta(false);
      } else if (event.data?.type === 'META_OAUTH_ERROR') {
        toast({
          title: 'Erro na conexão',
          description: event.data.error || 'Não foi possível conectar sua conta.',
          variant: 'destructive',
        });
        setConnectingMeta(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [toast, checkMetaConnectionStatus]);

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

  const connectWithFacebook = async () => {
    setConnectingMeta(true);
    try {
      const response = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'get_oauth_url' },
      });

      if (response.error || !response.data?.oauth_url) {
        throw new Error(response.error?.message || 'Erro ao gerar URL de autenticação');
      }

      // Open popup for OAuth
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(
        response.data.oauth_url,
        'facebook_oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (error: any) {
      console.error('Error connecting to Facebook:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao conectar com Facebook',
        variant: 'destructive',
      });
      setConnectingMeta(false);
    }
  };

  const fetchMetaPhoneNumbers = async () => {
    setLoadingMetaPhones(true);
    try {
      const response = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'get_phone_numbers' },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao buscar números');
      }

      const phones = response.data?.phone_numbers || [];
      setMetaPhones(phones);

      if (phones.length === 0) {
        toast({
          title: 'Nenhum número encontrado',
          description: 'Sua conta não tem números do WhatsApp Business configurados.',
        });
      } else {
        toast({
          title: 'Números carregados!',
          description: `${phones.length} número(s) encontrado(s)`,
        });
      }
    } catch (error: any) {
      console.error('Error fetching phone numbers:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao buscar números',
        variant: 'destructive',
      });
    } finally {
      setLoadingMetaPhones(false);
    }
  };

  const selectMetaPhone = async (phone: MetaPhoneNumber) => {
    try {
      const response = await supabase.functions.invoke('meta-oauth', {
        body: {
          action: 'select_phone_number',
          phone_number_id: phone.id,
          display_phone: phone.display_phone_number,
          waba_id: phone.waba_id,
          business_id: phone.business_id,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      await checkMetaConnectionStatus();
      
      toast({
        title: 'Número selecionado!',
        description: `${phone.verified_name} - ${phone.display_phone_number}`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao selecionar número',
        variant: 'destructive',
      });
    }
  };

  const disconnectMeta = async () => {
    try {
      const response = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'disconnect' },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setMetaConnectionStatus(null);
      setMetaPhones([]);
      
      toast({
        title: 'Desconectado',
        description: 'Sua conta do Facebook foi desconectada.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao desconectar',
        variant: 'destructive',
      });
    }
  };

  const testMetaMessage = async () => {
    if (!testPhoneNumber) {
      toast({
        title: 'Número obrigatório',
        description: 'Informe um número de telefone para teste',
        variant: 'destructive',
      });
      return;
    }

    setTestingMetaSend(true);
    try {
      const response = await supabase.functions.invoke('meta-send-message', {
        body: {
          to: testPhoneNumber,
          message: '✅ Teste de conexão realizado com sucesso! Sua integração com o WhatsApp Business API está funcionando.',
        },
      });

      if (response.error) {
        throw new Error(response.error.message || response.data?.error || 'Erro ao enviar mensagem');
      }

      if (response.data?.error) {
        throw new Error(response.data.details || response.data.error);
      }

      toast({
        title: 'Mensagem enviada!',
        description: 'Verifique o WhatsApp do número informado.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar',
        description: error.message || 'Não foi possível enviar a mensagem de teste',
        variant: 'destructive',
      });
    } finally {
      setTestingMetaSend(false);
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
          <Tabs defaultValue="connection" className="space-y-4">
            <TabsList>
              <TabsTrigger value="connection">Conexão</TabsTrigger>
              <TabsTrigger value="numbers">Meus Números</TabsTrigger>
              <TabsTrigger value="webhook">Webhook</TabsTrigger>
              <TabsTrigger value="test">Testar Envio</TabsTrigger>
            </TabsList>

            <TabsContent value="connection">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Facebook className="w-5 h-5 text-blue-600" />
                    <span>Conectar com Facebook</span>
                    {metaConnectionStatus?.connected && (
                      <Badge className="bg-green-500">
                        <Wifi className="w-3 h-3 mr-1" />
                        Conectado
                      </Badge>
                    )}
                    {metaConnectionStatus?.expired && (
                      <Badge variant="destructive">
                        <WifiOff className="w-3 h-3 mr-1" />
                        Token Expirado
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Conecte sua conta do Facebook/Meta para usar a API oficial do WhatsApp Business
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!metaConnectionStatus?.connected ? (
                    <>
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Clique no botão abaixo para conectar sua conta do Facebook. Você precisará autorizar o acesso ao WhatsApp Business.
                        </AlertDescription>
                      </Alert>

                      <div className="flex flex-col items-center gap-4 py-8">
                        <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center">
                          <Facebook className="w-10 h-10 text-white" />
                        </div>
                        <Button
                          size="lg"
                          onClick={connectWithFacebook}
                          disabled={connectingMeta}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {connectingMeta ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          ) : (
                            <Facebook className="w-5 h-5 mr-2" />
                          )}
                          Conectar com Facebook
                        </Button>
                        <p className="text-sm text-muted-foreground text-center max-w-md">
                          Ao conectar, você autoriza o acesso aos seus números do WhatsApp Business configurados na sua conta Meta.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Alert>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AlertDescription>
                          Sua conta do Facebook está conectada! Agora vá para a aba "Meus Números" para selecionar qual número usar.
                        </AlertDescription>
                      </Alert>

                      <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                        <h4 className="font-medium">Detalhes da Conexão</h4>
                        <div className="grid gap-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge className="bg-green-500">Conectado</Badge>
                          </div>
                          {metaConnectionStatus.display_phone && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Número Ativo:</span>
                              <span className="font-mono">{metaConnectionStatus.display_phone}</span>
                            </div>
                          )}
                          {metaConnectionStatus.connected_at && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Conectado em:</span>
                              <span>{new Date(metaConnectionStatus.connected_at).toLocaleDateString('pt-BR')}</span>
                            </div>
                          )}
                          {metaConnectionStatus.expires_at && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Token expira em:</span>
                              <span>{new Date(metaConnectionStatus.expires_at).toLocaleDateString('pt-BR')}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          onClick={connectWithFacebook}
                          disabled={connectingMeta}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Reconectar
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={disconnectMeta}
                        >
                          <Unplug className="w-4 h-4 mr-2" />
                          Desconectar
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="numbers">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    <span>Números do WhatsApp Business</span>
                  </CardTitle>
                  <CardDescription>
                    Selecione qual número usar para enviar mensagens e cobranças
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!metaConnectionStatus?.connected ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Conecte sua conta do Facebook primeiro na aba "Conexão".
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">
                          Clique para carregar os números disponíveis na sua conta
                        </p>
                        <Button
                          onClick={fetchMetaPhoneNumbers}
                          disabled={loadingMetaPhones}
                        >
                          {loadingMetaPhones ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-2" />
                          )}
                          Carregar Números
                        </Button>
                      </div>

                      {metaPhones.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label>Números Disponíveis</Label>
                            <Badge variant="secondary">
                              {metaPhones.length} número(s)
                            </Badge>
                          </div>
                          
                          <div className="grid gap-4 md:grid-cols-2">
                            {metaPhones.map((phone) => (
                              <div
                                key={phone.id}
                                onClick={() => selectMetaPhone(phone)}
                                className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                                  metaConnectionStatus?.phone_number_id === phone.id
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                }`}
                              >
                                {metaConnectionStatus?.phone_number_id === phone.id && (
                                  <div className="absolute top-2 right-2">
                                    <div className="bg-primary text-primary-foreground rounded-full p-1">
                                      <Check className="w-3 h-3" />
                                    </div>
                                  </div>
                                )}
                                
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                                    <Phone className="w-5 h-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-sm truncate">{phone.verified_name}</h4>
                                    <p className="text-xs font-mono text-green-600 dark:text-green-400">
                                      {phone.display_phone_number}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Qualidade: {phone.quality_rating || 'N/A'}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="mt-3 pt-3 border-t">
                                  <p className="text-xs text-muted-foreground">Empresa</p>
                                  <p className="text-sm font-medium truncate">{phone.business_name || phone.waba_name}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {metaConnectionStatus?.display_phone && (
                        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="font-medium text-sm">Número Ativo</span>
                          </div>
                          <p className="text-lg font-mono text-green-600 dark:text-green-400">
                            {metaConnectionStatus.display_phone}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="webhook">
              <Card>
                <CardHeader>
                  <CardTitle>Configurar Webhook (Opcional)</CardTitle>
                  <CardDescription>
                    Configure o webhook no Facebook para receber mensagens e ativar respostas automáticas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      O webhook é necessário apenas se você quiser receber mensagens e usar respostas automáticas.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>URL do Webhook (Callback URL)</Label>
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
                      <li>Acesse <strong>developers.facebook.com</strong></li>
                      <li>Vá em seu App → WhatsApp → Configuração</li>
                      <li>Na seção "Webhook", clique em "Editar"</li>
                      <li>Cole a <strong>Callback URL</strong> e o <strong>Verify Token</strong> acima</li>
                      <li>Clique em "Verificar e salvar"</li>
                      <li>Clique em "Gerenciar" e inscreva-se no evento <code className="bg-muted px-1 rounded">messages</code></li>
                    </ol>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="test">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="w-5 h-5" />
                    <span>Testar Envio de Mensagem</span>
                  </CardTitle>
                  <CardDescription>
                    Envie uma mensagem de teste para verificar se a integração está funcionando
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!metaConnectionStatus?.connected || !metaConnectionStatus?.phone_number_id ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Conecte sua conta e selecione um número primeiro.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <Alert>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <AlertDescription>
                          Enviando de: <strong>{metaConnectionStatus.display_phone}</strong>
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="test_phone">Número de Destino *</Label>
                          <Input
                            id="test_phone"
                            value={testPhoneNumber}
                            onChange={(e) => setTestPhoneNumber(e.target.value)}
                            placeholder="5511999999999"
                          />
                          <p className="text-xs text-muted-foreground">
                            Informe o número com código do país (ex: 5511999999999)
                          </p>
                        </div>

                        <Button
                          onClick={testMetaMessage}
                          disabled={testingMetaSend || !testPhoneNumber}
                        >
                          {testingMetaSend ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4 mr-2" />
                          )}
                          Enviar Mensagem de Teste
                        </Button>
                      </div>

                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Importante:</strong> Mensagens só podem ser enviadas para números que iniciaram conversa nas últimas 24h, 
                          ou usando templates aprovados. Para teste inicial, envie uma mensagem do número de destino para seu número do WhatsApp Business primeiro.
                        </AlertDescription>
                      </Alert>
                    </>
                  )}
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
