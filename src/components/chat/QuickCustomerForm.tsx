import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, X, UserPlus } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { triggerWelcomeBot } from '@/hooks/useBotTriggers';

type CustomerStatus = Database['public']['Enums']['customer_status'];

interface QuickCustomerFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialPhone?: string;
}

export default function QuickCustomerForm({ onSuccess, onCancel, initialPhone = '' }: QuickCustomerFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: initialPhone,
    username: '',
    server_id: '',
    plan_id: '',
    status: 'ativa' as CustomerStatus,
    notes: '',
    custom_price: '',
    extra_months: '0',
  });

  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('servers').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const plan = plans.find(p => p.id === data.plan_id);
      const durationDays = plan?.duration_days || 30;
      const dueDateObj = new Date();
      // Use calendar months for standard durations
      if (durationDays === 30) {
        dueDateObj.setMonth(dueDateObj.getMonth() + 1);
      } else if (durationDays === 90) {
        dueDateObj.setMonth(dueDateObj.getMonth() + 3);
      } else if (durationDays === 180) {
        dueDateObj.setMonth(dueDateObj.getMonth() + 6);
      } else if (durationDays === 365) {
        dueDateObj.setFullYear(dueDateObj.getFullYear() + 1);
      } else {
        dueDateObj.setDate(dueDateObj.getDate() + durationDays);
      }
      const dueDate = dueDateObj.toISOString().split('T')[0];

      const insertData: any = {
        name: data.name.trim(),
        phone: data.phone.replace(/\D/g, ''),
        username: data.username.trim() || null,
        status: data.status,
        notes: data.notes.trim() || null,
        start_date: new Date().toISOString().split('T')[0],
        due_date: dueDate,
        created_by: user?.id,
      };

      if (data.server_id) insertData.server_id = data.server_id;
      if (data.plan_id) insertData.plan_id = data.plan_id;
      if (data.custom_price) insertData.custom_price = parseFloat(data.custom_price);
      if (data.extra_months && parseInt(data.extra_months) > 0) {
        insertData.extra_months = parseInt(data.extra_months);
      }

      const { data: newCustomer, error } = await supabase
        .from('customers')
        .insert(insertData)
        .select('id')
        .single();
      if (error) throw error;

      // Criar pagamento automático para o novo cliente
      const paymentAmount = data.custom_price 
        ? parseFloat(data.custom_price) 
        : (plan?.price || 0);
      
      if (paymentAmount > 0 && newCustomer?.id) {
        const { error: paymentError } = await supabase.from('payments').insert({
          customer_id: newCustomer.id,
          amount: paymentAmount,
          payment_date: new Date().toISOString().split('T')[0],
          method: 'pix',
          confirmed: true,
        });
        if (paymentError) {
          console.error('Erro ao criar pagamento:', paymentError);
        }
      }

      return {
        customer: {
          id: newCustomer.id,
          name: insertData.name,
          phone: insertData.phone,
          due_date: dueDate,
          plan_id: insertData.plan_id,
        },
      };
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-search'] });
      toast.success('Cliente cadastrado com sucesso!');

      if (user?.id && result?.customer) {
        (async () => {
          const res = await triggerWelcomeBot(user.id, result.customer, plans as any);
          if (!res.success) {
            toast.error(res.error || 'Não foi possível iniciar o bot de boas-vindas.');
          }
        })();
      }
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error('Erro ao cadastrar: ' + error.message);
    },
  });

  const validatePhone = (phone: string): { valid: boolean; message: string } => {
    const digitsOnly = phone.replace(/\D/g, '');
    
    // Mínimo de 10 dígitos (DDI + número) e máximo de 15 (padrão E.164)
    if (digitsOnly.length < 10) {
      return { valid: false, message: 'Telefone incompleto. Insira DDI + número (ex: 5511999999999 ou 33619827368)' };
    }
    
    if (digitsOnly.length > 15) {
      return { valid: false, message: 'Telefone com dígitos a mais. Máximo 15 dígitos.' };
    }
    
    // Validação específica para Brasil (55)
    if (digitsOnly.startsWith('55')) {
      if (digitsOnly.length < 12 || digitsOnly.length > 13) {
        return { valid: false, message: 'Telefone brasileiro deve ter 12-13 dígitos (55 + DDD + número)' };
      }
      const ddd = parseInt(digitsOnly.substring(2, 4), 10);
      if (ddd < 11 || ddd > 99) {
        return { valid: false, message: 'DDD inválido. Verifique o código de área.' };
      }
    }
    
    return { valid: true, message: '' };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!formData.phone.trim()) {
      toast.error('Telefone é obrigatório');
      return;
    }
    
    // Validar telefone completo
    const phoneValidation = validatePhone(formData.phone);
    if (!phoneValidation.valid) {
      toast.error(phoneValidation.message);
      return;
    }
    
    createMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Novo Cliente
        </h3>
        {onCancel && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <Label htmlFor="name" className="text-xs">Nome *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Nome do cliente"
            className="h-8 text-sm"
          />
        </div>

        <div>
          <Label htmlFor="phone" className="text-xs">Telefone *</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="(00) 00000-0000"
            className="h-8 text-sm"
          />
        </div>

        <div>
          <Label htmlFor="username" className="text-xs">Usuário</Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
            placeholder="Usuário do sistema"
            className="h-8 text-sm"
          />
        </div>

        <div>
          <Label htmlFor="server" className="text-xs">Servidor</Label>
          <Select
            value={formData.server_id}
            onValueChange={(v) => setFormData(prev => ({ ...prev, server_id: v }))}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecione o servidor" />
            </SelectTrigger>
            <SelectContent>
              {servers.map((server) => (
                <SelectItem key={server.id} value={server.id}>
                  {server.server_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="plan" className="text-xs">Plano</Label>
          <Select
            value={formData.plan_id}
            onValueChange={(v) => setFormData(prev => ({ ...prev, plan_id: v }))}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecione o plano" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.plan_name} - R$ {plan.price?.toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="custom_price" className="text-xs">Preço personalizado</Label>
          <Input
            id="custom_price"
            type="number"
            step="0.01"
            value={formData.custom_price}
            onChange={(e) => setFormData(prev => ({ ...prev, custom_price: e.target.value }))}
            placeholder="Deixe vazio para usar preço do plano"
            className="h-8 text-sm"
          />
        </div>

        <div>
          <Label htmlFor="extra_months" className="text-xs">Meses extras (renovação incorreta)</Label>
          <Input
            id="extra_months"
            type="number"
            min="0"
            max="12"
            value={formData.extra_months}
            onChange={(e) => setFormData(prev => ({ ...prev, extra_months: e.target.value }))}
            placeholder="0"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            Informe se o cliente possui meses adicionais já pagos.
          </p>
        </div>

        <div>
          <Label htmlFor="notes" className="text-xs">Observações</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Observações"
            className="text-sm min-h-[60px]"
          />
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full h-8 text-sm" 
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : null}
        Cadastrar Cliente
      </Button>
    </form>
  );
}
