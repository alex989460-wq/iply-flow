import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { 
  Loader2, 
  MessageSquare, 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  Send, 
  Phone,
  RefreshCw,
  MessageCircle,
  Building2,
  Bot,
  Search,
  X,
  FileText,
  Play,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type BillingType = Database['public']['Enums']['billing_type'];

interface ZapSession {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface Department {
  id: string;
  name: string;
  phone?: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  language?: string;
  status?: string;
}

export default function Billing() {
  const [isSending, setIsSending] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [sessions, setSessions] = useState<ZapSession[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  
  // Form states
  const [searchPhone, setSearchPhone] = useState('');
  const [searchConversationId, setSearchConversationId] = useState('');
  const [conversationResult, setConversationResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Dialog states
  const [sendTemplateOpen, setSendTemplateOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    department_id: '',
    template_name: '',
    number: '',
    language: 'pt_BR',
  });
  
  const [iniciarBotOpen, setIniciarBotOpen] = useState(false);
  const [botForm, setBotForm] = useState({
    chat_id: '',
    departamento: '',
    aplicacao: 'whatsapp',
    mensagem_inicial: '',
  });

  const [criarConversaOpen, setCriarConversaOpen] = useState(false);
  const [conversaForm, setConversaForm] = useState({
    attendant_id: '',
    chat_id: '',
    department_id: '',
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeletingLog, setIsDeletingLog] = useState(false);
  const [departmentsLoaded, setDepartmentsLoaded] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const { data: billingLogs, isLoading } = useQuery({
    queryKey: ['billing-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_logs')
        .select('*, customers(name, phone)')
        .order('sent_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const deleteBillingLog = async (logId: string) => {
    setIsDeletingLog(true);
    try {
      const { error } = await supabase
        .from('billing_logs')
        .delete()
        .eq('id', logId);
      
      if (error) throw error;
      
      toast({ title: 'Log excluído!', description: 'O registro foi removido com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir',
        description: error.message || 'Não foi possível excluir o registro.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingLog(false);
    }
  };

  const { data: zapSettings, refetch: refetchSettings } = useQuery({
    queryKey: ['zap-responder-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Auto-load sessions and departments on mount
  useEffect(() => {
    if (zapSettings && !sessionsLoaded) {
      fetchSessions(false).then(() => setSessionsLoaded(true));
    }
  }, [zapSettings, sessionsLoaded]);

  useEffect(() => {
    if (zapSettings && !departmentsLoaded) {
      fetchDepartmentsAuto();
    }
  }, [zapSettings, departmentsLoaded]);

  // Silent fetch for auto-load (no toast)
  const fetchDepartmentsAuto = async () => {
    setIsLoadingDepartments(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'departamentos' },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setDepartments(data.data);
        setDepartmentsLoaded(true);
      }
    } catch (error: any) {
      console.error('Error auto-loading departments:', error);
    } finally {
      setIsLoadingDepartments(false);
    }
  };

  const { data: pendingBillings } = useQuery({
    queryKey: ['pending-billings'],
    queryFn: async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Fetch ALL customers (ativa + inativa) using pagination (bypass 1000 limit)
      const pageSize = 1000;
      let allCustomers: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('customers')
          .select('*, plans(plan_name)')
          .in('status', ['ativa', 'inativa'])
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allCustomers = [...allCustomers, ...data];
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      const todayStr = format(today, 'yyyy-MM-dd');
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
      const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

      return {
        dminus1: allCustomers.filter(c => c.due_date === tomorrowStr) || [],
        d0: allCustomers.filter(c => c.due_date === todayStr) || [],
        dplus1: allCustomers.filter(c => c.due_date === yesterdayStr) || [],
      };
    },
  });

  // Fetch sessions/atendentes
  const fetchSessions = async (showToast = true) => {
    setIsLoadingSessions(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'sessions' },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setSessions(data.data);
        if (showToast) {
          toast({ title: 'Atendentes carregados!', description: `${data.data.length} atendentes encontrados.` });
        }
      } else {
        if (showToast) {
          toast({ 
            title: 'Erro ao carregar atendentes', 
            description: data?.error || 'Resposta inválida da API',
            variant: 'destructive' 
          });
        }
      }
    } catch (error: any) {
      if (showToast) {
        toast({
          title: 'Erro ao carregar atendentes',
          description: error.message || 'Não foi possível conectar à API',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Fetch departments
  const fetchDepartments = async () => {
    setIsLoadingDepartments(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'departamentos' },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setDepartments(data.data);
        toast({ title: 'Departamentos carregados!', description: `${data.data.length} departamentos encontrados.` });
      } else {
        toast({ 
          title: 'Erro ao carregar departamentos', 
          description: data?.error || 'Resposta inválida da API',
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar departamentos',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingDepartments(false);
    }
  };

  // Fetch templates
  const fetchTemplates = async (departmentId: string) => {
    setIsLoadingTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'buscar-templates', department_id: departmentId },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setTemplates(data.data);
        toast({ title: 'Templates carregados!', description: `${data.data.length} templates encontrados.` });
      } else {
        toast({ 
          title: 'Erro ao carregar templates', 
          description: data?.error || 'Resposta inválida da API',
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar templates',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Search conversation by phone
  const searchByPhone = async () => {
    if (!searchPhone) return;
    setIsSearching(true);
    setConversationResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'buscar-conversa-telefone', phone: searchPhone, include_closed: true },
      });

      if (error) throw error;

      if (data?.success) {
        setConversationResult(data.data);
        toast({ title: 'Conversa encontrada!' });
      } else {
        toast({ 
          title: 'Conversa não encontrada', 
          description: data?.error,
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro na busca',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Search conversation by ID
  const searchById = async () => {
    if (!searchConversationId) return;
    setIsSearching(true);
    setConversationResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'buscar-conversa-id', conversation_id: searchConversationId, include_closed: true },
      });

      if (error) throw error;

      if (data?.success) {
        setConversationResult(data.data);
        toast({ title: 'Conversa encontrada!' });
      } else {
        toast({ 
          title: 'Conversa não encontrada', 
          description: data?.error,
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro na busca',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Send template
  const sendTemplate = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { 
          action: 'enviar-template',
          ...templateForm
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: 'Template enviado com sucesso!' });
        setSendTemplateOpen(false);
        setTemplateForm({ department_id: '', template_name: '', number: '', language: 'pt_BR' });
      } else {
        toast({ 
          title: 'Erro ao enviar template', 
          description: data?.error,
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar template',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Start bot
  const startBot = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { 
          action: 'iniciar-bot',
          chat_id: botForm.chat_id,
          departamento: botForm.departamento,
          aplicacao: botForm.aplicacao,
          mensagem_inicial: botForm.mensagem_inicial || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: 'Bot iniciado com sucesso!' });
        setIniciarBotOpen(false);
        setBotForm({ chat_id: '', departamento: '', aplicacao: 'whatsapp', mensagem_inicial: '' });
      } else {
        toast({ 
          title: 'Erro ao iniciar bot', 
          description: data?.error,
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao iniciar bot',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Create conversation
  const createConversation = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { 
          action: 'criar-conversa',
          attendant_id: conversaForm.attendant_id,
          chat_id: conversaForm.chat_id,
          department_id: conversaForm.department_id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: 'Conversa criada com sucesso!' });
        setCriarConversaOpen(false);
        setConversaForm({ attendant_id: '', chat_id: '', department_id: '' });
      } else {
        toast({ 
          title: 'Erro ao criar conversa', 
          description: data?.error,
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao criar conversa',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // End conversation
  const endConversation = async (chatId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'encerrar-conversa', chat_id: chatId },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: 'Conversa encerrada!' });
        setConversationResult(null);
      } else {
        toast({ 
          title: 'Erro ao encerrar conversa', 
          description: data?.error,
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao encerrar conversa',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const selectSessionMutation = useMutation({
    mutationFn: async (session: ZapSession) => {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: {
          action: 'select-session',
          session_id: session.id,
          session_name: session.name,
          session_phone: session.phone,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao selecionar sessão');

      return session;
    },
    onSuccess: (session) => {
      refetchSettings();
      toast({ title: 'Sessão selecionada!', description: `Usando ${session.name} (${session.phone})` });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao selecionar sessão',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const [sendingType, setSendingType] = useState<string | null>(null);

  const handleSendBillings = async (billingType?: BillingType) => {
    if (!zapSettings?.selected_session_id) {
      toast({
        title: 'Nenhuma sessão selecionada',
        description: 'Por favor, selecione um atendente antes de enviar cobranças.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    setSendingType(billingType || 'all');
    try {
      const { data, error } = await supabase.functions.invoke('send-billing', {
        body: billingType ? { billing_type: billingType } : {},
      });
      
      if (error) {
        toast({
          title: 'Erro ao enviar cobranças',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        const results = data?.results;
        const typeLabel = billingType || 'Todas';
        toast({
          title: `Cobranças ${typeLabel} processadas!`,
          description: `Enviadas: ${results?.sent || 0} | Ignoradas: ${results?.skipped || 0} | Erros: ${results?.errors || 0}`,
        });
        queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
        queryClient.invalidateQueries({ queryKey: ['pending-billings'] });
      }
    } catch (error) {
      toast({
        title: 'Erro inesperado',
        description: 'Não foi possível processar as cobranças',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
      setSendingType(null);
    }
  };

  const getBillingTypeBadge = (type: BillingType) => {
    const config = {
      'D-1': { label: 'D-1', className: 'bg-warning/10 text-warning', icon: Clock },
      'D0': { label: 'D0', className: 'bg-primary/10 text-primary', icon: AlertCircle },
      'D+1': { label: 'D+1', className: 'bg-destructive/10 text-destructive', icon: AlertCircle },
    };
    const { label, className, icon: Icon } = config[type];
    return (
      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', className)}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <span className="text-muted-foreground">-</span>;
    
    const isSuccess = status.toLowerCase().includes('success') || status.toLowerCase().includes('sent');
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        isSuccess ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
      )}>
        {isSuccess ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
        {status}
      </span>
    );
  };

  const totalPending = (pendingBillings?.dminus1.length || 0) + 
                       (pendingBillings?.d0.length || 0) + 
                       (pendingBillings?.dplus1.length || 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Cobranças & WhatsApp</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie cobranças automáticas e comunicações via WhatsApp
            </p>
          </div>
          <Button 
            variant="glow" 
            onClick={() => handleSendBillings()}
            disabled={isSending || totalPending === 0 || !zapSettings?.selected_session_id}
          >
            {isSending && sendingType === 'all' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Enviar Todas as Cobranças
          </Button>
        </div>

        <Tabs defaultValue="config" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="config">Configuração</TabsTrigger>
            <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
            <TabsTrigger value="conversas">Conversas</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          {/* Tab: Configuração */}
          <TabsContent value="config" className="space-y-4">
            {/* Zap Responder Configuration */}
            <Card className="glass-card border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="w-5 h-5 text-primary" />
                  Configuração do Zap Responder
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-2">Atendente Selecionado:</p>
                    {zapSettings?.selected_session_id ? (
                      <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="font-medium">{zapSettings.selected_session_name}</span>
                        <span className="text-muted-foreground">({zapSettings.selected_session_phone})</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-destructive" />
                        <span>Nenhum atendente selecionado</span>
                      </div>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => fetchSessions(true)}
                    disabled={isLoadingSessions}
                  >
                    {isLoadingSessions ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Carregar Atendentes
                  </Button>
                </div>

                {sessions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Selecione um atendente:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {sessions.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => selectSessionMutation.mutate(session)}
                          disabled={selectSessionMutation.isPending}
                          className={cn(
                            'p-3 rounded-lg border text-left transition-all hover:border-primary',
                            zapSettings?.selected_session_id === session.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-secondary/50'
                          )}
                        >
                          <p className="font-medium">{session.name}</p>
                          <p className="text-sm text-muted-foreground">{session.phone}</p>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full mt-1 inline-block',
                            session.status === 'connected' || session.status === 'active'
                              ? 'bg-success/10 text-success' 
                              : 'bg-muted text-muted-foreground'
                          )}>
                            {session.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Billings Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warning" />
                    D-1 (Vencem Amanhã)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-bold text-warning">{pendingBillings?.dminus1.length || 0}</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full border-warning/30 text-warning hover:bg-warning/10"
                    onClick={() => handleSendBillings('D-1')}
                    disabled={isSending || (pendingBillings?.dminus1.length || 0) === 0 || !zapSettings?.selected_session_id}
                  >
                    {isSending && sendingType === 'D-1' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3 mr-1" />
                    )}
                    Enviar D-1
                  </Button>
                </CardContent>
              </Card>
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-primary" />
                    D0 (Vencem Hoje)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-bold text-primary">{pendingBillings?.d0.length || 0}</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => handleSendBillings('D0')}
                    disabled={isSending || (pendingBillings?.d0.length || 0) === 0 || !zapSettings?.selected_session_id}
                  >
                    {isSending && sendingType === 'D0' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3 mr-1" />
                    )}
                    Enviar D0
                  </Button>
                </CardContent>
              </Card>
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    D+1 (Venceram Ontem)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-bold text-destructive">{pendingBillings?.dplus1.length || 0}</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => handleSendBillings('D+1')}
                    disabled={isSending || (pendingBillings?.dplus1.length || 0) === 0 || !zapSettings?.selected_session_id}
                  >
                    {isSending && sendingType === 'D+1' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3 mr-1" />
                    )}
                    Enviar D+1
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Departamentos */}
          <TabsContent value="departamentos" className="space-y-4">
            <Card className="glass-card border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Departamentos
                </CardTitle>
                <Button 
                  variant="outline" 
                  onClick={fetchDepartments}
                  disabled={isLoadingDepartments}
                >
                  {isLoadingDepartments ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Carregar Departamentos
                </Button>
              </CardHeader>
              <CardContent>
                {departments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Clique em "Carregar Departamentos" para listar os departamentos disponíveis.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {departments.map((dept) => (
                        <div
                          key={dept.id}
                          className={cn(
                            'p-4 rounded-lg border transition-all cursor-pointer hover:border-primary',
                            (selectedDepartment?.id === dept.id || zapSettings?.selected_department_id === dept.id)
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-secondary/30'
                          )}
                          onClick={async () => {
                            setSelectedDepartment(dept);
                            fetchTemplates(dept.id);
                            // Save department selection
                            try {
                              await supabase.functions.invoke('zap-responder', {
                                body: { 
                                  action: 'select-department', 
                                  department_id: dept.id, 
                                  department_name: dept.name 
                                },
                              });
                              refetchSettings();
                              toast({ title: 'Departamento salvo!', description: `${dept.name} definido como padrão.` });
                            } catch (err) {
                              console.error('Error saving department:', err);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{dept.name}</p>
                            {zapSettings?.selected_department_id === dept.id && (
                              <CheckCircle className="w-4 h-4 text-success" />
                            )}
                          </div>
                          {dept.phone && (
                            <p className="text-sm text-muted-foreground">{dept.phone}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">ID: {dept.id}</p>
                        </div>
                      ))}
                    </div>

                    {zapSettings?.selected_department_id && (
                      <div className="mt-4 p-3 bg-success/10 border border-success/20 rounded-lg flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span className="text-sm">
                          Departamento padrão: <strong>{zapSettings.selected_department_name || zapSettings.selected_department_id}</strong>
                        </span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Conversas */}
          <TabsContent value="conversas" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Search by Phone */}
              <Card className="glass-card border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Search className="w-5 h-5 text-primary" />
                    Buscar por Telefone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: 5511999999999"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                    />
                    <Button onClick={searchByPhone} disabled={isSearching || !searchPhone}>
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Search by ID */}
              <Card className="glass-card border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Search className="w-5 h-5 text-primary" />
                    Buscar por ID
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="ID da conversa"
                      value={searchConversationId}
                      onChange={(e) => setSearchConversationId(e.target.value)}
                    />
                    <Button onClick={searchById} disabled={isSearching || !searchConversationId}>
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Conversation Result */}
            {conversationResult && (
              <Card className="glass-card border-border/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Resultado da Busca</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setConversationResult(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <pre className="bg-secondary/50 p-4 rounded-lg overflow-auto max-h-64 text-sm">
                    {JSON.stringify(conversationResult, null, 2)}
                  </pre>
                  {conversationResult?.chatId && (
                    <div className="flex gap-2 mt-4">
                      <Button 
                        variant="destructive" 
                        onClick={() => endConversation(conversationResult.chatId)}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Encerrar Conversa
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Dialog open={criarConversaOpen} onOpenChange={setCriarConversaOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Criar Conversa
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Nova Conversa</DialogTitle>
                    <DialogDescription>
                      Crie uma nova conversa vinculando um atendente a um contato.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>ID do Atendente</Label>
                      <Input
                        placeholder="ID do atendente"
                        value={conversaForm.attendant_id}
                        onChange={(e) => setConversaForm({ ...conversaForm, attendant_id: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Telefone do Contato (chatId)</Label>
                      <Input
                        placeholder="Ex: 5511999999999"
                        value={conversaForm.chat_id}
                        onChange={(e) => setConversaForm({ ...conversaForm, chat_id: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>ID do Departamento</Label>
                      <Input
                        placeholder="ID do departamento"
                        value={conversaForm.department_id}
                        onChange={(e) => setConversaForm({ ...conversaForm, department_id: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCriarConversaOpen(false)}>Cancelar</Button>
                    <Button onClick={createConversation}>Criar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={iniciarBotOpen} onOpenChange={setIniciarBotOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Bot className="w-4 h-4 mr-2" />
                    Iniciar Bot
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Iniciar Bot</DialogTitle>
                    <DialogDescription>
                      Inicie um bot para um contato específico.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Telefone do Contato (chatId)</Label>
                      <Input
                        placeholder="Ex: 5511999999999"
                        value={botForm.chat_id}
                        onChange={(e) => setBotForm({ ...botForm, chat_id: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>ID do Departamento</Label>
                      <Input
                        placeholder="ID do departamento"
                        value={botForm.departamento}
                        onChange={(e) => setBotForm({ ...botForm, departamento: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Aplicação</Label>
                      <Input
                        placeholder="whatsapp"
                        value={botForm.aplicacao}
                        onChange={(e) => setBotForm({ ...botForm, aplicacao: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Mensagem Inicial (opcional)</Label>
                      <Textarea
                        placeholder="Mensagem inicial do bot..."
                        value={botForm.mensagem_inicial}
                        onChange={(e) => setBotForm({ ...botForm, mensagem_inicial: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIniciarBotOpen(false)}>Cancelar</Button>
                    <Button onClick={startBot}>
                      <Play className="w-4 h-4 mr-2" />
                      Iniciar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>

          {/* Tab: Templates */}
          <TabsContent value="templates" className="space-y-4">
            <Card className="glass-card border-border/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Templates WhatsApp
                </CardTitle>
                <Dialog open={sendTemplateOpen} onOpenChange={setSendTemplateOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Enviar Template WhatsApp</DialogTitle>
                      <DialogDescription>
                        Envie uma mensagem de template aprovado pelo WhatsApp.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>ID do Departamento</Label>
                        <Input
                          placeholder="ID do departamento"
                          value={templateForm.department_id}
                          onChange={(e) => setTemplateForm({ ...templateForm, department_id: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Nome do Template</Label>
                        <Input
                          placeholder="Nome do template"
                          value={templateForm.template_name}
                          onChange={(e) => setTemplateForm({ ...templateForm, template_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Número do Destinatário</Label>
                        <Input
                          placeholder="Ex: 5511999999999"
                          value={templateForm.number}
                          onChange={(e) => setTemplateForm({ ...templateForm, number: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Idioma</Label>
                        <Input
                          placeholder="pt_BR"
                          value={templateForm.language}
                          onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSendTemplateOpen(false)}>Cancelar</Button>
                      <Button onClick={sendTemplate}>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {selectedDepartment ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Templates do departamento: <strong>{selectedDepartment.name}</strong>
                    </p>
                    {isLoadingTemplates ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        Nenhum template encontrado para este departamento.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {templates.map((template) => (
                          <div
                            key={template.id}
                            className="p-4 rounded-lg border border-border bg-secondary/30"
                          >
                            <p className="font-medium">{template.name}</p>
                            {template.language && (
                              <p className="text-sm text-muted-foreground">Idioma: {template.language}</p>
                            )}
                            {template.status && (
                              <span className={cn(
                                'text-xs px-2 py-0.5 rounded-full mt-1 inline-block',
                                template.status === 'APPROVED' 
                                  ? 'bg-success/10 text-success' 
                                  : 'bg-muted text-muted-foreground'
                              )}>
                                {template.status}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Selecione um departamento na aba "Departamentos" para ver os templates disponíveis.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Approved Templates for Automatic Billing */}
            <Card className="glass-card border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Modelos de Cobrança Automática (Templates Aprovados)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedDepartment ? (
                  <p className="text-muted-foreground text-center py-4">
                    Selecione um departamento na aba "Departamentos" para ver os templates aprovados.
                  </p>
                ) : isLoadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : templates.filter(t => t.status === 'APPROVED').length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhum template aprovado encontrado para este departamento.
                  </p>
                ) : (
                  templates
                    .filter(t => t.status === 'APPROVED')
                    .map((template: any) => {
                      const bodyComponent = template.components?.find((c: any) => c.type === 'BODY');
                      const bodyText = bodyComponent?.text || 'Sem conteúdo';
                      
                      return (
                        <div 
                          key={template.id}
                          className="p-4 rounded-lg bg-success/5 border border-success/20"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-success">{template.name}</p>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
                              {template.status}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-line">
                            {bodyText}
                          </p>
                          {template.language && (
                            <p className="text-xs text-muted-foreground mt-2">Idioma: {template.language}</p>
                          )}
                        </div>
                      );
                    })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Histórico */}
          <TabsContent value="historico" className="space-y-4">
            <Card className="glass-card border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Histórico de Cobranças Enviadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : billingLogs?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhuma cobrança enviada ainda.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data/Hora</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Mensagem</TableHead>
                          <TableHead>Status WhatsApp</TableHead>
                          <TableHead className="w-[80px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billingLogs?.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap">
                              {new Date(log.sent_at).toLocaleString('pt-BR')}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{log.customers?.name}</p>
                                <p className="text-sm text-muted-foreground">{log.customers?.phone}</p>
                              </div>
                            </TableCell>
                            <TableCell>{getBillingTypeBadge(log.billing_type)}</TableCell>
                            <TableCell className="max-w-xs truncate">{log.message}</TableCell>
                            <TableCell>{getStatusBadge(log.whatsapp_status)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deleteBillingLog(log.id)}
                                disabled={isDeletingLog}
                              >
                                {isDeletingLog ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
