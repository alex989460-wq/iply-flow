import { useState, useMemo, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Phone,
  Ban,
  Play,
  Pause,
  ChevronDown,
  CheckCheck,
  Eye,
  Reply

} from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeWhatsAppPhone } from '@/lib/phone';
import { BroadcastProgressModal, BroadcastResult } from '@/components/broadcast/BroadcastProgressModal';

interface Customer {
  id: string;
  name: string;
  phone: string;
  due_date: string;
  status: 'ativa' | 'inativa' | 'suspensa' | 'bloqueado';
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
  phone_number_id?: string;
}

type StatusFilter = 'all' | 'ativa' | 'inativa' | 'suspensa' | 'bloqueado' | 'vencidos' | 'vencidos_mes_anterior' | 'ativos';
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

// Dias em atraso (positivo = vencido há X dias, negativo = ainda em dia)
function daysOverdueOf(dueDate: string): number {
  if (!dueDate) return -99999;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return -99999;
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

const OVERDUE_PRESETS: { label: string; min: number; max: number }[] = [
  { label: '1 a 7 dias', min: 1, max: 7 },
  { label: '8 a 30 dias', min: 8, max: 30 },
  { label: '30 a 90 dias', min: 30, max: 90 },
  { label: '90 a 180 dias', min: 90, max: 180 },
  { label: '180 a 365 dias', min: 180, max: 365 },
  { label: '365+ dias', min: 365, max: 9999 },
];

export default function MassBroadcast() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('customers');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedTemplateLanguage, setSelectedTemplateLanguage] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingProgress, setSendingProgress] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [batchSize, setBatchSize] = useState(30);
  const [batchIntervalSeconds, setBatchIntervalSeconds] = useState(1);

  const [broadcastReport, setBroadcastReport] = useState<BroadcastReportData | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState<BroadcastResult[]>([]);
  const [broadcastStats, setBroadcastStats] = useState({ sent: 0, errors: 0, skipped: 0 });
  const [isBroadcastComplete, setIsBroadcastComplete] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<ActiveBroadcast | null>(null);
  const [alreadySentCount, setAlreadySentCount] = useState(0);
  const [senderPhoneId, setSenderPhoneId] = useState<string>('');
  const senderTouchedRef = useRef(false);
  const [isCheckingAlreadySent, setIsCheckingAlreadySent] = useState(false);
  const [excludeActivePhones, setExcludeActivePhones] = useState(false);
  const [overdueSegmentEnabled, setOverdueSegmentEnabled] = useState(false);
  const [overdueMin, setOverdueMin] = useState<string>('30');
  const [overdueMax, setOverdueMax] = useState<string>('300');
  // 'new' = só quem nunca recebeu | 'all' = todos | 'already' = só quem já recebeu
  const [audienceMode, setAudienceMode] = useState<'new' | 'all' | 'already'>('new');
  const [campaignName, setCampaignName] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [resumingCampaignId, setResumingCampaignId] = useState<string | null>(null);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [syncingCampaignId, setSyncingCampaignId] = useState<string | null>(null);

  const initialResultsRef = useRef<BroadcastResult[]>([]);
  const realtimeResultsRef = useRef<Map<string, BroadcastResult>>(new Map());
  const cancelSendRef = useRef(false);
  const pauseRef = useRef(false);
  const completeRef = useRef(false);
  const campaignIdRef = useRef<string | null>(null);

  const recomputeRef = useRef<() => void>(() => {});

  // Histórico de campanhas de disparo
  const { data: campaigns = [], isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['broadcast-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('broadcast_campaigns' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Detalhe por número da campanha expandida
  const { data: campaignLogs = [], isLoading: isLoadingCampaignLogs } = useQuery({
    queryKey: ['broadcast-campaign-logs', expandedCampaignId],
    enabled: !!expandedCampaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('broadcast_logs' as any)
        .select('*')
        .eq('campaign_id', expandedCampaignId)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = (data || []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean)));
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: custs } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', ids.slice(0, 1000));
        names = Object.fromEntries((custs || []).map((c: any) => [c.id, c.name]));
      }
      return rows.map((r) => ({ ...r, customer_name: names[r.customer_id] || null }));
    },
  });

  const syncCampaignCounts = async (campaignId: string) => {
    setSyncingCampaignId(campaignId);
    try {
      const { error } = await supabase.functions.invoke('mass-broadcast', {
        body: { action: 'sync-counts', campaign_id: campaignId },
      });
      if (error) throw new Error(error.message);
      queryClient.invalidateQueries({ queryKey: ['broadcast-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['broadcast-campaign-logs', campaignId] });
      toast({ title: 'Métricas atualizadas' });
    } catch (e: any) {
      toast({ title: 'Erro ao sincronizar', description: e.message, variant: 'destructive' });
    } finally {
      setSyncingCampaignId(null);
    }
  };




  // Templates from API
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // CRM Oficial settings (replaces Zap Responder department flow)
  const { data: crmSettings } = useQuery({
    queryKey: ['crm-oficial-settings-broadcast'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from('crm_oficial_settings')
        .select('api_key, enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const crmEnabled = !!(crmSettings?.enabled && crmSettings?.api_key);

  // Números oficiais (WhatsApp Cloud) disponíveis para envio
  const { data: senderNumbers = [], isLoading: loadingSenders, refetch: refetchSenders } = useQuery({
    queryKey: ['broadcast-sender-numbers', crmSettings?.api_key],
    enabled: crmEnabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-channels', data: { apiKey: crmSettings!.api_key } },
      });
      if (error) throw error;
      const body = data?.results?.channels?.body;
      const raw: any[] = Array.isArray(body)
        ? body
        : Array.isArray(body?.channels)
          ? body.channels
          : Array.isArray(body?.whatsapp)
            ? body.whatsapp
            : Array.isArray(body?.data)
              ? body.data
              : Array.isArray(body?.items)
                ? body.items
                : body?.whatsapp
                  ? [body.whatsapp]
                  : [];
      return raw
        .filter((c: any) => {
          const kind = String(c.kind || c.type || '').toLowerCase();
          // exclui apenas canais não oficiais (evolution/baileys)
          if (kind.includes('evolution') || kind.includes('baileys')) return false;
          if (c.evolution_instance_name || c.evolution_status) return false;
          return true;
        })
        .map((c: any, i: number) => {
          const phoneId = String(c.phone_number_id || c.phoneNumberId || '');
          const phone = String(
            c.display_phone_number || c.displayPhoneNumber || c.phone_number ||
            c.phoneNumber || c.phone || c.number || c.msisdn || '',
          );
          return {
            id: phoneId || String(c.id || `wa-${i}`),
            label: String(c.verified_name || c.name || c.business_name || phone || 'Número oficial'),
            phone: phone && phone !== phoneId ? phone : '',
            primary: !!(c.primary || c.is_primary),
          };
        })
        // Somente phone_number_id reais podem ser usados como remetente.
        // O UUID interno de um canal não é aceito pela Graph API.
        .filter((c: any) => /^\d+$/.test(c.id))
        .sort((a: any, b: any) => Number(!!b.primary) - Number(!!a.primary));
    },

  });

  // Seleciona automaticamente o número principal
  useEffect(() => {
    if (senderPhoneId || senderNumbers.length === 0) return;
    const primary = senderNumbers.find((n: any) => n.primary) || senderNumbers[0];
    if (primary) setSenderPhoneId(primary.id);
  }, [senderNumbers, senderPhoneId]);


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

  // Fetch templates from CRM Oficial
  const fetchTemplates = async (showToast = true) => {
    if (!crmEnabled) {
      if (showToast) {
        toast({
          title: 'API Oficial não configurada',
          description: 'Habilite a API Oficial em Configurações.',
          variant: 'destructive',
        });
      }
      return;
    }

    setIsLoadingTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-templates', {
        body: { action: 'list', apiKey: crmSettings!.api_key, limit: 250 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const body = data?.data ?? data;
      const list: any[] = Array.isArray(body)
        ? body
        : (body?.data ?? body?.templates ?? body?.results ?? []);

      const approved = list
        .filter((t: any) => (t.status || '').toUpperCase() === 'APPROVED')
        .map((t: any) => ({
          id: String(t.id || t.name),
          name: String(t.name),
          language: t.language || 'pt_BR',
          status: t.status,
          category: (t.category || 'UTILITY').toUpperCase(),
          phone_number_id: t.phone_number_id ? String(t.phone_number_id) : undefined,
        }));

      setTemplates(approved);
      setTemplatesLoaded(true);
      if (showToast) {
        toast({
          title: 'Templates carregados!',
          description: `${approved.length} templates aprovados encontrados.`,
        });
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

  // Auto-load templates when CRM is enabled
  useEffect(() => {
    if (templatesLoaded) return;
    if (crmEnabled) fetchTemplates(false);
  }, [crmEnabled, templatesLoaded]);


  // Segmentação por dias vencidos
  const overdueRange = useMemo(() => {
    const minNum = Number(overdueMin);
    const maxNum = Number(overdueMax);
    const min = Number.isFinite(minNum) ? Math.max(0, Math.round(minNum)) : 0;
    const max = Number.isFinite(maxNum) ? Math.max(min, Math.round(maxNum)) : 9999;
    return { min, max };
  }, [overdueMin, overdueMax]);

  // Matcher único de status + segmentação (usado em clientes, servidores e contagens)
  const matchesFilters = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    return (customer: Customer) => {
      if (overdueSegmentEnabled) {
        const d = daysOverdueOf(customer.due_date);
        if (d < overdueRange.min || d > overdueRange.max) return false;
      }

      if (statusFilter === 'ativa') return customer.status === 'ativa';
      if (statusFilter === 'inativa') return customer.status === 'inativa';
      if (statusFilter === 'suspensa') return customer.status === 'suspensa';
      if (statusFilter === 'bloqueado') return customer.status === 'bloqueado';

      const dueDate = new Date(customer.due_date);
      dueDate.setHours(0, 0, 0, 0);
      if (statusFilter === 'vencidos') return dueDate < today;
      if (statusFilter === 'vencidos_mes_anterior') return dueDate < firstDayCurrentMonth;
      if (statusFilter === 'ativos') return dueDate >= today;

      return true;
    };
  }, [statusFilter, overdueSegmentEnabled, overdueRange]);

  // Busca com debounce: evita refiltrar milhares de clientes a cada tecla
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Filter customers based on status and search
  const filteredCustomers = useMemo(() => {
    const search = debouncedSearch.trim().toLowerCase();
    return customers.filter(customer => {
      if (search) {
        if (!customer.name.toLowerCase().includes(search) &&
            !customer.phone.includes(search)) {
          return false;
        }
      }
      return matchesFilters(customer);
    });
  }, [customers, matchesFilters, debouncedSearch]);

  // Renderização incremental: listas com milhares de itens travavam a página
  const [visibleCount, setVisibleCount] = useState(100);
  useEffect(() => {
    setVisibleCount(100);
  }, [debouncedSearch, statusFilter, overdueSegmentEnabled, overdueMin, overdueMax, selectionMode]);
  const visibleCustomers = useMemo(
    () => filteredCustomers.slice(0, visibleCount),
    [filteredCustomers, visibleCount],
  );

  // Contagem por servidor em uma única passada (antes era O(servidores x clientes) por render)
  const serverCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      if (!c.server_id) continue;
      if (!matchesFilters(c)) continue;
      map.set(c.server_id, (map.get(c.server_id) || 0) + 1);
    }
    return map;
  }, [customers, matchesFilters]);

  // Get customers for servers with status filter applied
  const getCustomersForServers = useMemo(() => {
    return customers.filter(customer => {
      if (!customer.server_id || !selectedServers.has(customer.server_id)) return false;
      return matchesFilters(customer);
    });
  }, [customers, selectedServers, matchesFilters]);



  // Telefones que possuem pelo menos um cliente ATIVO (status ativa e vencimento em dia)
  const activePhones = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const set = new Set<string>();
    for (const c of customers) {
      const digits = String(c.phone || '').replace(/\D/g, '');
      if (!digits) continue;
      const due = new Date(c.due_date);
      due.setHours(0, 0, 0, 0);
      if (c.status === 'ativa' && due >= today) set.add(digits);
    }
    return set;
  }, [customers]);

  // Get customers based on selection mode
  const getSelectedCustomersList = useMemo(() => {
    const base = selectionMode === 'customers'
      ? filteredCustomers.filter(c => selectedCustomers.has(c.id))
      : getCustomersForServers;

    if (!excludeActivePhones) return base;
    return base.filter(c => !activePhones.has(String(c.phone || '').replace(/\D/g, '')));
  }, [selectionMode, filteredCustomers, selectedCustomers, getCustomersForServers, excludeActivePhones, activePhones]);

  const excludedByActivePhoneCount = useMemo(() => {
    if (!excludeActivePhones) return 0;
    const base = selectionMode === 'customers'
      ? filteredCustomers.filter(c => selectedCustomers.has(c.id))
      : getCustomersForServers;
    return base.length - getSelectedCustomersList.length;
  }, [excludeActivePhones, selectionMode, filteredCustomers, selectedCustomers, getCustomersForServers, getSelectedCustomersList]);

  // Get selected template info
  const selectedTemplateInfo = useMemo(() => {
    return templates.find(t => t.name === selectedTemplate && t.language === selectedTemplateLanguage)
      || templates.find(t => t.name === selectedTemplate);
  }, [templates, selectedTemplate, selectedTemplateLanguage]);

  // Check how many selected customers already received the template
  // (debounced + paralelo: antes disparava dezenas de queries sequenciais a cada clique)
  const alreadySentRunRef = useRef(0);
  const selectedPhonesKey = useMemo(
    () => `${getSelectedCustomersList.length}:${getSelectedCustomersList[0]?.id || ''}:${getSelectedCustomersList[getSelectedCustomersList.length - 1]?.id || ''}`,
    [getSelectedCustomersList],
  );
  useEffect(() => {
    const runId = ++alreadySentRunRef.current;

    if (!selectedTemplate || getSelectedCustomersList.length === 0) {
      setAlreadySentCount(0);
      setIsCheckingAlreadySent(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingAlreadySent(true);
      try {
        const uniquePhones = [...new Set(getSelectedCustomersList.flatMap((customer) => {
          const normalized = normalizeWhatsAppPhone(customer.phone);
          return normalized.startsWith('55') && normalized.length >= 12
            ? [normalized, normalized.slice(2)]
            : [normalized];
        }))].filter(Boolean);
        const CHUNK_SIZE = 400;
        const chunks: string[][] = [];
        for (let i = 0; i < uniquePhones.length; i += CHUNK_SIZE) {
          chunks.push(uniquePhones.slice(i, i + CHUNK_SIZE));
        }

        let totalAlreadySent = 0;
        const CONCURRENCY = 5;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          if (alreadySentRunRef.current !== runId) return;
          const results = await Promise.all(
            chunks.slice(i, i + CONCURRENCY).map(chunk =>
              supabase
                .from('broadcast_logs')
                .select('phone_normalized')
                .eq('template_name', selectedTemplate)
                .eq('last_status', 'sent')
                .in('phone_normalized', chunk),
            ),
          );
          for (const { data, error } of results) {
            if (!error && data) totalAlreadySent += data.length;
          }
        }

        if (alreadySentRunRef.current !== runId) return;
        setAlreadySentCount(totalAlreadySent);
      } catch (error) {
        console.error('Error checking already sent:', error);
        if (alreadySentRunRef.current === runId) setAlreadySentCount(0);
      } finally {
        if (alreadySentRunRef.current === runId) setIsCheckingAlreadySent(false);
      }
    }, 600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, selectedPhonesKey]);


  // Calculate estimated cost based on template category
  const estimatedCost = useMemo(() => {
    const count = getSelectedCustomersList.length;
    const effectiveCount = audienceMode === 'all'
      ? count
      : audienceMode === 'already'
        ? Math.min(count, alreadySentCount)
        : Math.max(0, count - alreadySentCount);
    const isMarketing = selectedTemplateInfo?.category?.toUpperCase() === 'MARKETING';
    const costPerMessage = isMarketing ? COST_MARKETING : COST_UTILITY;

    const batches = batchSize > 0 ? Math.ceil(effectiveCount / batchSize) : 0;
    const estimatedTime = batches * batchIntervalSeconds;

    return {
      count,
      effectiveCount,
      totalCost: effectiveCount * costPerMessage,
      estimatedTime,
      isMarketing,
      costPerMessage,
      alreadySent: alreadySentCount,
    };
  }, [getSelectedCustomersList, batchSize, batchIntervalSeconds, selectedTemplateInfo, alreadySentCount, audienceMode]);


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

  // Loop de envio em lotes reutilizável (usado no disparo novo e ao continuar um pausado)
  const runQueueLoop = async (
    queueCustomerIds: string[],
    ctx: {
      templateName: string;
      templateLanguage: string;
      phoneNumberId?: string;
      campaignId: string | null;
      customerById: Record<string, { name: string; phone: string }>;
    },
  ) => {
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const applyBatchResults = (rows: any[]) => {
      for (const row of rows || []) {
        const info = ctx.customerById[row.customer_id];
        if (!info) continue;
        realtimeResultsRef.current.set(row.customer_id, {
          customer: info.name,
          phone: info.phone,
          status: row.status === 'sent' ? 'sent' : row.status === 'skipped' ? 'skipped' : 'error',
          error: row.status === 'sent' ? undefined : row.error || 'Erro desconhecido',
        });
      }
      recomputeRef.current?.();
    };

    const runBatch = async (batch: string[]) => {
      const res = await supabase.functions.invoke('mass-broadcast', {
        body: {
          action: 'batch',
          customer_ids: batch,
          template_name: ctx.templateName,
          template_language: ctx.templateLanguage,
          phone_number_id: ctx.phoneNumberId || undefined,
          campaign_id: ctx.campaignId || undefined,
          audience_mode: audienceMode,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (!res.data?.success) throw new Error(res.data?.error || 'Erro ao enviar lote');
      return res.data;
    };

    let lastError: string | null = null;
    let pausedByUser = false;

    for (let offset = 0; offset < queueCustomerIds.length; offset += batchSize) {
      if (cancelSendRef.current) break;
      if (pauseRef.current) {
        pausedByUser = true;
        break;
      }

      const batch = queueCustomerIds.slice(offset, offset + batchSize);
      let data: any = null;

      for (let attempt = 1; attempt <= 2 && !cancelSendRef.current; attempt++) {
        try {
          data = await runBatch(batch);
          break;
        } catch (err: any) {
          lastError = err?.message || 'Falha ao enviar lote';
          console.error(`Lote ${offset / batchSize + 1} falhou (tentativa ${attempt}):`, err);
          if (attempt === 1) await sleep(2500);
        }
      }

      let rateLimitWaitMs = 0;
      if (data) {
        applyBatchResults(data.results || []);
        for (const r of (data.results || []) as any[]) {
          const msg = String(r?.error || '');
          if (!/rate limit|too many requests|429/i.test(msg)) continue;
          const ms = msg.match(/retry\s*after\s*(\d+)\s*ms/i);
          const s = msg.match(/retry\s*after\s*(\d+)\s*s/i);
          const wait = ms ? Number(ms[1]) : s ? Number(s[1]) * 1000 : 20000;
          rateLimitWaitMs = Math.max(rateLimitWaitMs, Math.min(wait + 2000, 90000));
        }
      } else {
        applyBatchResults(
          batch.map((id) => ({ customer_id: id, status: 'error', error: lastError || 'Falha no lote' })),
        );
      }

      const isLast = offset + batchSize >= queueCustomerIds.length;
      if (!isLast) {
        const waitMs = Math.max(batchIntervalSeconds * 1000, rateLimitWaitMs);
        if (waitMs > 0) await sleep(waitMs);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['billing-logs'] });

    if (pausedByUser) {
      if (ctx.campaignId) {
        await supabase.functions
          .invoke('mass-broadcast', { body: { action: 'pause', campaign_id: ctx.campaignId } })
          .catch(() => null);
      }
      queryClient.invalidateQueries({ queryKey: ['broadcast-campaigns'] });
      toast({
        title: 'Disparo pausado',
        description: 'Você pode continuar depois pelo histórico de disparos.',
      });
      return { paused: true, lastError };
    }

    completeRef.current = true;
    setIsBroadcastComplete(true);
    setBroadcastReport((prev) => (prev ? { ...prev, completedAt: new Date() } : prev));

    if (ctx.campaignId) {
      await supabase.functions
        .invoke('mass-broadcast', { body: { action: 'finish', campaign_id: ctx.campaignId } })
        .catch(() => null);
      await supabase.functions
        .invoke('mass-broadcast', { body: { action: 'sync-counts', campaign_id: ctx.campaignId } })
        .catch(() => null);
      queryClient.invalidateQueries({ queryKey: ['broadcast-campaigns'] });
    }

    if (lastError) {
      toast({
        title: 'Disparo finalizado com falhas',
        description: `Alguns lotes falharam: ${lastError}`,
        variant: 'destructive',
      });
    }

    return { paused: false, lastError };
  };

  // Continuar um disparo pausado a partir do histórico
  const resumeCampaign = async (campaign: any) => {
    if (isSending) {
      toast({ title: 'Já existe um disparo em andamento', variant: 'destructive' });
      return;
    }
    setResumingCampaignId(campaign.id);
    try {
      const { data, error } = await supabase.functions.invoke('mass-broadcast', {
        body: { action: 'resume', campaign_id: campaign.id },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Falha ao retomar disparo');

      const pending: string[] = data.pending_customer_ids || [];
      if (pending.length === 0) {
        toast({ title: 'Nada pendente', description: 'Todos os números desta campanha já foram processados.' });
        queryClient.invalidateQueries({ queryKey: ['broadcast-campaigns'] });
        return;
      }

      const { data: pendingCustomers, error: custError } = await supabase
        .from('customers')
        .select('id, name, phone')
        .in('id', pending.slice(0, 1000));
      if (custError) throw custError;

      const customerById: Record<string, { name: string; phone: string }> = Object.fromEntries(
        (pendingCustomers || []).map((c: any) => [c.id, { name: c.name, phone: c.phone }]),
      );

      const startedAt = new Date();
      const startedAtIso = new Date(startedAt.getTime() - 15_000).toISOString();
      const templateName = campaign.template_name;

      campaignIdRef.current = campaign.id;
      cancelSendRef.current = false;
      pauseRef.current = false;
      setIsPaused(false);
      completeRef.current = false;
      setIsBroadcastComplete(false);
      initialResultsRef.current = [];
      realtimeResultsRef.current = new Map();
      setBroadcastResults([]);
      setBroadcastStats({ sent: 0, errors: 0, skipped: 0 });
      setActiveBroadcast({ templateName, startedAtIso, customerById, total: pending.length });
      setBroadcastReport({
        total: pending.length,
        sent: 0,
        errors: 0,
        skipped: 0,
        details: [],
        templateName,
        startedAt,
      });
      setShowProgressModal(true);
      setIsSending(true);

      await runQueueLoop(pending, {
        templateName,
        templateLanguage: campaign.template_language || 'pt_BR',
        phoneNumberId: campaign.phone_number_id || undefined,
        campaignId: campaign.id,
        customerById,
      });
    } catch (e: any) {
      toast({ title: 'Erro ao continuar disparo', description: e.message, variant: 'destructive' });
    } finally {
      setIsSending(false);
      setResumingCampaignId(null);
    }
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

    // Estimativa de custo (categoria do template)
    const tplObj = templates.find((t) => t.name === templateName);
    const isMarketing = (tplObj?.category || '').toUpperCase() === 'MARKETING';
    const perMsg = isMarketing ? COST_MARKETING : COST_UTILITY;
    const totalCost = perMsg * customersToSend.length;
    const confirmMsg =
      `Confirmar disparo do template "${templateName}" para ${customersToSend.length} clientes?\n\n` +
      `Categoria: ${isMarketing ? 'Marketing' : 'Utilidade'}\n` +
      `Custo por mensagem: ${formatCurrency(perMsg)}\n` +
      `Custo total estimado: ${formatCurrency(totalCost)}`;
    if (!confirm(confirmMsg)) return;

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
    pauseRef.current = false;
    setIsPaused(false);
    setIsSending(true);
    setSendingProgress(0);
    initialResultsRef.current = [];
    setBroadcastResults([]);
    setBroadcastStats({ sent: 0, errors: 0, skipped: 0 });
    completeRef.current = false;
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
          template_language: selectedTemplateInfo?.language || selectedTemplateLanguage || 'pt_BR',
          audience_mode: audienceMode,
          campaign_name: campaignName || `Disparo ${templateName}`,
          phone_number_id: senderPhoneId || selectedTemplateInfo?.phone_number_id || undefined,
        },

      });


      if (startResponse.error) throw new Error(startResponse.error.message);

      const startData = startResponse.data;
      if (!startData?.success) throw new Error(startData?.error || 'Resposta inválida do backend');

      const initialResults: BroadcastResult[] = startData.initial_results || [];
      const queueCustomerIds: string[] = startData.queue_customer_ids || [];
      campaignIdRef.current = startData.campaign_id || null;

      initialResultsRef.current = initialResults;

      // A barra considera apenas quem realmente vai receber (ignorados ficam de fora)
      setActiveBroadcast({
        templateName,
        startedAtIso,
        customerById,
        total: queueCustomerIds.length,
      });

      setBroadcastResults(initialResults);
      setBroadcastStats({
        sent: 0,
        errors: 0,
        skipped: 0,
      });
      setBroadcastReport({
        total: queueCustomerIds.length,
        sent: 0,
        errors: 0,
        skipped: 0,
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

      // 2) Envia em lotes curtos (com suporte a pausar/continuar)
      await runQueueLoop(queueCustomerIds, {
        templateName,
        templateLanguage: selectedTemplateInfo?.language || selectedTemplateLanguage || 'pt_BR',
        phoneNumberId: senderPhoneId || selectedTemplateInfo?.phone_number_id || undefined,
        campaignId: campaignIdRef.current,
        customerById,
      });
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
    if (!activeBroadcast) return;


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

      if (processed >= activeBroadcast.total && !completeRef.current) {
        completeRef.current = true;

        setIsBroadcastComplete(true);
        setBroadcastReport((prev) => (prev ? { ...prev, completedAt: new Date() } : prev));
        queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
      }
    };

    recomputeRef.current = updateBroadcastState;

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
  }, [activeBroadcast, queryClient]);

  // Progresso derivado (usado no card lateral e no indicador flutuante)
  const liveProcessed = broadcastStats.sent + broadcastStats.errors + broadcastStats.skipped;
  const liveTotal = broadcastReport?.total || 0;
  const livePercent = liveTotal > 0 ? Math.min(100, (liveProcessed / liveTotal) * 100) : 0;

  // Evita que o usuário feche/atualize a página no meio do disparo (o envio pararia).
  useEffect(() => {
    if (!isSending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isSending]);


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
    if (customer.status === 'bloqueado') {
      return <Badge variant="destructive" className="bg-red-900/50">Bloqueado</Badge>;
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

        {/* API Oficial Status Card */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="w-5 h-5" />
              API Oficial — WhatsApp Cloud
            </CardTitle>
            <CardDescription>
              Disparos enviados via API Oficial (Meta Cloud) integrada ao CRM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {crmEnabled ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-success/10 border border-success/30">
                <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">API Oficial conectada</p>
                  <p className="text-sm text-muted-foreground">Todos os envios usarão o canal oficial configurado.</p>
                </div>
                <Badge className="bg-success/20 text-success border-success/30">Ativa</Badge>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
                <p className="text-sm">Habilite a <strong>API Oficial</strong> em Configurações para realizar disparos.</p>
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
                  <Button
                    variant={statusFilter === 'suspensa' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('suspensa')}
                  >
                    Suspensos
                  </Button>
                  <Button
                    variant={statusFilter === 'bloqueado' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('bloqueado')}
                  >
                    Bloqueados
                  </Button>
                </div>

                {/* Segmentação por dias vencidos */}
                <div className={cn(
                  "rounded-xl border p-3 space-y-3 transition-colors",
                  overdueSegmentEnabled ? "border-primary/50 bg-primary/5" : "bg-muted/30"
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        Segmentação por dias vencidos
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Envie somente para quem está vencido dentro de um intervalo de dias.
                      </p>
                    </div>
                    <Switch
                      checked={overdueSegmentEnabled}
                      onCheckedChange={(v) => { setOverdueSegmentEnabled(v); clearSelection(); }}
                    />
                  </div>

                  {overdueSegmentEnabled && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="flex flex-wrap gap-2">
                        {OVERDUE_PRESETS.map(preset => {
                          const active = overdueRange.min === preset.min && overdueRange.max === preset.max;
                          return (
                            <Button
                              key={preset.label}
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              className="h-7 rounded-full text-xs"
                              onClick={() => {
                                setOverdueMin(String(preset.min));
                                setOverdueMax(String(preset.max));
                                clearSelection();
                              }}
                            >
                              {preset.label}
                            </Button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Mínimo (dias)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={9999}
                            value={overdueMin}
                            onChange={(e) => setOverdueMin(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Máximo (dias)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={9999}
                            value={overdueMax}
                            onChange={(e) => setOverdueMax(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Intervalo: <span className="font-medium text-foreground">{overdueRange.min} a {overdueRange.max} dias vencidos</span>
                        </span>
                        <Badge variant="secondary">
                          {selectionMode === 'customers' ? filteredCustomers.length : getCustomersForServers.length} cliente(s)
                        </Badge>
                      </div>
                    </div>
                  )}
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
                      <>
                        {visibleCustomers.map(customer => (
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
                            <p className="text-sm text-muted-foreground">
                              {customer.phone}
                              {daysOverdueOf(customer.due_date) > 0 && (
                                <span className="ml-2 text-destructive">
                                  · {daysOverdueOf(customer.due_date)}d vencido
                                </span>
                              )}
                            </p>
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
                        ))}
                        {filteredCustomers.length > visibleCustomers.length && (
                          <div className="flex flex-col items-center gap-2 py-3">
                            <p className="text-xs text-muted-foreground">
                              Exibindo {visibleCustomers.length} de {filteredCustomers.length} clientes
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setVisibleCount((v) => v + 200)}
                            >
                              Carregar mais 200
                            </Button>
                          </div>
                        )}
                      </>
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
                        const filteredCount = serverCounts.get(server.id) || 0;


                        const filterLabel = overdueSegmentEnabled
                          ? ` (${overdueRange.min}-${overdueRange.max}d vencidos)`
                          : statusFilter === 'all' ? '' :
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
            {/* Sender Number */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Número Remetente
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchSenders()}
                    disabled={loadingSenders || !crmEnabled}
                  >
                    {loadingSenders ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </div>
                <CardDescription>
                  Escolha de qual número oficial as mensagens serão enviadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!crmEnabled ? (
                  <p className="text-sm text-muted-foreground">Habilite a API Oficial para listar seus números.</p>
                ) : loadingSenders ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando números...
                  </div>
                ) : senderNumbers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum número oficial encontrado. Cadastre um canal WhatsApp Cloud em Conexões.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {senderNumbers.map((n: any) => {
                      const active = senderPhoneId === n.id;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => { senderTouchedRef.current = true; setSenderPhoneId(n.id); }}
                          className={cn(
                            'w-full text-left rounded-xl border p-3 transition-all',
                            active
                              ? 'border-primary bg-primary/10 shadow-sm'
                              : 'border-border/60 bg-card hover:border-primary/40 hover:bg-accent/40',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">{n.label}</span>
                            {n.primary && (
                              <Badge variant="secondary" className="text-[10px] shrink-0">Principal</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className={cn('font-mono', n.phone ? 'text-foreground' : 'text-muted-foreground')}>
                              {n.phone || 'Número não informado'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground font-mono truncate">ID {n.id}</p>
                        </button>
                      );
                    })}
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Público do disparo */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Público do disparo
                </CardTitle>
                <CardDescription>
                  Defina se quem já recebeu este template deve receber novamente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {([
                  { key: 'new', title: 'Somente novos', desc: 'Ignora quem já recebeu este template (padrão)' },
                  { key: 'all', title: 'Todos (permitir reenvio)', desc: 'Envia também para quem já recebeu antes' },
                  { key: 'already', title: 'Somente quem já recebeu', desc: 'Reengajamento de quem já foi impactado' },
                ] as const).map((opt) => {
                  const active = audienceMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAudienceMode(opt.key)}
                      className={cn(
                        'w-full text-left rounded-xl border p-3 transition-all',
                        active
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-border/60 bg-card hover:border-primary/40 hover:bg-accent/40',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'w-3.5 h-3.5 rounded-full border-2 shrink-0',
                          active ? 'border-primary bg-primary' : 'border-muted-foreground/50',
                        )} />
                        <span className="text-sm font-medium">{opt.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 pl-6">{opt.desc}</p>
                    </button>
                  );
                })}
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground pt-1">
                    {isCheckingAlreadySent
                      ? 'Verificando histórico...'
                      : `${alreadySentCount} da seleção já receberam "${selectedTemplate}" e serão pulados automaticamente.`}
                  </p>
                )}

                <div className="pt-2 space-y-1.5">
                  <Label htmlFor="campaign-name" className="text-xs">Nome do disparo (campanha)</Label>
                  <Input
                    id="campaign-name"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="Ex.: Recuperação vencidos 30-90 dias"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Usado no histórico para monitorar entregas, leituras e respostas.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Histórico de disparos */}
            <Card className="border-border/40 bg-card/60 backdrop-blur-xl shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
                      <Clock className="w-4 h-4 text-primary" />
                    </span>
                    Histórico de disparos
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['broadcast-campaigns'] })}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowHistory((v) => !v)}>
                      {showHistory ? 'Ocultar' : 'Ver'}
                    </Button>
                  </div>
                </div>
                <CardDescription>Enviados, entregues, lidos e respondidos por campanha</CardDescription>
              </CardHeader>
              {showHistory && (
                <CardContent className="space-y-3">
                  {isLoadingCampaigns ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                    </div>
                  ) : campaigns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum disparo registrado ainda.</p>
                  ) : (
                    campaigns.map((c: any) => {
                      const pendingCount = Array.isArray(c.pending_customer_ids) ? c.pending_customer_ids.length : 0;
                      const isPausedCampaign = c.status === 'paused' || (!c.finished_at && pendingCount > 0 && !isSending);
                      const processed = (c.sent_count || 0) + (c.error_count || 0);
                      const pct = c.total_targets ? Math.min(100, (processed / c.total_targets) * 100) : 0;
                      const isOpen = expandedCampaignId === c.id;
                      const logs = isOpen
                        ? campaignLogs.filter((l: any) => {
                            const q = campaignSearch.trim().toLowerCase();
                            if (!q) return true;
                            return (
                              String(l.phone_normalized || '').includes(q.replace(/\D/g, '')) ||
                              String(l.customer_name || '').toLowerCase().includes(q)
                            );
                          })
                        : [];

                      return (
                        <div
                          key={c.id}
                          className="rounded-2xl border border-border/40 bg-background/40 backdrop-blur-md p-4 transition-all hover:border-primary/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {c.template_name} · {new Date(c.created_at).toLocaleString('pt-BR')}
                              </p>
                            </div>
                            <Badge
                              variant={c.finished_at ? 'secondary' : isPausedCampaign ? 'outline' : 'default'}
                              className="shrink-0"
                            >
                              {c.finished_at ? 'Concluído' : isPausedCampaign ? 'Pausado' : 'Em andamento'}
                            </Badge>
                          </div>

                          <div className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                'h-full rounded-full transition-[width] duration-500',
                                c.finished_at ? 'bg-emerald-500' : 'bg-primary',
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3 text-center">
                            {[
                              { label: 'Alvos', value: c.total_targets || 0, icon: Users },
                              { label: 'Enviados', value: c.sent_count || 0, icon: Send },
                              { label: 'Entregues', value: c.delivered_count || 0, icon: CheckCheck },
                              { label: 'Lidos', value: c.read_count || 0, icon: Eye },
                              { label: 'Respostas', value: c.replied_count || 0, icon: Reply },
                            ].map((m) => (
                              <div key={m.label} className="rounded-xl border border-border/30 bg-muted/30 py-2">
                                <m.icon className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                                <p className="text-sm font-bold tabular-nums">{m.value}</p>
                                <p className="text-[10px] text-muted-foreground uppercase">{m.label}</p>
                              </div>
                            ))}
                          </div>

                          {(c.skipped_count > 0 || c.error_count > 0 || pendingCount > 0) && (
                            <p className="text-[11px] text-muted-foreground mt-2">
                              {c.skipped_count > 0 && `${c.skipped_count} ignorados`}
                              {c.skipped_count > 0 && c.error_count > 0 && ' · '}
                              {c.error_count > 0 && `${c.error_count} erros`}
                              {pendingCount > 0 && ` · ${pendingCount} pendentes`}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {pendingCount > 0 && !isSending && (
                              <Button size="sm" onClick={() => resumeCampaign(c)} disabled={resumingCampaignId === c.id}>
                                {resumingCampaignId === c.id ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <Play className="w-4 h-4 mr-1" />
                                )}
                                Continuar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => syncCampaignCounts(c.id)}
                              disabled={syncingCampaignId === c.id}
                            >
                              {syncingCampaignId === c.id ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4 mr-1" />
                              )}
                              Sincronizar métricas
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setCampaignSearch('');
                                setExpandedCampaignId(isOpen ? null : c.id);
                              }}
                            >
                              <ChevronDown className={cn('w-4 h-4 mr-1 transition-transform', isOpen && 'rotate-180')} />
                              {isOpen ? 'Fechar detalhes' : 'Ver número por número'}
                            </Button>
                          </div>

                          {isOpen && (
                            <div className="mt-3 rounded-xl border border-border/40 bg-background/50 p-3">
                              <div className="relative mb-2">
                                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                                <Input
                                  value={campaignSearch}
                                  onChange={(e) => setCampaignSearch(e.target.value)}
                                  placeholder="Buscar por nome ou telefone"
                                  className="pl-8 h-9"
                                />
                              </div>
                              {isLoadingCampaignLogs ? (
                                <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
                                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando números...
                                </div>
                              ) : logs.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">
                                  Nenhum registro encontrado.
                                </p>
                              ) : (
                                <div className="max-h-[320px] overflow-y-auto space-y-1">
                                  {logs.map((l: any) => (
                                    <div
                                      key={l.id}
                                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2.5 py-2"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium truncate">
                                          {l.customer_name || 'Cliente'}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                          <Phone className="w-3 h-3" />
                                          {l.phone_normalized || l.phone}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {l.replied_at && <Reply className="w-3.5 h-3.5 text-violet-400" />}
                                        {l.read_at && <Eye className="w-3.5 h-3.5 text-blue-400" />}
                                        {l.delivered_at && <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />}
                                        <Badge
                                          variant={
                                            l.last_status === 'sent'
                                              ? 'default'
                                              : l.last_status === 'error'
                                                ? 'destructive'
                                                : 'secondary'
                                          }
                                          className="text-[10px]"
                                        >
                                          {l.last_status === 'sent'
                                            ? 'Enviado'
                                            : l.last_status === 'error'
                                              ? 'Erro'
                                              : l.last_status || 'Pendente'}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              )}
            </Card>



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
                        key={`${template.id || template.name}-${template.language || ''}`}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedTemplate === template.name && selectedTemplateLanguage === (template.language || 'pt_BR')
                            ? "bg-primary/10 border-primary"
                            : "bg-card hover:bg-muted/50"
                        )}
                        onClick={() => {
                          setSelectedTemplate(template.name);
                          setSelectedTemplateLanguage(template.language || 'pt_BR');
                          if (template.phone_number_id && !senderTouchedRef.current) setSenderPhoneId(template.phone_number_id);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                              selectedTemplate === template.name && selectedTemplateLanguage === (template.language || 'pt_BR') ? "border-primary" : "border-muted-foreground"
                            )}>
                              {selectedTemplate === template.name && selectedTemplateLanguage === (template.language || 'pt_BR') && (
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
                          {template.language || 'pt_BR'} · {isMarketing ? formatCurrency(COST_MARKETING) : formatCurrency(COST_UTILITY)} por msg
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

                <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="exclude-active-phones" className="text-sm font-medium">
                      Ignorar números com assinatura ativa
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Se o telefone tiver qualquer cliente ativo (em dia), nenhum usuário desse número recebe o disparo.
                      {excludeActivePhones && excludedByActivePhoneCount > 0 && (
                        <> <strong className="text-foreground">{excludedByActivePhoneCount}</strong> serão ignorados.</>
                      )}
                    </p>
                  </div>
                  <Switch
                    id="exclude-active-phones"
                    checked={excludeActivePhones}
                    onCheckedChange={setExcludeActivePhones}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Already Sent Warning */}
            {selectedTemplate && estimatedCost.alreadySent > 0 && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="p-4 flex items-start gap-3">
                  <Ban className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Clientes já receberam este template</p>
                    <p className="text-sm text-muted-foreground">
                      {isCheckingAlreadySent ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Verificando...
                        </span>
                      ) : (
                        <>
                          <strong>{estimatedCost.alreadySent}</strong> de {estimatedCost.count} clientes já receberam o template 
                          <strong> "{selectedTemplate}"</strong> e serão ignorados automaticamente.
                        </>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

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
                    <div className="flex flex-col items-center">
                      <p className="text-2xl font-bold text-primary">{estimatedCost.effectiveCount}</p>
                      <p className="text-sm text-muted-foreground">A enviar</p>
                    </div>
                    {estimatedCost.alreadySent > 0 && (
                      <p className="text-xs text-destructive mt-1">
                        ({estimatedCost.alreadySent} bloqueados)
                      </p>
                    )}
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
              <Card className="border-primary/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="font-medium">Enviando mensagens...</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${livePercent}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center tabular-nums">
                    {liveProcessed} / {broadcastReport?.total || 0} · {broadcastStats.sent} enviados ·{' '}
                    {broadcastStats.errors} erros
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => setShowProgressModal(true)}>
                    Abrir painel de envio
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full h-12 text-lg"
                  onClick={sendBroadcast}
                  disabled={getSelectedCustomersList.length === 0 || !selectedTemplate}
                >
                  <Send className="w-5 h-5 mr-2" />
                  Iniciar Disparo
                </Button>
                {activeBroadcast && !showProgressModal && (
                  <Button variant="outline" className="w-full" onClick={() => setShowProgressModal(true)}>
                    Ver último disparo ({broadcastStats.sent} enviados)
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Indicador flutuante enquanto o painel está fechado */}
      {activeBroadcast && !showProgressModal && (
        <button
          type="button"
          onClick={() => setShowProgressModal(true)}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-3 rounded-2xl border border-primary/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-xl hover:bg-card"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <Send className="w-4 h-4 text-primary" />
          )}
          <span className="text-sm font-medium tabular-nums">
            {liveProcessed}/{broadcastReport?.total || 0} · {livePercent.toFixed(0)}%
          </span>
        </button>
      )}

      {/* Progress Modal */}
      <BroadcastProgressModal
        open={showProgressModal}
        onClose={() => {
          setShowProgressModal(false);
          // Mantém o disparo rastreado para poder reabrir o painel a qualquer momento.
        }}
        templateName={broadcastReport?.templateName || selectedTemplate || ''}
        totalToSend={broadcastReport?.total || 0}
        results={broadcastResults}
        isComplete={isBroadcastComplete}
        sent={broadcastStats.sent}
        errors={broadcastStats.errors}
        skipped={broadcastStats.skipped}
        isSending={isSending}
        startedAt={broadcastReport?.startedAt || null}
        isPaused={isPaused}
        onPause={() => {
          pauseRef.current = true;
          setIsPaused(true);
          toast({ title: 'Pausando...', description: 'O disparo para após o lote atual e fica salvo no histórico.' });
        }}
        onCancel={() => {
          cancelSendRef.current = true;
          toast({ title: 'Disparo cancelado', description: 'O envio será interrompido após o lote atual.' });
        }}
      />

    </DashboardLayout>
  );
}
