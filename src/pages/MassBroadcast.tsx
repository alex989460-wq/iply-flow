import { useState, useMemo, useEffect } from 'react';
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
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface BroadcastResult {
  customer: string;
  phone: string;
  status: 'sent' | 'error';
  error?: string;
}

interface BroadcastReport {
  total: number;
  sent: number;
  errors: number;
  details: BroadcastResult[];
  templateName: string;
  startedAt: Date;
  completedAt?: Date;
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
  const [delayMinSeconds, setDelayMinSeconds] = useState(5);
  const [delayMaxSeconds, setDelayMaxSeconds] = useState(10);
  const [broadcastReport, setBroadcastReport] = useState<BroadcastReport | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Templates from API
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Fetch zap settings for department
  const { data: zapSettings } = useQuery({
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

  // Get customers based on selection mode
  const getSelectedCustomersList = useMemo(() => {
    if (selectionMode === 'customers') {
      return filteredCustomers.filter(c => selectedCustomers.has(c.id));
    } else {
      return filteredCustomers.filter(c => c.server_id && selectedServers.has(c.server_id));
    }
  }, [selectionMode, filteredCustomers, selectedCustomers, selectedServers]);

  // Get selected template info
  const selectedTemplateInfo = useMemo(() => {
    return templates.find(t => t.name === selectedTemplate);
  }, [templates, selectedTemplate]);

  // Calculate estimated cost based on template category
  const estimatedCost = useMemo(() => {
    const count = getSelectedCustomersList.length;
    const isMarketing = selectedTemplateInfo?.category?.toUpperCase() === 'MARKETING';
    const costPerMessage = isMarketing ? COST_MARKETING : COST_UTILITY;
    const avgDelay = (delayMinSeconds + delayMaxSeconds) / 2;
    return {
      count,
      totalCost: count * costPerMessage,
      estimatedTime: count * avgDelay,
      isMarketing,
      costPerMessage,
    };
  }, [getSelectedCustomersList, delayMinSeconds, delayMaxSeconds, selectedTemplateInfo]);

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

    setIsSending(true);
    setSendingProgress(0);
    setBroadcastReport(null);
    setShowReport(false);

    const startedAt = new Date();

    try {
      const response = await supabase.functions.invoke('mass-broadcast', {
        body: {
          customer_ids: customersToSend.map(c => c.id),
          template_name: selectedTemplate,
          delay_min_seconds: delayMinSeconds,
          delay_max_seconds: delayMaxSeconds,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Background task started - show acknowledgment
      const data = response.data;
      
      if (data?.success) {
        toast({
          title: 'Disparo iniciado em segundo plano!',
          description: `${data.total} mensagens serão enviadas. Tempo estimado: ~${data.estimated_time_minutes} minutos. Acompanhe o progresso nos relatórios de cobrança.`,
        });
        
        // Create a preliminary report
        const report: BroadcastReport = {
          total: data.total,
          sent: 0,
          errors: 0,
          details: [],
          templateName: selectedTemplate,
          startedAt,
        };
        
        setBroadcastReport(report);
        setShowReport(true);
        setSendingProgress(100);
      }
      
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
      
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
                        const customerCount = customers.filter(c => c.server_id === server.id).length;
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
                                {customerCount} cliente{customerCount !== 1 ? 's' : ''}
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

            {/* Delay Setting */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Intervalo Aleatório
                </CardTitle>
                <CardDescription>
                  Intervalo aleatório entre envios (anti-bloqueio)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Mín:</Label>
                    <Input
                      type="number"
                      min={3}
                      max={delayMaxSeconds - 1}
                      value={delayMinSeconds}
                      onChange={(e) => {
                        const val = Math.max(3, parseInt(e.target.value) || 5);
                        setDelayMinSeconds(Math.min(val, delayMaxSeconds - 1));
                      }}
                      className="w-16"
                    />
                  </div>
                  <span className="text-muted-foreground">-</span>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Máx:</Label>
                    <Input
                      type="number"
                      min={delayMinSeconds + 1}
                      max={120}
                      value={delayMaxSeconds}
                      onChange={(e) => {
                        const val = Math.max(delayMinSeconds + 1, parseInt(e.target.value) || 10);
                        setDelayMaxSeconds(Math.min(val, 120));
                      }}
                      className="w-16"
                    />
                  </div>
                  <span className="text-muted-foreground">seg</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  O sistema escolherá um tempo aleatório entre {delayMinSeconds}s e {delayMaxSeconds}s para cada mensagem
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

            {/* Broadcast Report */}
            {showReport && broadcastReport && (
              <Card className="border-primary/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Relatório do Disparo
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowReport(false)}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                  <CardDescription>
                    Template: {broadcastReport.templateName}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-muted rounded-lg">
                      <p className="text-lg font-bold">{broadcastReport.total}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="p-2 bg-success/10 rounded-lg">
                      <p className="text-lg font-bold text-success">{broadcastReport.sent}</p>
                      <p className="text-xs text-muted-foreground">Enviados</p>
                    </div>
                    <div className="p-2 bg-destructive/10 rounded-lg">
                      <p className="text-lg font-bold text-destructive">{broadcastReport.errors}</p>
                      <p className="text-xs text-muted-foreground">Erros</p>
                    </div>
                  </div>

                  {/* Progress bar showing success rate */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Taxa de sucesso</span>
                      <span>{broadcastReport.total > 0 ? Math.round((broadcastReport.sent / broadcastReport.total) * 100) : 0}%</span>
                    </div>
                    <Progress 
                      value={broadcastReport.total > 0 ? (broadcastReport.sent / broadcastReport.total) * 100 : 0} 
                      className="h-2" 
                    />
                  </div>

                  {/* Time info */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Iniciado: {broadcastReport.startedAt.toLocaleTimeString('pt-BR')}</p>
                    {broadcastReport.completedAt && (
                      <p>Concluído: {broadcastReport.completedAt.toLocaleTimeString('pt-BR')}</p>
                    )}
                  </div>

                  {/* Details - scrollable list */}
                  {broadcastReport.details.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Detalhes:</p>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {broadcastReport.details.map((detail, idx) => (
                          <div 
                            key={idx}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded text-sm",
                              detail.status === 'sent' 
                                ? "bg-success/10" 
                                : "bg-destructive/10"
                            )}
                          >
                            {detail.status === 'sent' ? (
                              <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{detail.customer}</p>
                              <p className="text-xs text-muted-foreground">{detail.phone}</p>
                              {detail.error && (
                                <p className="text-xs text-destructive truncate">{detail.error}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
