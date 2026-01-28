import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, isAfter, isBefore, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Plus,
  Home,
  CreditCard,
  Car,
  Wifi,
  Phone,
  ShoppingCart,
  Heart,
  GraduationCap,
  Utensils,
  Dumbbell,
  Briefcase,
  Receipt,
  Trash2,
  Edit,
  CalendarIcon,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  CheckCircle2,
  RefreshCcw,
  Filter,
} from 'lucide-react';

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  casa: { icon: Home, color: 'bg-amber-500', label: 'Casa' },
  cartao: { icon: CreditCard, color: 'bg-purple-500', label: 'Cartão' },
  carro: { icon: Car, color: 'bg-blue-500', label: 'Carro' },
  internet: { icon: Wifi, color: 'bg-cyan-500', label: 'Internet' },
  telefone: { icon: Phone, color: 'bg-green-500', label: 'Telefone' },
  mercado: { icon: ShoppingCart, color: 'bg-orange-500', label: 'Mercado' },
  saude: { icon: Heart, color: 'bg-red-500', label: 'Saúde' },
  educacao: { icon: GraduationCap, color: 'bg-indigo-500', label: 'Educação' },
  alimentacao: { icon: Utensils, color: 'bg-yellow-500', label: 'Alimentação' },
  academia: { icon: Dumbbell, color: 'bg-pink-500', label: 'Academia' },
  trabalho: { icon: Briefcase, color: 'bg-slate-500', label: 'Trabalho' },
  outros: { icon: Receipt, color: 'bg-gray-500', label: 'Outros' },
};

interface Expense {
  id: string;
  user_id: string;
  category: string;
  description: string;
  amount: number;
  due_date: string | null;
  paid: boolean;
  paid_at: string | null;
  recurring: boolean;
  recurring_day: number | null;
  icon: string | null;
  color: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export default function Expenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filterMonth, setFilterMonth] = useState<Date>(new Date());
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPaid, setFilterPaid] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState({
    category: 'casa',
    description: '',
    amount: '',
    due_date: null as Date | null,
    paid: false,
    recurring: false,
    recurring_day: '',
    notes: '',
  });

  const fetchExpenses = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const startDate = format(startOfMonth(filterMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(filterMonth), 'yyyy-MM-dd');

      let query = supabase
        .from('expenses')
        .select('*')
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .order('due_date', { ascending: true });

      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }

      if (filterPaid !== 'all') {
        query = query.eq('paid', filterPaid === 'paid');
      }

      const { data, error } = await query;

      if (error) throw error;
      setExpenses(data || []);
    } catch (error: any) {
      console.error('Error fetching expenses:', error);
      toast.error('Erro ao carregar despesas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [user, filterMonth, filterCategory, filterPaid]);

  const resetForm = () => {
    setFormData({
      category: 'casa',
      description: '',
      amount: '',
      due_date: null,
      paid: false,
      recurring: false,
      recurring_day: '',
      notes: '',
    });
    setEditingExpense(null);
  };

  const handleOpenDialog = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData({
        category: expense.category,
        description: expense.description,
        amount: expense.amount.toString(),
        due_date: expense.due_date ? parseISO(expense.due_date) : null,
        paid: expense.paid,
        recurring: expense.recurring,
        recurring_day: expense.recurring_day?.toString() || '',
        notes: expense.notes || '',
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (!formData.description || !formData.amount || !formData.due_date) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      const expenseData = {
        user_id: user.id,
        category: formData.category,
        description: formData.description.trim(),
        amount: parseFloat(formData.amount),
        due_date: format(formData.due_date, 'yyyy-MM-dd'),
        paid: formData.paid,
        paid_at: formData.paid ? new Date().toISOString() : null,
        recurring: formData.recurring,
        recurring_day: formData.recurring ? parseInt(formData.recurring_day) || null : null,
        notes: formData.notes.trim() || null,
      };

      if (editingExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editingExpense.id);

        if (error) throw error;
        toast.success('Despesa atualizada!');
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert(expenseData);

        if (error) throw error;
        toast.success('Despesa adicionada!');
      }

      setDialogOpen(false);
      resetForm();
      fetchExpenses();
    } catch (error: any) {
      console.error('Error saving expense:', error);
      toast.error('Erro ao salvar despesa');
    }
  };

  const handleTogglePaid = async (expense: Expense) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          paid: !expense.paid,
          paid_at: !expense.paid ? new Date().toISOString() : null,
        })
        .eq('id', expense.id);

      if (error) throw error;
      toast.success(expense.paid ? 'Despesa marcada como pendente' : 'Despesa marcada como paga!');
      fetchExpenses();
    } catch (error: any) {
      console.error('Error toggling paid:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Despesa excluída!');
      fetchExpenses();
    } catch (error: any) {
      console.error('Error deleting expense:', error);
      toast.error('Erro ao excluir despesa');
    }
  };

  // Calculations
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const paidExpenses = expenses.filter(e => e.paid).reduce((sum, e) => sum + e.amount, 0);
  const pendingExpenses = expenses.filter(e => !e.paid).reduce((sum, e) => sum + e.amount, 0);
  const overdueExpenses = expenses.filter(e => !e.paid && e.due_date && isBefore(parseISO(e.due_date), new Date()));

  const getCategoryConfig = (category: string) => {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.outros;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Minhas Despesas
            </h1>
            <p className="text-muted-foreground mt-1">
              Gerencie suas despesas pessoais e domésticas
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                onClick={() => handleOpenDialog()}
                className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25"
              >
                <Plus className="w-4 h-4" />
                Nova Despesa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {editingExpense ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {editingExpense ? 'Editar Despesa' : 'Nova Despesa'}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData(p => ({ ...p, category: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_CONFIG).map(([key, { icon: Icon, label, color }]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div className={cn("w-6 h-6 rounded-md flex items-center justify-center text-white", color)}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            {label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Descrição *</Label>
                  <Input
                    placeholder="Ex: Aluguel, Fatura Nubank..."
                    value={formData.description}
                    onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formData.amount}
                    onChange={(e) => setFormData(p => ({ ...p, amount: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Data de Vencimento *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.due_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.due_date ? format(formData.due_date, "dd 'de' MMMM, yyyy", { locale: ptBR }) : "Selecionar data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.due_date || undefined}
                        onSelect={(date) => setFormData(p => ({ ...p, due_date: date || null }))}
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Checkbox
                    id="paid"
                    checked={formData.paid}
                    onCheckedChange={(checked) => setFormData(p => ({ ...p, paid: checked === true }))}
                  />
                  <Label htmlFor="paid" className="cursor-pointer flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Já está paga
                  </Label>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Checkbox
                    id="recurring"
                    checked={formData.recurring}
                    onCheckedChange={(checked) => setFormData(p => ({ ...p, recurring: checked === true }))}
                  />
                  <Label htmlFor="recurring" className="cursor-pointer flex items-center gap-2">
                    <RefreshCcw className="w-4 h-4 text-blue-500" />
                    Despesa recorrente (mensal)
                  </Label>
                </div>

                {formData.recurring && (
                  <div className="space-y-2 pl-6">
                    <Label>Dia do vencimento</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="Ex: 10"
                      value={formData.recurring_day}
                      onChange={(e) => setFormData(p => ({ ...p, recurring_day: e.target.value }))}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    placeholder="Anotações opcionais..."
                    value={formData.notes}
                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} className="gap-2">
                  {editingExpense ? 'Salvar' : 'Adicionar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-card to-card/80 border-border/50 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total do Mês</p>
                  <p className="text-2xl font-bold mt-1">
                    R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">Pagas</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
                    R$ {paidExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-600 dark:text-amber-400">Pendentes</p>
                  <p className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-300">
                    R$ {pendingExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-rose-600 dark:text-rose-400">Vencidas</p>
                  <p className="text-2xl font-bold mt-1 text-rose-700 dark:text-rose-300">
                    {overdueExpenses.length}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-rose-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-border/50 shadow-lg">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros:</span>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {format(filterMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterMonth}
                    onSelect={(date) => date && setFilterMonth(date)}
                    locale={ptBR}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(CATEGORY_CONFIG).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterPaid} onValueChange={setFilterPaid}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Expenses List */}
        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Despesas de {format(filterMonth, "MMMM 'de' yyyy", { locale: ptBR })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Nenhuma despesa encontrada</p>
                <Button 
                  variant="outline" 
                  className="mt-4 gap-2"
                  onClick={() => handleOpenDialog()}
                >
                  <Plus className="w-4 h-4" />
                  Adicionar primeira despesa
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => {
                  const categoryConfig = getCategoryConfig(expense.category);
                  const Icon = categoryConfig.icon;
                  const isOverdue = !expense.paid && expense.due_date && isBefore(parseISO(expense.due_date), new Date());

                  return (
                    <div
                      key={expense.id}
                      className={cn(
                        "group flex items-center gap-4 p-4 rounded-xl border transition-all duration-200",
                        expense.paid 
                          ? "bg-muted/30 border-border/50" 
                          : isOverdue 
                            ? "bg-rose-500/5 border-rose-500/30 hover:border-rose-500/50" 
                            : "bg-card hover:bg-muted/50 border-border/50 hover:border-primary/30"
                      )}
                    >
                      {/* Category Icon */}
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg",
                        categoryConfig.color,
                        expense.paid && "opacity-60"
                      )}>
                        <Icon className="w-5 h-5" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={cn(
                            "font-medium truncate",
                            expense.paid && "line-through text-muted-foreground"
                          )}>
                            {expense.description}
                          </h3>
                          {expense.recurring && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <RefreshCcw className="w-3 h-3" />
                              Recorrente
                            </Badge>
                          )}
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs">
                              Vencida
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>{categoryConfig.label}</span>
                          {expense.due_date && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3" />
                                {format(parseISO(expense.due_date), "dd/MM/yyyy")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <p className={cn(
                          "text-lg font-bold",
                          expense.paid ? "text-muted-foreground" : isOverdue ? "text-rose-500" : "text-foreground"
                        )}>
                          R$ {expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-8 w-8",
                            expense.paid 
                              ? "text-amber-500 hover:text-amber-600 hover:bg-amber-500/10" 
                              : "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                          )}
                          onClick={() => handleTogglePaid(expense)}
                          title={expense.paid ? "Marcar como pendente" : "Marcar como paga"}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleOpenDialog(expense)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(expense.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}