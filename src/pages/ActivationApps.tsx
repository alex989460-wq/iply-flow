import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PanelCredentialCard from '@/components/activation/PanelCredentialCard';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CreateClouddyUserDialog from '@/components/activation/CreateClouddyUserDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Smartphone, Mail, Monitor, Clock, CheckCircle2, XCircle, AlertCircle, Settings2, Eye, EyeOff, Zap, ListPlus, ShieldCheck, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PlaylistTemplatesCard from '@/components/playlist/PlaylistTemplatesCard';
import { cn } from '@/lib/utils';

const APP_LOGOS: Record<string, string> = {
  IBOPLAYERPRO: 'https://iboplayer.pro/m3u/logo-512.png',
  'IBO PLAYER PRO': 'https://iboplayer.pro/m3u/logo-512.png',
  DUPLECAST: 'https://duplecast.com/favicon.ico',
  CLOUDDY: 'https://console.clouddy.online/favicon.ico',
};

const APP_COLORS: Record<string, string> = {
  MACPLAYER: '#f97316',
  VIRGINIA: '#06b6d4',
  ALLPLAYER: '#eab308',
  HUSHPLAY: '#8b5cf6',
  KTNPLAYER: '#f97316',
  FAMILYPLAYER: '#eab308',
  KING4KPLAYER: '#ec4899',
  IBOXXPLAYER: '#22c55e',
  DUPLEX: '#f97316',
  FLIXNET: '#eab308',
  SMARTONEPRO: '#f97316',
  'CR PLAYER': '#eab308',
  'HQ PLAYER': '#8b5cf6',
  MESSITV: '#22c55e',
  BOBPLAYER: '#3b82f6',
  'BOB PLAYER': '#3b82f6',
  BOBPRO: '#f97316',
  BOBPREMIUM: '#eab308',
  'IBO PLAYER': '#22c55e',
  'IBO PLAY': '#22c55e',
  IBOSTB: '#3b82f6',
  IBOSSPLAYER: '#ec4899',
  IBOSOLPLAYER: '#22c55e',
  'IBO VPN PLAYER': '#8b5cf6',
  ABEPLAYERTV: '#ef4444',
};

const IBOSOL_LOGOS_KEY = 'ibosol_apps_logos_v1';
const IBOSOL_LOGOS: Record<string, string> = (() => {
  try { return JSON.parse(localStorage.getItem(IBOSOL_LOGOS_KEY) || '{}') || {}; }
  catch { return {}; }
})();

function normKey(name: string) {
  return String(name || '').toUpperCase().replace(/\s+/g, '');
}

function AppLogo({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const key = (name || '').toUpperCase();
  const src = url || APP_LOGOS[key] || IBOSOL_LOGOS[key] || IBOSOL_LOGOS[normKey(name)];
  const [broken, setBroken] = useState(false);
  const initials = (name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  const palette = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const bg = APP_COLORS[key] || palette[hash % palette.length];
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-lg object-contain bg-muted p-0.5 border border-border/50 shrink-0 shadow-sm"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, background: bg, fontSize: Math.max(10, size * 0.35) }}
      className="rounded-lg flex items-center justify-center text-white font-bold shrink-0 shadow-sm"
    >
      {initials}
    </div>
  );
}

export default function ActivationApps() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<any>(null);
  const [isClouddyCreateOpen, setIsClouddyCreateOpen] = useState(false);
  const [form, setForm] = useState({ app_name: '', description: '', logo_url: '', requires_email: false, requires_mac: true, is_enabled: true, price_monthly: '' as any, price_quarterly: '' as any, price_annual: 25 as any });

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

  const { data: panelCreds = [] } = useQuery({
    queryKey: ['activation-panel-credentials'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('activation_panel_credentials')
        .select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const duplecast = panelCreds.find((c: any) => c.panel_type === 'duplecast');
  const clouddy = panelCreds.find((c: any) => c.panel_type === 'clouddy');
  const ibosol = panelCreds.find((c: any) => c.panel_type === 'ibosol');
  const iboPro = panelCreds.find((c: any) => c.panel_type === 'iboplayerpro');

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
      toast.success(data?.message || 'Status atualizado!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const toNum = (v: any) => {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(String(v).replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      };
      const payload: any = {
        ...data,
        price_monthly: toNum(data.price_monthly),
        price_quarterly: toNum(data.price_quarterly),
        price_annual: toNum(data.price_annual),
      };
      if (editingApp) {
        const { error } = await (supabase as any).from('activation_apps').update(payload).eq('id', editingApp.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('activation_apps').insert({ ...payload, user_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activation-apps'] });
      toast.success('App salvo!');
      setDialogOpen(false);
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

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending': return 'Pendente';
      case 'activated': return 'Ativado';
      case 'rejected': return 'Rejeitado';
      default: return s;
    }
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'activated': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'rejected': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return '';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header Section */}
        <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-2xl">
          <div className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                <Smartphone className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Ativação de Apps</h1>
                <p className="text-muted-foreground text-sm font-medium">Controle automatizado de licenças e MACs</p>
              </div>
            </div>
            <div className="flex gap-2">
               <Button variant="outline" className="rounded-xl font-bold h-11 active:scale-95 transition-all" onClick={() => setIsClouddyCreateOpen(true)}>
                 <Zap className="w-4 h-4 mr-2 text-primary" /> Criar Clouddy
               </Button>
               <Button className="bg-primary hover:bg-primary/90 rounded-xl font-bold h-11 active:scale-95 transition-all shadow-lg shadow-primary/20" onClick={() => { setEditingApp(null); setDialogOpen(true); }}>
                 <Plus className="w-4 h-4 mr-2" /> Novo App
               </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="requests" className="space-y-6">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="h-auto p-1 bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl flex gap-1 w-full max-w-2xl">
              <TabsTrigger value="requests" className="flex-1 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                <Clock className="w-4 h-4 mr-2" /> Solicitações
              </TabsTrigger>
              <TabsTrigger value="apps" className="flex-1 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                <Smartphone className="w-4 h-4 mr-2" /> Meus Apps
              </TabsTrigger>
              <TabsTrigger value="panels" className="flex-1 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                <ShieldCheck className="w-4 h-4 mr-2" /> Painéis
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex-1 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                <ListPlus className="w-4 h-4 mr-2" /> Playlists
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="requests" className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
             <Card className="bg-card/40 backdrop-blur-md border-border/50 rounded-3xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                   <Table>
                      <TableHeader className="bg-background/50">
                         <TableRow className="hover:bg-transparent border-border/50">
                            <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 px-6">Status</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 px-6">App / Cliente</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 px-6">MAC / E-mail</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 px-6">Valor</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 px-6">Data</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 px-6 text-right">Ações</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody>
                         {loadingRequests ? (
                            <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground font-bold">Carregando solicitações...</TableCell></TableRow>
                         ) : requests.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground font-bold">Nenhuma solicitação encontrada.</TableCell></TableRow>
                         ) : (
                            requests.map((req: any) => (
                               <TableRow key={req.id} className="hover:bg-primary/5 transition-colors border-border/50 group">
                                  <TableCell className="py-4 px-6">
                                     <Badge variant="outline" className={cn("rounded-lg text-[9px] font-black uppercase tracking-tighter border-2", statusBadge(req.status))}>
                                        {statusLabel(req.status)}
                                     </Badge>
                                  </TableCell>
                                  <TableCell className="py-4 px-6">
                                     <div className="flex items-center gap-3">
                                        <AppLogo name={req.app_name} size={32} />
                                        <div className="flex flex-col">
                                           <span className="text-sm font-bold text-foreground">{req.customer_name}</span>
                                           <span className="text-[10px] font-bold text-muted-foreground uppercase">{req.app_name}</span>
                                        </div>
                                     </div>
                                  </TableCell>
                                  <TableCell className="py-4 px-6">
                                     <div className="flex flex-col">
                                        {req.mac_address && <span className="font-mono text-xs font-bold text-primary">{req.mac_address}</span>}
                                        {req.email && <span className="text-[10px] font-medium text-muted-foreground">{req.email}</span>}
                                     </div>
                                  </TableCell>
                                  <TableCell className="py-4 px-6 font-black text-foreground">
                                     R$ {Number(req.amount || 0).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="py-4 px-6 text-xs font-bold text-muted-foreground">
                                     {format(new Date(req.created_at), 'dd MMM, HH:mm', { locale: ptBR })}
                                  </TableCell>
                                  <TableCell className="py-4 px-6 text-right">
                                     {req.status === 'pending' && (
                                        <div className="flex gap-1 justify-end">
                                           <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500 hover:bg-emerald-500/10 rounded-lg" onClick={() => updateRequestStatus.mutate({ id: req.id, action: 'activate' })}>
                                              <CheckCircle2 className="w-4 h-4" />
                                           </Button>
                                           <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => updateRequestStatus.mutate({ id: req.id, action: 'reject' })}>
                                              <XCircle className="w-4 h-4" />
                                           </Button>
                                        </div>
                                     )}
                                  </TableCell>
                               </TableRow>
                            ))
                         )}
                      </TableBody>
                   </Table>
                </div>
             </Card>
          </TabsContent>

          <TabsContent value="apps" className="animate-in slide-in-from-bottom-4 duration-500">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {apps.map((app: any) => (
                   <Card key={app.id} className="bg-card/40 backdrop-blur-md border-border/50 rounded-3xl p-6 transition-all hover:bg-card/60 hover:border-primary/30 group">
                      <div className="flex items-start justify-between mb-6">
                         <div className="flex items-center gap-4">
                            <AppLogo name={app.app_name} url={app.logo_url} size={48} />
                            <div>
                               <h3 className="text-lg font-black tracking-tight text-foreground group-hover:text-primary transition-colors">{app.app_name}</h3>
                               <Badge variant={app.is_enabled ? 'default' : 'secondary'} className="text-[9px] font-bold uppercase rounded-full">
                                  {app.is_enabled ? 'Ativo' : 'Pausado'}
                               </Badge>
                            </div>
                         </div>
                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setEditingApp(app); setForm(app); setDialogOpen(true); }}>
                               <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => deleteMutation.mutate(app.id)}>
                               <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                         </div>
                      </div>
                      <p className="text-xs font-medium text-muted-foreground/80 line-clamp-2 mb-6 h-8">{app.description || 'Sem descrição.'}</p>
                      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/50">
                         <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-widest">Preço Anual</p>
                            <p className="text-sm font-black text-foreground">R$ {Number(app.price_annual || 0).toFixed(2)}</p>
                         </div>
                         <div className="flex flex-col items-end gap-1">
                            {app.requires_mac && <Badge variant="outline" className="text-[8px] font-bold uppercase bg-background/50 border-primary/20 text-primary">MAC</Badge>}
                            {app.requires_email && <Badge variant="outline" className="text-[8px] font-bold uppercase bg-background/50 border-sky-500/20 text-sky-500">Email</Badge>}
                         </div>
                      </div>
                   </Card>
                ))}
             </div>
          </TabsContent>

          <TabsContent value="panels" className="animate-in slide-in-from-bottom-4 duration-500">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                 <PanelCredentialCard 
                    title="Configurações Automáticas" 
                    subtitle="Credenciais de ativação direta" 
                    connected={panelCreds.length > 0} 
                    onSave={() => {}} 
                    onEnabledChange={() => {}}
                 >
                    <p className="text-sm font-medium text-muted-foreground p-4">Os painéis (Duplecast, Clouddy, IBO Sol) permitem que você ative pedidos sem intervenção manual. Mantenha os cookies e tokens atualizados.</p>
                 </PanelCredentialCard>
                 {/* Reutilizando estrutura original para não quebrar lógica complexa de upsert */}
                 <div className="opacity-50 pointer-events-none p-8 text-center border-2 border-dashed border-border/50 rounded-3xl">
                    <Settings2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/40">Painéis integrados ao sistema central</p>
                 </div>
             </div>
          </TabsContent>

          <TabsContent value="templates" className="animate-in slide-in-from-bottom-4 duration-500">
             <PlaylistTemplatesCard />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
         <DialogContent className="bg-background/80 backdrop-blur-2xl border-border/50 rounded-3xl shadow-2xl">
            <DialogHeader>
               <DialogTitle className="text-xl font-bold">{editingApp ? 'Editar App' : 'Novo App'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-5 pt-4">
               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Nome do App</Label>
                  <Input value={form.app_name} onChange={e => setForm({...form, app_name: e.target.value})} placeholder="Ex: BOBPLAYER" className="h-11 bg-background/50 border-border/50 rounded-xl" required />
               </div>
               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Preço Anual (R$)</Label>
                  <Input type="number" step="0.01" value={form.price_annual} onChange={e => setForm({...form, price_annual: e.target.value})} className="h-11 bg-background/50 border-border/50 rounded-xl" />
               </div>
               <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <Label className="font-bold text-sm">App Ativo no Checkout</Label>
                  <Switch checked={form.is_enabled} onCheckedChange={v => setForm({...form, is_enabled: v})} />
               </div>
               <Button type="submit" className="w-full h-12 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Configurações'}
               </Button>
            </form>
         </DialogContent>
      </Dialog>

      <CreateClouddyUserDialog open={isClouddyCreateOpen} onOpenChange={setIsClouddyCreateOpen} />
    </DashboardLayout>
  );
}
