import { useState, useMemo } from 'react';
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
  MessageSquare
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

interface Server {
  id: string;
  server_name: string;
}

type StatusFilter = 'all' | 'ativa' | 'inativa' | 'vencidos' | 'ativos';
type SelectionMode = 'customers' | 'servers';

// Templates aprovados
const APPROVED_TEMPLATES = [
  { id: 'vence_amanha', name: 'Vence Amanhã', description: 'Lembrete de vencimento para o dia seguinte' },
  { id: 'hoje01', name: 'Vence Hoje', description: 'Aviso de vencimento no dia atual' },
  { id: 'vencido', name: 'Vencido', description: 'Notificação de conta vencida' },
  { id: 'promocao', name: 'Promoção', description: 'Ofertas e promoções especiais' },
  { id: 'boas_vindas', name: 'Boas Vindas', description: 'Mensagem de boas vindas para novos clientes' },
];

// Custo estimado por mensagem (em centavos)
const COST_PER_MESSAGE = 0.08; // R$ 0,08 por mensagem

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
  const [delaySeconds, setDelaySeconds] = useState(5);

  // Fetch customers
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers-broadcast'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select(`
          *,
          servers:server_id(server_name),
          plans:plan_id(plan_name, price)
        `)
        .order('name');
      
      if (error) throw error;
      return data as Customer[];
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
      return data as Server[];
    },
  });

  // Filter customers based on status and search
  const filteredCustomers = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

  // Calculate estimated cost
  const estimatedCost = useMemo(() => {
    const count = getSelectedCustomersList.length;
    return {
      count,
      totalCost: count * COST_PER_MESSAGE,
      estimatedTime: count * delaySeconds, // em segundos
    };
  }, [getSelectedCustomersList, delaySeconds]);

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

    try {
      const response = await supabase.functions.invoke('mass-broadcast', {
        body: {
          customer_ids: customersToSend.map(c => c.id),
          template_name: selectedTemplate,
          delay_seconds: delaySeconds,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast({
        title: 'Disparo iniciado!',
        description: `Enviando para ${customersToSend.length} clientes com intervalo de ${delaySeconds}s entre mensagens.`,
      });

      // Poll for progress
      pollProgress(response.data?.batch_id);
      
    } catch (error: any) {
      console.error('Broadcast error:', error);
      toast({
        title: 'Erro no disparo',
        description: error.message || 'Ocorreu um erro ao iniciar o disparo.',
        variant: 'destructive',
      });
      setIsSending(false);
    }
  };

  // Poll for progress updates
  const pollProgress = async (batchId?: string) => {
    // Simple simulation of progress for now
    let progress = 0;
    const interval = setInterval(() => {
      progress += 100 / getSelectedCustomersList.length;
      setSendingProgress(Math.min(progress, 100));
      
      if (progress >= 100) {
        clearInterval(interval);
        setIsSending(false);
        toast({
          title: 'Disparo concluído!',
          description: 'Todas as mensagens foram enviadas com sucesso.',
        });
        clearSelection();
        queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
      }
    }, delaySeconds * 1000);
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
                    {selectionMode === 'customers' && (
                      <Button variant="outline" size="sm" onClick={selectAllCustomers}>
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
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Template
                </CardTitle>
                <CardDescription>
                  Selecione um template aprovado pelo Meta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {APPROVED_TEMPLATES.map(template => (
                  <div
                    key={template.id}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedTemplate === template.id
                        ? "bg-primary/10 border-primary"
                        : "bg-card hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        selectedTemplate === template.id ? "border-primary" : "border-muted-foreground"
                      )}>
                        {selectedTemplate === template.id && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <span className="font-medium">{template.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 ml-6">
                      {template.description}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Delay Setting */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Intervalo entre mensagens
                </CardTitle>
                <CardDescription>
                  Tempo de espera entre cada envio (anti-bloqueio)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    min={3}
                    max={60}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Math.max(3, parseInt(e.target.value) || 5))}
                    className="w-20"
                  />
                  <span className="text-muted-foreground">segundos</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Recomendado: 5-10 segundos para evitar bloqueios
                </p>
              </CardContent>
            </Card>

            {/* Cost Calculator */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Calculadora de Custos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-background rounded-lg">
                    <p className="text-2xl font-bold text-primary">{estimatedCost.count}</p>
                    <p className="text-sm text-muted-foreground">Mensagens</p>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg">
                    <p className="text-2xl font-bold text-primary">
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
                <p className="text-xs text-muted-foreground text-center">
                  * Custo baseado em {formatCurrency(COST_PER_MESSAGE)} por mensagem
                </p>
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
                  <Progress value={sendingProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    {Math.round(sendingProgress)}% concluído
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
    </DashboardLayout>
  );
}
