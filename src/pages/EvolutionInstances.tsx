import { useEffect, useRef, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, QrCode, Plus, RefreshCw, LogOut, CheckCircle2, Smartphone,
  Wifi, WifiOff, Zap, ShieldCheck, Sparkles, Settings as SettingsIcon, Save, Trash2,
  Lock, Server,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import logoSg from '@/assets/logo-sg.png';
import whatsappBg from '@/assets/whatsapp-bg.jpg';
import CrmChannelsInline from '@/components/crm/CrmChannelsInline';



interface InstanceRow {
  id: string;
  name: string;
  state: string;
  phone: string | null;
  profile_pic: string | null;
  profile_name?: string | null;
}

function stateBadge(state: string) {
  const s = String(state || '').toLowerCase();
  if (s === 'open' || s === 'connected' || s === 'online' || s.includes('open')) {
    return { label: 'Conectada', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: Wifi };
  }
  if (s.includes('connecting') || s.includes('qr')) {
    return { label: 'Aguardando QR', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: QrCode };
  }
  return { label: 'Desconectada', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30', icon: WifiOff };
}

export default function EvolutionInstances() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrInstance, setQrInstance] = useState<string | null>(null);
  const [qrMsg, setQrMsg] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const WEBHOOK_EVENTS = ['ALL','MESSAGE','SEND_MESSAGE','READ_RECEIPT','PRESENCE','HISTORY_SYNC','CHAT_PRESENCE','CALL','CONNECTION','QRCODE','CONTACTS','CHATS','GROUPS'];
  const DEFAULT_WEBHOOK_EVENTS = ['MESSAGE','SEND_MESSAGE','CONNECTION','PRESENCE','CHAT_PRESENCE'];
  const DEFAULT_ADVANCED = {
    alwaysOnline: false,
    rejectCall: false,
    msgCall: '',
    readMessages: false,
    ignoreGroups: false,
    ignoreStatus: false,
    readStatus: false,
    syncFullHistory: false,
    groupsOnly: false,
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInstance, setSettingsInstance] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [advanced, setAdvanced] = useState(DEFAULT_ADVANCED);
  const [webhookEvents, setWebhookEvents] = useState<string[]>(DEFAULT_WEBHOOK_EVENTS);

  const openSettings = async (name: string) => {
    setSettingsInstance(name);
    setSettingsOpen(true);
    setLoadingSettings(true);
    const { data } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'get-instance-settings', instance: name },
    });
    if (data?.ok) {
      setAdvanced({ ...DEFAULT_ADVANCED, ...(data.advanced || {}) });
      const savedEvents = Array.isArray(data.webhook?.events) ? data.webhook.events : DEFAULT_WEBHOOK_EVENTS;
      setWebhookEvents(savedEvents.length ? savedEvents : DEFAULT_WEBHOOK_EVENTS);
    } else {
      setAdvanced(DEFAULT_ADVANCED);
      setWebhookEvents(DEFAULT_WEBHOOK_EVENTS);
    }
    setLoadingSettings(false);
  };

  const toggleEvent = (ev: string) => {
    setWebhookEvents((prev) => {
      if (ev === 'ALL') return prev.includes('ALL') ? [] : ['ALL'];
      const next = prev.filter((e) => e !== 'ALL');
      return next.includes(ev) ? next.filter((e) => e !== ev) : [...next, ev];
    });
  };

  const saveSettings = async () => {
    if (!settingsInstance) return;
    setSavingSettings(true);
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: {
        action: 'update-instance-settings',
        instance: settingsInstance,
        advanced,
        webhook: { events: webhookEvents, enabled: webhookEvents.length > 0 },
      },
    });
    setSavingSettings(false);
    if (error || !data?.ok) {
      toast({ title: 'Falha', description: error?.message || 'Não foi possível aplicar todas as configurações.', variant: 'destructive' });
      return;
    }
    toast({
      title: 'Salvo',
      description: data.remoteOk === false
        ? `Configurações de "${settingsInstance}" foram guardadas; o painel WhatsApp recusou aplicar uma parte agora.`
        : `Configurações de "${settingsInstance}" aplicadas.`,
    });
    setSettingsOpen(false);
  };

  const fetchInstances = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'list-instances' },
    });
    if (error) {
      toast({ title: 'Erro ao listar', description: error.message, variant: 'destructive' });
      return;
    }
    if (data?.ok) {
      setInstances(data.instances || []);
      setCurrent(data.current || '');
      if (data.warning) {
        toast({ title: 'Atenção', description: data.warning });
      }
    } else if (data?.error) {
      toast({ title: 'Atenção', description: data.error });
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchInstances();
      setLoading(false);
    })();
  }, [fetchInstances]);

  const openQr = async (instanceName: string) => {
    setQrInstance(instanceName);
    setQrOpen(true);
    setQrImg(null);
    setQrMsg(null);
    setQrLoading(true);
    const loadQr = async () => {
      const { data } = await supabase.functions.invoke('evolution-send', {
        body: { action: 'qr-connect', instance: instanceName },
      });
      if (data?.alreadyConnected) {
        setQrMsg('Esta instância já está conectada.');
        setQrLoading(false);
        return true;
      }
      if (data?.ok && data.qr) {
        setQrImg(data.qr);
        setQrMsg(null);
      } else if (data?.error) {
        setQrMsg(data.error);
      }
      setQrLoading(false);
      return false;
    };
    const connected = await loadQr();
    if (connected) return;
    pollRef.current = window.setInterval(async () => {
      const done = await loadQr();
      const { data } = await supabase.functions.invoke('evolution-send', {
        body: { action: 'list-instances' },
      });
      if (data?.ok) {
        setInstances(data.instances || []);
        const me = (data.instances || []).find((i: InstanceRow) => i.name === instanceName);
        if (done || (me && /open|connected|online/i.test(me.state))) {
          toast({ title: 'Conectado!', description: `${instanceName} agora está online.` });
          closeQr();
        }
      }
    }, 8000);
  };

  const closeQr = () => {
    setQrOpen(false);
    setQrImg(null);
    setQrInstance(null);
    setQrMsg(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const createInstance = async () => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) {
      toast({ title: 'Nome obrigatório', description: 'Informe um nome para a instância.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'create-instance', name },
    });
    setCreating(false);
    if (error || !data?.ok) {
      toast({
        title: 'Falha ao criar',
        description: data?.error || error?.message || 'Verifique a URL/API Key em Configurações.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Instância criada', description: `${name} pronta para conectar.` });
    setNewName('');
    await fetchInstances();
    openQr(name);
  };

  const setActive = async (name: string) => {
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'set-active-instance', name },
    });
    if (error || !data?.ok) {
      toast({ title: 'Erro', description: error?.message || 'Não foi possível ativar', variant: 'destructive' });
      return;
    }
    setCurrent(name);
    toast({ title: 'Instância ativa', description: `${name} é a instância usada pelo Chat.` });
  };

  const logout = async (name: string) => {
    if (!confirm(`Desconectar a instância "${name}"?`)) return;
    const { data } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'logout-instance', instance: name },
    });
    if (data?.ok) {
      toast({ title: 'Desconectada', description: name });
      fetchInstances();
    } else {
      toast({ title: 'Falha', description: data?.error || 'Erro ao desconectar', variant: 'destructive' });
    }
  };

  const deleteInstance = async (name: string) => {
    if (!confirm(`Excluir definitivamente a instância "${name}"? Isso libera seu slot e remove do painel WhatsApp.`)) return;
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'delete-instance', instance: name },
    });
    if (error || !data?.ok) {
      const attemptsInfo = Array.isArray(data?.attempts)
        ? ` (tentativas: ${data.attempts.map((a: any) => `${a.method} ${a.status}`).join(', ')})`
        : '';
      toast({
        title: 'Falha ao excluir',
        description: (data?.error || error?.message || 'Erro ao excluir') + attemptsInfo,
        variant: 'destructive',
      });
      fetchInstances();
      return;
    }
    toast({ title: 'Instância excluída', description: name });
    fetchInstances();
  };


  return (
    <DashboardLayout>
      {/* Full-screen background image */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${whatsappBg})` }}
        aria-hidden
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/85 to-background/95 backdrop-blur-[2px]" aria-hidden />

      <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 relative">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-background/40 backdrop-blur-xl p-6 md:p-8 shadow-2xl shadow-emerald-500/10">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-emerald-500/30 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-2">
                <Sparkles className="w-3.5 h-3.5" /> CONEXÕES WHATSAPP
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Conecte suas instâncias</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Gerencie quantas linhas quiser, escaneie o QR direto pelo navegador e ative qual será usada no Chat WhatsApp.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchInstances} className="bg-background/60 backdrop-blur">
                <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
              </Button>
            </div>
          </div>
        </div>

        {/* Create */}
        <Card className="border-emerald-500/15 bg-background/50 backdrop-blur-xl shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="w-4 h-4 text-primary" /> Nova instância
            </CardTitle>
            <CardDescription>Apenas escolha um nome.</CardDescription>
          </CardHeader>
          <CardContent>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Label className="text-xs">Nome da instância</Label>
                <Input
                  placeholder="ex: vendas, suporte, financeiro"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createInstance(); }}
                />
              </div>
              <Button onClick={createInstance} disabled={creating} className="sm:self-end gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Criar e conectar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : instances.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center space-y-2">
              <Smartphone className="w-10 h-10 mx-auto text-muted-foreground" />
              <div className="text-sm font-medium">Nenhuma instância encontrada</div>
              <div className="text-xs text-muted-foreground">Crie uma acima ou verifique sua API Evolution em Configurações.</div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {instances.map((inst) => {
              const b = stateBadge(inst.state);
              const Icon = b.icon;
              const isActive = inst.name === current;
              const connected = /open|connected|online/i.test(inst.state);
              return (
                <Card
                  key={inst.id || inst.name}
                  className={`relative overflow-hidden border bg-background/55 backdrop-blur-xl transition-all hover:shadow-2xl hover:shadow-emerald-500/20 hover:-translate-y-1 ${
                    isActive ? 'ring-2 ring-emerald-500/50 border-emerald-500/40' : 'border-white/10'
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-2 right-2 z-10 bg-primary/90 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> EM USO
                    </div>
                  )}
                  {/* Logo Super Gestor grande */}
                  <div className="relative w-full aspect-square bg-gradient-to-br from-muted to-muted/50 overflow-hidden flex items-center justify-center">
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-500/10 to-primary/10">
                      <img src={logoSg} className="w-40 h-40 object-contain opacity-80" alt="Super Gestor" />
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-3">
                    {/* Nome e status/telefone */}
                    <div>
                      <div className="font-bold text-lg leading-tight truncate">{inst.name}</div>
                      <div className="flex items-center justify-between mt-2">
                        <Badge className={`gap-1 text-[10px] border-0 ${b.cls}`}>
                          <Icon className="w-3 h-3" /> {b.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {inst.phone ? `+${inst.phone}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Info extra */}
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3 h-3 shrink-0" />
                        <span className="truncate">{inst.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Server className="w-3 h-3 shrink-0" />
                        <span className="truncate">WhatsApp API</span>
                      </div>
                    </div>

                    {/* Botões de ação */}
                    <div className="flex items-center gap-2 pt-1">
                      {!connected && (
                        <Button
                          size="icon"
                          onClick={() => openQr(inst.name)}
                          className="h-9 w-9 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                        >
                          <QrCode className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => openSettings(inst.name)}
                        className="h-9 w-9 bg-blue-600 hover:bg-blue-700 text-white border-0"
                      >
                        <SettingsIcon className="w-4 h-4" />
                      </Button>
                      {connected && (
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={() => logout(inst.name)}
                          className="h-9 w-9 bg-rose-400 hover:bg-rose-500 text-white border-0"
                        >
                          <LogOut className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => deleteInstance(inst.name)}
                        className="h-9 w-9 bg-rose-600 hover:bg-rose-700 text-white border-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      {!isActive && connected && (
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => setActive(inst.name)}
                          className="h-9 w-9 ml-auto border-primary/50 text-primary hover:bg-primary/10"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* CRM Oficial channels inline */}
        <div className="pt-2">
          <CrmChannelsInline />
        </div>
      </div>

      {/* QR Dialog */}
      <Dialog open={qrOpen} onOpenChange={(o) => { if (!o) closeQr(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-500" /> Escaneie com o WhatsApp
            </DialogTitle>
            <DialogDescription>
              No celular, abra <b>WhatsApp → Aparelhos conectados → Conectar um aparelho</b> e aponte para o QR abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-64 h-64 rounded-xl bg-white p-3 flex items-center justify-center shadow-lg">
              {qrLoading && !qrImg ? (
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              ) : qrImg ? (
                <img src={qrImg} alt="QR Code" className="w-full h-full object-contain" />
              ) : qrMsg ? (
                <div className="text-xs text-emerald-600 text-center px-4 font-medium">{qrMsg}</div>
              ) : (
                <div className="text-xs text-rose-500 text-center px-4">
                  Não foi possível obter o QR. Tente novamente.
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground text-center">
              Instância: <b className="text-foreground">{qrInstance}</b> · O QR atualiza automaticamente.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" /> Configurações da instância
            </DialogTitle>
            <DialogDescription>
              Ajustes avançados e eventos de webhook para <b className="text-foreground">{settingsInstance}</b>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {loadingSettings && (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando configurações salvas...
              </div>
            )}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Configurações Avançadas</h3>
              {[
                { key: 'alwaysOnline', label: 'Sempre Online', desc: 'Manter status sempre online no WhatsApp' },
                { key: 'rejectCall', label: 'Rejeitar Chamadas', desc: 'Rejeitar todas as chamadas automaticamente' },
                { key: 'readMessages', label: 'Marcar como Lida', desc: 'Marcar mensagens recebidas como lidas' },
                { key: 'readStatus', label: 'Ver Status (Stories)', desc: 'Visualizar status/stories dos contatos' },
                { key: 'ignoreGroups', label: 'Ignorar Grupos', desc: 'Não receber mensagens de grupos' },
                { key: 'groupsOnly', label: 'Apenas Grupos', desc: 'Receber somente mensagens de grupos (ignora contatos)' },
                { key: 'ignoreStatus', label: 'Ignorar Status', desc: 'Ignorar atualizações de status dos contatos' },
                { key: 'syncFullHistory', label: 'Sincronizar Histórico', desc: 'Sincronizar todo o histórico de mensagens ao conectar' },
              ].map((opt) => (
                <div key={opt.key} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                  <Switch
                    checked={(advanced as any)[opt.key]}
                    onCheckedChange={(v) => setAdvanced((a) => ({ ...a, [opt.key]: v }))}
                  />
                </div>
              ))}
              {advanced.rejectCall && (
                <div className="space-y-1">
                  <Label className="text-xs">Mensagem ao rejeitar chamada (opcional)</Label>
                  <Input
                    placeholder="Ex: No momento não atendo chamadas, envie uma mensagem."
                    value={advanced.msgCall}
                    onChange={(e) => setAdvanced((a) => ({ ...a, msgCall: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Eventos do Webhook</h3>
              <p className="text-xs text-muted-foreground">Selecione quais eventos a Evolution deve enviar para o sistema.</p>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 p-2 rounded border border-border/60 cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={webhookEvents.includes(ev) || (ev !== 'ALL' && webhookEvents.includes('ALL'))}
                      onCheckedChange={() => toggleEvent(ev)}
                    />
                    <span className="text-xs font-medium">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
            <Button onClick={saveSettings} disabled={savingSettings || loadingSettings} className="gap-2">
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar configurações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
