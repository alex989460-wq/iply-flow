import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, User, Calendar, CreditCard, CheckCircle, Phone, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PaymentMethod = 'pix' | 'dinheiro' | 'transferencia';

interface Customer {
  id: string;
  name: string;
  phone: string;
  status: 'ativa' | 'inativa' | 'suspensa';
  due_date: string;
  custom_price: number | null;
  plan: {
    id: string;
    plan_name: string;
    price: number;
    duration_days: number;
  } | null;
}

export default function QuickRenewalPanel() {
  const [searchPhone, setSearchPhone] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const queryClient = useQueryClient();

  // Search customers by phone
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['customer-search', searchPhone],
    queryFn: async () => {
      if (searchPhone.length < 4) return [];
      
      const normalizedPhone = searchPhone.replace(/\D/g, '');
      
      const { data, error } = await supabase
        .from('customers')
        .select(`
          id,
          name,
          phone,
          status,
          due_date,
          custom_price,
          plan:plans(id, plan_name, price, duration_days)
        `)
        .ilike('phone', `%${normalizedPhone}%`)
        .limit(5);

      if (error) throw error;
      return data as Customer[];
    },
    enabled: searchPhone.length >= 4,
  });

  // Register payment mutation
  const registerPayment = useMutation({
    mutationFn: async (customer: Customer) => {
      const amount = customer.custom_price ?? customer.plan?.price ?? 0;
      
      const { error } = await supabase
        .from('payments')
        .insert({
          customer_id: customer.id,
          amount,
          method: paymentMethod,
          confirmed: true,
          payment_date: new Date().toISOString().split('T')[0],
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Pagamento registrado e cliente renovado!');
      queryClient.invalidateQueries({ queryKey: ['customer-search'] });
      setSelectedCustomer(null);
      setSearchPhone('');
    },
    onError: (error) => {
      toast.error('Erro ao registrar pagamento: ' + error.message);
    },
  });

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchPhone(customer.phone);
  };

  const handleRenew = () => {
    if (selectedCustomer) {
      registerPayment.mutate(selectedCustomer);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      ativa: { variant: 'default', label: 'Ativa' },
      inativa: { variant: 'secondary', label: 'Inativa' },
      suspensa: { variant: 'destructive', label: 'Suspensa' },
    };
    const config = variants[status] || variants.inativa;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  };

  const price = selectedCustomer?.custom_price ?? selectedCustomer?.plan?.price ?? 0;

  return (
    <div className="w-80 border-l border-border bg-background/50 flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground mb-2">Renovação Rápida</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefone..."
            value={searchPhone}
            onChange={(e) => {
              setSearchPhone(e.target.value);
              setSelectedCustomer(null);
            }}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {/* Search Results */}
        {!selectedCustomer && searchResults && searchResults.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-2">Resultados:</p>
            {searchResults.map((customer) => (
              <Card
                key={customer.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => handleSelectCustomer(customer)}
              >
                <CardContent className="p-2">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.phone}</p>
                    </div>
                    {getStatusBadge(customer.status)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No results */}
        {!selectedCustomer && searchPhone.length >= 4 && !isSearching && searchResults?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum cliente encontrado
          </p>
        )}

        {/* Selected Customer Details */}
        {selectedCustomer && (
          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" />
                {selectedCustomer.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{selectedCustomer.phone}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  {getStatusBadge(selectedCustomer.status)}
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Vencimento:</span>
                  </div>
                  <span className="font-medium">{formatDate(selectedCustomer.due_date)}</span>
                </div>
                
                {selectedCustomer.plan && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Plano:</span>
                    <span className="font-medium">{selectedCustomer.plan.plan_name}</span>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Valor:</span>
                  </div>
                  <span className="font-bold text-primary">
                    R$ {price.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-border space-y-2">
                <label className="text-xs text-muted-foreground">Método de Pagamento</label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  className="w-full h-9" 
                  onClick={handleRenew}
                  disabled={registerPayment.isPending}
                >
                  {registerPayment.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Renovar Cliente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!selectedCustomer && searchPhone.length < 4 && (
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Digite o telefone do cliente para buscar</p>
          </div>
        )}
      </div>
    </div>
  );
}
