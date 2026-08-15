import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
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
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Pencil, Trash2, Loader2, Package, Search, CalendarDays,
  Link2, CreditCard, TrendingUp, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type PlanRow = Database['public']['Tables']['plans']['Row'];

const money = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

/** Agrupa os planos por faixa de duração (mensal, bimestral, trimestral...). */
function durationGroup(days: number) {
  if (days <= 31) return { key: 'mensal', label: 'Mensal', months: 1 };
  if (days <= 62) return { key: 'bimestral', label: 'Bimestral', months: 2 };
  if (days <= 95) return { key: 'trimestral', label: 'Trimestral', months: 3 };
  if (days <= 190) return { key: 'semestral', label: 'Semestral', months: 6 };
  if (days <= 380) return { key: 'anual', label: 'Anual', months: 12 };
  return { key: 'outros', label: 'Longa duração', months: Math.round(days / 30) };
}

const GROUP_STYLES: Record<string, string> = {
  mensal: 'from-sky-500/20 to-blue-500/5 text-sky-400 border-sky-500/30',
  bimestral: 'from-violet-500/20 to-purple-500/5 text-violet-400 border-violet-500/30',
  trimestral: 'from-amber-500/20 to-orange-500/5 text-amber-400 border-amber-500/30',
  semestral: 'from-emerald-500/20 to-green-500/5 text-emerald-400 border-emerald-500/30',
  anual: 'from-fuchsia-500/20 to-pink-500/5 text-fuchsia-400 border-fuchsia-500/30',
  outros: 'from-slate-500/20 to-slate-500/5 text-slate-400 border-slate-500/30',
};

export default function Plans() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    plan_name: '',
    duration_days: 30,
    price: 0,
    checkout_url: '',
    card_checkout_url: '',
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('duration_days', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('plans').insert({
        ...data,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Plano criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar plano', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from('plans').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Plano atualizado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar plano', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setDeleteTarget(null);
      toast({ title: 'Plano excluído com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir plano', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({ plan_name: '', duration_days: 30, price: 0, checkout_url: '', card_checkout_url: '' });
    setEditingPlan(null);
  };

  const handleEdit = (plan: PlanRow) => {
    setEditingPlan(plan);
    setFormData({
      plan_name: plan.plan_name,
      duration_days: plan.duration_days,
      price: Number(plan.price),
      checkout_url: (plan as any).checkout_url || '',
      card_checkout_url: (plan as any).card_checkout_url || '',
    });
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!plans) return [] as PlanRow[];
    if (!term) return plans;
    return plans.filter((p) => p.plan_name.toLowerCase().includes(term));
  }, [plans, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: PlanRow[] }>();
    for (const p of filtered) {
      const g = durationGroup(p.duration_days);
      if (!map.has(g.key)) map.set(g.key, { label: g.label, items: [] });
      map.get(g.key)!.items.push(p);
    }
    for (const v of map.values()) v.items.sort((a, b) => Number(a.price) - Number(b.price));
    return Array.from(map.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    const list = plans || [];
    const prices = list.map((p) => Number(p.price)).filter((n) => n > 0);
    return {
      total: list.length,
      avg: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      min: prices.length ? Math.min(...prices) : 0,
      groups: new Set(list.map((p) => durationGroup(p.duration_days).key)).size,
    };
  }, [plans]);

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Planos</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Organize preços, durações e links de checkout
              </p>
            </div>
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="glow">
                <Plus className="w-4 h-4 mr-2" />
                Novo Plano
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPlan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Plano</Label>
                  <Input
                    value={formData.plan_name}
                    onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                    placeholder="Mensal"
                    required
                    className="bg-secondary/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Duração (dias)</Label>
                    <Input
                      type="number"
                      value={formData.duration_days}
                      onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) })}
                      min={1}
                      required
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Preço (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                      min={0}
                      required
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Link Pix / Checkout (Cakto)</Label>
                  <Input
                    value={formData.checkout_url}
                    onChange={(e) => setFormData({ ...formData, checkout_url: e.target.value })}
                    placeholder="https://pay.cakto.com.br/... (Pix)"
                    className="bg-secondary/50"
                  />
                  <p className="text-xs text-muted-foreground">Link Cakto padrão (usado como Pix na página pública).</p>
                </div>
                <div className="space-y-2">
                  <Label>Link Cartão de Crédito (Cakto)</Label>
                  <Input
                    value={formData.card_checkout_url}
                    onChange={(e) => setFormData({ ...formData, card_checkout_url: e.target.value })}
                    placeholder="https://pay.cakto.com.br/... (Cartão)"
                    className="bg-secondary/50"
                  />
                  <p className="text-xs text-muted-foreground">Opcional. Se preenchido, aparece o botão "Cartão de Crédito" no checkout público.</p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingPlan ? 'Atualizar' : 'Criar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Package, label: 'Planos cadastrados', value: String(stats.total) },
            { icon: Layers, label: 'Faixas de duração', value: String(stats.groups) },
            { icon: TrendingUp, label: 'Ticket médio', value: money(stats.avg) },
            { icon: CreditCard, label: 'Menor preço', value: money(stats.min) },
          ].map((s) => (
            <Card key={s.label} className="glass-card border-border/50 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <s.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{s.label}</p>
                  <p className="text-lg font-bold text-foreground truncate">{s.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Busca */}
        <Card className="glass-card border-border/50 p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar plano pelo nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50 border-border/50 h-10"
            />
          </div>
        </Card>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="glass-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Package className="w-12 h-12 mb-4 opacity-50" />
              <p>{search ? 'Nenhum plano encontrado para a busca' : 'Nenhum plano cadastrado'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map(([key, group]) => (
              <section key={key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn('bg-gradient-to-r border px-2.5 py-1 text-xs font-semibold', GROUP_STYLES[key])}
                  >
                    <CalendarDays className="w-3 h-3 mr-1" />
                    {group.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{group.items.length} plano(s)</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((plan) => {
                    const price = Number(plan.price);
                    const perMonth = price / Math.max(1, plan.duration_days / 30);
                    const hasPix = !!(plan as any).checkout_url;
                    const hasCard = !!(plan as any).card_checkout_url;
                    return (
                      <div
                        key={plan.id}
                        className="group relative rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-4 transition-all hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{plan.plan_name}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {plan.duration_days} dias de acesso
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(plan)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(plan)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 flex items-end gap-2">
                          <span className="text-2xl font-bold text-success">{money(price)}</span>
                          {plan.duration_days > 31 && (
                            <span className="text-xs text-muted-foreground mb-1">
                              ≈ {money(perMonth)}/mês
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge variant="outline" className={cn('text-[10px]', hasPix ? 'text-emerald-400 border-emerald-500/40' : 'text-muted-foreground')}>
                            <Link2 className="w-3 h-3 mr-1" /> Pix {hasPix ? 'configurado' : 'sem link'}
                          </Badge>
                          <Badge variant="outline" className={cn('text-[10px]', hasCard ? 'text-sky-400 border-sky-500/40' : 'text-muted-foreground')}>
                            <CreditCard className="w-3 h-3 mr-1" /> Cartão {hasCard ? 'configurado' : 'sem link'}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano</AlertDialogTitle>
            <AlertDialogDescription>
              O plano <b>{deleteTarget?.plan_name}</b> será removido definitivamente. Clientes vinculados a ele ficarão sem plano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
