import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Smartphone, Mail, Monitor, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function ActivationApps() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [form, setForm] = useState({ app_name: '', description: '', requires_email: false, requires_mac: true, is_enabled: true });

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['activation-apps'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('activation_apps').select('*').order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ['activation-requests'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('activation_requests').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingApp) {
        const { error } = await (supabase as any).from('activation_apps').update(data).eq('id', editingApp.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('activation_apps').insert({ ...data, user_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activation-apps'] });
      toast.success(editingApp ? 'App atualizado!' : 'App criado!');
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('activation_apps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activation-apps'] });
      toast.success('App removido!');
    },
  });

  const updateRequestStatus = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'activate' | 'reject' }) => {
      const { data, error } = await supabase.functions.invoke('confirm-activation', {
        body: { request_id: id, action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activation-requests'] });
      toast.success(data?.message || 'Status atualizado e cliente notificado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openNew() {
    setEditingApp(null);
    setForm({ app_name: '', description: '', requires_email: false, requires_mac: true, is_enabled: true });
    setDialogOpen(true);
  }

  function openEdit(app: any) {
    setEditingApp(app);
    setForm({ app_name: app.app_name, description: app.description || '', requires_email: app.requires_email, requires_mac: app.requires_mac, is_enabled: app.is_enabled });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingApp(null);
  }

  function handleSave() {
    if (!form.app_name.trim()) return toast.error('Nome do app é obrigatório');
    saveMutation.mutate(form);
  }

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === 'rejected') return <XCircle className="w-4 h-4 text-destructive" />;
    return <Clock className="w-4 h-4 text-yellow-500" />;
  };

  const statusLabel = (status: string) => {
    if (status === 'completed') return 'Ativado';
    if (status === 'rejected') return 'Rejeitado';
    return 'Pendente';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ativação de Apps</h1>
            <p className="text-muted-foreground">Gerencie apps e solicitações de ativação dos clientes</p>
          </div>
        </div>

        <Tabs defaultValue="requests" className="space-y-4">
          <TabsList>
            <TabsTrigger value="requests">
              Solicitações
              {requests.filter((r: any) => r.status === 'pending').length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                  {requests.filter((r: any) => r.status === 'pending').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="apps">Apps Configurados</TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Solicitações de Ativação</CardTitle>
                <CardDescription>Solicitações recebidas via pagamento no site externo</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRequests ? (
                  <p className="text-muted-foreground text-sm">Carregando...</p>
                ) : requests.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhuma solicitação recebida ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>App</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>MAC</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requests.map((req: any) => (
                          <TableRow key={req.id}>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {statusIcon(req.status)}
                                <span className="text-sm">{statusLabel(req.status)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{req.app_name}</TableCell>
                            <TableCell>{req.customer_name}</TableCell>
                            <TableCell className="text-sm">{req.customer_phone || '-'}</TableCell>
                            <TableCell className="font-mono text-xs">{req.mac_address || '-'}</TableCell>
                            <TableCell className="text-sm">{req.email || '-'}</TableCell>
                            <TableCell>R$ {Number(req.amount || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(req.created_at), 'dd/MM/yy HH:mm')}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {req.status === 'pending' && (
                                  <>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateRequestStatus.mutate({ id: req.id, action: 'activate' })}>
                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Ativar
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => updateRequestStatus.mutate({ id: req.id, action: 'reject' })}>
                                      <XCircle className="w-3 h-3 mr-1" /> Rejeitar
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="apps">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Apps de Ativação</CardTitle>
                  <CardDescription>Apps que seus clientes podem solicitar ativação</CardDescription>
                </div>
                <Button size="sm" onClick={openNew}>
                  <Plus className="w-4 h-4 mr-1" /> Novo App
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground text-sm">Carregando...</p>
                ) : apps.length === 0 ? (
                  <div className="text-center py-8">
                    <Smartphone className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">Nenhum app configurado ainda.</p>
                    <Button size="sm" className="mt-3" onClick={openNew}>
                      <Plus className="w-4 h-4 mr-1" /> Adicionar App
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {apps.map((app: any) => (
                      <div key={app.id} className="rounded-xl border border-border/50 p-4 space-y-3 bg-card">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Monitor className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground">{app.app_name}</h3>
                              {app.description && <p className="text-xs text-muted-foreground">{app.description}</p>}
                            </div>
                          </div>
                          <Badge variant={app.is_enabled ? 'default' : 'secondary'}>
                            {app.is_enabled ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          {app.requires_mac && <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> MAC</span>}
                          {app.requires_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> Email</span>}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openEdit(app)}>
                            <Pencil className="w-3 h-3 mr-1" /> Editar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => deleteMutation.mutate(app.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingApp ? 'Editar App' : 'Novo App de Ativação'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do App *</Label>
              <Input value={form.app_name} onChange={e => setForm(f => ({ ...f, app_name: e.target.value }))} placeholder="Ex: BOBPLAYER" />
              <p className="text-xs text-muted-foreground mt-1">Deve corresponder ao nome usado no produto da Cakto</p>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Player IPTV completo" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Requer endereço MAC</Label>
              <Switch checked={form.requires_mac} onCheckedChange={v => setForm(f => ({ ...f, requires_mac: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Requer email</Label>
              <Switch checked={form.requires_email} onCheckedChange={v => setForm(f => ({ ...f, requires_email: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch checked={form.is_enabled} onCheckedChange={v => setForm(f => ({ ...f, is_enabled: v }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={closeDialog}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
