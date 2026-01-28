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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  Download,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  FileDown,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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

  // Export to CSV function
  const handleExportCSV = () => {
    if (expenses.length === 0) {
      toast.error('Não há despesas para exportar');
      return;
    }

    const monthName = format(filterMonth, "MMMM 'de' yyyy", { locale: ptBR });
    
    // Group expenses by category
    const groupedByCategory = expenses.reduce((acc, expense) => {
      const category = getCategoryConfig(expense.category).label;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(expense);
      return acc;
    }, {} as Record<string, Expense[]>);

    // Build CSV content
    let csvContent = '\ufeff'; // BOM for UTF-8
    csvContent += `EXTRATO DE DESPESAS - ${monthName.toUpperCase()}\n`;
    csvContent += `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n`;
    csvContent += '\n';
    
    // Summary section
    csvContent += 'RESUMO\n';
    csvContent += `Total do Mês;R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    csvContent += `Total Pago;R$ ${paidExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    csvContent += `Total Pendente;R$ ${pendingExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    csvContent += `Despesas Atrasadas;${overdueExpenses.length}\n`;
    csvContent += '\n';

    // Detailed by category
    csvContent += 'DETALHAMENTO POR CATEGORIA\n';
    csvContent += '\n';

    Object.entries(groupedByCategory)
      .sort(([, a], [, b]) => b.reduce((s, e) => s + e.amount, 0) - a.reduce((s, e) => s + e.amount, 0))
      .forEach(([category, categoryExpenses]) => {
        const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
        const categoryPaid = categoryExpenses.filter(e => e.paid).reduce((sum, e) => sum + e.amount, 0);
        const categoryPending = categoryExpenses.filter(e => !e.paid).reduce((sum, e) => sum + e.amount, 0);
        
        csvContent += `═══ ${category.toUpperCase()} ═══\n`;
        csvContent += `Subtotal: R$ ${categoryTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Pago: R$ ${categoryPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Pendente: R$ ${categoryPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
        csvContent += 'Descrição;Vencimento;Valor;Status;Recorrente;Observações\n';
        
        categoryExpenses
          .sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          })
          .forEach(expense => {
            const dueDate = expense.due_date 
              ? format(parseISO(expense.due_date), 'dd/MM/yyyy')
              : '-';
            const status = expense.paid ? 'PAGO' : (expense.due_date && isBefore(parseISO(expense.due_date), new Date()) ? 'ATRASADO' : 'PENDENTE');
            const recurring = expense.recurring ? `Sim (dia ${expense.recurring_day})` : 'Não';
            const notes = expense.notes?.replace(/;/g, ',').replace(/\n/g, ' ') || '-';
            
            csvContent += `${expense.description};${dueDate};R$ ${expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })};${status};${recurring};${notes}\n`;
          });
        
        csvContent += '\n';
      });

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `extrato-despesas-${format(filterMonth, 'yyyy-MM')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast.success('Extrato CSV exportado!');
  };

  // Export to PDF function
  const handleExportPDF = () => {
    if (expenses.length === 0) {
      toast.error('Não há despesas para exportar');
      return;
    }

    const monthName = format(filterMonth, "MMMM 'de' yyyy", { locale: ptBR });
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text(`Extrato de Despesas`, 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(monthName.charAt(0).toUpperCase() + monthName.slice(1), 14, 28);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 35);

    // Summary box
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(14, 42, 182, 30, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    
    const summaryY = 52;
    doc.text('Total do Mês:', 20, summaryY);
    doc.setTextColor(40, 40, 40);
    doc.setFont(undefined, 'bold');
    doc.text(`R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 50, summaryY);
    
    doc.setFont(undefined, 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('Pago:', 85, summaryY);
    doc.setTextColor(34, 197, 94);
    doc.text(`R$ ${paidExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 100, summaryY);
    
    doc.setTextColor(60, 60, 60);
    doc.text('Pendente:', 140, summaryY);
    doc.setTextColor(234, 179, 8);
    doc.text(`R$ ${pendingExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 165, summaryY);
    
    doc.setTextColor(60, 60, 60);
    doc.text(`Atrasadas: ${overdueExpenses.length}`, 20, summaryY + 10);

    // Group expenses by category
    const groupedByCategory = expenses.reduce((acc, expense) => {
      const category = getCategoryConfig(expense.category).label;
      if (!acc[category]) acc[category] = [];
      acc[category].push(expense);
      return acc;
    }, {} as Record<string, Expense[]>);

    let startY = 80;

    // Table for each category
    Object.entries(groupedByCategory)
      .sort(([, a], [, b]) => b.reduce((s, e) => s + e.amount, 0) - a.reduce((s, e) => s + e.amount, 0))
      .forEach(([category, categoryExpenses]) => {
        const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
        
        // Category header
        doc.setFontSize(12);
        doc.setTextColor(40, 40, 40);
        doc.setFont(undefined, 'bold');
        doc.text(`${category} - R$ ${categoryTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, startY);
        doc.setFont(undefined, 'normal');

        // Table data
        const tableData = categoryExpenses
          .sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          })
          .map(expense => {
            const dueDate = expense.due_date ? format(parseISO(expense.due_date), 'dd/MM/yyyy') : '-';
            const status = expense.paid ? 'Pago' : (expense.due_date && isBefore(parseISO(expense.due_date), new Date()) ? 'Atrasado' : 'Pendente');
            return [
              expense.description,
              dueDate,
              `R$ ${expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              status
            ];
          });

        autoTable(doc, {
          startY: startY + 4,
          head: [['Descrição', 'Vencimento', 'Valor', 'Status']],
          body: tableData,
          theme: 'striped',
          headStyles: { 
            fillColor: [99, 102, 241],
            textColor: 255,
            fontSize: 9,
            fontStyle: 'bold'
          },
          bodyStyles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 30 },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 25 }
          },
          margin: { left: 14, right: 14 },
          didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
              const status = data.cell.raw as string;
              if (status === 'Pago') {
                doc.setTextColor(34, 197, 94);
              } else if (status === 'Atrasado') {
                doc.setTextColor(239, 68, 68);
              } else {
                doc.setTextColor(234, 179, 8);
              }
            }
          }
        });

        startY = (doc as any).lastAutoTable.finalY + 10;
        
        // Check if we need a new page
        if (startY > 270) {
          doc.addPage();
          startY = 20;
        }
      });

    // Save the PDF
    doc.save(`extrato-despesas-${format(filterMonth, 'yyyy-MM')}.pdf`);
    toast.success('Extrato PDF exportado!');
  };

  // Export to Excel function
  const handleExportExcel = () => {
    if (expenses.length === 0) {
      toast.error('Não há despesas para exportar');
      return;
    }

    const monthName = format(filterMonth, "MMMM 'de' yyyy", { locale: ptBR });
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Summary sheet data
    const summaryData: (string | number)[][] = [
      ['EXTRATO DE DESPESAS'],
      [monthName.charAt(0).toUpperCase() + monthName.slice(1)],
      [`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`],
      [],
      ['RESUMO'],
      ['Total do Mês', `R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Total Pago', `R$ ${paidExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Total Pendente', `R$ ${pendingExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Despesas Atrasadas', overdueExpenses.length.toString()],
      [],
      ['DISTRIBUIÇÃO POR CATEGORIA'],
    ];

    // Add category totals to summary
    const groupedByCategory = expenses.reduce((acc, expense) => {
      const category = getCategoryConfig(expense.category).label;
      if (!acc[category]) acc[category] = [];
      acc[category].push(expense);
      return acc;
    }, {} as Record<string, Expense[]>);

    Object.entries(groupedByCategory)
      .sort(([, a], [, b]) => b.reduce((s, e) => s + e.amount, 0) - a.reduce((s, e) => s + e.amount, 0))
      .forEach(([category, categoryExpenses]) => {
        const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
        summaryData.push([category, `R$ ${categoryTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Style summary sheet
    summarySheet['!cols'] = [{ wch: 25 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumo');

    // Detailed sheet data
    const detailData = [
      ['Categoria', 'Descrição', 'Vencimento', 'Valor', 'Status', 'Recorrente', 'Observações']
    ];

    expenses
      .sort((a, b) => {
        const catA = getCategoryConfig(a.category).label;
        const catB = getCategoryConfig(b.category).label;
        if (catA !== catB) return catA.localeCompare(catB);
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })
      .forEach(expense => {
        const category = getCategoryConfig(expense.category).label;
        const dueDate = expense.due_date ? format(parseISO(expense.due_date), 'dd/MM/yyyy') : '-';
        const status = expense.paid ? 'Pago' : (expense.due_date && isBefore(parseISO(expense.due_date), new Date()) ? 'Atrasado' : 'Pendente');
        const recurring = expense.recurring ? `Sim (dia ${expense.recurring_day})` : 'Não';
        
        detailData.push([
          category,
          expense.description,
          dueDate,
          `R$ ${expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          status,
          recurring,
          expense.notes || '-'
        ]);
      });

    const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
    
    // Style detail sheet
    detailSheet['!cols'] = [
      { wch: 15 },  // Categoria
      { wch: 30 },  // Descrição
      { wch: 12 },  // Vencimento
      { wch: 12 },  // Valor
      { wch: 10 },  // Status
      { wch: 15 },  // Recorrente
      { wch: 30 },  // Observações
    ];

    XLSX.utils.book_append_sheet(wb, detailSheet, 'Detalhado');

    // Save the file
    XLSX.writeFile(wb, `extrato-despesas-${format(filterMonth, 'yyyy-MM')}.xlsx`);
    toast.success('Extrato Excel exportado!');
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
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                  disabled={expenses.length === 0}
                >
                  <FileDown className="w-4 h-4" />
                  <span className="hidden sm:inline">Exportar</span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  Exportar CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  Exportar Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
                  <FileText className="w-4 h-4 text-red-500" />
                  Exportar PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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