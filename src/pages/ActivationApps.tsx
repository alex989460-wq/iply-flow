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
import { Plus, Pencil, Trash2, Smartphone, Mail, Monitor, Clock, CheckCircle2, XCircle, AlertCircle, Settings2, Eye, EyeOff, Zap, ListPlus, ShieldCheck, Loader2, Image as ImageIcon, Wand2 } from 'lucide-react';
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

// Sugere um ícone a partir do nome do app (favicon do domínio provável).
export function guessLogo(name: string) {
  const key = (name || '').toUpperCase().trim();
  if (APP_LOGOS[key]) return APP_LOGOS[key];
  const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return '';
  return `https://www.google.com/s2/favicons?domain=${slug}.com&sz=128`;
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
  const smartersmax = panelCreds.find((c: any) => c.panel_type === 'smartersmax');

  const [duplecastForm, setDuplecastForm] = useState({ username: '', password: '', is_enabled: true });
  const [clouddyForm, setClouddyForm] = useState({ base_url: 'https://console.clouddy.online', cookie: '', is_enabled: true });
  const [ibosolForm, setIbosolForm] = useState({ token: '', email: '', login_password: '', is_enabled: true });
  const [iboProForm, setIboProForm] = useState({ username: '', password: '', is_enabled: true });
  const [smartersForm, setSmartersForm] = useState({ username: '', password: '', is_enabled: true });
  const [showPass, setShowPass] = useState(false);
  const [showClCookie, setShowClCookie] = useState(false);
  const [showIboTok, setShowIboTok] = useState(false);
  const [showIboPass, setShowIboPass] = useState(false);
  const [showIboProPass, setShowIboProPass] = useState(false);
  const [showSmartersPass, setShowSmartersPass] = useState(false);

  useEffect(() => {
    if (duplecast) setDuplecastForm({ username: duplecast.username || '', password: duplecast.password || '', is_enabled: duplecast.is_enabled ?? true });
  }, [duplecast?.id, duplecast?.updated_at]);

  useEffect(() => {
    if (clouddy) setClouddyForm({ base_url: clouddy.username || 'https://console.clouddy.online', cookie: clouddy.password || '', is_enabled: clouddy.is_enabled ?? true });
  }, [clouddy?.id, clouddy?.updated_at]);

  useEffect(() => {
    if (ibosol) setIbosolForm({
      token: ibosol.password || '',
      email: (ibosol.extra as any)?.email || '',
      login_password: (ibosol.extra as any)?.login_password || '',
      is_enabled: ibosol.is_enabled ?? true,
    });

  }, [ibosol?.id, ibosol?.updated_at]);

  useEffect(() => {
    if (smartersmax) setSmartersForm({ username: smartersmax.username || '', password: smartersmax.password || '', is_enabled: smartersmax.is_enabled ?? true });
  }, [smartersmax?.id, smartersmax?.updated_at]);

  useEffect(() => {
    if (iboPro) setIboProForm({ username: iboPro.username || '', password: iboPro.password || '', is_enabled: iboPro.is_enabled ?? true });
  }, [iboPro?.id, iboPro?.updated_at]);

  const upsertPanel = async (payload: any) => {
    const { error } = await (supabase as any)
      .from('activation_panel_credentials')
      .upsert({ user_id: user?.id, ...payload }, { onConflict: 'user_id,panel_type' });
    if (error) throw error;
  };

  const panelSaved = (msg: string) => {
    queryClient.invalidateQueries({ queryKey: ['activation-panel-credentials'] });
    toast.success(msg);
  };

  const saveDuplecast = useMutation({
    mutationFn: async () => {
      if (!duplecastForm.username.trim() || !duplecastForm.password.trim()) throw new Error('E-mail e senha do painel Duplecast são obrigatórios');
      await upsertPanel({ panel_type: 'duplecast', username: duplecastForm.username.trim(), password: duplecastForm.password, is_enabled: duplecastForm.is_enabled });
    },
    onSuccess: () => panelSaved('Credenciais Duplecast salvas!'),
    onError: (e: any) => toast.error(e.message),
  });

  const saveClouddy = useMutation({
    mutationFn: async () => {
      if (!clouddyForm.base_url.trim() || !clouddyForm.cookie.trim()) throw new Error('URL do painel e cookie da sessão Clouddy são obrigatórios');
      await upsertPanel({ panel_type: 'clouddy', username: clouddyForm.base_url.trim().replace(/\/+$/, ''), password: clouddyForm.cookie.trim(), is_enabled: clouddyForm.is_enabled });
    },
    onSuccess: () => panelSaved('Credenciais Clouddy salvas!'),
    onError: (e: any) => toast.error(e.message),
  });

  const saveIbosol = useMutation({
    mutationFn: async () => {
      if (!ibosolForm.token.trim() && !(ibosolForm.email.trim() && ibosolForm.login_password)) {
        throw new Error('Informe e-mail e senha do IBO Sol (ou cole o token manualmente)');
      }
      await upsertPanel({
        panel_type: 'ibosol',
        username: 'https://backend-apis.ibosol.com',
        password: ibosolForm.token.trim(),
        is_enabled: ibosolForm.is_enabled,
        extra: {
          email: ibosolForm.email.trim(),
          login_password: ibosolForm.login_password,
          auto_login: !!(ibosolForm.email.trim() && ibosolForm.login_password),
        },
      });
    },
    onSuccess: () => panelSaved('Credenciais IBO Sol salvas!'),
    onError: (e: any) => toast.error(e.message),
  });

  const loginIbosol = useMutation({
    mutationFn: async () => {
      if (!ibosolForm.email.trim() || !ibosolForm.login_password) {
        throw new Error('Informe e-mail e senha do IBO Sol para conectar');
      }
      const { data, error } = await supabase.functions.invoke('ibosol-login', {
        body: {
          email: ibosolForm.email.trim(),
          password: ibosolForm.login_password,
          is_enabled: ibosolForm.is_enabled,
        },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => panelSaved('Conectado ao IBO Sol! Token capturado automaticamente.'),
    onError: (e: any) => toast.error(e.message || 'Não foi possível conectar no IBO Sol'),
  });


  const saveIboPro = useMutation({
    mutationFn: async () => {
      if (!iboProForm.username.trim() || !iboProForm.password.trim()) throw new Error('E-mail e senha do IBO Player Pro são obrigatórios');
      await upsertPanel({ panel_type: 'iboplayerpro', username: iboProForm.username.trim(), password: iboProForm.password, is_enabled: iboProForm.is_enabled });
    },
    onSuccess: () => panelSaved('Credenciais IBO Player Pro salvas!'),
    onError: (e: any) => toast.error(e.message),
  });

  const saveSmarters = useMutation({
    mutationFn: async () => {
      if (!smartersForm.username.trim() || !smartersForm.password.trim()) throw new Error('E-mail e senha do Smarters Max são obrigatórios');
      await upsertPanel({ panel_type: 'smartersmax', username: smartersForm.username.trim(), password: smartersForm.password, is_enabled: smartersForm.is_enabled });
    },
    onSuccess: () => panelSaved('Credenciais Smarters Max salvas!'),
    onError: (e: any) => toast.error(e.message),
  });

  const testSmarters = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('smartersmax', {
        body: { action: 'test', email: smartersForm.username.trim(), password: smartersForm.password },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (d: any) => toast.success(d?.credits != null ? `Conectado! Créditos: ${d.credits}` : 'Login no Smarters Max validado!'),
    onError: (e: any) => toast.error(e.message || 'Não foi possível conectar no Smarters Max'),
  });

  const bulkFetchLogos = useMutation({
    mutationFn: async () => {
      const targets = (apps as any[]).filter(a => !a.logo_url);
      let updated = 0;
      for (const a of targets) {
        const url = guessLogo(a.app_name);
        if (!url) continue;
        const { error } = await (supabase as any).from('activation_apps').update({ logo_url: url }).eq('id', a.id);
        if (!error) updated++;
      }
      return updated;
    },
    onSuccess: (n: number) => {
      queryClient.invalidateQueries({ queryKey: ['activation-apps'] });
      toast.success(n ? `${n} ícone(s) atualizados` : 'Todos os apps já possuem ícone');
    },
    onError: (e: any) => toast.error(e.message || 'Falha ao atualizar ícones'),
  });

  const togglePanelEnabled = useMutation({
    mutationFn: async ({ panel_type, value }: { panel_type: string; value: boolean }) => {
      const { error } = await (supabase as any)
        .from('activation_panel_credentials')
        .update({ is_enabled: value })
        .eq('user_id', user?.id)
        .eq('panel_type', panel_type);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['activation-panel-credentials'] });
      toast.success(vars.value ? 'Painel ativado' : 'Painel desativado');
    },
    onError: (e: any) => toast.error(e.message || 'Não foi possível alterar o status do painel'),
  });

  const handleToggle = (panel_type: string, exists: boolean, value: boolean, setLocal: (v: boolean) => void) => {
    setLocal(value);
    if (exists) togglePanelEnabled.mutate({ panel_type, value });
  };


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
                                     {!['activated', 'rejected'].includes(req.status) ? (
                                        <div className="flex gap-1 justify-end">
                                           <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-black uppercase border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10" disabled={updateRequestStatus.isPending} onClick={() => updateRequestStatus.mutate({ id: req.id, action: 'activate' })}>
                                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {req.status === 'failed' ? 'Tentar de novo' : 'Ativar'}
                                           </Button>
                                           <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg" disabled={updateRequestStatus.isPending} onClick={() => updateRequestStatus.mutate({ id: req.id, action: 'reject' })}>
                                              <XCircle className="w-4 h-4" />
                                           </Button>
                                        </div>
                                     ) : (
                                        <span className="text-[10px] font-bold uppercase text-muted-foreground/40">—</span>
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
             <div className="flex justify-end mb-4">
                <Button
                   variant="outline"
                   className="rounded-xl font-black uppercase text-[11px] tracking-wider"
                   disabled={bulkFetchLogos.isPending}
                   onClick={() => bulkFetchLogos.mutate()}
                >
                   {bulkFetchLogos.isPending
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Buscando ícones…</>
                      : <><Wand2 className="w-4 h-4 mr-2" /> Buscar ícones em massa</>}
                </Button>
             </div>
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

          <TabsContent value="panels" className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
             <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-md p-4">
                <p className="text-xs font-medium text-muted-foreground">
                   Configure o login de cada painel de revenda para ativar apps automaticamente. Clique no card para expandir e use o botão para ligar/desligar a ativação automática.
                </p>
             </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PanelCredentialCard
                   title="Duplecast"
                   subtitle="duplecast.com/client/login"
                   logo={<Monitor className="w-5 h-5 text-primary" />}
                   connected={!!duplecast}
                   enabled={duplecastForm.is_enabled}
                   onEnabledChange={(v) => handleToggle('duplecast', !!duplecast, v, (b) => setDuplecastForm(f => ({ ...f, is_enabled: b })))}
                   saving={saveDuplecast.isPending}
                   onSave={() => saveDuplecast.mutate()}
                   saveLabel="Salvar credenciais"
                   hint={<>Ao chegar um pedido do app <b>Duplecast</b>, o sistema faz login, cadastra o <b>MAC</b> no <b>code</b> informado e dispara a mensagem de app ativado. Se falhar, vira pendência manual.</>}
                >
                   <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                         <Label className="text-xs">E-mail do painel</Label>
                         <Input type="email" autoComplete="off" value={duplecastForm.username} onChange={e => setDuplecastForm(f => ({ ...f, username: e.target.value }))} placeholder="seuemail@dominio.com" />
                      </div>
                      <div className="space-y-1.5">
                         <Label className="text-xs">Senha</Label>
                         <div className="relative">
                            <Input type={showPass ? 'text' : 'password'} autoComplete="new-password" value={duplecastForm.password} onChange={e => setDuplecastForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className="pr-9" />
                            <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPass ? 'Ocultar' : 'Mostrar'}>
                               {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                         </div>
                      </div>
                   </div>
                </PanelCredentialCard>

                <PanelCredentialCard
                   title="Clouddy"
                   subtitle="console.clouddy.online/reseller"
                   logo={<Monitor className="w-5 h-5 text-primary" />}
                   connected={!!clouddy}
                   enabled={clouddyForm.is_enabled}
                   onEnabledChange={(v) => handleToggle('clouddy', !!clouddy, v, (b) => setClouddyForm(f => ({ ...f, is_enabled: b })))}
                   saving={saveClouddy.isPending}
                   onSave={() => saveClouddy.mutate()}
                   saveLabel="Salvar credenciais"
                   hint={<>O Clouddy usa <b>Cloudflare Turnstile</b>. Entre no painel manualmente, abra o DevTools → <b>Network</b> → em qualquer requisição <span className="font-mono">/reseller/*</span> copie o header <span className="font-mono">Cookie</span> completo e cole aqui.</>}
                >
                   <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                         <Label className="text-xs">URL do painel</Label>
                         <Input value={clouddyForm.base_url} onChange={e => setClouddyForm(f => ({ ...f, base_url: e.target.value }))} placeholder="https://console.clouddy.online" />
                      </div>
                      <div className="space-y-1.5">
                         <Label className="text-xs">Cookie da sessão</Label>
                         <div className="relative">
                            <Input type={showClCookie ? 'text' : 'password'} autoComplete="off" value={clouddyForm.cookie} onChange={e => setClouddyForm(f => ({ ...f, cookie: e.target.value }))} placeholder="PHPSESSID=xxx; REMEMBERME=yyy" className="font-mono text-xs pr-9" />
                            <button type="button" onClick={() => setShowClCookie(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showClCookie ? 'Ocultar' : 'Mostrar'}>
                               {showClCookie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                         </div>
                      </div>
                   </div>
                </PanelCredentialCard>

                <PanelCredentialCard
                   title="IBO Sol"
                   subtitle="Bob Player, IBO Player e afins — ativação por MAC"
                   logo={<Monitor className="w-5 h-5 text-primary" />}
                   connected={!!ibosol}
                   enabled={ibosolForm.is_enabled}
                   onEnabledChange={(v) => handleToggle('ibosol', !!ibosol, v, (b) => setIbosolForm(f => ({ ...f, is_enabled: b })))}
                   saving={saveIbosol.isPending}
                   onSave={() => saveIbosol.mutate()}
                   saveLabel="Salvar credenciais"
                   hint={<>Com <b>e-mail e senha</b> o sistema faz o login sozinho (o agente de navegador resolve o Cloudflare) e renova o token quando expirar. O campo de token continua disponível como alternativa manual.</>}
                >
                   <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                         <div className="space-y-1.5">
                            <Label className="text-xs">E-mail do IBO Sol</Label>
                            <Input type="email" autoComplete="off" value={ibosolForm.email} onChange={e => setIbosolForm(f => ({ ...f, email: e.target.value }))} placeholder="seu-email@exemplo.com" />
                         </div>
                         <div className="space-y-1.5">
                            <Label className="text-xs">Senha</Label>
                            <div className="relative">
                               <Input type={showIboPass ? 'text' : 'password'} autoComplete="new-password" value={ibosolForm.login_password} onChange={e => setIbosolForm(f => ({ ...f, login_password: e.target.value }))} placeholder="••••••••" className="pr-9" />
                               <button type="button" onClick={() => setShowIboPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showIboPass ? 'Ocultar' : 'Mostrar'}>
                                  {showIboPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                               </button>
                            </div>
                         </div>
                      </div>

                      <Button
                         type="button"
                         onClick={() => loginIbosol.mutate()}
                         disabled={loginIbosol.isPending}
                         className="w-full rounded-xl font-black uppercase text-[11px] tracking-wider"
                      >
                         {loginIbosol.isPending
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conectando no painel…</>
                            : <><ShieldCheck className="w-4 h-4 mr-2" /> Conectar e capturar token</>}
                      </Button>

                      <div className="space-y-1.5 pt-1 border-t border-border/40">
                         <Label className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Token Bearer (opcional / manual)</Label>
                         <div className="relative">
                            <Input type={showIboTok ? 'text' : 'password'} autoComplete="off" value={ibosolForm.token} onChange={e => setIbosolForm(f => ({ ...f, token: e.target.value }))} placeholder="5114508|tb3dyiNd5DRuzygqKTRRW9X2..." className="font-mono text-xs pr-9" />
                            <button type="button" onClick={() => setShowIboTok(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showIboTok ? 'Ocultar' : 'Mostrar'}>
                               {showIboTok ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                         </div>
                      </div>
                   </div>

                </PanelCredentialCard>

                <PanelCredentialCard
                   title="IBO Player Pro"
                   subtitle="cms.iboplayer.pro — ativação por MAC"
                   logo={<Monitor className="w-5 h-5 text-primary" />}
                   connected={!!iboPro}
                   enabled={iboProForm.is_enabled}
                   onEnabledChange={(v) => handleToggle('iboplayerpro', !!iboPro, v, (b) => setIboProForm(f => ({ ...f, is_enabled: b })))}
                   saving={saveIboPro.isPending}
                   onSave={() => saveIboPro.mutate()}
                   saveLabel="Salvar credenciais"
                   hint={<>Salve o e-mail e senha do painel <span className="font-mono">cms.iboplayer.pro</span>. O sistema mantém a sessão ativa e ativa o MAC do cliente quando chegar um pedido do app <b>IBOPLAYERPRO</b>.</>}
                >
                   <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                         <Label className="text-xs">E-mail do revendedor</Label>
                         <Input type="email" autoComplete="off" value={iboProForm.username} onChange={e => setIboProForm(f => ({ ...f, username: e.target.value }))} placeholder="seu-email@exemplo.com" />
                      </div>
                      <div className="space-y-1.5">
                         <Label className="text-xs">Senha</Label>
                         <div className="relative">
                            <Input type={showIboProPass ? 'text' : 'password'} autoComplete="new-password" value={iboProForm.password} onChange={e => setIboProForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className="pr-9" />
                            <button type="button" onClick={() => setShowIboProPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showIboProPass ? 'Ocultar' : 'Mostrar'}>
                               {showIboProPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                         </div>
                      </div>
                   </div>
                 </PanelCredentialCard>

                 <PanelCredentialCard
                    title="Smarters Max"
                    subtitle="cms.smartersmax.com — ativação por MAC e envio de listas"
                    logo={<Monitor className="w-5 h-5 text-primary" />}
                    connected={!!smartersmax}
                    enabled={smartersForm.is_enabled}
                    onEnabledChange={(v) => handleToggle('smartersmax', !!smartersmax, v, (b) => setSmartersForm(f => ({ ...f, is_enabled: b })))}
                    saving={saveSmarters.isPending}
                    onSave={() => saveSmarters.mutate()}
                    saveLabel="Salvar credenciais"
                    hint={<>Use o e-mail e senha do painel de revenda <span className="font-mono">cms.smartersmax.com</span>. Com isso o sistema ativa o MAC do cliente usando seus créditos e também envia listas direto no app (MAC + Device Key).</>}
                 >
                    <div className="space-y-3">
                       <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                             <Label className="text-xs">E-mail do revendedor</Label>
                             <Input type="email" autoComplete="off" value={smartersForm.username} onChange={e => setSmartersForm(f => ({ ...f, username: e.target.value }))} placeholder="seu-email@exemplo.com" />
                          </div>
                          <div className="space-y-1.5">
                             <Label className="text-xs">Senha</Label>
                             <div className="relative">
                                <Input type={showSmartersPass ? 'text' : 'password'} autoComplete="new-password" value={smartersForm.password} onChange={e => setSmartersForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" className="pr-9" />
                                <button type="button" onClick={() => setShowSmartersPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showSmartersPass ? 'Ocultar' : 'Mostrar'}>
                                   {showSmartersPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                             </div>
                          </div>
                       </div>
                       <Button
                          type="button"
                          variant="outline"
                          onClick={() => testSmarters.mutate()}
                          disabled={testSmarters.isPending}
                          className="w-full rounded-xl font-black uppercase text-[11px] tracking-wider"
                       >
                          {testSmarters.isPending
                             ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testando login…</>
                             : <><ShieldCheck className="w-4 h-4 mr-2" /> Testar login e ver créditos</>}
                       </Button>
                    </div>
                 </PanelCredentialCard>
             </div>
          </TabsContent>


          <TabsContent value="templates" className="animate-in slide-in-from-bottom-4 duration-500">
             <PlaylistTemplatesCard />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
         <DialogContent className="bg-background/80 backdrop-blur-2xl border-border/50 rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
               <DialogTitle className="text-xl font-bold">{editingApp ? 'Editar App' : 'Novo App'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-5 pt-4">
               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Nome do App</Label>
                  <Input value={form.app_name} onChange={e => setForm({...form, app_name: e.target.value})} placeholder="Ex: BOBPLAYER" className="h-11 bg-background/50 border-border/50 rounded-xl" required />
               </div>
               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Ícone do App (URL)</Label>
                  <div className="flex items-center gap-3">
                     <AppLogo name={form.app_name} url={form.logo_url} size={44} />
                     <Input value={form.logo_url || ''} onChange={e => setForm({...form, logo_url: e.target.value})} placeholder="https://site.com/icone.png" className="h-11 bg-background/50 border-border/50 rounded-xl flex-1" />
                     <Button type="button" variant="outline" className="h-11 rounded-xl shrink-0" onClick={() => setForm({ ...form, logo_url: guessLogo(form.app_name) })} title="Buscar ícone automaticamente">
                        <ImageIcon className="w-4 h-4" />
                     </Button>
                  </div>
               </div>
               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Descrição</Label>
                  <Input value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} placeholder="Ex: Licença anual do app" className="h-11 bg-background/50 border-border/50 rounded-xl" />
               </div>

               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">O que o cliente precisa informar</Label>
                  <div className="grid grid-cols-2 gap-3">
                     <button
                        type="button"
                        onClick={() => setForm({ ...form, requires_mac: !form.requires_mac })}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${form.requires_mac ? 'border-primary bg-primary/10' : 'border-border/50 bg-background/40 hover:bg-muted/40'}`}
                     >
                        <Smartphone className={`w-4 h-4 ${form.requires_mac ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                           <p className="text-xs font-black uppercase tracking-wide">MAC</p>
                           <p className="text-[10px] text-muted-foreground">Endereço MAC do aparelho</p>
                        </div>
                        <Switch checked={!!form.requires_mac} onCheckedChange={v => setForm({ ...form, requires_mac: v })} onClick={e => e.stopPropagation()} />
                     </button>
                     <button
                        type="button"
                        onClick={() => setForm({ ...form, requires_email: !form.requires_email })}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${form.requires_email ? 'border-sky-500 bg-sky-500/10' : 'border-border/50 bg-background/40 hover:bg-muted/40'}`}
                     >
                        <Mail className={`w-4 h-4 ${form.requires_email ? 'text-sky-500' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                           <p className="text-xs font-black uppercase tracking-wide">E-mail</p>
                           <p className="text-[10px] text-muted-foreground">Conta de e-mail do cliente</p>
                        </div>
                        <Switch checked={!!form.requires_email} onCheckedChange={v => setForm({ ...form, requires_email: v })} onClick={e => e.stopPropagation()} />
                     </button>
                  </div>
               </div>

               <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Mensal</Label>
                     <Input type="number" step="0.01" value={form.price_monthly ?? ''} onChange={e => setForm({...form, price_monthly: e.target.value})} className="h-11 bg-background/50 border-border/50 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Trimestral</Label>
                     <Input type="number" step="0.01" value={form.price_quarterly ?? ''} onChange={e => setForm({...form, price_quarterly: e.target.value})} className="h-11 bg-background/50 border-border/50 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Anual</Label>
                     <Input type="number" step="0.01" value={form.price_annual ?? ''} onChange={e => setForm({...form, price_annual: e.target.value})} className="h-11 bg-background/50 border-border/50 rounded-xl" />
                  </div>
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
