import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  MessageSquare, 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  Send, 
  Phone,
  RefreshCw,
  MessageCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type BillingType = Database['public']['Enums']['billing_type'];

interface ZapSession {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface ZapChat {
  id: string;
  contact_name: string;
  contact_phone: string;
  last_message: string;
  unread_count: number;
  updated_at: string;
}

export default function Billing() {
  const [isSending, setIsSending] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [sessions, setSessions] = useState<ZapSession[]>([]);
  const [chats, setChats] = useState<ZapChat[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const { data: zapSettings, refetch: refetchSettings } = useQuery({
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

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'sessions' },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setSessions(data.data);
        toast({ title: 'Sessões carregadas!', description: `${data.data.length} telefones encontrados.` });
      } else {
        toast({ 
          title: 'Erro ao carregar sessões', 
          description: data?.error || 'Resposta inválida da API',
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar sessões',
        description: error.message || 'Não foi possível conectar à API do Zap Responder',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const fetchChats = async () => {
    setIsLoadingChats(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'chats' },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setChats(data.data);
        toast({ title: 'Chats carregados!', description: `${data.data.length} conversas encontradas.` });
      } else {
        toast({ 
          title: 'Erro ao carregar chats', 
          description: data?.error || 'Resposta inválida da API',
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar chats',
        description: error.message || 'Não foi possível conectar à API do Zap Responder',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingChats(false);
    }
  };

  const selectSessionMutation = useMutation({
    mutationFn: async (session: ZapSession) => {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: {
          action: 'select-session',
          session_id: session.id,
          session_name: session.name,
          session_phone: session.phone,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao selecionar sessão');

      return session;
    },
    onSuccess: (session) => {
      refetchSettings();
      toast({ title: 'Sessão selecionada!', description: `Usando ${session.name} (${session.phone})` });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao selecionar sessão',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSendBillings = async () => {
    if (!zapSettings?.selected_session_id) {
      toast({
        title: 'Nenhuma sessão selecionada',
        description: 'Por favor, selecione um telefone conectado antes de enviar cobranças.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-billing');
      
      if (error) {
        toast({
          title: 'Erro ao enviar cobranças',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        const results = data?.results;
        toast({
          title: 'Cobranças processadas!',
          description: `Enviadas: ${results?.sent || 0} | Ignoradas: ${results?.skipped || 0} | Erros: ${results?.errors || 0}`,
        });
        queryClient.invalidateQueries({ queryKey: ['billing-logs'] });
        queryClient.invalidateQueries({ queryKey: ['pending-billings'] });
      }
    } catch (error) {
      toast({
        title: 'Erro inesperado',
        description: 'Não foi possível processar as cobranças',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

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

  const totalPending = (pendingBillings?.dminus1.length || 0) + 
                       (pendingBillings?.d0.length || 0) + 
                       (pendingBillings?.dplus1.length || 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Cobranças</h1>
            <p className="text-muted-foreground mt-1">
              Acompanhe as cobranças automáticas via WhatsApp
            </p>
          </div>
          <Button 
            variant="glow" 
            onClick={handleSendBillings}
            disabled={isSending || totalPending === 0 || !zapSettings?.selected_session_id}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Enviar Cobranças Agora
          </Button>
        </div>

        {/* Zap Responder Configuration */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Configuração do Zap Responder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">Telefone Conectado:</p>
                {zapSettings?.selected_session_id ? (
                  <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="font-medium">{zapSettings.selected_session_name}</span>
                    <span className="text-muted-foreground">({zapSettings.selected_session_phone})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <span>Nenhum telefone selecionado</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={fetchSessions}
                  disabled={isLoadingSessions}
                >
                  {isLoadingSessions ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Carregar Telefones
                </Button>
                <Button 
                  variant="outline" 
                  onClick={fetchChats}
                  disabled={isLoadingChats || !zapSettings?.selected_session_id}
                >
                  {isLoadingChats ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MessageCircle className="w-4 h-4 mr-2" />
                  )}
                  Ver Chats
                </Button>
              </div>
            </div>

            {/* Sessions List */}
            {sessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selecione um telefone:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => selectSessionMutation.mutate(session)}
                      disabled={selectSessionMutation.isPending}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all hover:border-primary',
                        zapSettings?.selected_session_id === session.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/50'
                      )}
                    >
                      <p className="font-medium">{session.name}</p>
                      <p className="text-sm text-muted-foreground">{session.phone}</p>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full mt-1 inline-block',
                        session.status === 'connected' 
                          ? 'bg-success/10 text-success' 
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {session.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chats List */}
            {chats.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Conversas Recentes:</p>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {chats.map((chat) => (
                    <div
                      key={chat.id}
                      className="p-3 rounded-lg border border-border bg-secondary/30 flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{chat.contact_name}</p>
                        <p className="text-sm text-muted-foreground truncate">{chat.contact_phone}</p>
                        <p className="text-xs text-muted-foreground truncate mt-1">{chat.last_message}</p>
                      </div>
                      {chat.unread_count > 0 && (
                        <span className="ml-2 px-2 py-1 bg-primary text-primary-foreground text-xs rounded-full">
                          {chat.unread_count}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
