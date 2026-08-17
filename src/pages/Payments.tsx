import { useState, useMemo, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'sonner';
import { 
  Plus, Loader2, CreditCard, Pencil, Trash2, Search, Wallet, 
  CalendarDays, TrendingUp, Server, Filter, Download
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [serverFilter, setServerFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const queryClient = useQueryClient();

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const pageSizeFetch = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('payments')
          .select('*, customers(name, phone, username, servers(server_name))')
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
      toast.success('Pagamento registrado!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao registrar: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Pagamento removido!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir: ' + error.message);
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

  const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const getSourceKey = (src: string) => {
    if (src.startsWith('cakto')) return 'cakto';
    if (src.startsWith('mp:') || src.startsWith('mercadopago')) return 'mercadopago';
    if (src.startsWith('pc_') || src.startsWith('pc:') || src.startsWith('efi:')) return 'checkout';
    return 'manual';
  };

  const getServerName = (p: any) => p?.customers?.servers?.server_name || 'Sem servidor';

  const filteredPayments = useMemo(() => {
    if (!payments) return [];
    const term = deferredSearch.trim().toLowerCase();
    return payments.filter((p: any) => {
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      if (sourceFilter !== 'all') {
        const key = getSourceKey(String(p.source || ''));
        if (key !== sourceFilter) return false;
      }
      if (serverFilter !== 'all') {
        const srvName = getServerName(p);
        if (serverFilter === '__none__' ? srvName !== 'Sem servidor' : srvName !== serverFilter) return false;
      }
      if (term) {
        const name = (p.customers?.name || '').toLowerCase();
        const phone = (p.customers?.phone || '').toLowerCase();
        const username = (p.customers?.username || '').toLowerCase();
        const srv = getServerName(p).toLowerCase();
        if (!name.includes(term) && !phone.includes(term) && !username.includes(term) && !srv.includes(term)) return false;
      }
      return true;
    });
  }, [payments, deferredSearch, methodFilter, sourceFilter, serverFilter]);

  const summary = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = todayStr.slice(0, 7);
    let total = 0, month = 0, today = 0;
    const byServer = new Map<string, number>();
    for (const p of filteredPayments as any[]) {
      const amt = Number(p.amount) || 0;
      total += amt;
      const d = String(p.payment_date || '');
      if (d.startsWith(monthStr)) month += amt;
      if (d === todayStr) today += amt;
      const srv = getServerName(p);
      byServer.set(srv, (byServer.get(srv) || 0) + amt);
    }
    const topServers = Array.from(byServer.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { total, month, today, count: filteredPayments.length, topServers };
  }, [filteredPayments]);

  const serverOptions = useMemo(() => {
    const set = new Set<string>();
    (payments || []).forEach((p: any) => {
      const n = p?.customers?.servers?.server_name;
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [payments]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Modern Header */}
        <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-2xl">
          <div className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <Wallet className="w-7 h-7 text-emerald-500" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Pagamentos</h1>
                <p className="text-muted-foreground text-sm font-medium">Controle total do fluxo financeiro</p>
              </div>
            </div>
            <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xl shadow-emerald-500/20 rounded-xl px-6 h-12 active:scale-95 transition-all">
                  <Plus className="w-5 h-5 mr-2" />
                  Registrar Pagamento
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-background/80 backdrop-blur-2xl border-border/50 rounded-3xl shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Novo Pagamento</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Cliente</Label>
                    <Select value={formData.customer_id} onValueChange={(v) => {
                      const c = customers?.find(x => x.id === v);
                      setFormData({ ...formData, customer_id: v, amount: c?.plans?.price ? Number(c.plans.price) : 0 });
                    }}>
                      <SelectTrigger className="h-11 bg-background/50 border-border/50 rounded-xl">
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name} ({c.phone})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                        className="h-11 bg-background/50 border-border/50 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Método</Label>
                      <Select value={formData.method} onValueChange={(v: any) => setFormData({ ...formData, method: v })}>
                        <SelectTrigger className="h-11 bg-background/50 border-border/50 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="transferencia">Transferência</SelectItem>
                          <SelectItem value="cartao_credito">Cartão</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 transition-all">
                    Confirmar Recebimento
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Wallet, label: 'Total', value: money(summary.total), color: 'text-emerald-500' },
            { icon: CalendarDays, label: 'Mensal', value: money(summary.month), color: 'text-sky-500' },
            { icon: TrendingUp, label: 'Hoje', value: money(summary.today), color: 'text-amber-500' },
            { icon: CreditCard, label: 'Transações', value: String(summary.count), color: 'text-primary' },
          ].map((s) => (
            <Card key={s.label} className="bg-card/40 backdrop-blur-md border-border/50 p-4 rounded-2xl group overflow-hidden relative">
              <div className="relative flex items-center gap-4">
                <div className={cn("w-10 h-10 rounded-xl bg-background/50 border border-border/50 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform", s.color)}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60">{s.label}</p>
                  <p className="text-xl font-black text-foreground">{s.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Filters and List */}
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
             <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-emerald-500 transition-colors" />
                <Input
                  placeholder="Filtrar pagamentos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-11 h-11 bg-card/40 backdrop-blur-md border-border/50 rounded-2xl focus:border-emerald-500/50 shadow-lg"
                />
             </div>
             <div className="flex gap-2">
               <Select value={serverFilter} onValueChange={setServerFilter}>
                 <SelectTrigger className="h-11 w-40 bg-card/40 backdrop-blur-md border-border/50 rounded-2xl">
                   <Filter className="w-3.5 h-3.5 mr-2 opacity-50" />
                   <SelectValue placeholder="Servidor" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Todos</SelectItem>
                   <SelectItem value="__none__">Sem servidor</SelectItem>
                   {serverOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                 </SelectContent>
               </Select>
               <Select value={methodFilter} onValueChange={setMethodFilter}>
                 <SelectTrigger className="h-11 w-36 bg-card/40 backdrop-blur-md border-border/50 rounded-2xl">
                   <CreditCard className="w-3.5 h-3.5 mr-2 opacity-50" />
                   <SelectValue placeholder="Método" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Todos</SelectItem>
                   <SelectItem value="pix">PIX</SelectItem>
                   <SelectItem value="cartao_credito">Cartão</SelectItem>
                   <SelectItem value="dinheiro">Dinheiro</SelectItem>
                 </SelectContent>
               </Select>
             </div>
          </div>

          <Card className="bg-card/40 backdrop-blur-md border-border/50 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-background/50">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-4 px-6">Cliente</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-4 px-6">Valor</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-4 px-6">Data</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-4 px-6">Método</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-4 px-6">Origem</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground py-4 px-6 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground font-medium">Carregando...</TableCell></TableRow>
                  ) : filteredPayments.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground font-medium">Nenhum pagamento encontrado.</TableCell></TableRow>
                  ) : (
                    filteredPayments.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((p: any) => (
                      <TableRow key={p.id} className="hover:bg-primary/5 transition-colors border-border/50 group">
                        <TableCell className="py-4 px-6">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{p.customers?.name || 'Cliente Removido'}</span>
                            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{getServerName(p)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <span className="text-sm font-black text-foreground">{money(Number(p.amount))}</span>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                           <span className="text-xs font-bold text-muted-foreground">{format(new Date(p.payment_date), 'dd MMM, yyyy', { locale: ptBR })}</span>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                           <Badge variant="secondary" className="bg-background/50 rounded-lg text-[9px] font-black uppercase tracking-tighter">
                             {p.method}
                           </Badge>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                           <Badge variant="outline" className={cn("rounded-lg text-[9px] font-black uppercase tracking-tighter border-2", 
                             p.source?.includes('cakto') ? 'border-violet-500/30 text-violet-500' : 
                             p.source?.includes('mp') ? 'border-sky-500/30 text-sky-500' : 
                             'border-muted text-muted-foreground'
                           )}>
                             {getSourceKey(String(p.source || ''))}
                           </Badge>
                        </TableCell>
                        <TableCell className="py-4 px-6 text-right">
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-all rounded-lg" onClick={() => deleteMutation.mutate(p.id)}>
                             <Trash2 className="w-4 h-4" />
                           </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredPayments.length > pageSize && (
              <div className="p-4 border-t border-border/50 flex items-center justify-between bg-background/30">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Mostrando {(currentPage - 1) * pageSize + 1} a {Math.min(currentPage * pageSize, filteredPayments.length)} de {filteredPayments.length}</p>
                <div className="flex gap-2">
                   <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl font-bold" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Anterior</Button>
                   <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl font-bold" disabled={currentPage * pageSize >= filteredPayments.length} onClick={() => setCurrentPage(c => c + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

import { ptBR } from 'date-fns/locale';
