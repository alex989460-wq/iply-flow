import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Bot, Edit, FileText, Image as ImageIcon, Loader2, MessageSquare, Music, Plus, RefreshCw, Save, Trash2, Video, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type BotStepType = 'message' | 'image' | 'video' | 'audio' | 'document' | 'buttons' | 'list' | 'capture' | 'wait' | 'condition';

interface BotStep {
  id: string;
  type: BotStepType;
  title: string;
  text?: string;
  media_url?: string;
}

interface CrmBot {
  id: string;
  name: string;
  keyword?: string;
  enabled?: boolean;
  active?: boolean;
  steps?: BotStep[];
  nodes?: BotStep[];
  flow?: { steps?: BotStep[]; nodes?: BotStep[] };
  first_message?: string;
  trigger_keywords?: string[];
}

const stepPalette: Array<{ type: BotStepType; label: string; icon: typeof MessageSquare; color: string }> = [
  { type: 'message', label: 'Mensagem', icon: MessageSquare, color: 'bg-blue-500' },
  { type: 'image', label: 'Imagem', icon: ImageIcon, color: 'bg-violet-500' },
  { type: 'video', label: 'Vídeo', icon: Video, color: 'bg-pink-500' },
  { type: 'audio', label: 'Áudio', icon: Music, color: 'bg-amber-500' },
  { type: 'document', label: 'Documento', icon: FileText, color: 'bg-indigo-500' },
  { type: 'buttons', label: 'Botões', icon: Zap, color: 'bg-cyan-500' },
  { type: 'list', label: 'Lista', icon: Bot, color: 'bg-teal-500' },
  { type: 'capture', label: 'Capturar resposta', icon: MessageSquare, color: 'bg-lime-500' },
  { type: 'wait', label: 'Aguardar', icon: Loader2, color: 'bg-zinc-500' },
  { type: 'condition', label: 'Condição', icon: RefreshCw, color: 'bg-red-500' },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

function normalizeBots(body: any): CrmBot[] {
  const raw = Array.isArray(body)
    ? body
    : Array.isArray(body?.chatbots)
      ? body.chatbots
      : Array.isArray(body?.bots)
        ? body.bots
        : Array.isArray(body?.data)
          ? body.data
          : Array.isArray(body?.items)
            ? body.items
            : [];
  return raw.map((b: any, index: number) => ({
    ...b,
    id: String(b.id || b.bot_id || `bot-${index}`),
    name: String(b.name || b.title || 'Chatbot'),
    keyword: String(b.keyword || b.trigger || b.trigger_keywords?.[0] || '').trim(),
    enabled: Boolean(b.enabled ?? b.active ?? true),
    steps: Array.isArray(b.steps) ? b.steps : Array.isArray(b.nodes) ? b.nodes : Array.isArray(b.flow?.steps) ? b.flow.steps : Array.isArray(b.flow?.nodes) ? b.flow.nodes : [],
  }));
}

export default function CrmOficialChatbots() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [bots, setBots] = useState<CrmBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [active, setActive] = useState<CrmBot | null>(null);
  const [form, setForm] = useState({ name: '', keyword: '', enabled: true, steps: [] as BotStep[] });

  const invoke = async (action: string, data: Record<string, unknown> = {}) => {
    const { data: res, error } = await supabase.functions.invoke('crm-oficial-sync', { body: { action, data: { apiKey, ...data } } });
    if (error) throw error;
    if (!res?.success) throw new Error(res?.error || 'Falha na API CRM Oficial');
    return res.results;
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('crm_oficial_settings').select('api_key, enabled').eq('user_id', user.id).maybeSingle();
      setApiKey(data?.api_key || '');
      setEnabled(!!data?.enabled);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => { if (apiKey) void loadBots(); }, [apiKey]);

  const loadBots = async () => {
    if (!apiKey) return;
    setSyncing(true);
    try {
      const r = await invoke('list-chatbots', { limit: 100 });
      const result = r?.chatbots;
      if (result && !result.ok) throw new Error(`Status ${result.status}`);
      setBots(normalizeBots(result?.body));
    } catch (e: any) {
      toast({ title: 'Erro ao carregar chatbots', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const openNew = () => {
    setActive(null);
    setForm({ name: 'Novo chatbot', keyword: '', enabled: true, steps: [{ id: uid(), type: 'message', title: 'Início', text: 'Olá! Como posso ajudar?' }] });
    setEditorOpen(true);
  };

  const openEdit = (bot: CrmBot) => {
    setActive(bot);
    setForm({ name: bot.name, keyword: bot.keyword || bot.trigger_keywords?.join(', ') || '', enabled: Boolean(bot.enabled ?? bot.active), steps: bot.steps || [] });
    setEditorOpen(true);
  };

  const addStep = (type: BotStepType) => {
    const meta = stepPalette.find(s => s.type === type);
    setForm(f => ({ ...f, steps: [...f.steps, { id: uid(), type, title: meta?.label || type, text: type === 'message' ? 'Digite sua mensagem...' : '' }] }));
  };

  const saveBot = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const chatbot = {
        name: form.name.trim(),
        keyword: form.keyword.trim(),
        trigger_keywords: form.keyword.split(',').map(s => s.trim()).filter(Boolean),
        enabled: form.enabled,
        active: form.enabled,
        steps: form.steps,
        flow: { steps: form.steps },
      };
      const r = await invoke(active ? 'update-chatbot' : 'create-chatbot', active ? { chatbot_id: active.id, chatbot } : { chatbot });
      const result = r?.chatbot;
      if (result && !result.ok) throw new Error(`Status ${result.status}: ${JSON.stringify(result.body).slice(0, 180)}`);
      toast({ title: 'Chatbot salvo', description: 'Fluxo sincronizado com o CRM Oficial.' });
      setEditorOpen(false);
      await loadBots();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar chatbot', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteBot = async (bot: CrmBot) => {
    if (!confirm(`Excluir chatbot "${bot.name}"?`)) return;
    try {
      const r = await invoke('delete-chatbot', { chatbot_id: bot.id });
      if (r?.chatbot && !r.chatbot.ok) throw new Error(`Status ${r.chatbot.status}`);
      toast({ title: 'Chatbot excluído' });
      await loadBots();
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    }
  };

  const toggleBot = async (bot: CrmBot) => {
    const nextEnabled = !(bot.enabled || bot.active);
    try {
      const chatbot = { ...bot, enabled: nextEnabled, active: nextEnabled };
      setBots(prev => prev.map(item => item.id === bot.id ? { ...item, enabled: nextEnabled, active: nextEnabled } : item));
      const r = await invoke('update-chatbot', { chatbot_id: bot.id, chatbot });
      if (r?.chatbot && !r.chatbot.ok) throw new Error(`Status ${r.chatbot.status}`);
      toast({ title: nextEnabled ? 'Chatbot ativado' : 'Chatbot desativado' });
    } catch (e: any) {
      setBots(prev => prev.map(item => item.id === bot.id ? bot : item));
      toast({ title: 'Erro ao alterar status', description: e.message, variant: 'destructive' });
    }
  };

  const activeBots = useMemo(() => bots.filter(b => b.enabled || b.active).length, [bots]);

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-7xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Bot className="w-6 h-6 text-emerald-500" /> Chatbots</h1>
            <p className="text-sm text-muted-foreground">Crie fluxos automáticos com visual e blocos compatíveis com o CRM Oficial.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadBots} disabled={!apiKey || syncing}>{syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Sincronizar</Button>
            <Button onClick={openNew} disabled={!apiKey}><Plus className="w-4 h-4 mr-2" /> Novo chatbot</Button>
          </div>
        </div>

        {!apiKey && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Configure sua chave em Configurações → CRM Oficial.</AlertDescription></Alert>}
        {apiKey && !enabled && <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>A integração está desativada; ative em Configurações para disparos automáticos.</AlertDescription></Alert>}

        {loading || syncing ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
        ) : bots.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground"><Bot className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum chatbot encontrado.</p><Button className="mt-4" onClick={openNew}>Criar chatbot</Button></CardContent></Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {bots.map(bot => (
              <div key={bot.id} className="rounded-2xl border border-border/60 bg-card/60 p-4 hover:border-emerald-500/40 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center"><Bot className="w-5 h-5 text-emerald-400" /></div>
                    <div className="min-w-0">
                      <h3 className="font-bold truncate">{bot.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">Palavra: {bot.keyword || bot.trigger_keywords?.join(', ') || '—'}</p>
                    </div>
                  </div>
                  <Badge className={cn((bot.enabled || bot.active) ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground')}>{bot.enabled || bot.active ? 'Ativo' : 'Inativo'}</Badge>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => openEdit(bot)}>Editar fluxo <Edit className="w-4 h-4 ml-2" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => toggleBot(bot)}><Zap className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-red-400" onClick={() => deleteBot(bot)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground">Total: {bots.length} • Ativos: {activeBots}</div>

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-6xl h-[82vh] p-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
              <div><DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-emerald-500" /> {active ? active.name : 'Novo chatbot'}</DialogTitle><DialogDescription>{form.steps.length} passo(s)</DialogDescription></div>
              <Button onClick={saveBot} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar fluxo</Button>
            </DialogHeader>
            <div className="h-full flex min-h-0 bg-background">
              <aside className="w-52 border-r bg-card/40 p-3 overflow-y-auto">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Arraste para criar</p>
                <div className="space-y-2">
                  {stepPalette.map(item => {
                    const Icon = item.icon;
                    return <button key={item.type} onClick={() => addStep(item.type)} className="w-full flex items-center gap-2 text-xs font-semibold text-left rounded-lg hover:bg-accent p-1.5"><span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white', item.color)}><Icon className="w-4 h-4" /></span>{item.label}</button>;
                  })}
                </div>
              </aside>
              <main className="flex-1 min-w-0 overflow-auto bg-[radial-gradient(circle,hsl(var(--muted)/0.25)_1px,transparent_1px)] [background-size:18px_18px] p-5">
                <div className="flex flex-wrap gap-3 mb-5 items-end">
                  <div className="space-y-1.5"><Label>Nome</Label><Input className="w-64" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="space-y-1.5 flex-1 min-w-64"><Label>Gatilhos</Label><Input value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} placeholder="oi, menu, ajuda" /></div>
                  <div className="flex items-center gap-2 pb-2"><Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} /><Label>Ativo</Label></div>
                </div>
                <div className="flex flex-wrap items-start gap-8">
                  {form.steps.map((step, index) => {
                    const meta = stepPalette.find(s => s.type === step.type) || stepPalette[0];
                    const Icon = meta.icon;
                    return (
                      <div key={step.id} className="relative w-72 rounded-xl border border-border/70 bg-card shadow-xl overflow-hidden">
                        <div className={cn('px-3 py-2 text-white flex items-center gap-2', meta.color)}><Icon className="w-4 h-4" /><Input className="h-7 bg-white/15 border-white/20 text-white" value={step.title} onChange={e => setForm(f => ({ ...f, steps: f.steps.map(s => s.id === step.id ? { ...s, title: e.target.value } : s) }))} /></div>
                        <div className="p-3 space-y-2">
                          <Textarea rows={4} value={step.text || ''} onChange={e => setForm(f => ({ ...f, steps: f.steps.map(s => s.id === step.id ? { ...s, text: e.target.value } : s) }))} placeholder="Conteúdo do bloco" />
                          {['image','video','audio','document'].includes(step.type) && <Input value={step.media_url || ''} onChange={e => setForm(f => ({ ...f, steps: f.steps.map(s => s.id === step.id ? { ...s, media_url: e.target.value } : s) }))} placeholder="URL da mídia" />}
                          <Button size="sm" variant="ghost" className="text-red-400" onClick={() => setForm(f => ({ ...f, steps: f.steps.filter(s => s.id !== step.id) }))}><Trash2 className="w-3 h-3 mr-1" /> Remover</Button>
                        </div>
                        {index < form.steps.length - 1 && <div className="hidden lg:block absolute top-1/2 -right-8 w-8 border-t border-dashed border-emerald-500" />}
                      </div>
                    );
                  })}
                </div>
              </main>
            </div>
            <DialogFooter className="sr-only" />
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}