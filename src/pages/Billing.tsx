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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Trash2,
  BarChart3,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';
import { SendProgressModal } from '@/components/billing/SendProgressModal';
import { BillingReportsTab } from '@/components/billing/BillingReportsTab';
import { BillingScheduleCard } from '@/components/billing/BillingScheduleCard';

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
  category?: string;
}

interface MetaPhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
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
  
  // Meta Cloud API states
  const [metaPhoneNumbers, setMetaPhoneNumbers] = useState<MetaPhoneNumber[]>([]);
  const [metaTemplates, setMetaTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoadingMetaPhones, setIsLoadingMetaPhones] = useState(false);
  const [isLoadingMetaTemplates, setIsLoadingMetaTemplates] = useState(false);
  
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

  // Progress modal state
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressResults, setProgressResults] = useState<Array<{
    customer: string;
    phone: string;
    billingType: string;
    template: string;
    status: 'sent' | 'error' | 'pending' | 'skipped';
    error?: string;
  }>>([]);
  const [progressStats, setProgressStats] = useState({ sent: 0, errors: 0, skipped: 0, total: 0 });
  const [isProgressComplete, setIsProgressComplete] = useState(false);


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

  const [isDeletingByType, setIsDeletingByType] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const deleteLogsByType = async (billingType: 'D-1' | 'D0' | 'D+1') => {
    setIsDeletingByType(billingType);
    try {
      const { error } = await supabase
        .from('billing_logs')
        .delete()
        .eq('billing_type', billingType);
      
      if (error) throw error;
      
      toast({ 
        title: 'Logs excluídos!', 
        description: `Todos os registros ${billingType} foram removidos.` 
      });
      queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir',
        description: error.message || 'Não foi possível excluir os registros.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingByType(null);
    }
  };

  const deleteAllBillingLogs = async () => {
    setIsDeletingAll(true);
    try {
      const { error } = await supabase
        .from('billing_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
      
      if (error) throw error;
      
      toast({ 
        title: 'Histórico limpo!', 
        description: 'Todos os registros de cobrança foram removidos. Agora você pode reenviar as cobranças.' 
      });
      queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
    } catch (error: any) {
      toast({
        title: 'Erro ao limpar',
        description: error.message || 'Não foi possível limpar o histórico.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const { data: zapSettings, refetch: refetchSettings } = useQuery({
    queryKey: ['zap-responder-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Check if using Meta Cloud API
  const isMetaCloudApi = zapSettings?.api_type === 'meta_cloud' && zapSettings?.meta_connected_at;
  const hasValidSession = isMetaCloudApi 
    ? !!zapSettings?.meta_phone_number_id 
    : !!zapSettings?.selected_session_id;

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

  // Meta Cloud API: Fetch phone numbers (equivalent to departments)
  const fetchMetaPhoneNumbers = async () => {
    setIsLoadingMetaPhones(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'fetch-phone-numbers' },
      });

      if (error) throw error;

      if (data?.phone_numbers) {
        setMetaPhoneNumbers(data.phone_numbers);
        toast({ title: 'Números carregados!', description: `${data.phone_numbers.length} números encontrados.` });
      }
    } catch (error: any) {
      console.error('[Billing] Fetch Meta phones error:', error);
      toast({
        title: 'Erro ao carregar números',
        description: error.message || 'Não foi possível buscar os números',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMetaPhones(false);
    }
  };

  // Meta Cloud API: Fetch templates
  const fetchMetaTemplates = async () => {
    setIsLoadingMetaTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { action: 'fetch-templates' },
      });

      if (error) throw error;

      if (data?.templates) {
        setMetaTemplates(data.templates);
        toast({ title: 'Templates carregados!', description: `${data.templates.length} templates encontrados.` });
      }
    } catch (error: any) {
      console.error('[Billing] Fetch Meta templates error:', error);
      toast({
        title: 'Erro ao carregar templates',
        description: error.message || 'Não foi possível buscar os templates',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMetaTemplates(false);
    }
  };

  // Meta Cloud API: Select phone number
  const selectMetaPhoneNumber = async (phone: MetaPhoneNumber) => {
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: {
          action: 'select-phone',
          phone_number_id: phone.id,
          display_phone: phone.display_phone_number,
        },
      });

      if (error) throw error;

      refetchSettings();
      toast({
        title: 'Número selecionado!',
        description: `Usando ${phone.display_phone_number} para envios`,
      });
    } catch (error: any) {
      console.error('[Billing] Select Meta phone error:', error);
      toast({
        title: 'Erro ao selecionar número',
        description: error.message || 'Não foi possível selecionar o número',
        variant: 'destructive',
      });
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
  const BATCH_SIZE = 8;
  const BATCH_DELAY_MS = 2000; // 2 seconds between batches

  const handleSendBillings = async (billingType?: BillingType, forceResend: boolean = false) => {
    if (!hasValidSession) {
      toast({
        title: isMetaCloudApi ? 'Nenhum número selecionado' : 'Nenhuma sessão selecionada',
        description: isMetaCloudApi 
          ? 'Por favor, selecione um número do WhatsApp Oficial antes de enviar cobranças.' 
          : 'Por favor, selecione um atendente antes de enviar cobranças.',
        variant: 'destructive',
      });
      return;
    }

    // Reset and open progress modal
    setProgressResults([]);
    setProgressStats({ sent: 0, errors: 0, skipped: 0, total: 0 });
    setIsProgressComplete(false);
    setProgressModalOpen(true);

    setIsSending(true);
    setSendingType(billingType || 'all');
    
    try {
      // Step 1: Get customers to process (with optional force resend)
      const { data: startData, error: startError } = await supabase.functions.invoke('send-billing-batch', {
        body: { action: 'start', billing_type: billingType || null, force: forceResend },
      });
      
      if (startError || !startData?.success) {
        toast({
          title: 'Erro ao iniciar envio',
          description: startError?.message || startData?.error || 'Erro desconhecido',
          variant: 'destructive',
        });
        setProgressModalOpen(false);
        setIsSending(false);
        setSendingType(null);
        return;
      }

      const customers = startData.customers || [];
      const skippedCount = startData.skipped || 0;
      const totalToProcess = customers.length;

      setProgressStats({ sent: 0, errors: 0, skipped: skippedCount, total: totalToProcess + skippedCount });

      if (totalToProcess === 0) {
        toast({
          title: 'Nenhuma cobrança pendente',
          description: `${skippedCount} clientes já foram processados hoje.`,
        });
        setIsProgressComplete(true);
        setIsSending(false);
        setSendingType(null);
        return;
      }

      // Step 2: Process in batches of 8 with delay
      let totalSent = 0;
      let totalErrors = 0;
      const allResults: any[] = [];

      for (let i = 0; i < customers.length; i += BATCH_SIZE) {
        const batch = customers.slice(i, i + BATCH_SIZE);
        
        // Add pending items to show they're being processed
        const pendingItems = batch.map((c: any) => ({
          customer: c.name,
          phone: c.normalizedPhone || c.phone,
          billingType: c.billingType,
          template: '',
          status: 'pending' as const,
        }));
        
        setProgressResults(prev => [...prev, ...pendingItems]);
        
        const { data: batchData, error: batchError } = await supabase.functions.invoke('send-billing-batch', {
          body: { action: 'batch', batch },
        });

        if (batchError) {
          console.error('Batch error:', batchError);
          // Mark batch as errors
          const errorResults = batch.map((c: any) => ({
            customer: c.name,
            phone: c.normalizedPhone || c.phone,
            billingType: c.billingType,
            template: '',
            status: 'error' as const,
            error: 'Erro de conexão',
          }));
          totalErrors += batch.length;
          
          // Replace pending with error status
          setProgressResults(prev => {
            const updated = [...prev];
            for (let j = 0; j < batch.length; j++) {
              const idx = updated.findIndex(
                r => r.customer === batch[j].name && r.status === 'pending'
              );
              if (idx !== -1) {
                updated[idx] = errorResults[j];
              }
            }
            return updated;
          });
        } else {
          const batchResults = batchData?.results || [];
          allResults.push(...batchResults);
          
          totalSent += batchData?.sent || 0;
          totalErrors += batchData?.errors || 0;
          
          // Update results - replace pending with actual status
          setProgressResults(prev => {
            const updated = [...prev];
            for (const result of batchResults) {
              const idx = updated.findIndex(
                r => r.customer === result.customer && r.status === 'pending'
              );
              if (idx !== -1) {
                updated[idx] = {
                  customer: result.customer,
                  phone: result.phone,
                  billingType: result.billingType,
                  template: result.template,
                  status: result.status,
                  error: result.error,
                };
              }
            }
            return updated;
          });
        }

        // Update stats
        setProgressStats({
          sent: totalSent,
          errors: totalErrors,
          skipped: skippedCount,
          total: totalToProcess + skippedCount,
        });

        // Delay between batches (except for the last one)
        if (i + BATCH_SIZE < customers.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // Step 3: Mark as complete
      await supabase.functions.invoke('send-billing-batch', {
        body: { action: 'complete', sent: totalSent, errors: totalErrors, skipped: skippedCount },
      });

      setIsProgressComplete(true);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
      queryClient.invalidateQueries({ queryKey: ['billing-logs-today'] });
      queryClient.invalidateQueries({ queryKey: ['pending-billings'] });

    } catch (error) {
      console.error('Unexpected error:', error);
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

  // Export contacts to CSV
  const exportContactsToCSV = (type: 'D-1' | 'D0' | 'D+1') => {
    let customers: any[] = [];
    let filename = '';
    
    switch (type) {
      case 'D-1':
        customers = pendingBillings?.dminus1 || [];
        filename = 'clientes_d-1_vencem_amanha.csv';
        break;
      case 'D0':
        customers = pendingBillings?.d0 || [];
        filename = 'clientes_d0_vencem_hoje.csv';
        break;
      case 'D+1':
        customers = pendingBillings?.dplus1 || [];
        filename = 'clientes_d+1_venceram_ontem.csv';
        break;
    }
    
    if (customers.length === 0) {
      toast({
        title: 'Nenhum cliente para exportar',
        description: `Não há clientes na categoria ${type}`,
        variant: 'destructive',
      });
      return;
    }
    
    // Create CSV content with BOM for proper encoding
    const BOM = '\uFEFF';
    const headers = ['Nome', 'Telefone'];
    const rows = customers.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`
    ]);
    
    const csvContent = BOM + headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    toast({
      title: 'Exportação concluída!',
      description: `${customers.length} contatos exportados para ${filename}`,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Cobranças & WhatsApp</h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">
              Gerencie cobranças automáticas e comunicações via WhatsApp
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="glow" 
              onClick={() => handleSendBillings()}
              disabled={isSending || totalPending === 0 || !hasValidSession}
              className="w-full sm:w-auto"
            >
              {isSending && sendingType === 'all' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              <span className="hidden sm:inline">Enviar Todas as Cobranças</span>
              <span className="sm:hidden">Enviar Todas</span>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  disabled={isSending || !hasValidSession}
                  className="w-full sm:w-auto border-warning/50 text-warning hover:bg-warning/10"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Forçar Reenvio</span>
                  <span className="sm:hidden">Reenviar</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Forçar Reenvio de Cobranças</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso irá reenviar cobranças para <strong>todos os clientes</strong> elegíveis (D-1, D0, D+1), 
                    <strong>mesmo que já tenham sido processados hoje</strong>.
                    <br /><br />
                    Use apenas se os clientes não receberam as mensagens anteriores.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => handleSendBillings(undefined, true)}
                    className="bg-warning hover:bg-warning/90 text-warning-foreground"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Forçar Reenvio
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Tabs defaultValue="config" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto">
            <TabsTrigger value="config" className="text-xs sm:text-sm py-2">Config</TabsTrigger>
            <TabsTrigger value="departamentos" className="text-xs sm:text-sm py-2">
              {isMetaCloudApi ? 'Números' : 'Deptos'}
            </TabsTrigger>
            <TabsTrigger value="conversas" className="text-xs sm:text-sm py-2">Conversas</TabsTrigger>
            <TabsTrigger value="templates" className="text-xs sm:text-sm py-2">Templates</TabsTrigger>
            <TabsTrigger value="relatorios" className="text-xs sm:text-sm py-2 flex items-center gap-1">
              <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Relatórios</span>
              <span className="sm:hidden">Rel.</span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="text-xs sm:text-sm py-2">Histórico</TabsTrigger>
          </TabsList>

          {/* Tab: Configuração */}
          <TabsContent value="config" className="space-y-4">
            {/* Billing Schedule Card */}
            <BillingScheduleCard />
            
            {/* Meta Cloud API Configuration */}
            {isMetaCloudApi ? (
              <Card className="glass-card border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Phone className="w-5 h-5 text-green-500" />
                    WhatsApp Oficial (Meta Cloud API)
                    <span className="ml-2 px-2 py-0.5 text-xs bg-green-500/10 text-green-500 rounded-full border border-green-500/30">
                      Conectado
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-2">Número Selecionado:</p>
                      {zapSettings?.meta_phone_number_id ? (
                        <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                          <CheckCircle className="w-4 h-4 text-success" />
                          <span className="font-medium">{zapSettings.meta_display_phone}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                          <AlertCircle className="w-4 h-4 text-destructive" />
                          <span>Nenhum número selecionado</span>
                        </div>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={fetchMetaPhoneNumbers}
                      disabled={isLoadingMetaPhones}
                    >
                      {isLoadingMetaPhones ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Carregar Números
                    </Button>
                  </div>

                  {metaPhoneNumbers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Selecione um número:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {metaPhoneNumbers.map((phone) => (
                          <button
                            key={phone.id}
                            onClick={() => selectMetaPhoneNumber(phone)}
                            className={cn(
                              'p-3 rounded-lg border text-left transition-all hover:border-primary',
                              zapSettings?.meta_phone_number_id === phone.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-secondary/50'
                            )}
                          >
                            <p className="font-medium">{phone.display_phone_number}</p>
                            {phone.verified_name && (
                              <p className="text-sm text-muted-foreground">{phone.verified_name}</p>
                            )}
                            {phone.quality_rating && (
                              <span className={cn(
                                'text-xs px-2 py-0.5 rounded-full mt-1 inline-block',
                                phone.quality_rating === 'GREEN' 
                                  ? 'bg-success/10 text-success' 
                                  : phone.quality_rating === 'YELLOW'
                                  ? 'bg-warning/10 text-warning'
                                  : 'bg-muted text-muted-foreground'
                              )}>
                                {phone.quality_rating}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* Zap Responder Configuration */
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
            )}

            {/* Pending Billings Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <Card className="glass-card border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warning" />
                    D-1 (Vencem Amanhã)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl sm:text-3xl font-bold text-warning">{pendingBillings?.dminus1.length || 0}</p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 border-warning/30 text-warning hover:bg-warning/10"
                      onClick={() => handleSendBillings('D-1')}
                      disabled={isSending || (pendingBillings?.dminus1.length || 0) === 0 || !hasValidSession}
                    >
                      {isSending && sendingType === 'D-1' ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3 mr-1" />
                      )}
                      Enviar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-warning/30 text-warning hover:bg-warning/10"
                      onClick={() => exportContactsToCSV('D-1')}
                      disabled={(pendingBillings?.dminus1.length || 0) === 0}
                      title="Exportar contatos para CSV"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
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
                  <p className="text-2xl sm:text-3xl font-bold text-primary">{pendingBillings?.d0.length || 0}</p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => handleSendBillings('D0')}
                      disabled={isSending || (pendingBillings?.d0.length || 0) === 0 || !hasValidSession}
                    >
                      {isSending && sendingType === 'D0' ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3 mr-1" />
                      )}
                      Enviar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => exportContactsToCSV('D0')}
                      disabled={(pendingBillings?.d0.length || 0) === 0}
                      title="Exportar contatos para CSV"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
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
                  <p className="text-2xl sm:text-3xl font-bold text-destructive">{pendingBillings?.dplus1.length || 0}</p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => handleSendBillings('D+1')}
                      disabled={isSending || (pendingBillings?.dplus1.length || 0) === 0 || !hasValidSession}
                    >
                      {isSending && sendingType === 'D+1' ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3 mr-1" />
                      )}
                      Enviar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => exportContactsToCSV('D+1')}
                      disabled={(pendingBillings?.dplus1.length || 0) === 0}
                      title="Exportar contatos para CSV"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Departamentos / Números */}
          <TabsContent value="departamentos" className="space-y-4">
            {isMetaCloudApi ? (
              /* Meta Cloud: Phone Numbers (equivalent to departments) */
              <Card className="glass-card border-border/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Phone className="w-5 h-5 text-green-500" />
                    Números WhatsApp Oficial
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={fetchMetaPhoneNumbers}
                    disabled={isLoadingMetaPhones}
                  >
                    {isLoadingMetaPhones ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Carregar Números
                  </Button>
                </CardHeader>
                <CardContent>
                  {metaPhoneNumbers.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Clique em "Carregar Números" para listar os números disponíveis.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {metaPhoneNumbers.map((phone) => (
                          <div
                            key={phone.id}
                            className={cn(
                              'p-4 rounded-lg border transition-all cursor-pointer hover:border-green-500',
                              zapSettings?.meta_phone_number_id === phone.id
                                ? 'border-green-500 bg-green-500/10'
                                : 'border-border bg-secondary/30'
                            )}
                            onClick={() => selectMetaPhoneNumber(phone)}
                          >
                            <div className="flex items-center justify-between">
                              <p className="font-medium">{phone.display_phone_number}</p>
                              {zapSettings?.meta_phone_number_id === phone.id && (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              )}
                            </div>
                            {phone.verified_name && (
                              <p className="text-sm text-muted-foreground">{phone.verified_name}</p>
                            )}
                            {phone.quality_rating && (
                              <span className={cn(
                                'text-xs px-2 py-0.5 rounded-full mt-1 inline-block',
                                phone.quality_rating === 'GREEN' 
                                  ? 'bg-success/10 text-success' 
                                  : phone.quality_rating === 'YELLOW'
                                  ? 'bg-warning/10 text-warning'
                                  : 'bg-muted text-muted-foreground'
                              )}>
                                Qualidade: {phone.quality_rating}
                              </span>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">ID: {phone.id}</p>
                          </div>
                        ))}
                      </div>

                      {zapSettings?.meta_phone_number_id && (
                        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-sm">
                            Número ativo: <strong>{zapSettings.meta_display_phone}</strong>
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* Zap Responder: Departments */
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
            )}
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
            {isMetaCloudApi ? (
              /* Meta Cloud: Templates */
              <Card className="glass-card border-border/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-500" />
                    Templates Meta WhatsApp
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={fetchMetaTemplates}
                    disabled={isLoadingMetaTemplates}
                  >
                    {isLoadingMetaTemplates ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Carregar Templates
                  </Button>
                </CardHeader>
                <CardContent>
                  {isLoadingMetaTemplates ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : metaTemplates.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Clique em "Carregar Templates" para listar os templates disponíveis na sua conta Meta.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {metaTemplates.map((template, idx) => (
                        <div
                          key={`${template.name}-${idx}`}
                          className="p-4 rounded-lg border border-border bg-secondary/30"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium">{template.name}</p>
                            <span className={cn(
                              'text-xs px-2 py-0.5 rounded-full',
                              template.status === 'APPROVED' 
                                ? 'bg-success/10 text-success' 
                                : template.status === 'PENDING'
                                ? 'bg-warning/10 text-warning'
                                : template.status === 'REJECTED'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-muted text-muted-foreground'
                            )}>
                              {template.status === 'APPROVED' ? 'Aprovado' : 
                               template.status === 'PENDING' ? 'Pendente' :
                               template.status === 'REJECTED' ? 'Rejeitado' : template.status}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {template.category} • {template.language}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* Zap Responder: Templates */
              <>
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
                        Selecione um departamento na aba "Deptos" para ver os templates disponíveis.
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
                        Selecione um departamento na aba "Deptos" para ver os templates aprovados.
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
              </>
            )}
          </TabsContent>

          {/* Tab: Histórico */}
          <TabsContent value="historico" className="space-y-4">
            <Card className="glass-card border-border/50">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Histórico de Cobranças Enviadas
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isDeletingAll || !billingLogs?.length}
                      >
                        {isDeletingAll ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        Limpar Tudo
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação vai remover todos os registros de cobrança do histórico. 
                          Isso permitirá reenviar as cobranças para todos os clientes novamente.
                          <br /><br />
                          <strong>Esta ação não pode ser desfeita.</strong>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={deleteAllBillingLogs}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Sim, limpar tudo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-warning/30 text-warning hover:bg-warning/10"
                    onClick={() => deleteLogsByType('D-1')}
                    disabled={isDeletingByType !== null || !billingLogs?.some(l => l.billing_type === 'D-1')}
                  >
                    {isDeletingByType === 'D-1' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 mr-1" />
                    )}
                    Excluir D-1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => deleteLogsByType('D0')}
                    disabled={isDeletingByType !== null || !billingLogs?.some(l => l.billing_type === 'D0')}
                  >
                    {isDeletingByType === 'D0' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 mr-1" />
                    )}
                    Excluir D0
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => deleteLogsByType('D+1')}
                    disabled={isDeletingByType !== null || !billingLogs?.some(l => l.billing_type === 'D+1')}
                  >
                    {isDeletingByType === 'D+1' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 mr-1" />
                    )}
                    Excluir D+1
                  </Button>
                </div>
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

          {/* Tab: Relatórios */}
          <TabsContent value="relatorios">
            <BillingReportsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Progress Modal */}
      <SendProgressModal
        open={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        billingType={sendingType || 'all'}
        totalToSend={progressStats.total}
        results={progressResults}
        isComplete={isProgressComplete}
        sent={progressStats.sent}
        errors={progressStats.errors}
        skipped={progressStats.skipped}
      />
    </DashboardLayout>
  );
}
