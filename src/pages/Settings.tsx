import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Save, AlertCircle, CheckCircle2, Unplug, Phone, RefreshCw, Server, FileText, Users, UserPlus, Trash2, Mail } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import VplayServersManager from '@/components/settings/VplayServersManager';

async function getFunctionsHttpErrorDetails(err: unknown): Promise<{ message?: string; raw?: any } | null> {
  // supabase-js / @supabase/functions-js throws FunctionsHttpError with `.context` as a Response
  const anyErr = err as any;
  const res: Response | undefined = anyErr?.context;

  if (!res || typeof res?.clone !== 'function') return null;

  try {
    const contentType = (res.headers.get('Content-Type') ?? '').split(';')[0].trim();
    if (contentType === 'application/json') {
      const json = await res.clone().json();
      return {
        message: typeof json?.error === 'string' ? json.error : undefined,
        raw: json,
      };
    }

    const text = await res.clone().text();
    return { message: text };
  } catch {
    return null;
  }
}

function buildRedirectUriFromCurrentUrl(): string {
  // FB.login with JS SDK uses the page ORIGIN as redirect_uri internally.
  // We must match that exactly for token exchange.
  return window.location.origin;
}
declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

const META_APP_ID = '1499507967794395';

const META_OAUTH_STATE_KEY = 'meta_oauth_state';

function getMetaCallbackRedirectUri(): string {
  return `${window.location.origin}/meta-callback`;
}

function generateState(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function buildMetaOauthDialogUrl(): { url: string; redirectUri: string; state: string } {
  const redirectUri = getMetaCallbackRedirectUri();
  const state = generateState();

  const dialog = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  dialog.searchParams.set('client_id', META_APP_ID);
  dialog.searchParams.set('redirect_uri', redirectUri);
  dialog.searchParams.set('response_type', 'code');
  dialog.searchParams.set('state', state);
  dialog.searchParams.set('scope', 'whatsapp_business_management,whatsapp_business_messaging,business_management');
  dialog.searchParams.set('display', 'popup');

  return { url: dialog.toString(), redirectUri, state };
}

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
}

interface MessageTemplate {
  name: string;
  status: string;
  language: string;
  category: string;
  components?: any[];
}

interface WabaUser {
  id: string;
  name: string;
  tasks?: string[];
  business?: {
    id: string;
    name: string;
  };
}

export default function Settings() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [activeTab, setActiveTab] = useState('zap_responder');
  
  // Zap Responder settings
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

  // Meta Cloud API settings
  const [metaSettings, setMetaSettings] = useState({
    api_type: 'zap_responder',
    meta_connected_at: null as string | null,
    meta_display_phone: null as string | null,
    meta_phone_number_id: null as string | null,
    meta_token_expires_at: null as string | null,
    meta_user_id: null as string | null,
    meta_business_id: null as string | null,
  });
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loadingPhones, setLoadingPhones] = useState(false);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const [disconnectingMeta, setDisconnectingMeta] = useState(false);
  const [fbSdkLoaded, setFbSdkLoaded] = useState(false);
  
  // Meta Templates & Users
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [wabaUsers, setWabaUsers] = useState<WabaUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  // Load Facebook SDK
  useEffect(() => {
    if (window.FB) {
      setFbSdkLoaded(true);
      return;
    }

    window.fbAsyncInit = function() {
      window.FB.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: true,
        version: 'v21.0'
      });
      setFbSdkLoaded(true);
      console.log('[Settings] Facebook SDK initialized');
    };

    // Load SDK script
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

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
        setMetaSettings({
          api_type: data.api_type || 'zap_responder',
          meta_connected_at: data.meta_connected_at,
          meta_display_phone: data.meta_display_phone,
          meta_phone_number_id: data.meta_phone_number_id,
          meta_token_expires_at: data.meta_token_expires_at,
          meta_user_id: data.meta_user_id,
          meta_business_id: data.meta_business_id,
        });
        
        // Set active tab based on api_type
        if (data.api_type === 'meta_cloud' && data.meta_connected_at) {
          setActiveTab('meta_cloud');
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
        api_type: 'zap_responder',
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

  const processMetaLoginResponse = useCallback(async (response: any) => {
    console.log('[Settings] FB.login response:', response);
    
    if (response.authResponse) {
      const { code } = response.authResponse;
      
      if (!code) {
        console.error('[Settings] No code in authResponse');
        toast({
          title: 'Erro',
          description: 'Código de autorização não recebido. Tente novamente.',
          variant: 'destructive',
        });
        setConnectingMeta(false);
        return;
      }

      try {
        console.log('[Settings] Exchanging code for token...');
        // IMPORTANT: The redirect_uri must match exactly what Meta considers valid.
        // We canonicalize current URL (no query/hash, no trailing slash).
        const redirectUri = buildRedirectUriFromCurrentUrl();
        
        const { data, error } = await supabase.functions.invoke('meta-oauth', {
          body: {
            action: 'exchange-token',
            code,
            redirect_uri: redirectUri,
          },
        });

        if (error) {
          const details = await getFunctionsHttpErrorDetails(error);
          const message = details?.message || (typeof details?.raw === 'object' ? JSON.stringify(details.raw) : undefined);
          throw new Error(
            message || `Erro ao conectar (redirect_uri: ${redirectUri}).`
          );
        }

        if (data.success) {
          toast({
            title: 'Sucesso!',
            description: `WhatsApp Oficial conectado: ${data.display_phone || 'Número detectado'}`,
          });
          
          // Refresh settings
          await fetchSettings();
        } else {
          throw new Error(data.error || 'Erro desconhecido');
        }
      } catch (err: any) {
        console.error('[Settings] Token exchange error:', err);
        toast({
          title: 'Erro',
          description: err?.message || 'Erro ao conectar conta Meta',
          variant: 'destructive',
        });
      }
    } else {
      console.log('[Settings] User cancelled login or did not fully authorize.');
      toast({
        title: 'Cancelado',
        description: 'Login cancelado ou não autorizado completamente.',
        variant: 'destructive',
      });
    }
    setConnectingMeta(false);
  }, [toast]);

  const handleMetaLogin = useCallback(() => {
    setConnectingMeta(true);

    const { url, redirectUri, state } = buildMetaOauthDialogUrl();
    sessionStorage.setItem(META_OAUTH_STATE_KEY, state);

    const popup = window.open(
      url,
      'meta_oauth',
      'width=600,height=700,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes'
    );

    if (!popup) {
      setConnectingMeta(false);
      toast({
        title: 'Popup bloqueado',
        description: 'Permita popups para concluir a conexão com o Facebook.',
        variant: 'destructive',
      });
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const type = (event.data as any)?.type;
      if (type === 'meta_oauth_success') {
        toast({
          title: 'Sucesso!',
          description: 'Conexão autorizada. Finalizando…',
        });
        fetchSettings();
      }
      cleanup();
    };

    const timer = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
      }
    }, 500);

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
      setConnectingMeta(false);
    };

    window.addEventListener('message', onMessage);

    // Helpful hint if user still gets redirect mismatch
    console.log('[Settings] Meta OAuth dialog opened', { redirectUri, state });
  }, [toast]);

  const handleDisconnectMeta = async () => {
    if (!confirm('Tem certeza que deseja desconectar a conta Meta?')) return;

    setDisconnectingMeta(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'disconnect' },
      });

      if (error) throw error;

      toast({
        title: 'Desconectado',
        description: 'Conta Meta desconectada com sucesso.',
      });

      setMetaSettings({
        api_type: 'zap_responder',
        meta_connected_at: null,
        meta_display_phone: null,
        meta_phone_number_id: null,
        meta_token_expires_at: null,
        meta_user_id: null,
        meta_business_id: null,
      });
      setPhoneNumbers([]);
      setActiveTab('zap_responder');
    } catch (err: any) {
      console.error('[Settings] Disconnect error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao desconectar',
        variant: 'destructive',
      });
    } finally {
      setDisconnectingMeta(false);
    }
  };

  const fetchPhoneNumbers = async () => {
    setLoadingPhones(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'fetch-phone-numbers' },
      });

      if (error) throw error;

      if (data.phone_numbers) {
        setPhoneNumbers(data.phone_numbers);
      }
    } catch (err: any) {
      console.error('[Settings] Fetch phones error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao buscar números',
        variant: 'destructive',
      });
    } finally {
      setLoadingPhones(false);
    }
  };

  const selectPhoneNumber = async (phone: PhoneNumber) => {
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: {
          action: 'select-phone',
          phone_number_id: phone.id,
          display_phone: phone.display_phone_number,
        },
      });

      if (error) throw error;

      setMetaSettings(prev => ({
        ...prev,
        meta_phone_number_id: phone.id,
        meta_display_phone: phone.display_phone_number,
      }));

      toast({
        title: 'Sucesso',
        description: `Número ${phone.display_phone_number} selecionado!`,
      });
    } catch (err: any) {
      console.error('[Settings] Select phone error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao selecionar número',
        variant: 'destructive',
      });
    }
  };

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'fetch-templates' },
      });

      if (error) throw error;

      if (data.templates) {
        setTemplates(data.templates);
      }
    } catch (err: any) {
      console.error('[Settings] Fetch templates error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao buscar templates',
        variant: 'destructive',
      });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const fetchWabaUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'fetch-waba-users' },
      });

      if (error) throw error;

      if (data.users) {
        setWabaUsers(data.users);
      }
    } catch (err: any) {
      console.error('[Settings] Fetch users error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao buscar atendentes',
        variant: 'destructive',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const addWabaUser = async () => {
    if (!newUserEmail.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite o email do atendente',
        variant: 'destructive',
      });
      return;
    }

    setAddingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { 
          action: 'assign-waba-user',
          user_email: newUserEmail.trim(),
          tasks: ['MANAGE'],
        },
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Convite enviado para o atendente!',
      });
      setNewUserEmail('');
      fetchWabaUsers();
    } catch (err: any) {
      console.error('[Settings] Add user error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao adicionar atendente',
        variant: 'destructive',
      });
    } finally {
      setAddingUser(false);
    }
  };

  const removeWabaUser = async (wabaUserId: string, userName: string) => {
    if (!confirm(`Tem certeza que deseja remover ${userName}?`)) return;

    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { 
          action: 'remove-waba-user',
          waba_user_id: wabaUserId,
        },
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Atendente removido com sucesso!',
      });
      fetchWabaUsers();
    } catch (err: any) {
      console.error('[Settings] Remove user error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao remover atendente',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case 'APPROVED':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Aprovado</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Pendente</Badge>;
      case 'REJECTED':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/30">Rejeitado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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

  const isMetaConnected = metaSettings.api_type === 'meta_cloud' && metaSettings.meta_connected_at;
  const tokenExpiresAt = metaSettings.meta_token_expires_at ? new Date(metaSettings.meta_token_expires_at) : null;
  const isTokenExpired = tokenExpiresAt ? tokenExpiresAt < new Date() : false;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">
            Configure sua integração com WhatsApp para envio de mensagens
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="zap_responder" className="flex items-center gap-2">
              <span className="hidden sm:inline">Zap Responder</span>
              <span className="sm:hidden">ZapResp</span>
            </TabsTrigger>
            <TabsTrigger value="meta_cloud" className="flex items-center gap-2">
              <span className="hidden sm:inline">WhatsApp Oficial</span>
              <span className="sm:hidden">WA Oficial</span>
              {isMetaConnected && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            </TabsTrigger>
            <TabsTrigger value="vplay_test" className="flex items-center gap-2">
              <Server className="w-4 h-4 text-violet-500" />
              <span className="hidden sm:inline">Gerador Vplay</span>
              <span className="sm:hidden">Vplay</span>
            </TabsTrigger>
          </TabsList>

          {/* Zap Responder Tab */}
          <TabsContent value="zap_responder" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>Integração Zap Responder</span>
                  {settings.zap_api_token && (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                </CardTitle>
                <CardDescription>
                  Configure seu token de API para enviar mensagens via Zap Responder
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Você pode obter seu token de API no painel do Zap Responder em Configurações &gt; API.
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
          </TabsContent>

          {/* Meta Cloud API Tab */}
          <TabsContent value="meta_cloud" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>WhatsApp Oficial (Meta Cloud API)</span>
                  {isMetaConnected && !isTokenExpired && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                      Conectado
                    </Badge>
                  )}
                  {isMetaConnected && isTokenExpired && (
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">
                      Token Expirado
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Conecte diretamente sua conta WhatsApp Business via Facebook, igual ao ManyChat ou Zap Responder
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!isMetaConnected ? (
                  <>
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Requisitos:</strong> 
                        <ul className="list-disc ml-4 mt-1 space-y-1">
                          <li>Conta WhatsApp Business verificada no Meta Business Suite</li>
                          <li>App Facebook deve ter as permissões: whatsapp_business_management, whatsapp_business_messaging</li>
                          <li>Se o app está em modo Development, você deve ser administrador ou tester do app</li>
                        </ul>
                      </AlertDescription>
                    </Alert>

                    <div className="flex flex-col items-center gap-4 py-8">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                        <Phone className="w-10 h-10 text-white" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-semibold">Conectar WhatsApp Oficial</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Use sua conta oficial verificada para enviar mensagens
                        </p>
                      </div>
                      <Button 
                        size="lg" 
                        onClick={handleMetaLogin}
                        disabled={connectingMeta || !fbSdkLoaded}
                        className="bg-[#1877F2] hover:bg-[#166FE5] text-white"
                      >
                        {connectingMeta ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                        )}
                        Conectar com Facebook
                      </Button>
                      {!fbSdkLoaded && (
                        <p className="text-xs text-muted-foreground">Carregando SDK do Facebook...</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Connected State */}
                    <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                            <Phone className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {metaSettings.meta_display_phone || 'Número não configurado'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Conectado em {metaSettings.meta_connected_at 
                                ? new Date(metaSettings.meta_connected_at).toLocaleDateString('pt-BR')
                                : '-'}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDisconnectMeta}
                          disabled={disconnectingMeta}
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                          {disconnectingMeta ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Unplug className="w-4 h-4" />
                          )}
                          <span className="ml-2 hidden sm:inline">Desconectar</span>
                        </Button>
                      </div>

                      {tokenExpiresAt && (
                        <div className="mt-3 pt-3 border-t border-green-500/20">
                          <p className="text-xs text-muted-foreground">
                            Token expira em: {tokenExpiresAt.toLocaleDateString('pt-BR')}
                            {isTokenExpired && (
                              <span className="text-orange-500 ml-2">(Expirado - reconecte)</span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Phone Numbers Management */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="font-medium">Números Disponíveis</h4>
                          <p className="text-sm text-muted-foreground">
                            Selecione qual número usar para envio
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchPhoneNumbers}
                          disabled={loadingPhones}
                        >
                          {loadingPhones ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          <span className="ml-2">Atualizar</span>
                        </Button>
                      </div>

                      {phoneNumbers.length > 0 ? (
                        <div className="grid gap-3">
                          {phoneNumbers.map((phone) => (
                            <div
                              key={phone.id}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                metaSettings.meta_phone_number_id === phone.id
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/50'
                              } transition-colors`}
                            >
                              <div className="flex items-center gap-3">
                                <Phone className="w-5 h-5 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{phone.display_phone_number}</p>
                                  {phone.verified_name && (
                                    <p className="text-xs text-muted-foreground">{phone.verified_name}</p>
                                  )}
                                </div>
                              </div>
                              {metaSettings.meta_phone_number_id === phone.id ? (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                                  Ativo
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => selectPhoneNumber(phone)}
                                >
                                  Selecionar
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          <p>Clique em "Atualizar" para buscar seus números</p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Templates Management */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="font-medium flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Templates de Mensagem
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Templates aprovados para envio de cobranças
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchTemplates}
                          disabled={loadingTemplates}
                        >
                          {loadingTemplates ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          <span className="ml-2">Carregar</span>
                        </Button>
                      </div>

                      {templates.length > 0 ? (
                        <div className="grid gap-3 max-h-64 overflow-y-auto">
                          {templates.map((template, idx) => (
                            <div
                              key={`${template.name}-${idx}`}
                              className="flex items-center justify-between p-3 rounded-lg border border-border"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{template.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {template.category} • {template.language}
                                  </p>
                                </div>
                              </div>
                              {getStatusBadge(template.status)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground border border-dashed border-border rounded-lg">
                          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>Clique em "Carregar" para buscar seus templates</p>
                          <p className="text-xs mt-1">Templates necessários: vence_amanha, hoje01, vencido</p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* WABA Users/Agents Management */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="font-medium flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Atendentes
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Gerencie os usuários com acesso à API
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchWabaUsers}
                          disabled={loadingUsers}
                        >
                          {loadingUsers ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          <span className="ml-2">Atualizar</span>
                        </Button>
                      </div>

                      {/* Add new user */}
                      <div className="flex gap-2 mb-4">
                        <div className="flex-1 relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="email"
                            placeholder="Email do atendente (deve ter conta Facebook)"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <Button
                          onClick={addWabaUser}
                          disabled={addingUser || !newUserEmail.trim()}
                        >
                          {addingUser ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                          <span className="ml-2 hidden sm:inline">Adicionar</span>
                        </Button>
                      </div>

                      {wabaUsers.length > 0 ? (
                        <div className="grid gap-3">
                          {wabaUsers.map((wuser) => (
                            <div
                              key={wuser.id}
                              className="flex items-center justify-between p-3 rounded-lg border border-border"
                            >
                              <div className="flex items-center gap-3">
                                <Users className="w-5 h-5 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{wuser.name}</p>
                                  {wuser.tasks && (
                                    <p className="text-xs text-muted-foreground">
                                      Permissões: {wuser.tasks.join(', ')}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeWabaUser(wuser.id, wuser.name)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground border border-dashed border-border rounded-lg">
                          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>Nenhum atendente encontrado</p>
                          <p className="text-xs mt-1">Adicione usuários pelo email da conta Facebook</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vplay Test Generator Tab */}
          <TabsContent value="vplay_test" className="mt-6">
            <VplayServersManager />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
