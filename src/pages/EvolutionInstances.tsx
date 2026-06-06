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
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const [adminMode, setAdminMode] = useState(true);
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
        ? `Configurações de "${settingsInstance}" foram guardadas; o painel Evolution recusou aplicar uma parte agora.`
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
      setAdminMode(!!data.adminMode);
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
    if (!confirm(`Excluir definitivamente a instância "${name}"? Isso libera seu slot e remove do painel Evolution.`)) return;
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
      <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-emerald-600/10 via-primary/10 to-cyan-500/10 p-6 md:p-8">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-2">
                <Sparkles className="w-3.5 h-3.5" /> CONEXÕES WHATSAPP
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Conecte suas instâncias</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Gerencie quantas linhas quiser, escaneie o QR direto pelo navegador e ative qual será usada no Chat Evolution.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={async () => {
                const { data, error } = await supabase.functions.invoke('evolution-send', { body: { action: 'set-webhook-all' } });
                if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
                const okCount = (data?.results || []).filter((r: any) => r.ok).length;
                const total = (data?.results || []).length;
                toast({ title: 'Webhooks configurados', description: `${okCount}/${total} instâncias OK` });
              }}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> Configurar webhooks (todas)
              </Button>
              <Button variant="outline" size="sm" onClick={fetchInstances}>
                <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
              </Button>
            </div>
          </div>
        </div>

        {!adminMode && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs p-3 flex gap-2">
            <span className="font-bold">⚠</span>
            <div>
              Sua API Key é <b>scoped por instância</b>, não a chave master da API Evolution. Por isso só aparece a instância atual e a criação de novas instâncias está indisponível. Para gerenciar várias, peça a <b>API Key global</b> ao seu provedor e atualize em <b>Configurações → Evolution API</b>.
            </div>
          </div>
        )}

        {/* Create */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="w-4 h-4 text-primary" /> Nova instância
            </CardTitle>
            <CardDescription>Apenas escolha um nome. O webhook é configurado automaticamente.</CardDescription>
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
          <div className="grid gap-3 md:grid-cols-2">
            {instances.map((inst) => {
              const b = stateBadge(inst.state);
              const Icon = b.icon;
              const isActive = inst.name === current;
              const connected = /open|connected|online/i.test(inst.state);
              return (
                <Card key={inst.id || inst.name} className={`relative overflow-hidden transition-all hover:shadow-lg ${isActive ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border/60'}`}>
                  {isActive && (
                    <div className="absolute top-0 right-0 bg-primary/90 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-bl-md flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> EM USO
                    </div>
                  )}
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-primary/20 flex items-center justify-center overflow-hidden ring-1 ring-border/50">
                        {inst.profile_pic ? (
                          <img src={inst.profile_pic} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Smartphone className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{inst.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {inst.phone ? `+${inst.phone}` : 'Sem número vinculado'}
                        </div>
                        <Badge variant="outline" className={`mt-1.5 gap-1 text-[10px] ${b.cls}`}>
                          <Icon className="w-3 h-3" /> {b.label}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {!connected && (
                        <Button size="sm" variant="default" onClick={() => openQr(inst.name)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                          <QrCode className="w-3.5 h-3.5" /> Conectar (QR)
                        </Button>
                      )}
                      {!isActive && (
                        <Button size="sm" variant="outline" onClick={() => setActive(inst.name)} className="gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Usar no Chat
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openSettings(inst.name)} className="gap-1.5">
                        <SettingsIcon className="w-3.5 h-3.5" /> Configurar
                      </Button>
                      {connected && (
                        <Button size="sm" variant="ghost" onClick={() => logout(inst.name)} className="gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                          <LogOut className="w-3.5 h-3.5" /> Desconectar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteInstance(inst.name)} className="gap-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
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
