import { useState, useMemo, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Loader2, CreditCard, Pencil, Trash2, Bot, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';

type PaymentMethod = Database['public']['Enums']['payment_method'];

export default function Payments() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    customer_id: '',
    amount: 0,
    method: 'pix' as PaymentMethod,
    payment_date: new Date().toISOString().split('T')[0],
  });

  // Filters & pagination
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      // Paginated fetch to bypass 1000-row Supabase limit
      const pageSizeFetch = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('payments')
          .select('*, customers(name, phone, username)')
          .order('created_at', { ascending: false })
          .range(from, from + pageSizeFetch - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSizeFetch) break;
        from += pageSizeFetch;
      }
      return all;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*, plans(price)')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('payments').insert({
        ...data,
        confirmed: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Pagamento registrado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao registrar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from('payments')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Pagamento atualizado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: 'Pagamento excluído com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      customer_id: '',
      amount: 0,
      method: 'pix',
      payment_date: new Date().toISOString().split('T')[0],
    });
    setEditingPayment(null);
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers?.find(c => c.id === customerId);
    setFormData({
      ...formData,
      customer_id: customerId,
      amount: customer?.plans?.price ? Number(customer.plans.price) : 0,
    });
  };

  const handleEdit = (payment: any) => {
    setEditingPayment(payment);
    setFormData({
      customer_id: payment.customer_id,
      amount: payment.amount,
      method: payment.method,
      payment_date: payment.payment_date,
    });
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPayment) {
      updateMutation.mutate({ id: editingPayment.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getMethodLabel = (method: PaymentMethod) => {
    const labels: Record<string, string> = {
      pix: 'PIX',
      dinheiro: 'Dinheiro',
      transferencia: 'Transferência',
      cartao_credito: 'Cartão de Crédito',
    };
    return labels[method] || method;
  };

  const getSourceKey = (src: string) => {
    if (src.startsWith('cakto')) return 'cakto';
    if (src.startsWith('pc_') || src.startsWith('pc:')) return 'checkout';
    return 'manual';
  };

  // Filter
  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    const term = deferredSearch.trim().toLowerCase();
    return payments.filter((p: any) => {
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      if (sourceFilter !== 'all') {
        const key = getSourceKey(String(p.source || ''));
        if (key !== sourceFilter) return false;
      }
      if (term) {
        const name = (p.customers?.name || '').toLowerCase();
        const phone = (p.customers?.phone || '').toLowerCase();
        const username = (p.customers?.username || '').toLowerCase();
        if (!name.includes(term) && !phone.includes(term) && !username.includes(term)) return false;
      }
      return true;
    });
  }, [payments, deferredSearch, methodFilter, sourceFilter]);

  const totalFiltered = filteredPayments.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pagePayments = filteredPayments.slice(startIdx, startIdx + pageSize);

  const handleSearchChange = (v: string) => { setSearch(v); setCurrentPage(1); };
  const handleMethodChange = (v: string) => { setMethodFilter(v); setCurrentPage(1); };
  const handleSourceChange = (v: string) => { setSourceFilter(v); setCurrentPage(1); };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Pagamentos</h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">Gerencie os pagamentos dos clientes</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="glow">
                <Plus className="w-4 h-4 mr-2" />
                Novo Pagamento
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>{editingPayment ? 'Editar Pagamento' : 'Registrar Pagamento'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select
                    value={formData.customer_id}
                    onValueChange={handleCustomerChange}
                    disabled={!!editingPayment}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} - {customer.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    min={0}
                    required
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Método</Label>
                  <Select
                    value={formData.method}
                    onValueChange={(value: PaymentMethod) => setFormData({ ...formData, method: value })}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data do Pagamento</Label>
                  <Input
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                    required
                    className="bg-secondary/50"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={createMutation.isPending || updateMutation.isPending || !formData.customer_id}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingPayment ? 'Salvar Alterações' : 'Registrar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card className="glass-card border-border/50 p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, usuário ou telefone..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 bg-background/50 border-border/50 h-10"
              />
            </div>
            <Select value={methodFilter} onValueChange={handleMethodChange}>
              <SelectTrigger className="w-full lg:w-[170px] bg-background/50 border-border/50 h-10">
                <SelectValue placeholder="Método" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Métodos</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={handleSourceChange}>
              <SelectTrigger className="w-full lg:w-[160px] bg-background/50 border-border/50 h-10">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Origens</SelectItem>
                <SelectItem value="cakto">Cakto</SelectItem>
                <SelectItem value="checkout">Checkout</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 px-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Mostrar</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-[80px] bg-background/50 border-border/50 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="glass-card border-border/50">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : pagePayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <CreditCard className="w-12 h-12 mb-4 opacity-50" />
                <p>Nenhum pagamento encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                     <TableHead>Cliente</TableHead>
                     <TableHead>Usuário</TableHead>
                     <TableHead>Valor</TableHead>
                     <TableHead>Método</TableHead>
                     <TableHead>Origem</TableHead>
                     <TableHead>Data</TableHead>
                     <TableHead className="text-right">Ações</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {pagePayments.map((payment: any) => (
                     <TableRow key={payment.id} className="table-row-hover border-border">
                       <TableCell className="font-medium">{payment.customers?.name}</TableCell>
                       <TableCell className="text-muted-foreground">{payment.customers?.username || '—'}</TableCell>
                      <TableCell className="text-success font-semibold">
                        R$ {Number(payment.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{getMethodLabel(payment.method)}</TableCell>
                      <TableCell>
                        {(() => {
                          const key = getSourceKey(String(payment.source || ''));
                          if (key === 'cakto') {
                            return (
                              <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
                                <Bot className="w-3 h-3" />
                                Cakto
                              </Badge>
                            );
                          }
                          if (key === 'checkout') {
                            return (
                              <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
                                <Bot className="w-3 h-3" />
                                Checkout
                              </Badge>
                            );
                          }
                          return (
                            <Badge variant="outline" className="text-muted-foreground gap-1">
                              Manual
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {payment.payment_date.split('-').reverse().join('/')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(payment)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(payment.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalFiltered > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
            <div className="text-muted-foreground">
              Mostrando <span className="font-medium text-foreground">{startIdx + 1} - {Math.min(startIdx + pageSize, totalFiltered)}</span> de <span className="font-medium text-foreground">{totalFiltered}</span> pagamentos
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-muted-foreground px-2">
                Página <span className="font-medium text-foreground">{safePage}</span> de <span className="font-medium text-foreground">{totalPages}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
