import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
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
import { 
  Plus, Pencil, Trash2, Loader2, Users, RefreshCw, Search, CalendarIcon,
  Upload, Phone, FileText, Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type CustomerStatus = Database['public']['Enums']['customer_status'];

export default function Customers() {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [renewingCustomer, setRenewingCustomer] = useState<any | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    server_id: '',
    plan_id: '',
    status: 'ativa' as CustomerStatus,
    notes: '',
    due_date: '',
  });

  // Import states
  const [importData, setImportData] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*, plans(plan_name, duration_days, price), servers(server_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('servers').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*');
      if (error) throw error;
      return data;
    },
  });

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

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      let dueDate: string;
      
      if (data.due_date) {
        dueDate = data.due_date;
      } else {
        const plan = plans?.find(p => p.id === data.plan_id);
        const dueDateObj = new Date();
        dueDateObj.setDate(dueDateObj.getDate() + (plan?.duration_days || 30));
        dueDate = dueDateObj.toISOString().split('T')[0];
      }
      
      const { due_date, ...restData } = data;
      
      const { error } = await supabase.from('customers').insert({
        ...restData,
        start_date: new Date().toISOString().split('T')[0],
        due_date: dueDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Cliente criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar cliente', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const updateData: any = { ...data };
      if (data.due_date) {
        updateData.due_date = data.due_date;
      }
      const { due_date, ...restData } = updateData;
      const finalData = data.due_date ? { ...restData, due_date: data.due_date } : restData;
      
      const { error } = await supabase.from('customers').update(finalData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Cliente atualizado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar cliente', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Cliente excluído com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir cliente', description: error.message, variant: 'destructive' });
    },
  });

  const renewMutation = useMutation({
    mutationFn: async ({ customerId, planId }: { customerId: string; planId: string }) => {
      const plan = plans?.find(p => p.id === planId);
      if (!plan) throw new Error('Plano não encontrado');
      
      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + plan.duration_days);
      
      const { error: customerError } = await supabase
        .from('customers')
        .update({ 
          due_date: newDueDate.toISOString().split('T')[0],
          status: 'ativa',
          plan_id: planId,
        })
        .eq('id', customerId);
      if (customerError) throw customerError;
      
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          customer_id: customerId,
          amount: plan.price,
          method: 'pix',
          payment_date: new Date().toISOString().split('T')[0],
          confirmed: false,
        });
      if (paymentError) throw paymentError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsRenewOpen(false);
      setRenewingCustomer(null);
      setSelectedPlanId('');
      toast({ title: 'Renovação registrada! Pagamento pendente criado.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao renovar plano', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', phone: '', server_id: '', plan_id: '', status: 'ativa', notes: '', due_date: '' });
    setEditingCustomer(null);
  };

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      server_id: customer.server_id || '',
      plan_id: customer.plan_id || '',
      status: customer.status,
      notes: customer.notes || '',
      due_date: customer.due_date || '',
    });
    setIsOpen(true);
  };

  const handleRenewClick = (customer: any) => {
    setRenewingCustomer(customer);
    setSelectedPlanId(customer.plan_id || '');
    setIsRenewOpen(true);
  };

  const handleRenewSubmit = () => {
    if (!renewingCustomer || !selectedPlanId) return;
    renewMutation.mutate({ customerId: renewingCustomer.id, planId: selectedPlanId });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      server_id: formData.server_id || null,
      plan_id: formData.plan_id || null,
    };
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const getStatusBadge = (status: CustomerStatus) => {
    const styles = {
      ativa: 'badge-online',
      inativa: 'badge-offline',
      suspensa: 'badge-maintenance',
    };
    const labels = {
      ativa: 'Ativa',
      inativa: 'Inativa',
      suspensa: 'Suspensa',
    };
    return <span className={styles[status]}>{labels[status]}</span>;
  };

  const filteredCustomers = customers?.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          customer.phone.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();

  const openWhatsApp = (phone: string) => {
    const formattedPhone = phone.replace(/\D/g, '');
    const phoneWithCode = formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`;
    window.open(`https://wa.me/${phoneWithCode}`, '_blank');
  };

  // ============ Import Functions ============
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({ title: 'Arquivo vazio ou inválido', variant: 'destructive' });
        return;
      }

      // Parse CSV header
      const header = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
      
      // Expected columns
      const nameIndex = header.findIndex(h => h.includes('nome') || h === 'name');
      const phoneIndex = header.findIndex(h => h.includes('telefone') || h.includes('phone') || h.includes('whatsapp'));
      const serverIndex = header.findIndex(h => h.includes('servidor') || h === 'server');
      const planIndex = header.findIndex(h => h.includes('plano') || h === 'plan');
      const dueDateIndex = header.findIndex(h => h.includes('vencimento') || h.includes('due') || h.includes('expira'));
      const startDateIndex = header.findIndex(h => h.includes('cadastro') || h.includes('start') || h.includes('inicio'));
      const statusIndex = header.findIndex(h => h.includes('status'));

      if (nameIndex === -1 || phoneIndex === -1) {
        toast({ 
          title: 'Colunas obrigatórias não encontradas', 
          description: 'O arquivo deve ter colunas "nome" e "telefone".',
          variant: 'destructive',
        });
        return;
      }

      const parsedData: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/[,;]/).map(v => v.trim().replace(/^["']|["']$/g, ''));
        
        if (values.length < 2) continue;

        const name = values[nameIndex] || '';
        const phone = values[phoneIndex] || '';
        
        if (!name || !phone) continue;

        // Try to match server and plan by name
        const serverName = serverIndex >= 0 ? values[serverIndex] : '';
        const planName = planIndex >= 0 ? values[planIndex] : '';
        
        const matchedServer = servers?.find(s => 
          s.server_name.toLowerCase().includes(serverName.toLowerCase()) ||
          serverName.toLowerCase().includes(s.server_name.toLowerCase())
        );
        
        const matchedPlan = plans?.find(p => 
          p.plan_name.toLowerCase().includes(planName.toLowerCase()) ||
          planName.toLowerCase().includes(p.plan_name.toLowerCase())
        );

        let dueDate = dueDateIndex >= 0 ? values[dueDateIndex] : '';
        let startDate = startDateIndex >= 0 ? values[startDateIndex] : '';
        
        // Parse date formats (DD/MM/YYYY or YYYY-MM-DD)
        const parseDate = (dateStr: string) => {
          if (!dateStr) return null;
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
          return dateStr;
        };

        let status: CustomerStatus = 'ativa';
        if (statusIndex >= 0) {
          const statusValue = values[statusIndex]?.toLowerCase();
          if (statusValue?.includes('inativ')) status = 'inativa';
          else if (statusValue?.includes('suspen')) status = 'suspensa';
        }

        parsedData.push({
          name,
          phone: phone.replace(/\D/g, ''),
          server_id: matchedServer?.id || null,
          server_name: serverName,
          plan_id: matchedPlan?.id || null,
          plan_name: planName,
          due_date: parseDate(dueDate) || null,
          start_date: parseDate(startDate) || new Date().toISOString().split('T')[0],
          status,
        });
      }

      setImportData(parsedData);
      toast({ 
        title: 'Arquivo processado!', 
        description: `${parsedData.length} clientes prontos para importar.`,
      });
    };

    reader.readAsText(file);
  };

  const executeImport = async () => {
    if (importData.length === 0) {
      toast({ title: 'Nenhum dado para importar', variant: 'destructive' });
      return;
    }

    setIsImporting(true);
    let imported = 0;
    let errors = 0;

    try {
      for (const row of importData) {
        const { server_name, plan_name, ...customerData } = row;
        
        // Calculate due_date if not provided
        if (!customerData.due_date && customerData.plan_id) {
          const plan = plans?.find(p => p.id === customerData.plan_id);
          if (plan) {
            const dueDateObj = new Date();
            dueDateObj.setDate(dueDateObj.getDate() + plan.duration_days);
            customerData.due_date = dueDateObj.toISOString().split('T')[0];
          }
        }
        
        // Default due_date if still not set
        if (!customerData.due_date) {
          const dueDateObj = new Date();
          dueDateObj.setDate(dueDateObj.getDate() + 30);
          customerData.due_date = dueDateObj.toISOString().split('T')[0];
        }

        const { error } = await supabase.from('customers').insert(customerData);
        
        if (error) {
          console.error('Error importing customer:', row.name, error);
          errors++;
        } else {
          imported++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsImportOpen(false);
      setImportData([]);
      
      toast({ 
        title: 'Importação concluída!', 
        description: `${imported} clientes importados. ${errors > 0 ? `${errors} erros.` : ''}`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro na importação',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = 'nome;telefone;servidor;plano;vencimento;cadastro;status\n' +
      'João Silva;11999998888;Servidor 1;Mensal;31/01/2025;01/01/2025;ativa\n' +
      'Maria Santos;11999997777;Servidor 2;Anual;31/12/2025;15/01/2025;ativa';
    
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'modelo_importacao_clientes.csv';
    link.click();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Clientes</h1>
            <p className="text-muted-foreground mt-1">Gerencie seus clientes IPTV</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="w-4 h-4 mr-2" />
                  Importar
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Importar Clientes</DialogTitle>
                  <DialogDescription>
                    Importe clientes a partir de um arquivo CSV.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={downloadTemplate}>
                      <Download className="w-4 h-4 mr-2" />
                      Baixar Modelo
                    </Button>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <FileText className="w-4 h-4 mr-2" />
                      Selecionar Arquivo
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  {importData.length > 0 && (
                    <>
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          <strong>{importData.length}</strong> clientes prontos para importar
                        </p>
                      </div>

                      <div className="overflow-x-auto max-h-60">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nome</TableHead>
                              <TableHead>Telefone</TableHead>
                              <TableHead>Servidor</TableHead>
                              <TableHead>Plano</TableHead>
                              <TableHead>Vencimento</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {importData.slice(0, 10).map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{row.name}</TableCell>
                                <TableCell>{row.phone}</TableCell>
                                <TableCell>
                                  {row.server_id ? (
                                    <span className="text-success">✓ {row.server_name}</span>
                                  ) : (
                                    <span className="text-muted-foreground">{row.server_name || '-'}</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {row.plan_id ? (
                                    <span className="text-success">✓ {row.plan_name}</span>
                                  ) : (
                                    <span className="text-muted-foreground">{row.plan_name || '-'}</span>
                                  )}
                                </TableCell>
                                <TableCell>{row.due_date || 'Auto'}</TableCell>
                                <TableCell>{row.status}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {importData.length > 10 && (
                          <p className="text-sm text-muted-foreground text-center mt-2">
                            ... e mais {importData.length - 10} clientes
                          </p>
                        )}
                      </div>

                      <Button 
                        onClick={executeImport} 
                        className="w-full"
                        disabled={isImporting}
                      >
                        {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Importar {importData.length} Clientes
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button variant="glow">
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
                  <DialogDescription>
                    {editingCustomer ? 'Atualize as informações do cliente.' : 'Preencha os dados do novo cliente.'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {editingCustomer && (
                      <div className="col-span-2 p-3 bg-secondary/30 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          <strong>Data de Cadastro:</strong>{' '}
                          {format(new Date(editingCustomer.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                    <div className="space-y-2 col-span-2">
                      <Label>Nome</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Nome completo"
                        required
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Telefone (WhatsApp)</Label>
                      <Input
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="5511999999999"
                        required
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Servidor</Label>
                      <Select
                        value={formData.server_id}
                        onValueChange={(value) => setFormData({ ...formData, server_id: value })}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {servers?.map((server) => (
                            <SelectItem key={server.id} value={server.id}>
                              {server.server_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Plano</Label>
                      <Select
                        value={formData.plan_id}
                        onValueChange={(value) => setFormData({ ...formData, plan_id: value })}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {plans?.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.plan_name} - R${Number(plan.price).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Data de Vencimento</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal bg-secondary/50",
                              !formData.due_date && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.due_date ? (
                              format(new Date(formData.due_date + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>{editingCustomer ? 'Alterar vencimento' : 'Calculado pelo plano'}</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.due_date ? new Date(formData.due_date + 'T00:00:00') : undefined}
                            onSelect={(date) => setFormData({ 
                              ...formData, 
                              due_date: date ? date.toISOString().split('T')[0] : '' 
                            })}
                            initialFocus
                            className="p-3 pointer-events-auto"
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                      <p className="text-xs text-muted-foreground">
                        {editingCustomer 
                          ? 'Deixe em branco para manter a data atual.' 
                          : 'Deixe em branco para calcular automaticamente pelo plano.'}
                      </p>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Status</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value: CustomerStatus) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativa">Ativa</SelectItem>
                          <SelectItem value="inativa">Inativa</SelectItem>
                          <SelectItem value="suspensa">Suspensa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Observações</Label>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Notas opcionais..."
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    {editingCustomer ? 'Atualizar' : 'Criar'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Renew Dialog */}
        <Dialog open={isRenewOpen} onOpenChange={(open) => { setIsRenewOpen(open); if (!open) { setRenewingCustomer(null); setSelectedPlanId(''); } }}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle>Renovar Plano</DialogTitle>
              <DialogDescription>
                Selecione o plano para renovação de {renewingCustomer?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.plan_name} - R${Number(plan.price).toFixed(2)} ({plan.duration_days} dias)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPlanId && (
                <div className="p-3 bg-secondary/30 rounded-lg text-sm">
                  <p className="text-muted-foreground">
                    Um pagamento pendente de <strong>R${Number(plans?.find(p => p.id === selectedPlanId)?.price).toFixed(2)}</strong> será criado.
                  </p>
                </div>
              )}
              <Button 
                onClick={handleRenewSubmit} 
                className="w-full"
                disabled={!selectedPlanId || renewMutation.isPending}
              >
                {renewMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar Renovação
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tabs */}
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              className="pl-10 bg-secondary/50"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-secondary/50">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativa">Ativas</SelectItem>
              <SelectItem value="inativa">Inativas</SelectItem>
              <SelectItem value="suspensa">Suspensas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="glass-card border-border/50">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredCustomers?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Users className="w-12 h-12 mb-4 opacity-50" />
                <p>Nenhum cliente encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers?.map((customer) => (
                    <TableRow key={customer.id} className="table-row-hover border-border">
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="font-mono text-sm">{customer.phone}</TableCell>
                      <TableCell>{customer.servers?.server_name || '-'}</TableCell>
                      <TableCell>{customer.plans?.plan_name || '-'}</TableCell>
                      <TableCell>
                        <span className={cn(
                          isOverdue(customer.due_date) && customer.status === 'ativa' && "text-destructive"
                        )}>
                          {new Date(customer.due_date).toLocaleDateString('pt-BR')}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(customer.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Abrir WhatsApp"
                            onClick={() => openWhatsApp(customer.phone)}
                          >
                            <Phone className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Renovar plano"
                            onClick={() => handleRenewClick(customer)}
                            disabled={renewMutation.isPending}
                          >
                            <RefreshCw className={cn("w-4 h-4", renewMutation.isPending && "animate-spin")} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(customer)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(customer.id)}
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
      </div>
    </DashboardLayout>
  );
}