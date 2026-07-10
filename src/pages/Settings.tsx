import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, EyeOff, Save, AlertCircle, CheckCircle2, Unplug, Phone, RefreshCw, Server, FileText, Users, UserPlus, Trash2, Target, CreditCard, Database, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import VplayServersManager from '@/components/settings/VplayServersManager';
import GoalsSettingsCard from '@/components/settings/GoalsSettingsCard';
import ResellerApiSettings from '@/components/settings/ResellerApiSettings';
import AutoRenewServersCard from '@/components/settings/AutoRenewServersCard';
import BillingSettingsCard from '@/components/settings/BillingSettingsCard';
import BackupManagerCard from '@/components/settings/BackupManagerCard';
import EvolutionApiCard from '@/components/settings/EvolutionApiCard';
import CrmOficialCard from '@/components/settings/CrmOficialCard';
import PanelThemeCard from '@/components/settings/PanelThemeCard';
import AttendancesStatsCard from '@/components/settings/AttendancesStatsCard';
import { Palette, MessageSquare } from 'lucide-react';


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

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}


const META_APP_ID = '1499507967794395';

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  waba_id?: string;
  waba_name?: string;
  business_id?: string;
  business_name?: string;
  account_review_status?: string;
}

interface MessageTemplate {
  name: string;
  status: string;
  language: string;
  category: string;
  components?: any[];
  waba_id?: string;
  waba_name?: string;
  business_id?: string;
  business_name?: string;
}

interface Department {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

export default function Settings() {
  const { user, session, isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [activeTab, setActiveTab] = useState('cobranca');
  
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
  
  // Meta Templates & Departments
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [addingDepartment, setAddingDepartment] = useState(false);

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
      fetchDepartments();
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

    const shortLivedToken = response?.authResponse?.accessToken;

    if (!shortLivedToken) {
      const message =
        response?.status === 'not_authorized'
          ? 'Permissões não autorizadas. Confirme todas as permissões no popup.'
          : response?.status === 'unknown'
            ? 'Login não concluído. Se o app estiver em Development, adicione seu usuário como tester.'
            : 'Login cancelado ou não autorizado completamente.';

      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
      setConnectingMeta(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: {
          action: 'exchange-sdk-token',
          access_token: shortLivedToken,
        },
      });

      if (error) {
        const details = await getFunctionsHttpErrorDetails(error);
        const message = details?.message || (typeof details?.raw === 'object' ? JSON.stringify(details.raw) : undefined);
        throw new Error(message || 'Erro ao conectar conta Meta.');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro desconhecido');
      }

      toast({
        title: 'Sucesso!',
        description: `WhatsApp Oficial conectado: ${data.display_phone || 'Número detectado'}`,
      });

      await fetchSettings();
    } catch (err: any) {
      console.error('[Settings] Token exchange error:', err);
      toast({
        title: 'Erro',
        description: err?.message || 'Erro ao conectar conta Meta',
        variant: 'destructive',
      });
    } finally {
      setConnectingMeta(false);
    }
  }, [toast]);

  const handleMetaLogin = useCallback(() => {
    if (!fbSdkLoaded || !window.FB) {
      toast({
        title: 'SDK indisponível',
        description: 'Aguarde o carregamento do Facebook SDK e tente novamente.',
        variant: 'destructive',
      });
      return;
    }

    setConnectingMeta(true);

    try {
      window.FB.login(
        (response: any) => {
          processMetaLoginResponse(response);
        },
        {
          scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
          return_scopes: true,
        }
      );
    } catch (err: any) {
      console.error('[Settings] FB.login error:', err);
      toast({
        title: 'Erro',
        description: err?.message || 'Erro ao abrir login do Facebook.',
        variant: 'destructive',
      });
      setConnectingMeta(false);
    }
  }, [fbSdkLoaded, processMetaLoginResponse, toast]);

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
      setActiveTab('cobranca');
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
    if (!phone.waba_id) {
      toast({
        title: 'Erro',
        description: 'Não foi possível identificar a conta WhatsApp desse número.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: {
          action: 'select-phone',
          phone_number_id: phone.id,
          display_phone: phone.display_phone_number,
          waba_id: phone.waba_id,
        },
      });

      if (error) throw error;

      setMetaSettings(prev => ({
        ...prev,
        meta_business_id: data?.waba_id || phone.waba_id,
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

  const fetchDepartments = async () => {
    setLoadingDepartments(true);
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data) {
        setDepartments(data);
      }
    } catch (err: any) {
      console.error('[Settings] Fetch departments error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao buscar departamentos',
        variant: 'destructive',
      });
    } finally {
      setLoadingDepartments(false);
    }
  };

  const addDepartment = async () => {
    if (!newDepartmentName.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite o nome do departamento',
        variant: 'destructive',
      });
      return;
    }

    setAddingDepartment(true);
    try {
      const { data, error } = await supabase
        .from('departments')
        .insert({
          user_id: user?.id,
          name: newDepartmentName.trim(),
          is_default: departments.length === 0, // First one is default
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Departamento criado com sucesso!',
      });
      setNewDepartmentName('');
      fetchDepartments();
    } catch (err: any) {
      console.error('[Settings] Add department error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao criar departamento',
        variant: 'destructive',
      });
    } finally {
      setAddingDepartment(false);
    }
  };

  const removeDepartment = async (departmentId: string, departmentName: string) => {
    if (!confirm(`Tem certeza que deseja remover "${departmentName}"?`)) return;

    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', departmentId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Departamento removido com sucesso!',
      });
      fetchDepartments();
    } catch (err: any) {
      console.error('[Settings] Remove department error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao remover departamento',
        variant: 'destructive',
      });
    }
  };

  const setDefaultDepartment = async (departmentId: string) => {
    try {
      // First, unset all defaults
      await supabase
        .from('departments')
        .update({ is_default: false })
        .eq('user_id', user?.id);

      // Then set the new default
      const { error } = await supabase
        .from('departments')
        .update({ is_default: true })
        .eq('id', departmentId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Departamento padrão definido!',
      });
      fetchDepartments();
    } catch (err: any) {
      console.error('[Settings] Set default department error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao definir departamento padrão',
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
          <TabsList className="flex w-full flex-wrap gap-1 h-auto justify-start">
            <TabsTrigger value="cobranca" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-green-500" />
              <span className="hidden sm:inline">Cobrança</span>
              <span className="sm:hidden">Cobr.</span>
            </TabsTrigger>
            <TabsTrigger value="crm_oficial" className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              <span className="hidden sm:inline">CRM Oficial</span>
              <span className="sm:hidden">CRM</span>
            </TabsTrigger>
            <TabsTrigger value="aparencia" className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-pink-500" />
              <span className="hidden sm:inline">Aparência</span>
              <span className="sm:hidden">Cores</span>
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="evolution" className="flex items-center gap-2">
                <span className="hidden sm:inline">Evolution</span>
                <span className="sm:hidden">Evo</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="apis_externas" className="flex items-center gap-2">
              <span className="hidden sm:inline">APIs Externas</span>
              <span className="sm:hidden">APIs</span>
            </TabsTrigger>
            <TabsTrigger value="vplay_test" className="flex items-center gap-2">
              <Server className="w-4 h-4 text-violet-500" />
              <span className="hidden sm:inline">Gerador Vplay</span>
              <span className="sm:hidden">Vplay</span>
            </TabsTrigger>
            <TabsTrigger value="metas" className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-500" />
              <span className="hidden sm:inline">Metas</span>
              <span className="sm:hidden">Metas</span>
            </TabsTrigger>
            <TabsTrigger value="backups" className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-500" />
              <span className="hidden sm:inline">Backups</span>
              <span className="sm:hidden">Back.</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="crm_oficial" className="mt-6">
            <CrmOficialCard />
          </TabsContent>





          <TabsContent value="aparencia" className="mt-6">
            <PanelThemeCard />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="evolution" className="mt-6">
              <EvolutionApiCard />
            </TabsContent>
          )}

          {/* Cobrança Tab */}
          <TabsContent value="cobranca" className="mt-6">
            <BillingSettingsCard />
          </TabsContent>


          {/* APIs Externas Tab */}
          <TabsContent value="apis_externas" className="mt-6 space-y-6">
            <ResellerApiSettings />
            <P2CineCredentialsCard />
            <AutoRenewServersCard />
          </TabsContent>

          {/* Vplay Test Generator Tab */}
          <TabsContent value="vplay_test" className="mt-6">
            <VplayServersManager />
          </TabsContent>

          {/* Metas Tab */}
          <TabsContent value="metas" className="mt-6">
            <GoalsSettingsCard />
          </TabsContent>

          {/* Backups Tab */}
          <TabsContent value="backups" className="mt-6">
            <BackupManagerCard />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
