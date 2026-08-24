import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { 
  AlertCircle, Bot, Edit, FileText, Image as ImageIcon, 
  Loader2, MessageSquare, Music, Plus, RefreshCw, Save, 
  Trash2, Video, Zap, MousePointer2, Search, Filter, 
  LayoutGrid, Share2, MoreHorizontal, Settings, Play, 
  Pause, Link as LinkIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactFlow, { 
  Background, Controls, useNodesState, useEdgesState, 
  addEdge, Connection, Edge, Node, Handle, Position,
  NodeProps, MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';

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
  instance_name?: string | null;
}

const stepPalette: Array<{ type: BotStepType; label: string; icon: typeof MessageSquare; color: string }> = [
  { type: 'message', label: 'Mensagem', icon: MessageSquare, color: 'bg-blue-500' },
  { type: 'image', label: 'Imagem', icon: ImageIcon, color: 'bg-violet-500' },
  { type: 'video', label: 'Vídeo', icon: Video, color: 'bg-pink-500' },
  { type: 'audio', label: 'Áudio', icon: Music, color: 'bg-amber-500' },
  { type: 'document', label: 'Documento', icon: FileText, color: 'bg-indigo-500' },
  { type: 'buttons', label: 'Botões', icon: Zap, color: 'bg-cyan-500' },
  { type: 'list', label: 'Lista', icon: Bot, color: 'bg-emerald-500' },
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

const BotStepNode = ({ data, selected }: NodeProps) => {
  const meta = stepPalette.find(s => s.type === data.type) || stepPalette[0];
  const Icon = meta.icon;

  return (
    <div className={cn(
      "w-64 rounded-xl border border-border/40 bg-[#121214] shadow-2xl overflow-hidden transition-all duration-200",
      selected ? "ring-2 ring-emerald-500 border-emerald-500/50 scale-[1.02]" : "hover:border-white/10"
    )}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-emerald-500 border-2 border-[#121214]" />
      
      <div className={cn("px-3 py-2 flex items-center gap-2 border-b border-white/5", meta.color.replace('bg-', 'bg-opacity-20 text-'))}>
        <div className={cn("p-1.5 rounded-lg", meta.color)}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase font-bold tracking-wider opacity-70">{meta.label}</p>
          <p className="text-xs font-semibold truncate text-white">{data.title || 'Sem título'}</p>
        </div>
        <MoreHorizontal className="w-4 h-4 text-white/40" />
      </div>

      <div className="p-3 space-y-2">
        {data.text && (
          <p className="text-[11px] text-white/60 line-clamp-3 leading-relaxed">
            {data.text}
          </p>
        )}
        {data.media_url && (
          <div className="rounded-lg overflow-hidden bg-white/5 border border-white/5 aspect-video flex items-center justify-center">
            {data.type === 'image' ? (
              <img src={data.media_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <Play className="w-6 h-6 text-white/20" />
            )}
          </div>
        )}
        {!data.text && !data.media_url && (
          <div className="h-12 flex items-center justify-center border border-dashed border-white/5 rounded-lg">
            <p className="text-[10px] text-white/20 uppercase font-medium">Configurar conteúdo</p>
          </div>
        )}
        
        <div className="flex items-center justify-between pt-1">
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-white/10 bg-white/5 text-white/40">ID: {data.id.slice(0,4)}</Badge>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="w-6 h-6 text-white/20 hover:text-white/40" onClick={(e) => {
              e.stopPropagation();
              data.onDelete(data.id);
            }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-emerald-500 border-2 border-[#121214]" />
    </div>
  );
};

const nodeTypes = {
  step: BotStepNode
};

export default function CrmOficialChatbots({ embed = false, overrideToken }: { embed?: boolean, overrideToken?: string } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [apiKey, setApiKey] = useState(overrideToken || searchParams.get('token') || '');
  const [enabled, setEnabled] = useState(false);
  const [bots, setBots] = useState<CrmBot[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [active, setActive] = useState<CrmBot | null>(null);
  const [form, setForm] = useState({ name: '', keyword: '', enabled: true, steps: [] as BotStep[] });
  
  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ 
      ...params, 
      type: 'smoothstep', 
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
      style: { stroke: '#10b981', strokeWidth: 2 }
    }, eds)),
    [setEdges]
  );

  const onNodeDelete = useCallback((id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
  }, [setNodes]);

  const invoke = async (action: string, data: Record<string, unknown> = {}) => {
    const { data: res, error } = await supabase.functions.invoke('crm-oficial-sync', { body: { action, data: { apiKey, ...data } } });
    if (error) throw error;
    if (!res?.success) throw new Error(res?.error || 'Falha na API CRM Oficial');
    return res.results;
  };

  useEffect(() => {
    if (apiKey) {
      setEnabled(true);
      setLoading(false);
      return;
    }
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('crm_oficial_settings').select('api_key, enabled').eq('user_id', user.id).maybeSingle();
      if (data?.api_key) setApiKey(data.api_key);
      setEnabled(!!data?.enabled);
      setLoading(false);
    })();
  }, [user, apiKey]);

  useEffect(() => { if (apiKey) void loadBots(); }, [apiKey]);

  const loadBots = async () => {
    if (!apiKey) return;
    setSyncing(true);
    try {
      const r = await invoke('list-chatbots', { limit: 100 });
      const result = r?.chatbots;
      if (result && !result.ok) throw new Error(`Status ${result.status}`);
      setBots(normalizeBots(result?.body));
      
      // Load channels to allow linking
      const cRes = await invoke('list-channels');
      if (cRes?.channels?.ok) {
        const list = Array.isArray(cRes.channels.body) ? cRes.channels.body : [];
        setChannels(list.map((c: any) => ({
          id: c.id || c.phone_number_id,
          name: c.name || c.verified_name,
          verified_name: c.verified_name || c.name,
          instance_name: c.evolution_instance_name || c.instance_name,
          display_phone_number: c.display_phone_number || c.phone_number
        })));
      }
    } catch (e: any) {
      toast({ title: 'Erro ao carregar chatbots', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const openNew = () => {
    setActive(null);
    const initialSteps = [{ id: uid(), type: 'message' as BotStepType, title: 'Início', text: 'Olá! Como posso ajudar?' }];
    setForm({ name: 'Novo chatbot', keyword: '', enabled: true, steps: initialSteps });
    
    // Initialize Flow with start node
    const initialNodes: Node[] = [{
      id: initialSteps[0].id,
      type: 'step',
      position: { x: 100, y: 150 },
      data: { ...initialSteps[0], onDelete: onNodeDelete }
    }];
    
    setNodes(initialNodes);
    setEdges([]);
    setEditorOpen(true);
  };

  const openEdit = (bot: CrmBot) => {
    setActive(bot);
    const steps = bot.steps || [];
    setForm({ name: bot.name, keyword: bot.keyword || bot.trigger_keywords?.join(', ') || '', enabled: Boolean(bot.enabled ?? bot.active), steps });
    
    // Initialize Flow
    const initialNodes: Node[] = steps.map((s, idx) => ({
      id: s.id,
      type: 'step',
      position: { x: 50 + (idx * 300), y: 150 },
      data: { ...s, onDelete: onNodeDelete }
    }));

    const initialEdges: Edge[] = steps.slice(0, -1).map((s, idx) => ({
      id: `e${s.id}-${steps[idx + 1].id}`,
      source: s.id,
      target: steps[idx + 1].id,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
      style: { stroke: '#10b981', strokeWidth: 2 }
    }));

    setNodes(initialNodes);
    setEdges(initialEdges);
    setEditorOpen(true);
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as BotStepType;
      if (!type || !reactFlowWrapper.current) return;

      const position = {
        x: event.clientX - reactFlowWrapper.current.getBoundingClientRect().left,
        y: event.clientY - reactFlowWrapper.current.getBoundingClientRect().top,
      };

      const meta = stepPalette.find(s => s.type === type);
      const newId = uid();
      const newNode: Node = {
        id: newId,
        type: 'step',
        position,
        data: { 
          id: newId, 
          type, 
          title: meta?.label || type, 
          text: type === 'message' ? 'Digite sua mensagem...' : '',
          onDelete: onNodeDelete 
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, onNodeDelete]
  );

  const saveBot = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    
    // Convert Nodes back to steps (simplified linear order based on X position for now)
    const sortedSteps = [...nodes]
      .sort((a, b) => a.position.x - b.position.x)
      .map(node => ({
        id: node.id,
        type: node.data.type,
        title: node.data.title,
        text: node.data.text,
        media_url: node.data.media_url
      }));

    try {
      const chatbot = {
        name: form.name.trim(),
        keyword: form.keyword.trim(),
        trigger_keywords: form.keyword.split(',').map(s => s.trim()).filter(Boolean),
        enabled: form.enabled,
        active: form.enabled,
        steps: sortedSteps,
        flow: { steps: sortedSteps },
        instance_name: active?.instance_name || null,
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

  const __content = (
      <div className={cn("space-y-5 w-full p-4 md:p-6", embed && "p-0")}>
        {!embed && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-foreground">Robô CRM</h1>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Crie e gerencie fluxos automáticos de atendimento no WhatsApp
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void loadBots()} disabled={syncing || !apiKey}>
                  <RefreshCw className={cn('w-4 h-4 mr-2', syncing && 'animate-spin')} /> Atualizar
                </Button>
                <Button onClick={openNew} disabled={!apiKey}>
                  <Plus className="w-4 h-4 mr-2" /> Novo robô
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Robôs', value: bots.length, icon: Bot },
                { label: 'Ativos', value: activeBots, icon: Play },
                { label: 'Pausados', value: Math.max(0, bots.length - activeBots), icon: Pause },
                { label: 'Conexões', value: channels.length, icon: LinkIcon },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label} className="border-border/60 bg-card/60">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-lg font-bold leading-none">{value}</p>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {apiKey && !searchParams.get('token') && (
              <div className="relative w-full h-[calc(100vh-300px)] min-h-[620px] bg-[#0b0b0d] rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
                <iframe
                  src={`https://zapcrm.top/embed/chatbots?token=${apiKey}`}
                  className="absolute inset-0 w-full h-full border-0"
                  title="Editor de Robôs"
                  allow="clipboard-write"
                />
              </div>

            )}
          </div>
        )}



        {!apiKey && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Configure sua chave em Configurações → CRM Oficial.</AlertDescription></Alert>}
        {apiKey && !enabled && <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>A integração está desativada; ative em Configurações para disparos automáticos.</AlertDescription></Alert>}

        {embed && (
          <>
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
                          <div className="mt-1">
                            <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Conexão Vinculada</Label>
                            <select 
                              className="w-full h-7 bg-background/50 border border-border/40 rounded px-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                              value={bot.instance_name || ''}
                              onChange={async (e) => {
                                const instanceName = e.target.value;
                                try {
                                  const chatbot = { ...bot, instance_name: instanceName || null };
                                  const r = await invoke('update-chatbot', { chatbot_id: bot.id, chatbot });
                                  if (r?.chatbot && !r.chatbot.ok) throw new Error(`Status ${r.chatbot.status}`);
                                  setBots(prev => prev.map(item => item.id === bot.id ? { ...item, instance_name: instanceName || null } : item));
                                  toast({ title: 'Chatbot vinculado à conexão' });
                                } catch (err: any) {
                                  toast({ title: 'Erro ao vincular', description: err.message, variant: 'destructive' });
                                }
                              }}
                            >
                              <option value="">Todos os números conectados</option>
                              {channels.map(c => (
                                <option key={c.id} value={c.instance_name || c.name}>
                                  {c.verified_name || c.name} ({c.display_phone_number || c.instance_name})
                                </option>
                              ))}
                            </select>
                          </div>
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
          </>
        )}


        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-6xl h-[82vh] p-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
              <div><DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-emerald-500" /> {active ? active.name : 'Novo chatbot'}</DialogTitle><DialogDescription>{form.steps.length} passo(s)</DialogDescription></div>
              <Button onClick={saveBot} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar fluxo</Button>
            </DialogHeader>
            <div className="h-full flex min-h-0 bg-[#0b0b0d]">
              <aside className="w-60 border-r border-white/5 bg-[#121214] p-4 flex flex-col gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <LayoutGrid className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Componentes</p>
                  </div>
                  
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                    <Input className="h-9 bg-white/5 border-white/10 pl-9 text-xs" placeholder="Buscar..." />
                  </div>

                  <div className="flex gap-1 mb-4">
                    <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer px-2 py-0.5 text-[10px]">Todos</Badge>
                    <Badge variant="outline" className="text-white/40 border-white/5 hover:bg-white/5 cursor-pointer px-2 py-0.5 text-[10px]">Mensagens</Badge>
                    <Badge variant="outline" className="text-white/40 border-white/5 hover:bg-white/5 cursor-pointer px-2 py-0.5 text-[10px]">Lógica</Badge>
                  </div>

                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-3">Ações</p>
                  <div className="space-y-2">
                    {stepPalette.map(item => {
                      const Icon = item.icon;
                      return (
                        <div 
                          key={item.type} 
                          draggable 
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/reactflow', item.type);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          className="w-full flex items-center gap-3 text-xs font-semibold text-white/70 hover:text-white rounded-xl hover:bg-white/5 p-2 transition-all cursor-grab active:cursor-grabbing border border-transparent hover:border-white/5 group"
                        >
                          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shadow-black/20', item.color)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold">{item.label}</p>
                            <p className="text-[10px] text-white/30 font-medium group-hover:text-white/40">Arrastar para fluxo</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </aside>
              
              <main className="flex-1 min-w-0 flex flex-col relative" ref={reactFlowWrapper}>
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  <div className="bg-[#121214] border border-white/5 rounded-xl p-1.5 flex gap-1 shadow-2xl">
                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"><MousePointer2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-white/20 hover:text-white/40 hover:bg-white/5"><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg text-white/20 hover:text-white/40 hover:bg-white/5"><Share2 className="w-4 h-4" /></Button>
                  </div>

                  <div className="bg-[#121214] border border-white/5 rounded-xl px-3 py-1.5 flex items-center gap-3 shadow-2xl">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">{active?.name || 'Novo Fluxo'}</p>
                    </div>
                    <div className="w-px h-3 bg-white/10" />
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{nodes.length} Componentes</p>
                  </div>
                </div>

                <div className="absolute top-4 right-4 z-10 flex gap-2">
                  <Button variant="outline" className="bg-[#121214] border-white/5 text-white/50 hover:bg-[#1c1c1f] hover:text-white rounded-xl h-9 text-xs font-bold gap-2">
                    <Settings className="w-3.5 h-3.5" /> Organizar
                  </Button>
                </div>

                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  nodeTypes={nodeTypes}
                  fitView
                  style={{ background: '#0b0b0d' }}
                >
                  <Background gap={24} size={1} color="#ffffff10" />
                  <Controls className="!bg-[#121214] !border-white/5 !fill-white/40" />
                </ReactFlow>
              </main>
            </div>
            <DialogFooter className="sr-only" />
          </DialogContent>
        </Dialog>
      </div>
  );

  return embed ? __content : <DashboardLayout>{__content}</DashboardLayout>;
}