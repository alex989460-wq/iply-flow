import { useState, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Smartphone, Mail, Monitor, Clock, CheckCircle2, XCircle, AlertCircle, Settings2, Eye, EyeOff, Zap } from 'lucide-react';
import { format } from 'date-fns';

// Logos conhecidas (URL pública) por nome de app (uppercase).
const APP_LOGOS: Record<string, string> = {
  IBOPLAYERPRO: 'https://iboplayer.pro/m3u/logo-512.png',
  'IBO PLAYER PRO': 'https://iboplayer.pro/m3u/logo-512.png',
  DUPLECAST: 'https://duplecast.com/favicon.ico',
  CLOUDDY: 'https://console.clouddy.online/favicon.ico',
};

// Paleta fixa por app (mesmo estilo do painel ibosol.com) — usada quando não
// existe uma logo real cadastrada. Assim cada app tem sempre a mesma cor.
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

// Cache global das logos vindas do painel IBO Sol.
// Persiste em localStorage para não depender do token estar válido —
// uma vez que o painel devolveu as logos, elas ficam fixas.
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
        className="rounded-lg object-contain bg-muted p-0.5 border border-border/50 shrink-0"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, background: bg, fontSize: Math.max(10, size * 0.35) }}
      className="rounded-lg flex items-center justify-center text-white font-bold shrink-0"
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

  // Busca logos oficiais dos apps direto do painel IBO Sol (usa o token salvo).
  useQuery({
    queryKey: ['ibosol-apps-logos'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      try {
        const { data } = await supabase.functions.invoke('ibosol-list-apps');
        const list: Array<{ name: string; logo: string | null }> = (data as any)?.apps || [];
        for (const a of list) {
          if (a?.name && a?.logo) {
            IBOSOL_LOGOS[a.name.toUpperCase()] = a.logo;
            IBOSOL_LOGOS[normKey(a.name)] = a.logo;
          }
        }
        try { localStorage.setItem(IBOSOL_LOGOS_KEY, JSON.stringify(IBOSOL_LOGOS)); } catch {}
        return list;
      } catch { return []; }
    },
  });

  const duplecast = panelCreds.find((c: any) => c.panel_type === 'duplecast');
  const clouddy = panelCreds.find((c: any) => c.panel_type === 'clouddy');
  const p2cine = panelCreds.find((c: any) => c.panel_type === 'p2cine');
  const ibosol = panelCreds.find((c: any) => c.panel_type === 'ibosol');
  const iboPro = panelCreds.find((c: any) => c.panel_type === 'iboplayerpro');
  const [duplecastForm, setDuplecastForm] = useState({ username: '', password: '', is_enabled: true });

  const [clouddyForm, setClouddyForm] = useState({ base_url: 'https://console.clouddy.online', cookie: '', is_enabled: true });
  const [p2cineForm, setP2cineForm] = useState({ base_url: '', is_enabled: false });
  const [ibosolForm, setIbosolForm] = useState({ token: '', is_enabled: true });
  const [iboProForm, setIboProForm] = useState({ username: '', password: '', is_enabled: true });
  const [showPass, setShowPass] = useState(false);
  const [showClCookie, setShowClCookie] = useState(false);
  const [showIboTok, setShowIboTok] = useState(false);
  const [showIboProPass, setShowIboProPass] = useState(false);

  useEffect(() => {
    if (duplecast) {
      setDuplecastForm({
        username: duplecast.username || '',
        password: duplecast.password || '',
        is_enabled: duplecast.is_enabled ?? true,
      });
    }
  }, [duplecast?.id, duplecast?.updated_at]);

  useEffect(() => {
    if (clouddy) {
      setClouddyForm({
        base_url: clouddy.username || 'https://console.clouddy.online',
        cookie: clouddy.password || '',
        is_enabled: clouddy.is_enabled ?? true,
      });
    }
  }, [clouddy?.id, clouddy?.updated_at]);

  useEffect(() => {
    if (p2cine) {
      setP2cineForm({
        base_url: p2cine.username || '',
        is_enabled: false,
      });
    }
  }, [p2cine?.id, p2cine?.updated_at]);

  useEffect(() => {
    if (ibosol) {
      setIbosolForm({
        token: ibosol.password || '',
        is_enabled: ibosol.is_enabled ?? true,
      });
    }
  }, [ibosol?.id, ibosol?.updated_at]);

  useEffect(() => {
    if (iboPro) {
      setIboProForm({
        username: iboPro.username || '',
        password: iboPro.password || '',
        is_enabled: iboPro.is_enabled ?? true,
      });
    }
  }, [iboPro?.id, iboPro?.updated_at]);

  const saveDuplecast = useMutation({
    mutationFn: async () => {
      if (!duplecastForm.username.trim() || !duplecastForm.password.trim()) {
        throw new Error('E-mail e senha do painel Duplecast são obrigatórios');
      }
      const payload = {
        user_id: user?.id,
        panel_type: 'duplecast',
        username: duplecastForm.username.trim(),
        password: duplecastForm.password,
        is_enabled: duplecastForm.is_enabled,
      };
      const { error } = await (supabase as any)
        .from('activation_panel_credentials')
        .upsert(payload, { onConflict: 'user_id,panel_type' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activation-panel-credentials'] });
      toast.success('Credenciais Duplecast salvas!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveClouddy = useMutation({
    mutationFn: async () => {
      if (!clouddyForm.base_url.trim() || !clouddyForm.cookie.trim()) {
        throw new Error('URL do painel e cookie da sessão Clouddy são obrigatórios');
      }
      const payload = {
        user_id: user?.id,
        panel_type: 'clouddy',
        username: clouddyForm.base_url.trim().replace(/\/+$/, ''),
        password: clouddyForm.cookie.trim(),
        is_enabled: clouddyForm.is_enabled,
      };
      const { error } = await (supabase as any)
        .from('activation_panel_credentials')
        .upsert(payload, { onConflict: 'user_id,panel_type' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activation-panel-credentials'] });
      toast.success('Credenciais Clouddy salvas!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveP2cine = useMutation({
    mutationFn: async () => {
      if (!p2cineForm.base_url.trim()) {
        throw new Error('URL do painel P2Cine é obrigatória');
      }
      const payload = {
        user_id: user?.id,
        panel_type: 'p2cine',
        username: p2cineForm.base_url.trim().replace(/\/+$/, ''),
        password: '',
        is_enabled: false,
      };
      const { error } = await (supabase as any)
        .from('activation_panel_credentials')
        .upsert(payload, { onConflict: 'user_id,panel_type' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activation-panel-credentials'] });
      toast.success('P2Cine salvo como renovação manual.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveIbosol = useMutation({
    mutationFn: async () => {
      if (!ibosolForm.token.trim()) {
        throw new Error('Token do IBO Sol é obrigatório');
      }
      const payload = {
        user_id: user?.id,
        panel_type: 'ibosol',
        username: 'https://backend-apis.ibosol.com',
        password: ibosolForm.token.trim(),
        is_enabled: ibosolForm.is_enabled,
      };
      const { error } = await (supabase as any)
        .from('activation_panel_credentials')
        .upsert(payload, { onConflict: 'user_id,panel_type' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activation-panel-credentials'] });
      toast.success('Token IBO Sol salvo!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveIboPro = useMutation({
    mutationFn: async () => {
      if (!iboProForm.username.trim() || !iboProForm.password.trim()) {
        throw new Error('E-mail e senha do IBO Player Pro são obrigatórios');
      }
      const payload = {
        user_id: user?.id,
        panel_type: 'iboplayerpro',
        username: iboProForm.username.trim(),
        password: iboProForm.password,
        is_enabled: iboProForm.is_enabled,
      };
      const { error } = await (supabase as any)
        .from('activation_panel_credentials')
        .upsert(payload, { onConflict: 'user_id,panel_type' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activation-panel-credentials'] });
      toast.success('Credenciais IBO Player Pro salvas!');
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

  // ── Ativação Manual (revendas sem Cakto) ──
  const [manualForm, setManualForm] = useState({
    app_name: '',
    customer_name: '',
    customer_phone: '',
    email: '',
    mac_address: '',
    amount: '',
  });

  const manualActivate = useMutation({
    mutationFn: async () => {
      if (!manualForm.app_name) throw new Error('Selecione o app');
      if (!manualForm.customer_name.trim()) throw new Error('Nome do cliente é obrigatório');
      const upper = manualForm.app_name.toUpperCase();
      const isClouddy = upper === 'CLOUDDY';
      const isDuplecast = upper === 'DUPLECAST';
      const isIbo = !isClouddy && !isDuplecast; // demais apps são todos IBO Sol
      if (isClouddy && !manualForm.email.trim()) throw new Error('E-mail é obrigatório para Clouddy');
      if ((isDuplecast || isIbo) && !manualForm.mac_address.trim()) throw new Error('MAC é obrigatório para este app');


      const { data: inserted, error: insErr } = await (supabase as any)
        .from('activation_requests')
        .insert({
          user_id: user?.id,
          app_name: manualForm.app_name,
          customer_name: manualForm.customer_name.trim(),
          customer_phone: manualForm.customer_phone.replace(/\D/g, '') || null,
          email: manualForm.email.trim() || null,
          mac_address: manualForm.mac_address.trim() || null,
          payment_method: 'Manual',
          amount: Number(manualForm.amount) || 0,
          status: 'pending',
          cakto_payload: { source: 'manual_activation' },
        })
        .select('id')
        .single();
      if (insErr) throw insErr;

      const { data, error } = await supabase.functions.invoke('confirm-activation', {
        body: { request_id: inserted.id, action: 'activate' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['activation-requests'] });
      toast.success(data?.message || 'Ativação enviada!');
      setManualForm({ app_name: '', customer_name: '', customer_phone: '', email: '', mac_address: '', amount: '' });
    },
    onError: (e: any) => toast.error(e.message || 'Falha na ativação'),
  });


  function openNew() {
    setEditingApp(null);
    setForm({ app_name: '', description: '', logo_url: '', requires_email: false, requires_mac: true, is_enabled: true, price_monthly: '', price_quarterly: '', price_annual: 25 });
    setDialogOpen(true);
  }

  function openEdit(app: any) {
    setEditingApp(app);
    setForm({
      app_name: app.app_name, description: app.description || '', logo_url: app.logo_url || '',
      requires_email: app.requires_email, requires_mac: app.requires_mac, is_enabled: app.is_enabled,
      price_monthly: app.price_monthly ?? '',
      price_quarterly: app.price_quarterly ?? '',
      price_annual: app.price_annual ?? 25,
    });
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
            <TabsTrigger value="manual">
              <Zap className="w-3.5 h-3.5 mr-1" /> Ativação Manual
            </TabsTrigger>
            <TabsTrigger value="apps">Apps Configurados</TabsTrigger>
            <TabsTrigger value="panels">
              <Settings2 className="w-3.5 h-3.5 mr-1" /> Painéis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" /> Ativação Manual
                </CardTitle>
                <CardDescription>
                  Para revendas que recebem pagamento manualmente (sem Cakto). Selecione o app, informe os dados do cliente e ative na hora.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(() => {
                  // Apps agrupados por painel — o nome enviado precisa bater com o roteamento
                  // do confirm-activation (DUPLECAST / CLOUDDY / regex IBO Sol).
                  const PANEL_APPS: Record<string, { label: string; apps: string[]; needsMac: boolean; needsEmail: boolean }> = {
                    duplecast: { label: 'Duplecast', apps: ['DUPLECAST'], needsMac: true, needsEmail: false },
                    clouddy:   { label: 'Clouddy',   apps: ['CLOUDDY'],   needsMac: false, needsEmail: true },
                    ibosol:    {
                      label: 'IBO Sol',
                      needsMac: true,
                      needsEmail: false,
                      apps: [
                        'BOBPLAYER','BOBPRO','BOBPREMIUM','IBOPLAYER','IBOSTB','IBOSSPLAYER',
                        'IBOSOLPLAYER','IBO VPN PLAYER','IBO PLAY','ABEPLAYERTV','MACPLAYER',
                        'VIRGINIA','ALLPLAYER','HUSHPLAY','KTNPLAYER','FAMILYPLAYER','KING4KPLAYER',
                        'IBOXXPLAYER','DUPLEX','FLIXNET','SMARTONEPRO','CR PLAYER','HQ PLAYER','MESSITV',
                      ],
                    },
                    iboplayerpro: { label: 'IBO Player Pro', apps: ['IBOPLAYERPRO'], needsMac: true, needsEmail: false },
                  };
                  const findPanel = (name: string) =>
                    Object.values(PANEL_APPS).find(p => p.apps.includes(name));
                  const selectedPanel = findPanel(manualForm.app_name);
                  const needsMac = selectedPanel?.needsMac ?? false;
                  const needsEmail = selectedPanel?.needsEmail ?? false;

                  return (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>App *</Label>
                        <Select
                          value={manualForm.app_name}
                          onValueChange={(v) => setManualForm(f => ({ ...f, app_name: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o aplicativo" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PANEL_APPS).map(([key, panel]) => (
                              <div key={key}>
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {panel.label}
                                </div>
                                {panel.apps.map(app => (
                                  <SelectItem key={app} value={app}>
                                    <span className="flex items-center gap-2">
                                      <AppLogo name={app} url={apps.find((a: any) => a.app_name?.toUpperCase() === app.toUpperCase())?.logo_url} size={20} />
                                      {app}
                                    </span>
                                  </SelectItem>
                                ))}

                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedPanel && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Painel: <b>{selectedPanel.label}</b>
                          </p>
                        )}
                      </div>
                      <div>
                        <Label>Nome do cliente *</Label>
                        <Input
                          value={manualForm.customer_name}
                          onChange={e => setManualForm(f => ({ ...f, customer_name: e.target.value }))}
                          placeholder="Ex: João da Silva"
                        />
                      </div>
                      <div>
                        <Label>E-mail {needsEmail && <span className="text-destructive">*</span>}</Label>
                        <Input
                          type="email"
                          value={manualForm.email}
                          onChange={e => setManualForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="cliente@email.com"
                          disabled={!!selectedPanel && !needsEmail && selectedPanel.label !== 'Clouddy'}
                        />
                      </div>
                      <div>
                        <Label>MAC {needsMac && <span className="text-destructive">*</span>}</Label>
                        <Input
                          value={manualForm.mac_address}
                          onChange={e => setManualForm(f => ({ ...f, mac_address: e.target.value }))}
                          placeholder="AA:BB:CC:DD:EE:FF"
                          className="font-mono"
                          disabled={!!selectedPanel && !needsMac}
                        />
                      </div>
                      <div>
                        <Label>Telefone (WhatsApp)</Label>
                        <Input
                          value={manualForm.customer_phone}
                          onChange={e => setManualForm(f => ({ ...f, customer_phone: e.target.value }))}
                          placeholder="5511999999999"
                        />
                      </div>
                      <div>
                        <Label>Valor recebido (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={manualForm.amount}
                          onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  );
                })()}


                <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-xs text-muted-foreground flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-500" />
                  <span>
                    Usa as credenciais do painel configuradas na aba <b>Painéis</b> (Duplecast, Clouddy, IBO Sol). Se o telefone estiver preenchido, o cliente recebe a mensagem de ativado automaticamente.
                  </span>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => manualActivate.mutate()} disabled={manualActivate.isPending}>
                    <Zap className="w-4 h-4 mr-1" />
                    {manualActivate.isPending ? 'Ativando...' : 'Ativar agora'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


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
                                {req.status !== 'activated' && req.status !== 'rejected' && (
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
                            <AppLogo name={app.app_name} url={app.logo_url} size={40} />
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

          <TabsContent value="panels">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings2 className="w-5 h-5" /> Credenciais dos Painéis
                </CardTitle>
                <CardDescription>
                  Configure aqui o login do seu painel de revenda para ativar apps automaticamente quando um pedido chegar. Cada revendedor usa suas próprias credenciais.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-xl border border-border/50 p-4 space-y-4 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Duplecast</h3>
                        <p className="text-xs text-muted-foreground">
                          Painel do revendedor em <span className="font-mono">duplecast.com/client/login</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="dup-enabled" className="text-xs">Ativação automática</Label>
                      <Switch
                        id="dup-enabled"
                        checked={duplecastForm.is_enabled}
                        onCheckedChange={v => setDuplecastForm(f => ({ ...f, is_enabled: v }))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>E-mail do painel</Label>
                      <Input
                        type="email"
                        autoComplete="off"
                        value={duplecastForm.username}
                        onChange={e => setDuplecastForm(f => ({ ...f, username: e.target.value }))}
                        placeholder="seuemail@dominio.com"
                      />
                    </div>
                    <div>
                      <Label>Senha</Label>
                      <div className="relative">
                        <Input
                          type={showPass ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={duplecastForm.password}
                          onChange={e => setDuplecastForm(f => ({ ...f, password: e.target.value }))}
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showPass ? 'Ocultar' : 'Mostrar'}
                        >
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-xs text-muted-foreground flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-500" />
                    <span>
                      Ao chegar um pedido de ativação com o app <b>Duplecast</b>, o sistema fará login com essas credenciais, cadastrará o <b>MAC</b> no <b>code</b> informado pelo cliente e disparará automaticamente a mensagem de app ativado. Se falhar, a solicitação fica pendente para ativação manual.
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => saveDuplecast.mutate()} disabled={saveDuplecast.isPending}>
                      {saveDuplecast.isPending ? 'Salvando...' : 'Salvar credenciais'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 p-4 space-y-4 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Clouddy</h3>
                        <p className="text-xs text-muted-foreground">
                          Painel do revendedor em <span className="font-mono">console.clouddy.online/reseller</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="cl-enabled" className="text-xs">Ativação automática</Label>
                      <Switch
                        id="cl-enabled"
                        checked={clouddyForm.is_enabled}
                        onCheckedChange={v => setClouddyForm(f => ({ ...f, is_enabled: v }))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>URL do painel</Label>
                      <Input
                        value={clouddyForm.base_url}
                        onChange={e => setClouddyForm(f => ({ ...f, base_url: e.target.value }))}
                        placeholder="https://console.clouddy.online"
                      />
                    </div>
                    <div>
                      <Label>Cookie da sessão</Label>
                      <div className="relative">
                        <Input
                          type={showClCookie ? 'text' : 'password'}
                          autoComplete="off"
                          value={clouddyForm.cookie}
                          onChange={e => setClouddyForm(f => ({ ...f, cookie: e.target.value }))}
                          placeholder="PHPSESSID=xxx; REMEMBERME=yyy"
                          className="font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowClCookie(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showClCookie ? 'Ocultar' : 'Mostrar'}
                        >
                          {showClCookie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-xs text-muted-foreground flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-500" />
                    <span>
                      Como o Clouddy tem <b>Cloudflare Turnstile</b> no login, entre em <span className="font-mono">console.clouddy.online/reseller</span> manualmente, abra o DevTools (F12) → <b>Network</b> → em qualquer requisição <span className="font-mono">/reseller/*</span> copie o valor completo do header <span className="font-mono">Cookie</span> e cole aqui (também aceita o JSON exportado). Ao chegar um pedido de ativação com o app <b>Clouddy</b>, o sistema usará essa sessão para localizar o cliente pelo <b>email</b> e realizar a recarga automaticamente.
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => saveClouddy.mutate()} disabled={saveClouddy.isPending}>
                      {saveClouddy.isPending ? 'Salvando...' : 'Salvar credenciais'}
                    </Button>
                  </div>
                </div>


                <div className="rounded-xl border border-border/50 p-4 space-y-4 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">IBO Sol (Bob Player, IBO Player, etc.)</h3>
                        <p className="text-xs text-muted-foreground">
                          Painel do revendedor em <span className="font-mono">ibosol.com</span> — ativação por MAC
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="ibo-enabled" className="text-xs">Ativação automática</Label>
                      <Switch
                        id="ibo-enabled"
                        checked={ibosolForm.is_enabled}
                        onCheckedChange={v => setIbosolForm(f => ({ ...f, is_enabled: v }))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Token do IBO Sol (Bearer)</Label>
                    <div className="relative">
                      <Input
                        type={showIboTok ? 'text' : 'password'}
                        autoComplete="off"
                        value={ibosolForm.token}
                        onChange={e => setIbosolForm(f => ({ ...f, token: e.target.value }))}
                        placeholder="5114508|tb3dyiNd5DRuzygqKTRRW9X2elAUtvjDPplNSPwj..."
                        className="font-mono text-xs pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowIboTok(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showIboTok ? 'Ocultar' : 'Mostrar'}
                      >
                        {showIboTok ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-xs text-muted-foreground flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-500" />
                    <span>
                      Como o IBO Sol tem <b>Cloudflare Turnstile</b> no login, faça login manualmente em <span className="font-mono">ibosol.com</span>, abra o DevTools (F12) → <b>Network</b> → localize a requisição <span className="font-mono">POST /api/login</span> e copie o campo <span className="font-mono">token</span> da resposta (formato <span className="font-mono">"5114508|xxxx..."</span>). Ao chegar um pedido com <b>BOBPLAYER</b>, <b>IBOPLAYER</b> ou qualquer outro app do IBO Sol, o sistema seleciona automaticamente o app correto e ativa o MAC do cliente (1 crédito).
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => saveIbosol.mutate()} disabled={saveIbosol.isPending}>
                      {saveIbosol.isPending ? 'Salvando...' : 'Salvar token'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 p-4 space-y-4 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">IBO Player Pro</h3>
                        <p className="text-xs text-muted-foreground">
                          Painel do revendedor em <span className="font-mono">cms.iboplayer.pro</span> — ativação por MAC
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="ibopro-enabled" className="text-xs">Ativação automática</Label>
                      <Switch
                        id="ibopro-enabled"
                        checked={iboProForm.is_enabled}
                        onCheckedChange={v => setIboProForm(f => ({ ...f, is_enabled: v }))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>E-mail do revendedor</Label>
                      <Input
                        type="email"
                        autoComplete="off"
                        value={iboProForm.username}
                        onChange={e => setIboProForm(f => ({ ...f, username: e.target.value }))}
                        placeholder="seu-email@exemplo.com"
                      />
                    </div>
                    <div>
                      <Label>Senha</Label>
                      <div className="relative">
                        <Input
                          type={showIboProPass ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={iboProForm.password}
                          onChange={e => setIboProForm(f => ({ ...f, password: e.target.value }))}
                          placeholder="••••••••"
                          className="pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowIboProPass(v => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showIboProPass ? 'Ocultar' : 'Mostrar'}
                        >
                          {showIboProPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-xs text-muted-foreground flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-500" />
                    <span>
                      Salve o e-mail e senha do painel <span className="font-mono">cms.iboplayer.pro</span>. O sistema mantém a sessão ativa automaticamente (mesma rotina do IBO Sol/Duplecast) e usa essas credenciais para ativar o MAC do cliente quando chegar um pedido do app <b>IBOPLAYERPRO</b>.
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => saveIboPro.mutate()} disabled={saveIboPro.isPending}>
                      {saveIboPro.isPending ? 'Salvando...' : 'Salvar credenciais'}
                    </Button>
                  </div>
                </div>



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
            <div>
              <Label>URL da Logo</Label>
              <div className="flex items-center gap-2">
                <AppLogo name={form.app_name || '?'} url={form.logo_url} size={40} />
                <Input
                  value={form.logo_url}
                  onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://.../logo.png (opcional)"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3 space-y-2 bg-muted/30">
              <Label className="text-sm font-semibold">Valores da Licença (R$)</Label>
              <p className="text-xs text-muted-foreground">Preços usados no checkout público de ativação. Deixe em branco para ocultar a opção.</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Mensal</Label>
                  <Input type="number" step="0.01" placeholder="—" value={form.price_monthly}
                    onChange={e => setForm(f => ({ ...f, price_monthly: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Trimestral</Label>
                  <Input type="number" step="0.01" placeholder="—" value={form.price_quarterly}
                    onChange={e => setForm(f => ({ ...f, price_quarterly: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Anual</Label>
                  <Input type="number" step="0.01" placeholder="25.00" value={form.price_annual}
                    onChange={e => setForm(f => ({ ...f, price_annual: e.target.value }))} />
                </div>
              </div>
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
