import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Pencil, Trash2, Loader2, Server, Globe, Users, Activity, Wallet, Search, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';
import { PANEL_OPTIONS, resolvePanel } from '@/lib/panel-detect';

type ServerStatus = Database['public']['Enums']['server_status'];
type ServerRow = Database['public']['Tables']['servers']['Row'];

export default function Servers() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerRow | null>(null);
  const [formData, setFormData] = useState({
    server_name: '',
    host: '',
    description: '',
    status: 'online' as ServerStatus,
    is_public: false,
    credit_cost: 0,
    panel_type: 'auto',
    sigma_connection_id: '',
    koffice_connection_id: '',
  });


  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sigmaConnections = [] } = useQuery({
    queryKey: ['sigma-panel-connections', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('sigma_panel_connections' as any).select('id, name, base_url').eq('user_id', user?.id).eq('is_active', true).order('name');
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: kofficeConnections = [] } = useQuery({
    queryKey: ['koffice-panel-connections', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('koffice_panel_connections' as any).select('id, name, base_url').eq('user_id', user?.id).eq('is_active', true).order('name');
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Contagem de clientes cadastrados por servidor (count exato, sem limite de 1000 linhas)
  const { data: customerCounts } = useQuery({
    queryKey: ['server-customer-counts', servers?.map(s => s.id)],
    enabled: !!servers && servers.length > 0,
    queryFn: async () => {
      if (!servers || servers.length === 0) return {};

      const counts: Record<string, { total: number; active: number }> = {};

      await Promise.all(
        servers.map(async (server) => {
          const [{ count: total }, { count: active }] = await Promise.all([
            supabase.from('customers').select('*', { count: 'exact', head: true }).eq('server_id', server.id),
            supabase
              .from('customers')
              .select('*', { count: 'exact', head: true })
              .eq('server_id', server.id)
              .eq('status', 'ativa'),
          ]);
          counts[server.id] = { total: total ?? 0, active: active ?? 0 };
        })
      );

      return counts;
    },
  });

  // ---- Dados reais do painel (créditos + conexões online) ----
  type PanelStat = { credits: number | null; online: number | null; error?: string | null; updated_at?: string | null };

  const { data: panelStats = {} } = useQuery({
    queryKey: ['panel-stats-cache', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('panel_stats_cache' as any)
        .select('server_id, credits, online, error, updated_at')
        .eq('user_id', user?.id);
      if (error) throw error;
      const map: Record<string, PanelStat> = {};
      for (const row of (data || []) as any[]) {
        map[row.server_id] = {
          credits: row.credits === null ? null : Number(row.credits),
          online: row.online === null ? null : Number(row.online),
          error: row.error,
          updated_at: row.updated_at,
        };
      }
      return map;
    },
  });

  const [syncingCredits, setSyncingCredits] = useState(false);

  const syncCredits = async () => {
    if (!servers?.length) return;
    setSyncingCredits(true);
    try {
      const { data, error } = await supabase.functions.invoke('panel-stats', {
        body: { action: 'stats', server_ids: servers.map((s) => s.id) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      await queryClient.invalidateQueries({ queryKey: ['panel-stats-cache'] });
      const failures = Object.values(((data as any)?.stats || {}) as Record<string, PanelStat>).filter((s) => s.error).length;
      toast({
        title: 'Painéis consultados',
        description: failures ? `${failures} servidor(es) retornaram erro — veja o detalhe no card.` : 'Créditos atualizados.',
        variant: failures ? 'destructive' : 'default',
      });
    } catch (e: any) {
      toast({ title: 'Falha ao consultar os painéis', description: e?.message || 'Tente novamente', variant: 'destructive' });
    } finally {
      setSyncingCredits(false);
    }
  };

  const lastSync = (() => {
    const dates = Object.values(panelStats).map((s) => s.updated_at).filter(Boolean) as string[];
    if (!dates.length) return null;
    return new Date(dates.sort().reverse()[0]);
  })();

  const [search, setSearch] = useState('');
  const filteredServers = (servers || []).filter((s: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${s.server_name} ${s.host}`.toLowerCase().includes(q);
  });

  const totals = (() => {
    let total = 0;
    let active = 0;
    let credits: number | null = null;
    let online: number | null = null;
    for (const s of servers || []) {
      const c = customerCounts?.[s.id];
      total += c?.total || 0;
      active += c?.active || 0;
      const st = panelStats[s.id];
      if (typeof st?.credits === 'number' && Number.isFinite(st.credits)) credits = (credits || 0) + st.credits;
      if (typeof st?.online === 'number' && Number.isFinite(st.online)) online = (online || 0) + st.online;
    }
    return { total, active, credits, online };
  })();





  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { panel_type, sigma_connection_id, koffice_connection_id, ...rest } = data;
      const { error } = await supabase.from('servers').insert({
        ...rest,
        panel_type: panel_type === 'auto' ? null : panel_type,
        sigma_connection_id: panel_type === 'sigma' ? sigma_connection_id || null : null,
        koffice_connection_id: panel_type === 'koffice' ? koffice_connection_id || null : null,
        created_by: user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Servidor criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar servidor', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { panel_type, sigma_connection_id, koffice_connection_id, ...rest } = data;
      const { error } = await supabase
        .from('servers')
        .update({
          ...rest,
          panel_type: panel_type === 'auto' ? null : panel_type,
          sigma_connection_id: panel_type === 'sigma' ? sigma_connection_id || null : null,
          koffice_connection_id: panel_type === 'koffice' ? koffice_connection_id || null : null,
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      setIsOpen(false);
      resetForm();
      toast({ title: 'Servidor atualizado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar servidor', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('servers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast({ title: 'Servidor excluído com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir servidor', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({ server_name: '', host: '', description: '', status: 'online', is_public: false, credit_cost: 0, panel_type: 'auto', sigma_connection_id: '', koffice_connection_id: '' });
    setEditingServer(null);
  };

  const handleEdit = (server: ServerRow) => {
    setEditingServer(server);
    const rawPanel = ((server as any).panel_type as string) || 'auto';
    setFormData({
      server_name: server.server_name,
      host: server.host,
      description: server.description || '',
      status: server.status,
      is_public: (server as any).is_public || false,
      credit_cost: Number((server as any).credit_cost || 0),
      panel_type: rawPanel === 'p2cine' ? 'koffice' : rawPanel,
      sigma_connection_id: (server as any).sigma_connection_id || '',
      koffice_connection_id: (server as any).koffice_connection_id || '',
    });
    setIsOpen(true);
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingServer) {
      updateMutation.mutate({ id: editingServer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getStatusBadge = (status: ServerStatus) => {
    const styles = {
      online: 'badge-online',
      offline: 'badge-offline',
      manutencao: 'badge-maintenance',
    };
    const labels = {
      online: 'Online',
      offline: 'Offline',
      manutencao: 'Manutenção',
    };
    return <span className={styles[status]}>{labels[status]}</span>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Servidores</h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">Gerencie seus servidores IPTV</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="glow">
                <Plus className="w-4 h-4 mr-2" />
                Novo Servidor
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>{editingServer ? 'Editar Servidor' : 'Novo Servidor'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Servidor</Label>
                  <Input
                    value={formData.server_name}
                    onChange={(e) => setFormData({ ...formData, server_name: e.target.value })}
                    placeholder="Servidor 01"
                    required
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Host / IP</Label>
                  <Input
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    placeholder="192.168.1.100"
                    required
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: ServerStatus) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                      <SelectItem value="manutencao">Manutenção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Painel / API de renovação</Label>
                  <Select
                    value={formData.panel_type}
                    onValueChange={(value) => setFormData({ ...formData, panel_type: value })}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PANEL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Define qual API será chamada ao renovar clientes deste servidor. Em "Automático", o sistema detecta pelo nome/host (comportamento atual).
                  </p>
                </div>
                {formData.panel_type === 'koffice' && (
                  <div className="space-y-2">
                    <Label>Conexão kOffice</Label>
                    <Select value={formData.koffice_connection_id} onValueChange={(value) => setFormData({ ...formData, koffice_connection_id: value })}>
                      <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Selecione a URL e credencial" /></SelectTrigger>
                      <SelectContent>
                        {kofficeConnections.map((connection) => (
                          <SelectItem key={connection.id} value={connection.id}>{connection.name} — {connection.base_url}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {kofficeConnections.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhuma conexão kOffice cadastrada. Adicione em Configurações → APIs.</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Custo por crédito (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.credit_cost}
                    onChange={(e) => setFormData({ ...formData, credit_cost: Number(e.target.value) || 0 })}
                    placeholder="0,00"
                    className="bg-secondary/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Custo pago ao painel por 1 crédito (30 dias / 1 tela). Usado para calcular o lucro líquido.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição opcional..."
                    className="bg-secondary/50"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    <div>
                      <Label className="text-sm">Visível na Página de Checkout</Label>
                      <p className="text-xs text-muted-foreground">Exibir este servidor para novos clientes</p>
                    </div>
                  </div>
                  <Switch
                    checked={(formData as any).is_public || false}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_public: checked } as any)}
                  />
                </div>
                <Button
                  type="submit" 
                  className="w-full" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingServer ? 'Atualizar' : 'Criar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Servidores', value: servers?.length ?? 0, icon: Server, tone: 'text-primary bg-primary/10' },
            { label: 'Clientes cadastrados', value: totals.total, icon: Users, tone: 'text-sky-400 bg-sky-500/10' },
            { label: 'Clientes ativos', value: totals.active, icon: Activity, tone: 'text-emerald-400 bg-emerald-500/10' },
            { label: 'Créditos nos painéis', value: totals.credits === null ? '—' : Math.round(Number(totals.credits)).toLocaleString('pt-BR'), icon: Wallet, tone: 'text-amber-400 bg-amber-500/10' },



          ].map((card) => (
            <Card key={card.label} className="glass-card border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', card.tone)}>
                  <card.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                  <p className="text-base sm:text-xl font-bold truncate">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Busca + sincronizar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou host..."
              className="pl-9 bg-secondary/50"
            />
          </div>
          <Button variant="outline" onClick={syncCredits} disabled={syncingCredits} title={lastSync ? `Última consulta: ${lastSync.toLocaleString('pt-BR')}` : undefined}>
            {syncingCredits ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {syncingCredits ? 'Consultando painéis...' : 'Atualizar créditos'}
          </Button>

        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredServers.length === 0 ? (
          <Card className="glass-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Server className="w-12 h-12 mb-4 opacity-50" />
              <p>Nenhum servidor encontrado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredServers.map((server: any) => {
              const counts = customerCounts?.[server.id] || { total: 0, active: 0 };
              const panel = resolvePanel(server);
              const credit = panelStats[server.id];
              const ratio = counts.total > 0 ? Math.round((counts.active / counts.total) * 100) : 0;
              return (
                <Card key={server.id} className="glass-card border-border/50 hover:border-primary/40 transition-colors group">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{server.server_name}</h3>
                          {getStatusBadge(server.status)}
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate mt-1">{server.host}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(server)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(server.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                        {panel ? panel.toUpperCase() : 'SEM PAINEL'}
                      </span>
                      {server.is_public && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                          <Globe className="w-3 h-3" /> Checkout
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-secondary/40 p-2">
                        <p className="text-[11px] text-muted-foreground">Clientes</p>
                        <p className="font-bold text-sky-400">{counts.total}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/40 p-2">
                        <p className="text-[11px] text-muted-foreground">Ativos</p>
                        <p className="font-bold text-teal-400">{counts.active}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/40 p-2">
                        <p className="text-[11px] text-muted-foreground">Créditos</p>
                        <p className="font-bold text-amber-400">
                          {credit?.credits ?? '—'}
                        </p>
                      </div>
                    </div>



                    <div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${ratio}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                        <span>{ratio}% ativos</span>
                        <span>Custo/crédito: R$ {Number(server.credit_cost || 0).toFixed(2)}</span>
                      </div>
                    </div>

                    {credit?.error && (
                      <p className="text-xs text-destructive line-clamp-2">{credit.error}</p>
                    )}
                    {server.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{server.description}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
