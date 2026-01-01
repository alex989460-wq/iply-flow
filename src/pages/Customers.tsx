import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
  Upload, Phone, FileText, Download, MessageSquare, AlertTriangle
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type CustomerStatus = Database['public']['Enums']['customer_status'];

export default function Customers() {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isBulkRenewOpen, setIsBulkRenewOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [renewingCustomer, setRenewingCustomer] = useState<any | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [sendConfirmationMessage, setSendConfirmationMessage] = useState(true);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dueDateFilter, setDueDateFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [bulkRenewProgress, setBulkRenewProgress] = useState(0);
  const [isBulkRenewing, setIsBulkRenewing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    server_id: '',
    plan_id: '',
    status: 'ativa' as CustomerStatus,
    notes: '',
    due_date: '',
    custom_price: '',
    username: '',
  });

  // Import states
  const [importData, setImportData] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatusFilter, setImportStatusFilter] = useState<string[]>(['ativa', 'inativa', 'suspensa']);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete all states
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteAllProgress, setDeleteAllProgress] = useState(0);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Handle URL params for filtering from dashboard
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter) {
      setDueDateFilter(filter);
      // Clear the URL param after setting the filter
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      // Fetch customers with optimized parallel pagination
      const pageSize = 1000;
      
      // First, get total count
      const { count, error: countError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
      
      if (countError) throw countError;
      
      const totalPages = Math.ceil((count || 0) / pageSize);
      
      if (totalPages === 0) return [];
      
      // Fetch all pages in parallel
      const pagePromises = Array.from({ length: totalPages }, (_, page) =>
        supabase
          .from('customers')
          .select('*, plans(plan_name, duration_days, price), servers(server_name), creator:profiles!customers_created_by_profiles_fkey(full_name)')
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)
      );
      
      const results = await Promise.all(pagePromises);
      
      const allData: any[] = [];
      for (const result of results) {
        if (result.error) throw result.error;
        if (result.data) allData.push(...result.data);
      }
      
      return allData;
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch all profiles for user assignment
  const { data: allProfiles } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .order('full_name');
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
        created_by: user?.id,
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
    mutationFn: async ({ customerId, planId, amount, sendMessage }: { customerId: string; planId: string; amount: number; sendMessage: boolean }) => {
      const plan = plans?.find(p => p.id === planId);
      if (!plan) throw new Error('Plano não encontrado');
      
      // Always fetch the latest customer data from the backend (avoids stale cache)
      const { data: customer, error: fetchCustomerError } = await supabase
        .from('customers')
        .select('id, name, phone, due_date, username, notes, servers(server_name)')
        .eq('id', customerId)
        .single();
      if (fetchCustomerError) throw fetchCustomerError;
      if (!customer) throw new Error('Cliente não encontrado');

      // Extend from current due date (if still valid) otherwise from today
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const baseDate = new Date(`${customer.due_date}T12:00:00`);
      const anchorDate = baseDate > startOfToday ? baseDate : startOfToday;

      const newDueDate = new Date(anchorDate);
      newDueDate.setDate(newDueDate.getDate() + plan.duration_days);
      
      const { error: customerError } = await supabase
        .from('customers')
        .update({ 
          due_date: format(newDueDate, 'yyyy-MM-dd'),
          status: 'ativa',
          plan_id: planId,
        })
        .eq('id', customerId);
      if (customerError) throw customerError;
      
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          customer_id: customerId,
          amount: amount,
          method: 'pix',
          payment_date: format(new Date(), 'yyyy-MM-dd'),
          confirmed: false,
        });
      if (paymentError) throw paymentError;

      // Return payload for UI/cache updates
      const nextDueDateStr = format(newDueDate, 'yyyy-MM-dd');

      // Enviar mensagem de confirmação via WhatsApp se solicitado
      let sendMessageRequested = false;
      let departmentConfigured = false;
      let messageSent = false;
      let messageError: string | null = null;

      if (sendMessage) {
        sendMessageRequested = true;
        departmentConfigured = Boolean(zapSettings?.selected_department_id);
      }

      if (sendMessage && zapSettings?.selected_department_id) {
        const serverName = customer.servers?.server_name || '-';
        const formattedDueDate = format(newDueDate, "dd/MM/yyyy", { locale: ptBR });
        const formattedTime = format(new Date(), "HH:mm", { locale: ptBR });

        const message = `✅ Olá, *${customer.name}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:\n\n==========================\n📅 Próx. Vencimento: *${formattedDueDate} - ${formattedTime} hrs*\n💰 Valor: *${amount.toFixed(2)}*\n👤 Usuário: *${customer.username || '-'}*\n📦 Plano: *${plan.plan_name}*\n🔌 Status: *Ativo*\n💎 Obs: ${customer.notes || '-'}\n⚡: *${serverName}*\n==========================`;

        try {
          const phone = customer.phone.replace(/\D/g, '');
          const phoneWithCode = phone.startsWith('55') ? phone : `55${phone}`;

          const { data, error } = await supabase.functions.invoke('zap-responder', {
            body: {
              action: 'enviar-mensagem',
              department_id: zapSettings.selected_department_id,
              number: phoneWithCode,
              text: message,
            },
          });

          if (error) {
            messageError = error.message;
            console.error('Erro ao enviar mensagem WhatsApp:', error);
          } else if (!data?.success) {
            messageError = data?.error || 'Falha ao enviar mensagem.';
            console.error('Falha ao enviar mensagem WhatsApp:', data);
          } else {
            messageSent = true;
            console.log('Mensagem de confirmação enviada:', data);
          }
        } catch (msgError) {
          messageError = msgError instanceof Error ? msgError.message : 'Erro desconhecido ao enviar mensagem.';
          console.error('Erro ao enviar mensagem:', msgError);
        }
      }

      return {
        customerId,
        planId,
        nextDueDate: nextDueDateStr,
        sendMessageRequested,
        departmentConfigured,
        messageSent,
        messageError,
      };
    },
    onSuccess: (result) => {
      // Update cache immediately so the new due date appears right away
      if (result?.customerId && result?.nextDueDate) {
        const plan = plans?.find((p) => p.id === result.planId);
        queryClient.setQueryData(['customers'], (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((c) =>
            c.id === result.customerId
              ? {
                  ...c,
                  due_date: result.nextDueDate,
                  plan_id: result.planId,
                  status: 'ativa',
                  plans: plan
                    ? {
                        plan_name: plan.plan_name,
                        duration_days: plan.duration_days,
                        price: plan.price,
                      }
                    : c.plans,
                }
              : c
          );
        });
      }

      // Refetch in background
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });

      // Reset all renewal state
      setIsRenewOpen(false);
      setRenewingCustomer(null);
      setSelectedPlanId('');
      setCustomAmount('');
      setSendConfirmationMessage(true);

      if (result?.sendMessageRequested) {
        if (!result.departmentConfigured) {
          toast({
            title: 'Renovação registrada! Mensagem não enviada.',
            description: 'Configure um departamento nas configurações de WhatsApp para habilitar o envio.',
            variant: 'destructive',
          });
        } else if (result.messageSent) {
          toast({ title: 'Renovação registrada! Mensagem de confirmação enviada.' });
        } else {
          toast({
            title: 'Renovação registrada, mas a mensagem falhou.',
            description: result.messageError || 'Não foi possível enviar a confirmação no WhatsApp.',
            variant: 'destructive',
          });
        }
      } else {
        toast({ title: 'Renovação registrada! Pagamento pendente criado.' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao renovar plano', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({ name: '', phone: '', server_id: '', plan_id: '', status: 'ativa', notes: '', due_date: '', custom_price: '', username: '' });
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
      custom_price: customer.custom_price ? String(customer.custom_price) : '',
      username: customer.username || '',
    });
    setIsOpen(true);
  };

  const handleRenewClick = (customer: any) => {
    setRenewingCustomer(customer);
    setSelectedPlanId(customer.plan_id || '');
    const plan = plans?.find(p => p.id === customer.plan_id);
    setCustomAmount(plan ? String(plan.price) : '');
    setIsRenewOpen(true);
  };

  const handleRenewSubmit = () => {
    if (!renewingCustomer || !selectedPlanId || renewMutation.isPending) return;
    const amount = customAmount ? parseFloat(customAmount) : (plans?.find(p => p.id === selectedPlanId)?.price || 0);
    renewMutation.mutate({ 
      customerId: renewingCustomer.id, 
      planId: selectedPlanId, 
      amount, 
      sendMessage: sendConfirmationMessage 
    });
  };

  // Bulk renew handler
  const handleBulkRenew = async () => {
    if (selectedCustomerIds.size === 0 || !selectedPlanId || isBulkRenewing) return;
    
    setIsBulkRenewing(true);
    setBulkRenewProgress(0);
    
    const selectedCustomers = customers?.filter(c => selectedCustomerIds.has(c.id)) || [];
    const plan = plans?.find(p => p.id === selectedPlanId);
    if (!plan) {
      toast({ title: 'Plano não encontrado', variant: 'destructive' });
      setIsBulkRenewing(false);
      return;
    }
    
    const amount = customAmount ? parseFloat(customAmount) : plan.price;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < selectedCustomers.length; i++) {
      const customer = selectedCustomers[i];
      
      try {
        // Fetch latest customer data
        const { data: latestCustomer, error: fetchError } = await supabase
          .from('customers')
          .select('id, name, phone, due_date, username, notes, servers(server_name)')
          .eq('id', customer.id)
          .single();
        
        if (fetchError || !latestCustomer) {
          errorCount++;
          continue;
        }
        
        // Calculate new due date
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const baseDate = new Date(`${latestCustomer.due_date}T12:00:00`);
        const anchorDate = baseDate > startOfToday ? baseDate : startOfToday;
        const newDueDate = new Date(anchorDate);
        newDueDate.setDate(newDueDate.getDate() + plan.duration_days);
        
        // Update customer
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            due_date: format(newDueDate, 'yyyy-MM-dd'),
            status: 'ativa',
            plan_id: selectedPlanId,
          })
          .eq('id', customer.id);
        
        if (updateError) {
          errorCount++;
          continue;
        }
        
        // Create payment
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            customer_id: customer.id,
            amount: amount,
            method: 'pix',
            payment_date: format(new Date(), 'yyyy-MM-dd'),
            confirmed: true,
          });
        
        if (paymentError) {
          console.error('Payment error for', customer.name, paymentError);
        }
        
        // Send WhatsApp message if enabled
        if (sendConfirmationMessage && zapSettings?.selected_department_id) {
          const serverName = latestCustomer.servers?.server_name || '-';
          const formattedDueDate = format(newDueDate, "dd/MM/yyyy", { locale: ptBR });
          const formattedTime = format(new Date(), "HH:mm", { locale: ptBR });
          
          const message = `✅ Olá, *${latestCustomer.name}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:\n\n==========================\n📅 Próx. Vencimento: *${formattedDueDate} - ${formattedTime} hrs*\n💰 Valor: *${Number(amount).toFixed(2)}*\n👤 Usuário: *${latestCustomer.username || '-'}*\n📦 Plano: *${plan.plan_name}*\n🔌 Status: *Ativo*\n💎 Obs: ${latestCustomer.notes || '-'}\n⚡: *${serverName}*\n==========================`;
          
          const phone = latestCustomer.phone.replace(/\D/g, '');
          const phoneWithCode = phone.startsWith('55') ? phone : `55${phone}`;
          
          try {
            await supabase.functions.invoke('zap-responder', {
              body: {
                action: 'enviar-mensagem',
                department_id: zapSettings.selected_department_id,
                number: phoneWithCode,
                text: message,
              },
            });
          } catch (msgError) {
            console.error('Message error for', customer.name, msgError);
          }
        }
        
        successCount++;
      } catch (error) {
        console.error('Error renewing', customer.name, error);
        errorCount++;
      }
      
      setBulkRenewProgress(Math.round(((i + 1) / selectedCustomers.length) * 100));
    }
    
    // Cleanup
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    setIsBulkRenewing(false);
    setBulkRenewProgress(0);
    setIsBulkRenewOpen(false);
    setSelectedCustomerIds(new Set());
    setSelectedPlanId('');
    setCustomAmount('');
    setSendConfirmationMessage(true);
    
    toast({
      title: 'Renovação em massa concluída!',
      description: `${successCount} renovados${errorCount > 0 ? `, ${errorCount} erros` : ''}.`,
    });
  };

  const toggleSelectCustomer = (customerId: string) => {
    const newSet = new Set(selectedCustomerIds);
    if (newSet.has(customerId)) {
      newSet.delete(customerId);
    } else {
      newSet.add(customerId);
    }
    setSelectedCustomerIds(newSet);
  };

  const toggleSelectAll = () => {
    if (!paginatedCustomers) return;
    const allSelected = paginatedCustomers.every((c: any) => selectedCustomerIds.has(c.id));
    if (allSelected) {
      const newSet = new Set(selectedCustomerIds);
      paginatedCustomers.forEach((c: any) => newSet.delete(c.id));
      setSelectedCustomerIds(newSet);
    } else {
      const newSet = new Set(selectedCustomerIds);
      paginatedCustomers.forEach((c: any) => newSet.add(c.id));
      setSelectedCustomerIds(newSet);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      server_id: formData.server_id || null,
      plan_id: formData.plan_id || null,
      custom_price: formData.custom_price ? parseFloat(formData.custom_price) : null,
      username: formData.username || null,
      created_by: editingCustomer ? undefined : user?.id,
    };
    if (editingCustomer) {
      const { created_by, ...updateData } = submitData;
      updateMutation.mutate({ id: editingCustomer.id, data: updateData });
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
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = customer.name.toLowerCase().includes(searchLower) ||
                          customer.phone.includes(searchTerm) ||
                          (customer.username && customer.username.toLowerCase().includes(searchLower));
    const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;
    
    // Due date filtering
    let matchesDueDate = true;
    if (dueDateFilter !== 'all') {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      switch (dueDateFilter) {
        case 'due_today':
          matchesDueDate = customer.due_date === today;
          break;
        case 'due_tomorrow':
          matchesDueDate = customer.due_date === tomorrowStr;
          break;
        case 'overdue_1day':
          matchesDueDate = customer.due_date === yesterdayStr;
          break;
        case 'overdue':
          matchesDueDate = customer.due_date < today;
          break;
      }
    }
    
    return matchesSearch && matchesStatus && matchesDueDate;
  });

  // Pagination
  const totalFiltered = filteredCustomers?.length || 0;
  const totalPages = Math.ceil(totalFiltered / pageSize);
  const paginatedCustomers = filteredCustomers?.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (val: string) => void, value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const isOverdue = (dueDate: string) => new Date(dueDate + 'T23:59:59') < new Date();

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
      const valueIndex = header.findIndex(h => h.includes('valor') || h === 'value' || h === 'preco' || h === 'price');
      const userIndex = header.findIndex(h => h.includes('usuario') || h === 'user' || h.includes('responsavel'));
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

        // Determine status based on due date (if vencido = inativa or suspensa)
        let status: CustomerStatus = 'ativa';
        const parsedDueDate = parseDate(dueDate);
        if (parsedDueDate) {
          const dueDateObj = new Date(parsedDueDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          dueDateObj.setHours(0, 0, 0, 0);
          // Se vencido há mais de 7 dias = suspensa, senão se vencido = inativa
          const diffDays = Math.floor((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 7) {
            status = 'suspensa';
          } else if (diffDays > 0) {
            status = 'inativa';
          }
        }

        // Parse custom value - if empty, use plan price
        let customPrice: number | null = null;
        if (valueIndex >= 0 && values[valueIndex]) {
          const priceStr = values[valueIndex].replace(/[^\d.,]/g, '').replace(',', '.');
          const parsed = parseFloat(priceStr);
          if (!isNaN(parsed)) customPrice = parsed;
        }
        // If no custom price and plan matched, use plan price
        if (customPrice === null && matchedPlan) {
          customPrice = Number(matchedPlan.price);
        }

        // Get username directly from CSV
        const username = userIndex >= 0 ? values[userIndex] : '';

        parsedData.push({
          name,
          phone: phone.replace(/\D/g, ''),
          server_id: matchedServer?.id || null,
          server_name: serverName,
          plan_id: matchedPlan?.id || null,
          plan_name: planName,
          custom_price: customPrice,
          username: username || null,
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
    // Filter data based on selected status filters
    const dataToImport = importStatusFilter.length === 3
      ? importData 
      : importData.filter(r => importStatusFilter.includes(r.status));

    if (dataToImport.length === 0) {
      toast({ title: 'Nenhum dado para importar', variant: 'destructive' });
      return;
    }

    setIsImporting(true);
    let imported = 0;
    let errors = 0;
    let serversCreated = 0;

    // Cache for newly created servers to avoid duplicates
    const serverCache: Record<string, string> = {};

    try {
      // First, create all unique servers that don't exist
      const uniqueServerNames = [...new Set(dataToImport.map(row => row.server_name?.trim()).filter(Boolean))];
      
      for (const serverName of uniqueServerNames) {
        // Check if server already exists in current list
        const existingServer = servers?.find(s => 
          s.server_name.toLowerCase() === serverName.toLowerCase()
        );
        
        if (existingServer) {
          serverCache[serverName.toLowerCase()] = existingServer.id;
        } else {
          // Create new server
          const { data: newServer, error: serverError } = await supabase
            .from('servers')
            .insert({
              server_name: serverName,
              host: serverName.toLowerCase().replace(/\s+/g, '-'),
              status: 'online',
            })
            .select('id')
            .single();
          
          if (!serverError && newServer) {
            serverCache[serverName.toLowerCase()] = newServer.id;
            serversCreated++;
          }
        }
      }

      // Refresh servers list after creating new ones
      await queryClient.invalidateQueries({ queryKey: ['servers'] });

      const totalToImport = dataToImport.length;
      let processedCount = 0;

      for (const row of dataToImport) {
        const { server_name, plan_name, ...customerData } = row;
        
        // Use cached server_id if server was created or matched
        if (server_name && serverCache[server_name.toLowerCase()]) {
          customerData.server_id = serverCache[server_name.toLowerCase()];
        }
        
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

        // Set created_by to current user for import tracking
        customerData.created_by = user?.id;

        const { error } = await supabase.from('customers').insert(customerData);
        
        if (error) {
          console.error('Error importing customer:', row.name, error);
          errors++;
        } else {
          imported++;
        }

        // Update progress
        processedCount++;
        setImportProgress(Math.round((processedCount / totalToImport) * 100));
      }

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsImportOpen(false);
      setImportData([]);
      setImportStatusFilter(['ativa', 'inativa', 'suspensa']);
      
      const serverMsg = serversCreated > 0 ? ` ${serversCreated} servidor(es) criado(s).` : '';
      toast({ 
        title: 'Importação concluída!', 
        description: `${imported} clientes importados.${serverMsg} ${errors > 0 ? `${errors} erros.` : ''}`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro na importação',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const downloadTemplate = () => {
    const template = 'nome;telefone;usuario;servidor;plano;valor;vencimento;cadastro;status\n' +
      'João Silva;11999998888;joao.silva;NATV;Mensal;35.00;31/01/2025;01/01/2025;ativa\n' +
      'Maria Santos;11999997777;maria.santos;NATV;Anual;280.00;31/12/2025;15/01/2025;ativa\n' +
      'Carlos Oliveira;11999996666;carlos123;NATV;Trimestral;;30/03/2025;01/01/2025;ativa';
    
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'modelo_importacao_clientes.csv';
    link.click();
  };

  const handleDeleteAll = async () => {
    if (!customers || customers.length === 0 || isDeletingAll) return;
    
    setIsDeletingAll(true);
    setDeleteAllProgress(0);
    
    const totalCustomers = customers.length;
    let deleted = 0;
    let errors = 0;
    
    // Delete in batches of 50 for efficiency
    const batchSize = 50;
    const customerIds = customers.map(c => c.id);
    
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('customers')
        .delete()
        .in('id', batch);
      
      if (error) {
        console.error('Erro ao excluir lote:', error);
        errors += batch.length;
      } else {
        deleted += batch.length;
      }
      
      setDeleteAllProgress(Math.round(((i + batch.length) / totalCustomers) * 100));
    }
    
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    setIsDeletingAll(false);
    setIsDeleteAllOpen(false);
    setDeleteAllProgress(0);
    setSelectedCustomerIds(new Set());
    
    if (errors > 0) {
      toast({
        title: 'Exclusão parcial',
        description: `${deleted} clientes excluídos. ${errors} erros.`,
        variant: 'destructive',
      });
    } else {
      toast({ title: `${deleted} clientes excluídos com sucesso!` });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Clientes</h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">Gerencie seus clientes IPTV</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <AlertDialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!customers || customers.length === 0}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Todos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    Excluir todos os clientes?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é irreversível. Todos os <strong>{customers?.length || 0}</strong> clientes serão excluídos permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                
                {isDeletingAll ? (
                  <div className="space-y-3 py-4">
                    <div className="flex items-center justify-between text-sm">
                      <span>Excluindo clientes...</span>
                      <span className="font-medium">{deleteAllProgress}%</span>
                    </div>
                    <Progress value={deleteAllProgress} className="h-3" />
                  </div>
                ) : (
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAll}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sim, excluir todos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                )}
              </AlertDialogContent>
            </AlertDialog>

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
                      <div className="space-y-3">
                        <div className="p-3 bg-secondary/30 rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            <strong>{importData.length}</strong> clientes no arquivo
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Importar clientes com status:</Label>
                          <div className="flex flex-wrap gap-3">
                            {[
                              { value: 'ativa', label: 'Ativos' },
                              { value: 'inativa', label: 'Inativos' },
                              { value: 'suspensa', label: 'Suspensos' },
                            ].map((status) => (
                              <label key={status.value} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={importStatusFilter.includes(status.value)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setImportStatusFilter([...importStatusFilter, status.value]);
                                    } else {
                                      setImportStatusFilter(importStatusFilter.filter(s => s !== status.value));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-border bg-input accent-primary"
                                />
                                <span className="text-sm">{status.label}</span>
                              </label>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {importStatusFilter.length === 3 
                              ? `${importData.length} clientes serão importados`
                              : importStatusFilter.length === 0
                              ? 'Selecione pelo menos um status'
                              : `${importData.filter(r => importStatusFilter.includes(r.status)).length} clientes serão importados`
                            }
                          </p>
                        </div>
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
                            {(importStatusFilter.length === 3 ? importData : importData.filter(r => importStatusFilter.includes(r.status))).slice(0, 10).map((row, idx) => (
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
                        {(importStatusFilter.length === 3 ? importData : importData.filter(r => importStatusFilter.includes(r.status))).length > 10 && (
                          <p className="text-sm text-muted-foreground text-center mt-2">
                            ... e mais {(importStatusFilter.length === 3 ? importData : importData.filter(r => importStatusFilter.includes(r.status))).length - 10} clientes
                          </p>
                        )}
                      </div>

                      {isImporting ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>Importando clientes...</span>
                            <span className="font-medium">{importProgress}%</span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                            <div 
                              className="bg-primary h-full transition-all duration-300 ease-out"
                              style={{ width: `${importProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <Button 
                          onClick={executeImport} 
                          className="w-full"
                          disabled={importStatusFilter.length === 0 || (importStatusFilter.length === 3 ? importData : importData.filter(r => importStatusFilter.includes(r.status))).length === 0}
                        >
                          Importar {(importStatusFilter.length === 3 ? importData : importData.filter(r => importStatusFilter.includes(r.status))).length} Clientes
                        </Button>
                      )}
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
                        onValueChange={(value) => {
                          const plan = plans?.find(p => p.id === value);
                          setFormData({ 
                            ...formData, 
                            plan_id: value,
                            custom_price: formData.custom_price || (plan ? String(plan.price) : '')
                          });
                        }}
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
                    <div className="space-y-2">
                      <Label>Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.custom_price}
                        onChange={(e) => setFormData({ ...formData, custom_price: e.target.value })}
                        placeholder={formData.plan_id ? `Padrão: R$${Number(plans?.find(p => p.id === formData.plan_id)?.price || 0).toFixed(2)}` : 'Selecione um plano'}
                        className="bg-secondary/50"
                      />
                      <p className="text-xs text-muted-foreground">
                        Deixe vazio para usar o valor do plano.
                      </p>
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
                            selected={formData.due_date ? new Date(formData.due_date + 'T12:00:00') : undefined}
                            onSelect={(date) => setFormData({ 
                              ...formData, 
                              due_date: date ? format(date, 'yyyy-MM-dd') : '' 
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
                    <div className="space-y-2">
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
                    <div className="space-y-2">
                      <Label>Usuário (login IPTV)</Label>
                      <Input
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        placeholder="Nome de usuário do cliente"
                        className="bg-secondary/50"
                      />
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
        <Dialog open={isRenewOpen} onOpenChange={(open) => { setIsRenewOpen(open); if (!open) { setRenewingCustomer(null); setSelectedPlanId(''); setCustomAmount(''); } }}>
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
                <Select 
                  value={selectedPlanId} 
                  onValueChange={(value) => {
                    setSelectedPlanId(value);
                    const plan = plans?.find(p => p.id === value);
                    if (plan) setCustomAmount(String(plan.price));
                  }}
                >
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
              <div className="space-y-2">
                <Label>Valor do Pagamento (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Valor personalizado"
                  className="bg-secondary/50"
                />
                <p className="text-xs text-muted-foreground">
                  Edite para cobrar um valor diferente do plano.
                </p>
              </div>
              
              {/* Checkbox para enviar mensagem de confirmação */}
              <div className="flex items-start space-x-3 p-3 bg-secondary/30 rounded-lg">
                <Checkbox
                  id="sendConfirmation"
                  checked={sendConfirmationMessage}
                  onCheckedChange={(checked) => setSendConfirmationMessage(checked === true)}
                  disabled={!zapSettings?.selected_department_id}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="sendConfirmation"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Enviar confirmação via WhatsApp
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {zapSettings?.selected_department_id 
                      ? 'Envia mensagem com dados da renovação para o cliente.'
                      : 'Configure o departamento do ZapResponder primeiro.'}
                  </p>
                </div>
              </div>

              {selectedPlanId && customAmount && (
                <div className="p-3 bg-secondary/30 rounded-lg text-sm">
                  <p className="text-muted-foreground">
                    Um pagamento pendente de <strong>R${Number(customAmount).toFixed(2)}</strong> será criado.
                    {sendConfirmationMessage && zapSettings?.selected_department_id && (
                      <span className="block mt-1 text-primary">
                        ✓ Mensagem de confirmação será enviada
                      </span>
                    )}
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Buscar por nome, telefone ou usuário..."
              className="pl-10 bg-secondary/50"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => handleFilterChange(setStatusFilter, v)}>
            <SelectTrigger className="w-full sm:w-40 bg-secondary/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="ativa">Ativas</SelectItem>
              <SelectItem value="inativa">Inativas</SelectItem>
              <SelectItem value="suspensa">Suspensas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dueDateFilter} onValueChange={(v) => handleFilterChange(setDueDateFilter, v)}>
            <SelectTrigger className="w-full sm:w-48 bg-secondary/50">
              <SelectValue placeholder="Vencimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Vencimentos</SelectItem>
              <SelectItem value="due_today">Vencem Hoje</SelectItem>
              <SelectItem value="due_tomorrow">Vencem Amanhã</SelectItem>
              <SelectItem value="overdue_1day">Vencidas 1 Dia</SelectItem>
              <SelectItem value="overdue">Todas Vencidas</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Mostrar</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-20 bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground whitespace-nowrap">Registros</span>
          </div>
          {selectedCustomerIds.size > 0 && (
            <Button 
              variant="glow" 
              onClick={() => setIsBulkRenewOpen(true)}
              disabled={isBulkRenewing}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Renovar {selectedCustomerIds.size} selecionado(s)
            </Button>
          )}
        </div>

        {/* Bulk Renew Dialog */}
        <Dialog open={isBulkRenewOpen} onOpenChange={(open) => { if (!isBulkRenewing) setIsBulkRenewOpen(open); }}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Renovar {selectedCustomerIds.size} Clientes</DialogTitle>
              <DialogDescription>
                Renove todos os clientes selecionados de uma vez.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={selectedPlanId} onValueChange={(value) => {
                  setSelectedPlanId(value);
                  const plan = plans?.find(p => p.id === value);
                  setCustomAmount(plan ? String(plan.price) : '');
                }}>
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
              <div className="space-y-2">
                <Label>Valor do Pagamento (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Valor personalizado"
                  className="bg-secondary/50"
                />
              </div>
              
              <div className="flex items-start space-x-3 p-3 bg-secondary/30 rounded-lg">
                <Checkbox
                  id="bulkSendConfirmation"
                  checked={sendConfirmationMessage}
                  onCheckedChange={(checked) => setSendConfirmationMessage(checked === true)}
                  disabled={!zapSettings?.selected_department_id}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="bulkSendConfirmation"
                    className="text-sm font-medium leading-none flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Enviar confirmação via WhatsApp
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {zapSettings?.selected_department_id 
                      ? 'Envia mensagem para cada cliente.'
                      : 'Configure o departamento do ZapResponder primeiro.'}
                  </p>
                </div>
              </div>

              {isBulkRenewing ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Renovando clientes...</span>
                    <span className="font-medium">{bulkRenewProgress}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300 ease-out"
                      style={{ width: `${bulkRenewProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <Button 
                  onClick={handleBulkRenew} 
                  className="w-full"
                  disabled={!selectedPlanId}
                >
                  Confirmar Renovação em Massa
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>

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
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={paginatedCustomers?.length > 0 && paginatedCustomers.every((c: any) => selectedCustomerIds.has(c.id))}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCustomers?.map((customer: any) => (
                    <TableRow key={customer.id} className="table-row-hover border-border">
                      <TableCell>
                        <Checkbox 
                          checked={selectedCustomerIds.has(customer.id)}
                          onCheckedChange={() => toggleSelectCustomer(customer.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="font-mono text-sm">{customer.phone}</TableCell>
                      <TableCell>{customer.servers?.server_name || '-'}</TableCell>
                      <TableCell>{customer.plans?.plan_name || '-'}</TableCell>
                      <TableCell className="font-medium text-primary">
                        R${Number(customer.custom_price || customer.plans?.price || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          isOverdue(customer.due_date) && customer.status === 'ativa' && "text-destructive"
                        )}>
                          {format(new Date(customer.due_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {customer.username || '-'}
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

          {/* Pagination */}
          {totalFiltered > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Mostrando {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalFiltered)} de {totalFiltered} registros
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  Primeira
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm px-2">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Última
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}