import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, MessageSquare, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type BillingType = Database['public']['Enums']['billing_type'];

export default function Billing() {
  const { data: billingLogs, isLoading } = useQuery({
    queryKey: ['billing-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_logs')
        .select('*, customers(name, phone)')
        .order('sent_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingBillings } = useQuery({
    queryKey: ['pending-billings'],
    queryFn: async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: customers, error } = await supabase
        .from('customers')
        .select('*, plans(plan_name)')
        .eq('status', 'ativa');

      if (error) throw error;

      const todayStr = today.toISOString().split('T')[0];
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      return {
        dminus1: customers?.filter(c => c.due_date === tomorrowStr) || [],
        d0: customers?.filter(c => c.due_date === todayStr) || [],
        dplus1: customers?.filter(c => c.due_date === yesterdayStr) || [],
      };
    },
  });

  const getBillingTypeBadge = (type: BillingType) => {
    const config = {
      'D-1': { label: 'D-1', className: 'bg-warning/10 text-warning', icon: Clock },
      'D0': { label: 'D0', className: 'bg-primary/10 text-primary', icon: AlertCircle },
      'D+1': { label: 'D+1', className: 'bg-destructive/10 text-destructive', icon: AlertCircle },
    };
    const { label, className, icon: Icon } = config[type];
    return (
      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', className)}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <span className="text-muted-foreground">-</span>;
    
    const isSuccess = status.toLowerCase().includes('success') || status.toLowerCase().includes('sent');
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        isSuccess ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
      )}>
        {isSuccess ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
        {status}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Cobranças</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe as cobranças automáticas via WhatsApp
          </p>
        </div>

        {/* Pending Billings Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning" />
                D-1 (Vencem Amanhã)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-warning">{pendingBillings?.dminus1.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-primary" />
                D0 (Vencem Hoje)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{pendingBillings?.d0.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="glass-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                D+1 (Venceram Ontem)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-destructive">{pendingBillings?.dplus1.length || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Message Templates */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Modelos de Mensagem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-warning/5 border border-warning/20">
              <p className="text-sm font-medium text-warning mb-2">D-1 (1 dia antes)</p>
              <p className="text-sm text-muted-foreground">
                "Olá, consta em nosso sistema que sua conta possui vencimento agendado para amanhã. 
                Caso já tenha realizado o pagamento, desconsidere esta mensagem."
              </p>
            </div>
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm font-medium text-primary mb-2">D0 (dia do vencimento)</p>
              <p className="text-sm text-muted-foreground">
                "Olá, consta em nosso sistema que sua conta possui vencimento registrado para hoje. 
                Caso já tenha realizado o pagamento, desconsidere esta mensagem."
              </p>
            </div>
            <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <p className="text-sm font-medium text-destructive mb-2">D+1 (1 dia após)</p>
              <p className="text-sm text-muted-foreground">
                "Olá, consta em nosso sistema que sua conta encontra-se vencida. 
                Para restabelecer o acesso aos serviços, é necessária a regularização."
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Billing Logs */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Envios</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : billingLogs?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                <p>Nenhuma cobrança enviada</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead>Status WhatsApp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billingLogs?.map((log) => (
                    <TableRow key={log.id} className="table-row-hover border-border">
                      <TableCell className="font-medium">{log.customers?.name}</TableCell>
                      <TableCell>{getBillingTypeBadge(log.billing_type)}</TableCell>
                      <TableCell>
                        {new Date(log.sent_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.whatsapp_status)}</TableCell>
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
