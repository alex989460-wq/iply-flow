import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Save, AlertCircle, CheckCircle2, QrCode, RefreshCw, Smartphone, Wifi, WifiOff, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ApiType = 'zap_responder' | 'evolution';

interface EvolutionInstance {
  id: string;
  name: string;
  phone: string;
  status: string;
  profilePictureUrl?: string;
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [settings, setSettings] = useState({
    api_type: 'zap_responder' as ApiType,
    api_base_url: 'https://api.zapresponder.com.br/api',
    zap_api_token: '',
    selected_session_id: '',
    selected_session_name: '',
    selected_session_phone: '',
    selected_department_id: '',
    selected_department_name: '',
    instance_name: '',
  });
  const [hasExistingSettings, setHasExistingSettings] = useState(false);

  // Evolution API states
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [connectionState, setConnectionState] = useState<string>('');
  const [newInstanceName, setNewInstanceName] = useState('');
  const [creatingInstance, setCreatingInstance] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
  }, [user]);

  // Auto-refresh QR code when in Evolution mode and instance selected
  useEffect(() => {
    if (settings.api_type === 'evolution' && settings.instance_name && connectionState !== 'open') {
      const interval = setInterval(() => {
        fetchQRCode();
      }, 20000); // Refresh every 20 seconds

      return () => clearInterval(interval);
    }
  }, [settings.api_type, settings.instance_name, connectionState]);

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
          api_type: (data.api_type as ApiType) || 'zap_responder',
          api_base_url: data.api_base_url || 'https://api.zapresponder.com.br/api',
          zap_api_token: data.zap_api_token || '',
          selected_session_id: data.selected_session_id || '',
          selected_session_name: data.selected_session_name || '',
          selected_session_phone: data.selected_session_phone || '',
          selected_department_id: data.selected_department_id || '',
          selected_department_name: data.selected_department_name || '',
          instance_name: data.instance_name || '',
        });

        // If Evolution API is configured, fetch instances
        if (data.api_type === 'evolution' && data.zap_api_token) {
          fetchInstances();
        }
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

  const fetchInstances = useCallback(async () => {
    if (!settings.zap_api_token || !settings.api_base_url) return;

    setLoadingInstances(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'fetch-instances',
          apiBaseUrl: settings.api_base_url,
          apiKey: settings.zap_api_token,
        },
      });

      if (error) throw error;

      if (data?.success && data.data) {
        setInstances(data.data);
        
        // If we have a selected instance, check its connection state
        if (settings.instance_name) {
          checkConnectionState(settings.instance_name);
        }
      } else {
        console.error('Failed to fetch instances:', data?.error);
      }
    } catch (error) {
      console.error('Error fetching instances:', error);
    } finally {
      setLoadingInstances(false);
    }
  }, [settings.zap_api_token, settings.api_base_url, settings.instance_name]);

  const checkConnectionState = async (instanceName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'connection-state',
          instanceName,
          apiBaseUrl: settings.api_base_url,
          apiKey: settings.zap_api_token,
        },
      });

      if (error) throw error;

      if (data?.success && data.data) {
        const state = data.data.instance?.state || data.data.state || 'unknown';
        setConnectionState(state);
        
        // If not connected, fetch QR code
        if (state !== 'open') {
          fetchQRCode();
        } else {
          setQrCode(null);
        }
      }
    } catch (error) {
      console.error('Error checking connection state:', error);
    }
  };

  const fetchQRCode = async () => {
    if (!settings.instance_name) return;

    setLoadingQr(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'get-qrcode',
          instanceName: settings.instance_name,
          apiBaseUrl: settings.api_base_url,
          apiKey: settings.zap_api_token,
        },
      });

      if (error) throw error;

      if (data?.success && data.data) {
        if (data.data.qrcode) {
          // Handle base64 QR code
          const qrBase64 = data.data.qrcode.startsWith('data:') 
            ? data.data.qrcode 
            : `data:image/png;base64,${data.data.qrcode}`;
          setQrCode(qrBase64);
        }
        
        if (data.data.state === 'open') {
          setConnectionState('open');
          setQrCode(null);
          toast({
            title: 'Conectado!',
            description: 'WhatsApp conectado com sucesso',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching QR code:', error);
    } finally {
      setLoadingQr(false);
    }
  };

  const createNewInstance = async () => {
    if (!newInstanceName.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite um nome para a instância',
        variant: 'destructive',
      });
      return;
    }

    setCreatingInstance(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'create-instance',
          newInstanceName: newInstanceName.trim().toLowerCase().replace(/\s+/g, '-'),
          apiBaseUrl: settings.api_base_url,
          apiKey: settings.zap_api_token,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Sucesso',
          description: 'Instância criada com sucesso!',
        });
        setNewInstanceName('');
        fetchInstances();
      } else {
        toast({
          title: 'Erro',
          description: data?.error || 'Erro ao criar instância',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error creating instance:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao criar instância',
        variant: 'destructive',
      });
    } finally {
      setCreatingInstance(false);
    }
  };

  const deleteInstanceHandler = async (instanceName: string) => {
    if (!confirm(`Tem certeza que deseja excluir a instância "${instanceName}"?`)) return;

    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'delete-instance',
          instanceName,
          apiBaseUrl: settings.api_base_url,
          apiKey: settings.zap_api_token,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Sucesso',
          description: 'Instância excluída com sucesso!',
        });
        
        // Clear selected instance if it was the deleted one
        if (settings.instance_name === instanceName) {
          setSettings(prev => ({ ...prev, instance_name: '' }));
          setQrCode(null);
          setConnectionState('');
        }
        
        fetchInstances();
      } else {
        toast({
          title: 'Erro',
          description: data?.error || 'Erro ao excluir instância',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error deleting instance:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao excluir instância',
        variant: 'destructive',
      });
    }
  };

  const handleSelectInstance = (instanceName: string) => {
    const instance = instances.find(i => i.name === instanceName);
    setSettings(prev => ({
      ...prev,
      instance_name: instanceName,
      selected_session_id: instance?.id || '',
      selected_session_phone: instance?.phone || '',
    }));
    setQrCode(null);
    checkConnectionState(instanceName);
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        api_type: settings.api_type,
        api_base_url: settings.api_base_url,
        zap_api_token: settings.zap_api_token || null,
        selected_session_id: settings.selected_session_id || null,
        selected_session_name: settings.selected_session_name || null,
        selected_session_phone: settings.selected_session_phone || null,
        selected_department_id: settings.selected_department_id || null,
        selected_department_name: settings.selected_department_name || null,
        instance_name: settings.instance_name || null,
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

      // If Evolution API is now configured, fetch instances
      if (settings.api_type === 'evolution' && settings.zap_api_token) {
        fetchInstances();
      }
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
            Configure suas credenciais de API para integração com WhatsApp
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Integração WhatsApp</span>
              {settings.zap_api_token && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
            </CardTitle>
            <CardDescription>
              Escolha o tipo de API e configure suas credenciais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Type Selection */}
            <div className="space-y-2">
              <Label>Tipo de API</Label>
              <Select
                value={settings.api_type}
                onValueChange={(value: ApiType) => {
                  setSettings(prev => ({
                    ...prev,
                    api_type: value,
                    api_base_url: value === 'evolution' 
                      ? 'https://api-evolution.supergestor.top' 
                      : 'https://api.zapresponder.com.br/api',
                  }));
                  setQrCode(null);
                  setConnectionState('');
                  setInstances([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zap_responder">Zap Responder</SelectItem>
                  <SelectItem value="evolution">Evolution API</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Tabs defaultValue="credentials" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="credentials">Credenciais</TabsTrigger>
                {settings.api_type === 'evolution' && (
                  <TabsTrigger value="connection">Conexão</TabsTrigger>
                )}
                {settings.api_type === 'zap_responder' && (
                  <TabsTrigger value="session">Sessão</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="credentials" className="space-y-4 mt-4">
                {settings.api_type === 'zap_responder' ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Você pode obter seu token de API no painel do Zap Responder em Configurações &gt; API.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Configure a URL da sua Evolution API e a Global API Key do servidor.
                      A URL padrão já está configurada para o servidor do Super Gestor.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="api_base_url">URL Base da API</Label>
                    <Input
                      id="api_base_url"
                      value={settings.api_base_url}
                      onChange={(e) => setSettings({ ...settings, api_base_url: e.target.value })}
                      placeholder={settings.api_type === 'evolution' 
                        ? "https://api-evolution.supergestor.top" 
                        : "https://api.zapresponder.com.br/api"
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="api_token">
                      {settings.api_type === 'evolution' ? 'API Key Global' : 'Token da API'} *
                    </Label>
                    <div className="relative">
                      <Input
                        id="api_token"
                        type={showToken ? 'text' : 'password'}
                        value={settings.zap_api_token}
                        onChange={(e) => setSettings({ ...settings, zap_api_token: e.target.value })}
                        placeholder={settings.api_type === 'evolution' 
                          ? "Cole sua API Key global aqui" 
                          : "Cole seu token de API aqui"
                        }
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
              </TabsContent>

              {/* Evolution API Connection Tab */}
              {settings.api_type === 'evolution' && (
                <TabsContent value="connection" className="space-y-4 mt-4">
                  {!settings.zap_api_token ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Configure primeiro a API Key na aba Credenciais e salve para poder conectar.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      {/* Instance List */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Instâncias Disponíveis</Label>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={fetchInstances}
                            disabled={loadingInstances}
                          >
                            <RefreshCw className={`w-4 h-4 mr-1 ${loadingInstances ? 'animate-spin' : ''}`} />
                            Atualizar
                          </Button>
                        </div>

                        {loadingInstances ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : instances.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Nenhuma instância encontrada</p>
                            <p className="text-sm">Crie uma nova instância abaixo</p>
                          </div>
                        ) : (
                          <div className="grid gap-2">
                            {instances.map((instance) => (
                              <div
                                key={instance.id}
                                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                  settings.instance_name === instance.name 
                                    ? 'border-primary bg-primary/5' 
                                    : 'border-border hover:bg-muted/50'
                                }`}
                                onClick={() => handleSelectInstance(instance.name)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                    <Smartphone className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <p className="font-medium">{instance.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {instance.phone || 'Não conectado'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={instance.status === 'open' ? 'default' : 'secondary'}>
                                    {instance.status === 'open' ? (
                                      <><Wifi className="w-3 h-3 mr-1" /> Conectado</>
                                    ) : (
                                      <><WifiOff className="w-3 h-3 mr-1" /> Desconectado</>
                                    )}
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteInstanceHandler(instance.name);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Create New Instance */}
                      <div className="border-t pt-4">
                        <Label className="mb-2 block">Criar Nova Instância</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Nome da instância (ex: meu-whatsapp)"
                            value={newInstanceName}
                            onChange={(e) => setNewInstanceName(e.target.value)}
                          />
                          <Button 
                            onClick={createNewInstance}
                            disabled={creatingInstance || !newInstanceName.trim()}
                          >
                            {creatingInstance ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* QR Code Section */}
                      {settings.instance_name && connectionState !== 'open' && (
                        <div className="border-t pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <Label>Conectar WhatsApp</Label>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={fetchQRCode}
                              disabled={loadingQr}
                            >
                              <RefreshCw className={`w-4 h-4 mr-1 ${loadingQr ? 'animate-spin' : ''}`} />
                              Atualizar QR
                            </Button>
                          </div>
                          
                          <div className="flex flex-col items-center justify-center p-6 bg-muted/30 rounded-lg">
                            {loadingQr ? (
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <p className="text-sm text-muted-foreground">Carregando QR Code...</p>
                              </div>
                            ) : qrCode ? (
                              <div className="flex flex-col items-center gap-3">
                                <img 
                                  src={qrCode} 
                                  alt="QR Code" 
                                  className="w-64 h-64 rounded-lg"
                                />
                                <p className="text-sm text-muted-foreground text-center">
                                  Escaneie o QR Code com seu WhatsApp para conectar
                                </p>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <QrCode className="w-16 h-16 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                  Clique em "Atualizar QR" para gerar o código
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Connected Status */}
                      {settings.instance_name && connectionState === 'open' && (
                        <Alert className="bg-green-500/10 border-green-500/20">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <AlertDescription className="text-green-700 dark:text-green-300">
                            WhatsApp conectado com sucesso! Instância: {settings.instance_name}
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={saving}>
                          {saving ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-2" />
                          )}
                          Salvar Instância Selecionada
                        </Button>
                      </div>
                    </>
                  )}
                </TabsContent>
              )}

              {/* Zap Responder Session Tab */}
              {settings.api_type === 'zap_responder' && (
                <TabsContent value="session" className="space-y-4 mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
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
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
