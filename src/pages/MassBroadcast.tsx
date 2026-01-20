import { useState, useMemo, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Send, 
  Users, 
  Server, 
  Calculator, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Loader2,
  MessageSquare,
  RefreshCw,
  FileText,
  Phone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BroadcastProgressModal, BroadcastResult } from '@/components/broadcast/BroadcastProgressModal';

interface Customer {
  id: string;
  name: string;
  phone: string;
  due_date: string;
  status: 'ativa' | 'inativa' | 'suspensa';
  server_id: string | null;
  plan_id: string | null;
  servers?: { server_name: string } | null;
  plans?: { plan_name: string; price: number } | null;
}

interface ServerType {
  id: string;
  server_name: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  language?: string;
  status?: string;
  category?: string;
}

type StatusFilter = 'all' | 'ativa' | 'inativa' | 'vencidos' | 'vencidos_mes_anterior' | 'ativos';
type SelectionMode = 'customers' | 'servers';

interface BroadcastReportData {
  total: number;
  sent: number;
  errors: number;
  skipped: number;
  details: BroadcastResult[];
  templateName: string;
  startedAt: Date;
  completedAt?: Date;
}

interface ActiveBroadcast {
  templateName: string;
  startedAtIso: string;
  customerById: Record<string, { name: string; phone: string }>;
  total: number;
}

// Custos por tipo de mensagem - Tabela Brasil (válida até 31/12/2025)
const COST_MARKETING = 0.5895; // R$ 0,5895 por mensagem de marketing (Cloud API)
const COST_UTILITY = 0.0642; // R$ 0,0642 por mensagem de utilidade (Cloud API)

export default function MassBroadcast() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('customers');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingProgress, setSendingProgress] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [batchSize, setBatchSize] = useState(8);
  const [batchIntervalSeconds, setBatchIntervalSeconds] = useState(3);
  const [broadcastReport, setBroadcastReport] = useState<BroadcastReportData | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState<BroadcastResult[]>([]);
  const [broadcastStats, setBroadcastStats] = useState({ sent: 0, errors: 0, skipped: 0 });
  const [isBroadcastComplete, setIsBroadcastComplete] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<ActiveBroadcast | null>(null);

  const initialResultsRef = useRef<BroadcastResult[]>([]);
  const realtimeResultsRef = useRef<Map<string, BroadcastResult>>(new Map());
  const cancelSendRef = useRef(false);

  // Templates from API
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Sessions from API
  interface Session {
    id: string;
    name: string;
    phone: string;
    status: string;
  }
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [showSessionSelector, setShowSessionSelector] = useState(false);

  // Fetch zap settings for department
  const { data: zapSettings, refetch: refetchZapSettings } = useQuery({
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

  // Fetch WhatsApp instances/sessions from API
  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      // Primeiro tenta buscar instâncias de WhatsApp (com telefones)
      const { data: instancesData, error: instancesError } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'whatsapp-sessions' },
      });

      if (!instancesError && instancesData?.success && instancesData?.data?.length > 0) {
        setSessions(instancesData.data);
        setShowSessionSelector(true);
        return;
      }

      // Fallback: busca atendentes
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'sessions' },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setSessions(data.data);
        setShowSessionSelector(true);
      } else {
        toast({ 
          title: 'Erro ao carregar sessões', 
          description: data?.error || 'Resposta inválida da API',
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar sessões',
        description: error.message || 'Não foi possível conectar à API',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Select session mutation
  const selectSessionMutation = useMutation({
    mutationFn: async (session: Session) => {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { 
          action: 'selecionar-sessao',
          session_id: session.id,
          session_name: session.name,
          session_phone: session.phone
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao selecionar sessão');
      return session;
    },
    onSuccess: (session) => {
      toast({ title: 'Atendente selecionado!', description: `${session.name} - ${session.phone}` });
      setShowSessionSelector(false);
      refetchZapSettings();
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao selecionar atendente', description: error.message, variant: 'destructive' });
    }
  });

  // Fetch all customers with pagination to overcome 1000 row limit
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers-broadcast'],
    queryFn: async () => {
      const allCustomers: Customer[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        const { data, error } = await supabase
          .from('customers')
          .select(`
            *,
            servers:server_id(server_name),
            plans:plan_id(plan_name, price)
          `)
          .order('name')
          .range(from, to);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allCustomers.push(...(data as Customer[]));
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      return allCustomers;
    },
  });

  // Fetch servers
  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ['servers-broadcast'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, server_name')
        .order('server_name');
      
      if (error) throw error;
      return data as ServerType[];
    },
  });

  // Fetch templates when department is available
  const fetchTemplates = async (showToast = true) => {
    if (!zapSettings?.selected_department_id) {
      if (showToast) {
        toast({
          title: 'Departamento não configurado',
          description: 'Configure um departamento na página de cobrança primeiro.',
          variant: 'destructive',
        });
      }
      return;
    }

    setIsLoadingTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'buscar-templates', department_id: zapSettings.selected_department_id },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        // Filter only approved templates
        const approvedTemplates = data.data.filter((t: any) => 
          t.status?.toLowerCase() === 'approved' || !t.status
        );
        setTemplates(approvedTemplates);
        setTemplatesLoaded(true);
        if (showToast) {
          toast({ title: 'Templates carregados!', description: `${approvedTemplates.length} templates aprovados encontrados.` });
        }
      } else {
        if (showToast) {
          toast({ 
            title: 'Erro ao carregar templates', 
            description: data?.error || 'Resposta inválida da API',
            variant: 'destructive' 
          });
        }
      }
    } catch (error: any) {
      if (showToast) {
        toast({
          title: 'Erro ao carregar templates',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Auto-load templates when department is available
  useEffect(() => {
    if (zapSettings?.selected_department_id && !templatesLoaded) {
      fetchTemplates(false);
    }
  }, [zapSettings?.selected_department_id, templatesLoaded]);

  // Filter customers based on status and search
  const filteredCustomers = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // First day of current month
    const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    return customers.filter(customer => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!customer.name.toLowerCase().includes(search) && 
            !customer.phone.includes(search)) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === 'ativa') return customer.status === 'ativa';
      if (statusFilter === 'inativa') return customer.status === 'inativa';
      if (statusFilter === 'vencidos') {
        const dueDate = new Date(customer.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
      }
      if (statusFilter === 'vencidos_mes_anterior') {
        const dueDate = new Date(customer.due_date);
        dueDate.setHours(0, 0, 0, 0);
        // Vencidos até o mês anterior (antes do primeiro dia do mês atual)
        return dueDate < firstDayCurrentMonth;
      }
      if (statusFilter === 'ativos') {
        const dueDate = new Date(customer.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= today;
      }
      
      return true;
    });
  }, [customers, statusFilter, searchTerm]);

  // Get customers for servers with status filter applied
  const getCustomersForServers = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    return customers.filter(customer => {
      // Must belong to a selected server
      if (!customer.server_id || !selectedServers.has(customer.server_id)) {
        return false;
      }

      // Apply status filter
      if (statusFilter === 'ativa') return customer.status === 'ativa';
      if (statusFilter === 'inativa') return customer.status === 'inativa';
      if (statusFilter === 'vencidos') {
        const dueDate = new Date(customer.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
      }
      if (statusFilter === 'vencidos_mes_anterior') {
        const dueDate = new Date(customer.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < firstDayCurrentMonth;
      }
      if (statusFilter === 'ativos') {
        const dueDate = new Date(customer.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= today;
      }
      
      return true;
    });
  }, [customers, selectedServers, statusFilter]);

  // Get customers based on selection mode
  const getSelectedCustomersList = useMemo(() => {
    if (selectionMode === 'customers') {
      return filteredCustomers.filter(c => selectedCustomers.has(c.id));
    } else {
      return getCustomersForServers;
    }
  }, [selectionMode, filteredCustomers, selectedCustomers, getCustomersForServers]);

  // Get selected template info
  const selectedTemplateInfo = useMemo(() => {
    return templates.find(t => t.name === selectedTemplate);
  }, [templates, selectedTemplate]);

  // Calculate estimated cost based on template category
  const estimatedCost = useMemo(() => {
    const count = getSelectedCustomersList.length;
    const isMarketing = selectedTemplateInfo?.category?.toUpperCase() === 'MARKETING';
    const costPerMessage = isMarketing ? COST_MARKETING : COST_UTILITY;

    const batches = batchSize > 0 ? Math.ceil(count / batchSize) : 0;
    const estimatedTime = batches * batchIntervalSeconds;

    return {
      count,
      totalCost: count * costPerMessage,
      estimatedTime,
      isMarketing,
      costPerMessage,
    };
  }, [getSelectedCustomersList, batchSize, batchIntervalSeconds, selectedTemplateInfo]);

  // Toggle customer selection
  const toggleCustomer = (customerId: string) => {
    const newSelected = new Set(selectedCustomers);
    if (newSelected.has(customerId)) {
      newSelected.delete(customerId);
    } else {
      newSelected.add(customerId);
    }
    setSelectedCustomers(newSelected);
  };

  // Toggle server selection
  const toggleServer = (serverId: string) => {
    const newSelected = new Set(selectedServers);
    if (newSelected.has(serverId)) {
      newSelected.delete(serverId);
    } else {
      newSelected.add(serverId);
    }
    setSelectedServers(newSelected);
  };

  // Select all visible customers
  const selectAllCustomers = () => {
    const allIds = new Set(filteredCustomers.map(c => c.id));
    setSelectedCustomers(allIds);
  };

  // Select all servers
  const selectAllServers = () => {
    const allIds = new Set(servers.map(s => s.id));
    setSelectedServers(allIds);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedCustomers(new Set());
    setSelectedServers(new Set());
  };

  // Send broadcast
  const sendBroadcast = async () => {
    if (isSending) return;

    if (!selectedTemplate) {
      toast({
        title: 'Template não selecionado',
        description: 'Selecione um template aprovado para enviar.',
        variant: 'destructive',
      });
      return;
    }

    const customersToSend = getSelectedCustomersList;
    if (customersToSend.length === 0) {
      toast({
        title: 'Nenhum cliente selecionado',
        description: 'Selecione pelo menos um cliente ou servidor para enviar.',
        variant: 'destructive',
      });
      return;
    }

    const templateName = selectedTemplate;
    const allCustomerIds = customersToSend.map((c) => c.id);

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const startedAt = new Date();
    const startedAtIso = new Date(startedAt.getTime() - 15_000).toISOString();
    const customerById: Record<string, { name: string; phone: string }> = Object.fromEntries(
      customersToSend.map((c) => [c.id, { name: c.name, phone: c.phone }])
    );

    // Open progress modal immediately
    setActiveBroadcast({
      templateName,
      startedAtIso,
      customerById,
      total: customersToSend.length,
    });

    cancelSendRef.current = false;
    setIsSending(true);
    setSendingProgress(0);
    initialResultsRef.current = [];
    setBroadcastResults([]);
    setBroadcastStats({ sent: 0, errors: 0, skipped: 0 });
    setIsBroadcastComplete(false);
    setShowProgressModal(true);
    setBroadcastReport({
      total: customersToSend.length,
      sent: 0,
      errors: 0,
      skipped: 0,
      details: [],
      templateName,
      startedAt,
    });

    try {
      // 1) Start: get queue + log skips immediately
      const startResponse = await supabase.functions.invoke('mass-broadcast', {
        body: {
          action: 'start',
          customer_ids: allCustomerIds,
          template_name: templateName,
        },
      });

      if (startResponse.error) throw new Error(startResponse.error.message);

      const startData = startResponse.data;
      if (!startData?.success) throw new Error(startData?.error || 'Resposta inválida do backend');

      const initialResults: BroadcastResult[] = startData.initial_results || [];
      const queueCustomerIds: string[] = startData.queue_customer_ids || [];

      initialResultsRef.current = initialResults;

      setBroadcastResults(initialResults);
      setBroadcastStats({
        sent: 0,
        errors: 0,
        skipped: startData.skipped || 0,
      });
      setBroadcastReport({
        total: customersToSend.length,
        sent: 0,
        errors: 0,
        skipped: startData.skipped || 0,
        details: initialResults,
        templateName,
        startedAt,
      });

      const alreadySentCount = startData.already_sent || 0;
      const duplicatesCount = startData.duplicates || 0;

      const batches = batchSize > 0 ? Math.ceil(queueCustomerIds.length / batchSize) : 0;
      const estimatedSeconds = batches * batchIntervalSeconds;

      let description = `${queueCustomerIds.length} mensagens únicas serão enviadas`;
      if (alreadySentCount > 0 || duplicatesCount > 0) {
        const skipParts: string[] = [];
        if (alreadySentCount > 0) skipParts.push(`${alreadySentCount} já enviados`);
        if (duplicatesCount > 0) skipParts.push(`${duplicatesCount} duplicados`);
        description += ` (${skipParts.join(', ')} ignorados)`;
      }
      description += `. Velocidade: ${batchSize} msgs / ${batchIntervalSeconds}s. Tempo estimado: ~${formatDuration(estimatedSeconds)}.`;

      toast({
        title: 'Disparo iniciado!',
        description,
      });

      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['billing-logs'] });

      // 2) Drive the sending in short batches to avoid backend timeouts
      for (let offset = 0; offset < queueCustomerIds.length; offset += batchSize) {
        if (cancelSendRef.current) break;

        const batch = queueCustomerIds.slice(offset, offset + batchSize);
        const batchResponse = await supabase.functions.invoke('mass-broadcast', {
          body: {
            action: 'batch',
            customer_ids: batch,
            template_name: templateName,
          },
        });

        if (batchResponse.error) throw new Error(batchResponse.error.message);
        if (!batchResponse.data?.success) throw new Error(batchResponse.data?.error || 'Erro ao enviar lote');

        const isLast = offset + batchSize >= queueCustomerIds.length;
        if (!isLast && batchIntervalSeconds > 0) {
          await sleep(batchIntervalSeconds * 1000);
        }
      }
    } catch (error: any) {
      console.error('Broadcast error:', error);
      toast({
        title: 'Erro no disparo',
        description: error.message || 'Ocorreu um erro ao iniciar o disparo.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const normalizeDigits = (value: string) => value.replace(/\D/g, '');

  const extractIgnoredReason = (message?: string | null) => {
    if (!message) return undefined;
    const match = message.match(/IGNORADO\s*\(([^)]+)\)/i);
    if (!match?.[1]) return undefined;
    const reason = match[1].trim();
    return reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : undefined;
  };

  // Realtime subscription to billing_logs for live progress updates
  useEffect(() => {
    if (!showProgressModal || !activeBroadcast) return;

    // Reset realtime results when starting new broadcast
    realtimeResultsRef.current = new Map();

    // Load existing logs first (in case some were already inserted)
    const loadInitialLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('billing_logs')
          .select('customer_id, whatsapp_status, message, sent_at')
          .ilike('message', `%Template: ${activeBroadcast.templateName}%`)
          .gte('sent_at', activeBroadcast.startedAtIso)
          .order('sent_at', { ascending: true })
          .limit(1000);

        if (error) throw error;

        for (const row of data || []) {
          const info = activeBroadcast.customerById[row.customer_id];
          if (!info) continue;

          const statusRaw = row.whatsapp_status || '';
          const status: BroadcastResult['status'] =
            statusRaw === 'sent'
              ? 'sent'
              : statusRaw === 'skipped'
                ? 'skipped'
                : 'error';

          const errorText =
            status === 'error'
              ? statusRaw.startsWith('error:')
                ? statusRaw.replace(/^error:\s*/i, '').trim()
                : statusRaw
              : extractIgnoredReason(row.message) || undefined;

          realtimeResultsRef.current.set(row.customer_id, {
            customer: info.name,
            phone: info.phone,
            status,
            error: errorText,
          });
        }

        updateBroadcastState();
      } catch (e) {
        console.error('Erro ao carregar logs iniciais:', e);
      }
    };

    const updateBroadcastState = () => {
      // Merge initial skipped results with realtime results
      const byPhone = new Map<string, BroadcastResult>();
      for (const r of initialResultsRef.current) {
        byPhone.set(normalizeDigits(r.phone), r);
      }
      for (const r of realtimeResultsRef.current.values()) {
        byPhone.set(normalizeDigits(r.phone), r);
      }

      const combined = Array.from(byPhone.values()).sort((a, b) =>
        a.customer.localeCompare(b.customer, 'pt-BR')
      );

      const sent = combined.filter((r) => r.status === 'sent').length;
      const errors = combined.filter((r) => r.status === 'error').length;
      const skipped = combined.filter((r) => r.status === 'skipped').length;
      const processed = sent + errors + skipped;

      setBroadcastResults(combined);
      setBroadcastStats({ sent, errors, skipped });
      setBroadcastReport((prev) =>
        prev
          ? {
              ...prev,
              sent,
              errors,
              skipped,
              details: combined,
            }
          : prev
      );

      if (processed >= activeBroadcast.total && !isBroadcastComplete) {
        setIsBroadcastComplete(true);
        setBroadcastReport((prev) => (prev ? { ...prev, completedAt: new Date() } : prev));
        queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
      }
    };

    // Subscribe to realtime inserts on billing_logs
    const channel = supabase
      .channel('broadcast-progress')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'billing_logs',
        },
        (payload) => {
          const row = payload.new as {
            customer_id: string;
            whatsapp_status: string | null;
            message: string | null;
            sent_at: string;
          };

          // Check if this log belongs to the current broadcast
          if (
            !row.message?.includes(`Template: ${activeBroadcast.templateName}`) ||
            row.sent_at < activeBroadcast.startedAtIso
          ) {
            return;
          }

          const info = activeBroadcast.customerById[row.customer_id];
          if (!info) return;

          const statusRaw = row.whatsapp_status || '';
          const status: BroadcastResult['status'] =
            statusRaw === 'sent'
              ? 'sent'
              : statusRaw === 'skipped'
                ? 'skipped'
                : 'error';

          const errorText =
            status === 'error'
              ? statusRaw.startsWith('error:')
                ? statusRaw.replace(/^error:\s*/i, '').trim()
                : statusRaw
              : extractIgnoredReason(row.message) || undefined;

          realtimeResultsRef.current.set(row.customer_id, {
            customer: info.name,
            phone: info.phone,
            status,
            error: errorText,
          });

          updateBroadcastState();
        }
      )
      .subscribe();

    loadInitialLogs();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showProgressModal, activeBroadcast, isBroadcastComplete, queryClient]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}min ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  const getStatusBadge = (customer: Customer) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(customer.due_date);
    dueDate.setHours(0, 0, 0, 0);
    
    const isOverdue = dueDate < today;
    
    if (customer.status === 'inativa') {
      return <Badge variant="secondary">Inativa</Badge>;
    }
    if (customer.status === 'suspensa') {
      return <Badge variant="destructive">Suspensa</Badge>;
    }
    if (isOverdue) {
      return <Badge variant="destructive">Vencido</Badge>;
    }
    return <Badge className="bg-success text-success-foreground">Ativa</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Disparo em Massa</h1>
            <p className="text-muted-foreground">
              Envie mensagens para múltiplos clientes usando templates aprovados
            </p>
          </div>
        </div>

        {/* Session Selector Card */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Telefone de Envio
            </CardTitle>
            <CardDescription>
              Selecione qual atendente/sessão será usado para enviar as mensagens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Session Display */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {zapSettings?.selected_session_phone ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-success/10 border border-success/30 flex-1">
                  <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{zapSettings.selected_session_phone}</p>
                    {zapSettings.selected_session_name && (
                      <p className="text-sm text-muted-foreground">{zapSettings.selected_session_name}</p>
                    )}
                  </div>
                  <Badge className="bg-success/20 text-success border-success/30">Selecionado</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-warning/10 border border-warning/30 flex-1">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
                  <p className="text-warning-foreground">Nenhum telefone selecionado para envio</p>
                </div>
              )}
              <Button 
                onClick={fetchSessions}
                disabled={isLoadingSessions}
                variant="outline"
                className="shrink-0"
              >
                {isLoadingSessions ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {zapSettings?.selected_session_phone ? 'Alterar' : 'Selecionar'}
              </Button>
            </div>

            {/* Session Selection Grid */}
            {showSessionSelector && sessions.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-medium text-muted-foreground">Selecione uma sessão de WhatsApp:</p>
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
                      <p className="font-medium text-foreground">{session.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {session.phone || 'Telefone não disponível'}
                      </p>
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

            {/* Empty State */}
            {showSessionSelector && sessions.length === 0 && !isLoadingSessions && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma sessão de WhatsApp encontrada. Configure as instâncias no painel do Zap Responder.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Anti-blocking warning */}
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-warning-foreground">Proteção contra bloqueio</p>
              <p className="text-sm text-muted-foreground">
                O sistema envia mensagens com intervalo de tempo entre elas para evitar bloqueios. 
                Use apenas templates aprovados pelo Meta Business Suite.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Selection */}
          <div className="lg:col-span-2 space-y-4">
            {/* Selection Mode */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Modo de Seleção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={selectionMode === 'customers' ? 'default' : 'outline'}
                    onClick={() => setSelectionMode('customers')}
                    className="flex-1"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Por Clientes
                  </Button>
                  <Button
                    variant={selectionMode === 'servers' ? 'default' : 'outline'}
                    onClick={() => setSelectionMode('servers')}
                    className="flex-1"
                  >
                    <Server className="w-4 h-4 mr-2" />
                    Por Servidores
                  </Button>
                </div>

                {/* Status Filter */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={statusFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('all')}
                  >
                    Todos
                  </Button>
                  <Button
                    variant={statusFilter === 'ativa' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('ativa')}
                  >
                    Ativos
                  </Button>
                  <Button
                    variant={statusFilter === 'inativa' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('inativa')}
                  >
                    Inativos
                  </Button>
                  <Button
                    variant={statusFilter === 'vencidos' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('vencidos')}
                  >
                    Vencidos
                  </Button>
                  <Button
                    variant={statusFilter === 'vencidos_mes_anterior' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('vencidos_mes_anterior')}
                  >
                    Vencidos Mês Anterior
                  </Button>
                  <Button
                    variant={statusFilter === 'ativos' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('ativos')}
                  >
                    Em dia
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Selection List */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {selectionMode === 'customers' ? 'Selecionar Clientes' : 'Selecionar Servidores'}
                  </CardTitle>
                  <div className="flex gap-2">
                    {selectionMode === 'customers' ? (
                      <Button variant="outline" size="sm" onClick={selectAllCustomers}>
                        Selecionar Todos
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={selectAllServers}>
                        Selecionar Todos
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={clearSelection}>
                      Limpar
                    </Button>
                  </div>
                </div>
                {selectionMode === 'customers' && (
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou telefone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {customersLoading || serversLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : selectionMode === 'customers' ? (
                  <div className="max-h-[400px] overflow-y-auto space-y-2">
                    {filteredCustomers.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        Nenhum cliente encontrado
                      </p>
                    ) : (
                      filteredCustomers.map(customer => (
                        <div
                          key={customer.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                            selectedCustomers.has(customer.id)
                              ? "bg-primary/10 border-primary"
                              : "bg-card hover:bg-muted/50"
                          )}
                          onClick={() => toggleCustomer(customer.id)}
                        >
                          <Checkbox
                            checked={selectedCustomers.has(customer.id)}
                            onCheckedChange={() => toggleCustomer(customer.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{customer.name}</p>
                            <p className="text-sm text-muted-foreground">{customer.phone}</p>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(customer)}
                            {customer.servers && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {customer.servers.server_name}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {servers.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        Nenhum servidor cadastrado
                      </p>
                    ) : (
                      servers.map(server => {
                        const serverCustomers = customers.filter(c => c.server_id === server.id);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                        
                        // Count based on current filter
                        const filteredCount = serverCustomers.filter(customer => {
                          if (statusFilter === 'ativa') return customer.status === 'ativa';
                          if (statusFilter === 'inativa') return customer.status === 'inativa';
                          if (statusFilter === 'vencidos') {
                            const dueDate = new Date(customer.due_date);
                            dueDate.setHours(0, 0, 0, 0);
                            return dueDate < today;
                          }
                          if (statusFilter === 'vencidos_mes_anterior') {
                            const dueDate = new Date(customer.due_date);
                            dueDate.setHours(0, 0, 0, 0);
                            return dueDate < firstDayCurrentMonth;
                          }
                          if (statusFilter === 'ativos') {
                            const dueDate = new Date(customer.due_date);
                            dueDate.setHours(0, 0, 0, 0);
                            return dueDate >= today;
                          }
                          return true;
                        }).length;

                        const filterLabel = statusFilter === 'all' ? '' : 
                          statusFilter === 'ativa' ? ' ativos' :
                          statusFilter === 'inativa' ? ' inativos' :
                          statusFilter === 'vencidos' ? ' vencidos' :
                          statusFilter === 'vencidos_mes_anterior' ? ' vencidos mês ant.' :
                          statusFilter === 'ativos' ? ' em dia' : '';

                        return (
                          <div
                            key={server.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                              selectedServers.has(server.id)
                                ? "bg-primary/10 border-primary"
                                : "bg-card hover:bg-muted/50"
                            )}
                            onClick={() => toggleServer(server.id)}
                          >
                            <Checkbox
                              checked={selectedServers.has(server.id)}
                              onCheckedChange={() => toggleServer(server.id)}
                            />
                            <Server className="w-5 h-5 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="font-medium">{server.server_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {filteredCount} cliente{filteredCount !== 1 ? 's' : ''}{filterLabel}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Template & Calculator */}
          <div className="space-y-4">
            {/* Template Selection */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Template
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchTemplates(true)}
                    disabled={isLoadingTemplates}
                  >
                    {isLoadingTemplates ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <CardDescription>
                  Selecione um template aprovado pelo Meta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Nenhum template encontrado
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchTemplates(true)}
                    >
                      Carregar templates
                    </Button>
                  </div>
                ) : (
                  templates.map(template => {
                    const isMarketing = template.category?.toUpperCase() === 'MARKETING';
                    return (
                      <div
                        key={template.id || template.name}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedTemplate === template.name
                            ? "bg-primary/10 border-primary"
                            : "bg-card hover:bg-muted/50"
                        )}
                        onClick={() => setSelectedTemplate(template.name)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                              selectedTemplate === template.name ? "border-primary" : "border-muted-foreground"
                            )}>
                              {selectedTemplate === template.name && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>
                            <span className="font-medium">{template.name}</span>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              isMarketing 
                                ? "bg-warning/10 text-warning border-warning/30" 
                                : "bg-success/10 text-success border-success/30"
                            )}
                          >
                            {isMarketing ? "Marketing" : "Utility"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                          {isMarketing ? formatCurrency(COST_MARKETING) : formatCurrency(COST_UTILITY)} por msg
                        </p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Batch Speed */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Envio em Lotes
                </CardTitle>
                <CardDescription>
                  Ex.: 8 mensagens a cada 3s (mais rápido e evita travar)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Lote:</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={batchSize}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        setBatchSize(Math.min(val, 50));
                      }}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">msgs</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Intervalo:</Label>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={batchIntervalSeconds}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setBatchIntervalSeconds(Math.min(val, 60));
                      }}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">seg</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Envia até <strong>{batchSize}</strong> mensagens por lote, aguarda{' '}
                  <strong>{batchIntervalSeconds}s</strong> e repete. Quanto mais rápido, maior o risco de bloqueio.
                </p>
              </CardContent>
            </Card>

            {/* Cost Calculator */}
            <Card className={cn(
              "border-primary/30",
              estimatedCost.isMarketing ? "bg-warning/5 border-warning/30" : "bg-primary/5"
            )}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Calculadora de Custos
                </CardTitle>
                {selectedTemplateInfo && (
                  <Badge 
                    variant={estimatedCost.isMarketing ? "secondary" : "outline"}
                    className={cn(
                      "w-fit",
                      estimatedCost.isMarketing 
                        ? "bg-warning/20 text-warning border-warning/30" 
                        : "bg-primary/20 text-primary border-primary/30"
                    )}
                  >
                    {estimatedCost.isMarketing ? "Marketing" : "Utility"}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-background rounded-lg">
                    <p className="text-2xl font-bold text-primary">{estimatedCost.count}</p>
                    <p className="text-sm text-muted-foreground">Mensagens</p>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg">
                    <p className={cn(
                      "text-2xl font-bold",
                      estimatedCost.isMarketing ? "text-warning" : "text-primary"
                    )}>
                      {formatCurrency(estimatedCost.totalCost)}
                    </p>
                    <p className="text-sm text-muted-foreground">Custo estimado</p>
                  </div>
                </div>
                <div className="p-3 bg-background rounded-lg">
                  <p className="text-center">
                    <span className="text-lg font-semibold">
                      {formatDuration(estimatedCost.estimatedTime)}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground text-center">
                    Tempo estimado de envio
                  </p>
                </div>
                <div className="text-xs text-muted-foreground text-center space-y-1">
                  <p>
                    * {estimatedCost.isMarketing ? "Marketing" : "Utility"}: {formatCurrency(estimatedCost.costPerMessage)} por mensagem
                  </p>
                  <p className="text-[10px] opacity-70">
                    Marketing: {formatCurrency(COST_MARKETING)} | Utility: {formatCurrency(COST_UTILITY)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Send Button */}
            {isSending ? (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="font-medium">Enviando mensagens...</span>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Aguarde, o disparo está em andamento...
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Button
                className="w-full h-12 text-lg"
                onClick={sendBroadcast}
                disabled={getSelectedCustomersList.length === 0 || !selectedTemplate}
              >
                <Send className="w-5 h-5 mr-2" />
                Iniciar Disparo
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Modal */}
      <BroadcastProgressModal
        open={showProgressModal}
        onClose={() => {
          setShowProgressModal(false);
          setActiveBroadcast(null);
        }}
        templateName={broadcastReport?.templateName || selectedTemplate || ''}
        totalToSend={broadcastReport?.total || 0}
        results={broadcastResults}
        isComplete={isBroadcastComplete}
        sent={broadcastStats.sent}
        errors={broadcastStats.errors}
        skipped={broadcastStats.skipped}
      />
    </DashboardLayout>
  );
}
