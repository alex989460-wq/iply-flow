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
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Loader2, Package, Search, CalendarDays,
  Link2, CreditCard, TrendingUp, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type PlanRow = Database['public']['Tables']['plans']['Row'];

const money = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function durationGroup(days: number) {
  if (days <= 31) return { key: 'mensal', label: 'Mensal' };
  if (days <= 62) return { key: 'bimestral', label: 'Bimestral' };
  if (days <= 95) return { key: 'trimestral', label: 'Trimestral' };
  if (days <= 190) return { key: 'semestral', label: 'Semestral' };
  if (days <= 380) return { key: 'anual', label: 'Anual' };
  return { key: 'outros', label: 'Longa duração' };
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
      toast.success('Plano criado!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar: ' + error.message);
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
      toast.success('Plano atualizado!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar: ' + error.message);
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
      toast.success('Plano excluído!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir: ' + error.message);
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
      <div className="space-y-6 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Modern Header */}
        <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-2xl">
          <div className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                <Package className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Planos</h1>
                <p className="text-muted-foreground text-sm font-medium">Gestão inteligente de preços e durações</p>
              </div>
            </div>
            <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xl shadow-primary/20 rounded-xl px-6 h-12 active:scale-95 transition-all">
                  <Plus className="w-5 h-5 mr-2" />
                  Criar Novo Plano
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-background/80 backdrop-blur-2xl border-border/50 rounded-3xl shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">{editingPlan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Nome do Plano</Label>
                    <Input
                      value={formData.plan_name}
                      onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                      placeholder="Ex: Mensal Premium"
                      required
                      className="h-11 bg-background/50 border-border/50 rounded-xl focus:border-primary/50 transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Duração (dias)</Label>
                      <Input
                        type="number"
                        value={formData.duration_days}
                        onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) })}
                        min={1}
                        required
                        className="h-11 bg-background/50 border-border/50 rounded-xl focus:border-primary/50 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Preço (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                        min={0}
                        required
                        className="h-11 bg-background/50 border-border/50 rounded-xl focus:border-primary/50 transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Link Pix (Cakto)</Label>
                    <Input
                      value={formData.checkout_url}
                      onChange={(e) => setFormData({ ...formData, checkout_url: e.target.value })}
                      placeholder="URL do checkout"
                      className="h-11 bg-background/50 border-border/50 rounded-xl focus:border-primary/50 transition-all"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingPlan ? 'Salvar Alterações' : 'Criar Plano'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Package, label: 'Ativos', value: String(stats.total), color: 'text-primary' },
            { icon: Layers, label: 'Categorias', value: String(stats.groups), color: 'text-sky-500' },
            { icon: TrendingUp, label: 'Média', value: money(stats.avg), color: 'text-emerald-500' },
            { icon: CreditCard, label: 'Mínimo', value: money(stats.min), color: 'text-amber-500' },
          ].map((s) => (
            <Card key={s.label} className="bg-card/40 backdrop-blur-md border-border/50 p-4 rounded-2xl hover:bg-card/60 transition-all group overflow-hidden relative">
              <div className="relative flex items-center gap-3 sm:gap-4">
                <div className={cn("w-10 h-10 rounded-xl bg-background/50 border border-border/50 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform", s.color)}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60">{s.label}</p>
                  <p className="text-base sm:text-xl font-black text-foreground truncate">{s.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* List Section */}
        <div className="space-y-6">
          <div className="relative group max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Pesquisar plano..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-11 bg-card/40 backdrop-blur-md border-border/50 rounded-2xl focus:border-primary/50 transition-all shadow-lg shadow-black/5"
            />
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
              <p className="text-sm font-medium text-muted-foreground">Carregando planos...</p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(([key, group]) => (
                <div key={key} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className={cn("bg-gradient-to-br px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-tighter border-2", GROUP_STYLES[key])}>
                      {group.label}
                    </Badge>
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{group.items.length} itens</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {group.items.map((plan) => {
                      const hasPix = !!(plan as any).checkout_url;
                      const hasCard = !!(plan as any).card_checkout_url;
                      return (
                        <div key={plan.id} className="group relative rounded-3xl border border-border/50 bg-card/40 backdrop-blur-md p-6 transition-all hover:bg-card/60 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 active:scale-[0.99]">
                          <div className="flex justify-between items-start mb-6">
                            <div className="space-y-1">
                              <h3 className="text-lg font-black tracking-tight text-foreground group-hover:text-primary transition-colors">{plan.plan_name}</h3>
                              <p className="text-xs font-bold text-muted-foreground/60 uppercase">{plan.duration_days} dias</p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10" onClick={() => handleEdit(plan)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive" onClick={() => setDeleteTarget(plan)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-baseline gap-2 mb-6">
                            <span className="text-3xl font-black text-foreground">{money(Number(plan.price))}</span>
                            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">Final</span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                             <Badge variant="secondary" className={cn("rounded-lg px-2 py-1 text-[9px] font-bold uppercase", hasPix ? "bg-emerald-500/10 text-emerald-500" : "bg-muted/50 text-muted-foreground")}>
                               <Link2 className="w-3 h-3 mr-1" /> {hasPix ? "Pix Ativo" : "Sem Pix"}
                             </Badge>
                             <Badge variant="secondary" className={cn("rounded-lg px-2 py-1 text-[9px] font-bold uppercase", hasCard ? "bg-sky-500/10 text-sky-500" : "bg-muted/50 text-muted-foreground")}>
                               <CreditCard className="w-3 h-3 mr-1" /> {hasCard ? "Cartão Ativo" : "Sem Cartão"}
                             </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl border-border/50 bg-background/80 backdrop-blur-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Excluir Plano?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o plano permanentemente. Os clientes vinculados a este plano não serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-bold">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 rounded-xl font-bold" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Excluir Plano
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
