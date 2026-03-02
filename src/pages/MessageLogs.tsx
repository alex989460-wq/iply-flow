import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MessageLog {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  message_type: string;
  source: string;
  status: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  success: { label: 'Enviado', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle2 },
  error: { label: 'Erro', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
  not_found: { label: 'Não encontrado', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: AlertTriangle },
  pending: { label: 'Pendente', color: 'bg-muted text-muted-foreground border-border', icon: Clock },
  skipped: { label: 'Ignorado', color: 'bg-muted text-muted-foreground border-border', icon: Clock },
};

const sourceLabels: Record<string, string> = {
  cakto: 'Cakto Webhook',
  manual: 'Renovação Manual',
  billing: 'Cobrança',
  broadcast: 'Disparo em Massa',
};

export default function MessageLogs() {
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from('message_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (sourceFilter !== 'all') {
      query = query.eq('source', sourceFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data as MessageLog[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchLogs();
  }, [isAdmin, statusFilter, sourceFilter]);

  const filteredLogs = logs.filter(log => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (log.customer_name?.toLowerCase().includes(s)) ||
      (log.customer_phone?.includes(s)) ||
      (log.error_message?.toLowerCase().includes(s)) ||
      (log.source?.toLowerCase().includes(s))
    );
  });

  const stats = {
    total: logs.length,
    success: logs.filter(l => l.status === 'success').length,
    error: logs.filter(l => l.status === 'error').length,
    notFound: logs.filter(l => l.status === 'not_found').length,
  };

  if (!isAdmin) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Logs de Mensagens
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitore todas as mensagens enviadas pelo sistema
            </p>
          </div>
          <Button onClick={fetchLogs} variant="outline" size="sm" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.success}</p>
                <p className="text-xs text-muted-foreground">Enviados</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.error}</p>
                <p className="text-xs text-muted-foreground">Erros</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.notFound}</p>
                <p className="text-xs text-muted-foreground">Não encontrado</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, telefone ou erro..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="success">Enviados</SelectItem>
                  <SelectItem value="error">Erros</SelectItem>
                  <SelectItem value="not_found">Não encontrado</SelectItem>
                  <SelectItem value="skipped">Ignorados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  <SelectItem value="cakto">Cakto Webhook</SelectItem>
                  <SelectItem value="manual">Renovação Manual</SelectItem>
                  <SelectItem value="billing">Cobrança</SelectItem>
                  <SelectItem value="broadcast">Disparo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs list */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {filteredLogs.length} registro(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Carregando...
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum log encontrado</p>
                  <p className="text-xs mt-1">Os logs aparecerão conforme mensagens forem enviadas</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {filteredLogs.map(log => {
                    const config = statusConfig[log.status] || statusConfig.pending;
                    const StatusIcon = config.icon;
                    return (
                      <div key={log.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-lg mt-0.5 ${config.color}`}>
                            <StatusIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-foreground">
                                {log.customer_name || 'Desconhecido'}
                              </span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {sourceLabels[log.source] || log.source}
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              📞 {log.customer_phone || '-'}
                              {log.message_type && ` • ${log.message_type}`}
                            </p>
                            {log.error_message && (
                              <p className="text-xs text-destructive mt-1 bg-destructive/5 rounded px-2 py-1">
                                ⚠️ {log.error_message}
                              </p>
                            )}
                            {log.metadata && (
                              <details className="mt-1">
                                <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                                  Ver detalhes
                                </summary>
                                <pre className="text-[10px] text-muted-foreground mt-1 bg-muted/50 rounded p-2 overflow-x-auto max-h-32">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
