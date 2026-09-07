import { useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Plus, CalendarClock, Bell, Repeat, Trash2, Pencil, Search, CheckCircle2,
  Circle, Timer, AlarmClock, Flame, ListChecks, Loader2, Tag, MessageCircle, Smartphone,
} from 'lucide-react';

type Status = 'todo' | 'doing' | 'done';

interface Task {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: 'baixa' | 'media' | 'alta' | 'urgente';
  due_at: string | null;
  remind_at: string | null;
  notify_whatsapp: boolean;
  notify_push: boolean;
  notify_phone: string | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  tags: string[];
  checklist: { text: string; done: boolean }[];
  completed_at: string | null;
  created_at: string;
}

const COLUMNS: { key: Status; label: string; icon: typeof Circle; accent: string }[] = [
  { key: 'todo', label: 'A fazer', icon: Circle, accent: 'from-sky-500/20 to-sky-500/5 text-sky-400' },
  { key: 'doing', label: 'Em andamento', icon: Timer, accent: 'from-amber-500/20 to-amber-500/5 text-amber-400' },
  { key: 'done', label: 'Concluídas', icon: CheckCircle2, accent: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400' },
];

const PRIORITIES = [
  { value: 'baixa', label: 'Baixa', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { value: 'media', label: 'Média', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  { value: 'alta', label: 'Alta', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { value: 'urgente', label: 'Urgente', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
] as const;

const RECURRENCES = [
  { value: 'none', label: 'Não repetir' },
  { value: 'daily', label: 'Todo dia' },
  { value: 'weekly', label: 'Toda semana' },
  { value: 'monthly', label: 'Todo mês' },
] as const;

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}
function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const emptyForm = {
  id: '',
  title: '',
  description: '',
  status: 'todo' as Status,
  priority: 'media' as Task['priority'],
  due_at: '',
  remind_at: '',
  notify_whatsapp: false,
  notify_push: true,
  notify_phone: '',
  recurrence: 'none' as Task['recurrence'],
  tags: '',
  checklist: [] as { text: string; done: boolean }[],
};

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [checkItem, setCheckItem] = useState('');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks' as never)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Task[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Informe um título para a tarefa');
      const payload = {
        owner_id: user!.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        due_at: fromLocalInput(form.due_at),
        remind_at: fromLocalInput(form.remind_at),
        notify_whatsapp: form.notify_whatsapp,
        notify_push: form.notify_push,
        notify_phone: form.notify_phone.replace(/\D/g, '') || null,
        recurrence: form.recurrence,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        checklist: form.checklist,
        last_notified_at: null,
      };
      if (form.id) {
        const { error } = await supabase.from('tasks' as never).update(payload as never).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tasks' as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setOpen(false);
      setForm(emptyForm);
      toast({ title: 'Tarefa salva com sucesso' });
    },
    onError: (e: Error) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('tasks' as never).update(patch as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Tarefa excluída' });
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      if (!s) return true;
      return (
        t.title.toLowerCase().includes(s) ||
        (t.description || '').toLowerCase().includes(s) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(s))
      );
    });
  }, [tasks, search, filterPriority]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: tasks.length,
      done: tasks.filter(t => t.status === 'done').length,
      late: tasks.filter(t => t.status !== 'done' && t.due_at && new Date(t.due_at).getTime() < now).length,
      alerts: tasks.filter(t => t.status !== 'done' && !!t.remind_at).length,
    };
  }, [tasks]);

  const openEdit = (t: Task) => {
    setForm({
      id: t.id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      due_at: toLocalInput(t.due_at),
      remind_at: toLocalInput(t.remind_at),
      notify_whatsapp: t.notify_whatsapp,
      notify_push: t.notify_push,
      notify_phone: t.notify_phone || '',
      recurrence: t.recurrence,
      tags: (t.tags || []).join(', '),
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
    });
    setOpen(true);
  };

  const toggleChecklist = (t: Task, idx: number) => {
    const list = (Array.isArray(t.checklist) ? [...t.checklist] : []);
    list[idx] = { ...list[idx], done: !list[idx].done };
    patchMutation.mutate({ id: t.id, patch: { checklist: list } });
  };

  const advance = (t: Task) => {
    const next: Status = t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
    patchMutation.mutate({
      id: t.id,
      patch: { status: next, completed_at: next === 'done' ? new Date().toISOString() : null },
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-primary/15 via-background/60 to-background/20 backdrop-blur-xl p-6 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center shadow-inner">
                <ListChecks className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">Tarefas &amp; Anotações</h1>
                <p className="text-sm text-muted-foreground">Organize seu dia e receba avisos automáticos no WhatsApp e no celular.</p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => { setForm(emptyForm); setOpen(true); }}
              className="rounded-2xl shadow-lg shadow-primary/30 hover:scale-[1.02] transition-transform"
            >
              <Plus className="w-4 h-4 mr-2" /> Nova tarefa
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            {[
              { label: 'Total', value: stats.total, icon: ListChecks, cls: 'text-primary' },
              { label: 'Concluídas', value: stats.done, icon: CheckCircle2, cls: 'text-emerald-400' },
              { label: 'Atrasadas', value: stats.late, icon: Flame, cls: 'text-red-400' },
              { label: 'Com aviso', value: stats.alerts, icon: AlarmClock, cls: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-border/40 bg-background/40 backdrop-blur-md px-4 py-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                  <s.icon className={cn('w-3.5 h-3.5', s.cls)} /> {s.label}
                </div>
                <p className="text-2xl font-black mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, descrição ou etiqueta..."
              className="pl-9 rounded-2xl bg-background/50 backdrop-blur-md"
            />
          </div>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-full sm:w-56 rounded-2xl bg-background/50 backdrop-blur-md">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Board */}
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {COLUMNS.map(col => {
              const items = filtered.filter(t => t.status === col.key);
              return (
                <div key={col.key} className="rounded-3xl border border-border/40 bg-card/40 backdrop-blur-xl p-4 shadow-xl min-h-[240px]">
                  <div className={cn('flex items-center gap-2 rounded-2xl px-3 py-2 mb-4 bg-gradient-to-r', col.accent)}>
                    <col.icon className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-[0.15em]">{col.label}</span>
                    <span className="ml-auto text-xs font-bold opacity-80">{items.length}</span>
                  </div>

                  <div className="space-y-3">
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhuma tarefa aqui.</p>
                    )}
                    {items.map(t => {
                      const prio = PRIORITIES.find(p => p.value === t.priority)!;
                      const late = t.status !== 'done' && t.due_at && new Date(t.due_at).getTime() < Date.now();
                      const list = Array.isArray(t.checklist) ? t.checklist : [];
                      return (
                        <Card key={t.id} className="p-4 rounded-2xl border-border/50 bg-background/50 backdrop-blur-md hover:border-primary/40 transition-all group">
                          <div className="flex items-start gap-2">
                            <button onClick={() => advance(t)} className="mt-0.5 shrink-0" title="Mudar situação">
                              {t.status === 'done'
                                ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                : <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={cn('font-semibold text-sm leading-snug', t.status === 'done' && 'line-through text-muted-foreground')}>
                                {t.title}
                              </p>
                              {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{t.description}</p>}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => openEdit(t)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          {list.length > 0 && (
                            <div className="mt-3 space-y-1.5 pl-7">
                              {list.map((c, i) => (
                                <label key={i} className="flex items-center gap-2 text-xs cursor-pointer">
                                  <Checkbox checked={c.done} onCheckedChange={() => toggleChecklist(t, i)} />
                                  <span className={cn(c.done && 'line-through text-muted-foreground')}>{c.text}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5 mt-3 pl-7">
                            <Badge variant="outline" className={cn('text-[10px] font-bold', prio.cls)}>{prio.label}</Badge>
                            {t.due_at && (
                              <Badge variant="outline" className={cn('text-[10px] gap-1', late && 'border-red-500/40 text-red-400')}>
                                <CalendarClock className="w-3 h-3" /> {fmtDate(t.due_at)}
                              </Badge>
                            )}
                            {t.remind_at && (
                              <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/30 text-amber-400">
                                <Bell className="w-3 h-3" /> {fmtDate(t.remind_at)}
                              </Badge>
                            )}
                            {t.recurrence !== 'none' && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Repeat className="w-3 h-3" /> {RECURRENCES.find(r => r.value === t.recurrence)?.label}
                              </Badge>
                            )}
                            {t.notify_whatsapp && <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-400"><MessageCircle className="w-3 h-3" /> WhatsApp</Badge>}
                            {(t.tags || []).map(tag => (
                              <Badge key={tag} variant="secondary" className="text-[10px] gap-1"><Tag className="w-3 h-3" />{tag}</Badge>
                            ))}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-primary" />
              {form.id ? 'Editar tarefa' : 'Nova tarefa'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Cobrar clientes vencidos" />
            </div>

            <div className="space-y-1.5">
              <Label>Anotação</Label>
              <Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Detalhes, links, observações..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as Task['priority'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prazo</Label>
                <Input type="datetime-local" value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Avisar em</Label>
                <Input type="datetime-local" value={form.remind_at} onChange={e => setForm({ ...form, remind_at: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Repetição do aviso</Label>
              <Select value={form.recurrence} onValueChange={v => setForm({ ...form, recurrence: v as Task['recurrence'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RECURRENCES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="rounded-2xl border border-border/50 bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Bell className="w-3.5 h-3.5" /> Avisos automáticos
              </p>
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-normal"><MessageCircle className="w-4 h-4 text-emerald-400" /> Avisar no WhatsApp</Label>
                <Switch checked={form.notify_whatsapp} onCheckedChange={v => setForm({ ...form, notify_whatsapp: v })} />
              </div>
              {form.notify_whatsapp && (
                <Input
                  value={form.notify_phone}
                  onChange={e => setForm({ ...form, notify_phone: e.target.value })}
                  placeholder="Telefone (deixe vazio para usar o número de notificações)"
                />
              )}
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-normal"><Smartphone className="w-4 h-4 text-primary" /> Notificação no celular</Label>
                <Switch checked={form.notify_push} onCheckedChange={v => setForm({ ...form, notify_push: v })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Etiquetas (separadas por vírgula)</Label>
              <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="cobrança, urgente, revenda" />
            </div>

            <div className="space-y-2">
              <Label>Checklist</Label>
              <div className="flex gap-2">
                <Input
                  value={checkItem}
                  onChange={e => setCheckItem(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && checkItem.trim()) {
                      e.preventDefault();
                      setForm({ ...form, checklist: [...form.checklist, { text: checkItem.trim(), done: false }] });
                      setCheckItem('');
                    }
                  }}
                  placeholder="Adicionar item e pressionar Enter"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!checkItem.trim()) return;
                    setForm({ ...form, checklist: [...form.checklist, { text: checkItem.trim(), done: false }] });
                    setCheckItem('');
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {form.checklist.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={c.done}
                    onCheckedChange={() => {
                      const list = [...form.checklist];
                      list[i] = { ...list[i], done: !list[i].done };
                      setForm({ ...form, checklist: list });
                    }}
                  />
                  <span className={cn('flex-1', c.done && 'line-through text-muted-foreground')}>{c.text}</span>
                  <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive"
                    onClick={() => setForm({ ...form, checklist: form.checklist.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
