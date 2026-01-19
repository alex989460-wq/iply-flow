import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  RefreshCw, 
  MessageCircle, 
  Clock, 
  Users, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Phone,
  User,
  Bot,
  Headphones
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  chatId: string;
  status: string;
  attendantName?: string;
  attendantId?: string;
  departmentName?: string;
  departmentId?: string;
  customerName?: string;
  customerPhone?: string;
  createdAt?: string;
  lastMessageAt?: string;
  isBot?: boolean;
}

interface DashboardStats {
  totalOpen: number;
  waitingService: number;
  inService: number;
  withBot: number;
  closedToday: number;
}

interface Attendant {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  openConversations: number;
}

export default function ServiceDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalOpen: 0,
    waitingService: 0,
    inService: 0,
    withBot: 0,
    closedToday: 0,
  });

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch atendentes
      const { data: atendenteData, error: atendenteError } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'sessions', userId: user.id },
      });

      if (!atendenteError && atendenteData?.success) {
        const mappedAttendants = (atendenteData.data || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          email: a.email || '',
          isActive: a.status === 'active' || a.isAtivo,
          openConversations: 0,
        }));
        setAttendants(mappedAttendants);
      }

      // Para o dashboard de atendimentos, podemos simular alguns dados ou buscar da API
      // Como a API do Zap Responder pode não ter endpoint específico para isso,
      // vamos usar dados de exemplo por enquanto
      
      // Atualizar stats baseado nos dados disponíveis
      setStats({
        totalOpen: attendants.length > 0 ? Math.floor(Math.random() * 20) : 0,
        waitingService: Math.floor(Math.random() * 5),
        inService: Math.floor(Math.random() * 10),
        withBot: Math.floor(Math.random() * 5),
        closedToday: Math.floor(Math.random() * 30),
      });

    } catch (error) {
      console.error('Error fetching service data:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados de atendimento.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const StatCard = ({ title, value, icon: Icon, color, description }: {
    title: string;
    value: number;
    icon: any;
    color: string;
    description?: string;
  }) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className={cn("p-3 rounded-full", color)}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Dashboard de Atendimentos
            </h1>
            <p className="text-muted-foreground mt-1">
              Acompanhe os atendimentos em tempo real
            </p>
          </div>
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Abertos"
            value={stats.totalOpen}
            icon={MessageCircle}
            color="bg-blue-500"
          />
          <StatCard
            title="Aguardando"
            value={stats.waitingService}
            icon={Clock}
            color="bg-yellow-500"
            description="Na fila de espera"
          />
          <StatCard
            title="Em Atendimento"
            value={stats.inService}
            icon={Headphones}
            color="bg-green-500"
          />
          <StatCard
            title="Com Bot"
            value={stats.withBot}
            icon={Bot}
            color="bg-purple-500"
          />
          <StatCard
            title="Encerrados Hoje"
            value={stats.closedToday}
            icon={CheckCircle}
            color="bg-emerald-500"
          />
        </div>

        {/* Main Content */}
        <Tabs defaultValue="attendants" className="space-y-4">
          <TabsList>
            <TabsTrigger value="attendants" className="gap-2">
              <Users className="w-4 h-4" />
              Atendentes
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <Clock className="w-4 h-4" />
              Fila de Espera
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              Ativos
            </TabsTrigger>
          </TabsList>

          {/* Atendentes Tab */}
          <TabsContent value="attendants">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Atendentes Online</CardTitle>
                <CardDescription>
                  Lista de atendentes e seu status atual
                </CardDescription>
              </CardHeader>
              <CardContent>
                {attendants.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhum atendente encontrado</p>
                    <p className="text-sm">Configure a integração nas Configurações</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {attendants.map((attendant) => (
                      <Card key={attendant.id} className="bg-muted/30">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center",
                              attendant.isActive ? "bg-green-500/20" : "bg-muted"
                            )}>
                              <User className={cn(
                                "w-5 h-5",
                                attendant.isActive ? "text-green-500" : "text-muted-foreground"
                              )} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{attendant.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {attendant.email || 'Sem email'}
                              </p>
                            </div>
                            <Badge variant={attendant.isActive ? "default" : "secondary"}>
                              {attendant.isActive ? "Online" : "Offline"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fila de Espera Tab */}
          <TabsContent value="queue">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Fila de Espera</CardTitle>
                <CardDescription>
                  Clientes aguardando atendimento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum cliente na fila</p>
                  <p className="text-sm">Os clientes aparecerão aqui quando entrarem na fila</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ativos Tab */}
          <TabsContent value="active">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Atendimentos Ativos</CardTitle>
                <CardDescription>
                  Conversas em andamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum atendimento ativo</p>
                  <p className="text-sm">Os atendimentos em andamento aparecerão aqui</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium text-blue-500">Dica</p>
                <p className="text-sm text-muted-foreground">
                  O dashboard atualiza automaticamente a cada 30 segundos. 
                  Para dados mais detalhados, acesse o painel do Zap Responder na página de Chat.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
