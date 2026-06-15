import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Bot, Plus, Trash2, MessageSquare, ListChecks, LogOut, ArrowRight,
  Save, Loader2, Flag, PlayCircle, X, Settings2,
} from "lucide-react";
import ReactFlow, {
  Background, Controls, MiniMap, Handle, Position, addEdge,
  useNodesState, useEdgesState, type Node, type Edge, type Connection,
  type NodeProps, MarkerType, ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";

type StepType = "message" | "menu" | "transfer" | "end";
type FlowButton = { id: string; label: string; next_step_id: string | null };
type Step = {
  id: string;
  type: StepType;
  title?: string;
  text: string;
  buttons?: FlowButton[];
  position?: { x: number; y: number };
};
type Flow = {
  id: string;
  owner_id: string;
  name: string;
  enabled: boolean;
  trigger_keywords: string[];
  start_step_id: string | null;
  steps: Step[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

const TYPE_META: Record<StepType, { label: string; icon: JSX.Element; color: string }> = {
  message:  { label: "Mensagem",          icon: <MessageSquare className="w-3.5 h-3.5" />, color: "bg-blue-500" },
  menu:     { label: "Menu com botões",   icon: <ListChecks   className="w-3.5 h-3.5" />, color: "bg-violet-500" },
  transfer: { label: "Transferir humano", icon: <LogOut       className="w-3.5 h-3.5" />, color: "bg-amber-500" },
  end:      { label: "Encerrar",          icon: <ArrowRight   className="w-3.5 h-3.5" />, color: "bg-rose-500" },
};

function emptyFlow(owner_id: string): Omit<Flow, "id"> {
  const startId = uid();
  return {
    owner_id,
    name: "Novo fluxo",
    enabled: true,
    trigger_keywords: [],
    start_step_id: startId,
    steps: [
      {
        id: startId,
        type: "menu",
        title: "Boas-vindas",
        text: "Olá! Como posso ajudar?",
        buttons: [
          { id: uid(), label: "Renovar", next_step_id: null },
          { id: uid(), label: "Suporte", next_step_id: null },
        ],
        position: { x: 280, y: 160 },
      },
    ],
  };
}

/* ---------------- Custom Node ---------------- */

type StepNodeData = {
  step: Step;
  isStart: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSetStart: (id: string) => void;
};

function StepNode({ data, selected }: NodeProps<StepNodeData>) {
  const { step, isStart, onEdit, onDelete, onSetStart } = data;
  const meta = TYPE_META[step.type];
  return (
    <div
      className={`rounded-xl border bg-card shadow-sm min-w-[240px] max-w-[280px] transition ${
        selected ? "ring-2 ring-primary" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-muted-foreground" />
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl text-white text-xs font-medium ${meta.color}`}>
        <div className="flex items-center gap-1.5">
          {meta.icon}
          <span>{step.title || meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {isStart && (
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
              <Flag className="w-3 h-3" /> início
            </span>
          )}
        </div>
      </div>
      <div className="px-3 py-2 space-y-2">
        <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-4">
          {step.text || <span className="text-muted-foreground italic">(sem texto)</span>}
        </p>

        {step.type === "menu" && step.buttons && step.buttons.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border">
            {step.buttons.map((b) => (
              <div key={b.id} className="relative flex items-center justify-between text-xs bg-muted/60 rounded px-2 py-1.5">
                <span className="truncate">{b.label || "Botão"}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`btn-${b.id}`}
                  className="!w-2.5 !h-2.5 !bg-violet-500 !-right-[7px]"
                  style={{ top: "50%" }}
                />
              </div>
            ))}
          </div>
        )}

        {step.type !== "menu" && step.type !== "end" && (
          <div className="relative h-2">
            <Handle
              type="source"
              position={Position.Right}
              id="next"
              className="!w-2.5 !h-2.5 !bg-primary"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border bg-muted/30 rounded-b-xl">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onEdit(step.id)}>
          <Settings2 className="w-3 h-3 mr-1" /> Editar
        </Button>
        {!isStart && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onSetStart(step.id)}>
            <Flag className="w-3 h-3" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-rose-500 ml-auto" onClick={() => onDelete(step.id)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

const nodeTypes = { step: StepNode };

/* ---------------- Builder ---------------- */

function FlowBuilder({
  flow,
  onChange,
}: {
  flow: Flow;
  onChange: (updater: (f: Flow) => Flow) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // Build nodes/edges from steps
  const initialNodes: Node<StepNodeData>[] = useMemo(
    () =>
      flow.steps.map((s, i) => ({
        id: s.id,
        type: "step",
        position: s.position ?? { x: 120 + (i % 4) * 320, y: 100 + Math.floor(i / 4) * 260 },
        data: {
          step: s,
          isStart: flow.start_step_id === s.id,
          onEdit: setEditingId,
          onDelete: handleDelete,
          onSetStart: handleSetStart,
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow.id]
  );

  const initialEdges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    for (const s of flow.steps) {
      if (s.type === "menu" && s.buttons) {
        for (const b of s.buttons) {
          if (b.next_step_id) {
            list.push({
              id: `${s.id}-${b.id}`,
              source: s.id,
              sourceHandle: `btn-${b.id}`,
              target: b.next_step_id,
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed },
            });
          }
        }
      } else if (s.type === "message" || s.type === "transfer") {
        // next stored on buttons[0] convention
        const nxt = s.buttons?.[0]?.next_step_id;
        if (nxt) {
          list.push({
            id: `${s.id}-next`,
            source: s.id,
            sourceHandle: "next",
            target: nxt,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        }
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState<StepNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Refresh nodes/edges when flow.id changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

  // Sync node data (step content / isStart) when flow.steps changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const step = flow.steps.find((s) => s.id === n.id);
        if (!step) return n;
        return {
          ...n,
          data: {
            ...n.data,
            step,
            isStart: flow.start_step_id === step.id,
          },
        };
      })
    );
  }, [flow.steps, flow.start_step_id, setNodes]);

  function handleSetStart(id: string) {
    onChange((f) => ({ ...f, start_step_id: id }));
  }

  function handleDelete(id: string) {
    onChange((f) => {
      const steps = f.steps
        .filter((s) => s.id !== id)
        .map((s) => ({
          ...s,
          buttons: s.buttons?.map((b) =>
            b.next_step_id === id ? { ...b, next_step_id: null } : b
          ),
        }));
      return {
        ...f,
        steps,
        start_step_id: f.start_step_id === id ? steps[0]?.id ?? null : f.start_step_id,
      };
    });
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }

  function addStep(type: StepType) {
    const id = uid();
    const newStep: Step = {
      id,
      type,
      title: TYPE_META[type].label,
      text:
        type === "menu"
          ? "Escolha uma opção:"
          : type === "transfer"
          ? "Aguarde, vou te transferir para um atendente."
          : type === "end"
          ? "Obrigado pelo contato!"
          : "Digite sua mensagem...",
      buttons:
        type === "menu"
          ? [
              { id: uid(), label: "Opção 1", next_step_id: null },
              { id: uid(), label: "Opção 2", next_step_id: null },
            ]
          : type === "message" || type === "transfer"
          ? [{ id: "next", label: "Próximo", next_step_id: null }]
          : [],
      position: { x: 200 + Math.random() * 300, y: 200 + Math.random() * 200 },
    };
    onChange((f) => ({ ...f, steps: [...f.steps, newStep] }));
  }

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
          eds
        )
      );
      // persist into flow data
      onChange((f) => ({
        ...f,
        steps: f.steps.map((s) => {
          if (s.id !== params.source) return s;
          if (s.type === "menu") {
            const btnId = params.sourceHandle?.replace("btn-", "");
            return {
              ...s,
              buttons: s.buttons?.map((b) =>
                b.id === btnId ? { ...b, next_step_id: params.target ?? null } : b
              ),
            };
          }
          // message/transfer: store on buttons[0]
          return {
            ...s,
            buttons: [{ id: "next", label: "Próximo", next_step_id: params.target ?? null }],
          };
        }),
      }));
    },
    [onChange, setEdges]
  );

  const onEdgesDelete = useCallback(
    (removed: Edge[]) => {
      onChange((f) => ({
        ...f,
        steps: f.steps.map((s) => {
          const hit = removed.find((e) => e.source === s.id);
          if (!hit) return s;
          if (s.type === "menu") {
            const btnId = hit.sourceHandle?.replace("btn-", "");
            return {
              ...s,
              buttons: s.buttons?.map((b) =>
                b.id === btnId ? { ...b, next_step_id: null } : b
              ),
            };
          }
          return {
            ...s,
            buttons: [{ id: "next", label: "Próximo", next_step_id: null }],
          };
        }),
      }));
    },
    [onChange]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      onChange((f) => ({
        ...f,
        steps: f.steps.map((s) =>
          s.id === node.id ? { ...s, position: node.position } : s
        ),
      }));
    },
    [onChange]
  );

  const editing = editingId ? flow.steps.find((s) => s.id === editingId) : null;

  return (
    <div className="relative h-full w-full">
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2 bg-card/95 backdrop-blur p-2 rounded-lg border shadow-sm">
        <span className="text-xs font-medium px-2 self-center text-muted-foreground">Adicionar:</span>
        {(["message", "menu", "transfer", "end"] as StepType[]).map((t) => (
          <Button key={t} size="sm" variant="outline" className="h-7 text-xs" onClick={() => addStep(t)}>
            <Plus className="w-3 h-3 mr-1" />
            {TYPE_META[t].icon}
            <span className="ml-1">{TYPE_META[t].label}</span>
          </Button>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        defaultEdgeOptions={{ animated: true, markerEnd: { type: MarkerType.ArrowClosed } }}
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap pannable zoomable className="!bg-card" />
      </ReactFlow>

      {/* Editor side panel */}
      {editing && (
        <div className="absolute top-0 right-0 h-full w-[360px] bg-card border-l shadow-xl z-20 flex flex-col">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${TYPE_META[editing.type].color}`} />
              <h3 className="font-medium text-sm">Editar passo</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={editing.type}
                onValueChange={(v: StepType) =>
                  onChange((f) => ({
                    ...f,
                    steps: f.steps.map((s) =>
                      s.id === editing.id
                        ? {
                            ...s,
                            type: v,
                            buttons:
                              v === "menu"
                                ? s.buttons && s.buttons.length && s.buttons[0].id !== "next"
                                  ? s.buttons
                                  : [{ id: uid(), label: "Opção 1", next_step_id: null }]
                                : v === "end"
                                ? []
                                : [{ id: "next", label: "Próximo", next_step_id: null }],
                          }
                        : s
                    ),
                  }))
                }
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_META) as StepType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Título (interno)</Label>
              <Input
                className="h-9"
                value={editing.title ?? ""}
                onChange={(e) =>
                  onChange((f) => ({
                    ...f,
                    steps: f.steps.map((s) => (s.id === editing.id ? { ...s, title: e.target.value } : s)),
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Mensagem enviada</Label>
              <Textarea
                rows={5}
                value={editing.text}
                onChange={(e) =>
                  onChange((f) => ({
                    ...f,
                    steps: f.steps.map((s) => (s.id === editing.id ? { ...s, text: e.target.value } : s)),
                  }))
                }
              />
            </div>

            {editing.type === "menu" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Botões</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      onChange((f) => ({
                        ...f,
                        steps: f.steps.map((s) =>
                          s.id === editing.id
                            ? {
                                ...s,
                                buttons: [
                                  ...(s.buttons ?? []),
                                  { id: uid(), label: `Opção ${(s.buttons?.length ?? 0) + 1}`, next_step_id: null },
                                ],
                              }
                            : s
                        ),
                      }))
                    }
                  >
                    <Plus className="w-3 h-3 mr-1" /> Adicionar
                  </Button>
                </div>
                {editing.buttons?.map((b) => (
                  <div key={b.id} className="flex gap-1">
                    <Input
                      className="h-8"
                      value={b.label}
                      onChange={(e) =>
                        onChange((f) => ({
                          ...f,
                          steps: f.steps.map((s) =>
                            s.id === editing.id
                              ? {
                                  ...s,
                                  buttons: s.buttons?.map((x) =>
                                    x.id === b.id ? { ...x, label: e.target.value } : x
                                  ),
                                }
                              : s
                          ),
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-rose-500"
                      onClick={() =>
                        onChange((f) => ({
                          ...f,
                          steps: f.steps.map((s) =>
                            s.id === editing.id
                              ? { ...s, buttons: s.buttons?.filter((x) => x.id !== b.id) }
                              : s
                          ),
                        }))
                      }
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Arraste do círculo violeta à direita de cada botão até outro passo para conectar.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Page ---------------- */

export default function RoboFlows() {
  const { user } = useAuth();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const active = flows.find((f) => f.id === activeId) || null;

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bot_flows" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar fluxos");
      return;
    }
    const list = (data ?? []) as any[];
    setFlows(list.map((r) => ({ ...r, steps: r.steps ?? [], trigger_keywords: r.trigger_keywords ?? [] })));
    if (list.length && !activeId) setActiveId(list[0].id);
  }

  async function createFlow() {
    if (!user) return;
    const payload = emptyFlow(user.id);
    const { data, error } = await supabase
      .from("bot_flows" as any)
      .insert(payload as any)
      .select()
      .single();
    if (error || !data) {
      toast.error("Erro ao criar fluxo");
      return;
    }
    const newF = data as any as Flow;
    setFlows((p) => [newF, ...p]);
    setActiveId(newF.id);
  }

  async function saveActive() {
    if (!active) return;
    setSaving(true);
    const { error } = await supabase
      .from("bot_flows" as any)
      .update({
        name: active.name,
        enabled: active.enabled,
        trigger_keywords: active.trigger_keywords,
        start_step_id: active.start_step_id,
        steps: active.steps as any,
      })
      .eq("id", active.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar");
      return;
    }
    toast.success("Fluxo salvo");
  }

  async function deleteFlow(id: string) {
    if (!confirm("Excluir este fluxo?")) return;
    const { error } = await supabase.from("bot_flows" as any).delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    setFlows((p) => p.filter((f) => f.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function patchActive(updater: (f: Flow) => Flow) {
    setFlows((prev) => prev.map((f) => (f.id === activeId ? updater(f) : f)));
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h1 className="font-semibold">Robô — Construtor de Fluxos</h1>
            <Badge variant="secondary" className="text-[10px]">Beta</Badge>
          </div>
          <div className="flex items-center gap-2">
            {active && (
              <Button size="sm" onClick={saveActive} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={createFlow}>
              <Plus className="w-4 h-4 mr-1" /> Novo fluxo
            </Button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <aside className="w-64 border-r bg-muted/30 flex flex-col">
            <div className="p-3 border-b">
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Fluxos</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading && <p className="text-xs text-muted-foreground p-2">Carregando...</p>}
              {!loading && flows.length === 0 && (
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-2">Nenhum fluxo</p>
                  <Button size="sm" onClick={createFlow}><Plus className="w-3 h-3 mr-1" /> Criar</Button>
                </div>
              )}
              {flows.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveId(f.id)}
                  className={`w-full text-left px-2 py-2 rounded-md text-sm flex items-center justify-between group ${
                    activeId === f.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate flex items-center gap-1.5">
                    <PlayCircle className={`w-3.5 h-3.5 ${f.enabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                    {f.name}
                  </span>
                  <Trash2
                    className="w-3 h-3 opacity-0 group-hover:opacity-100 text-rose-500"
                    onClick={(e) => { e.stopPropagation(); deleteFlow(f.id); }}
                  />
                </button>
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <main className="flex-1 relative bg-muted/10">
            {!active ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Selecione ou crie um fluxo para começar.
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* Flow meta bar */}
                <div className="px-4 py-2 border-b bg-card flex flex-wrap items-center gap-3">
                  <Input
                    className="h-8 max-w-xs font-medium"
                    value={active.name}
                    onChange={(e) => patchActive((f) => ({ ...f, name: e.target.value }))}
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={active.enabled}
                      onCheckedChange={(v) => patchActive((f) => ({ ...f, enabled: v }))}
                    />
                    <Label className="text-xs">Ativo</Label>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Label className="text-xs whitespace-nowrap">Gatilhos:</Label>
                    <Input
                      className="h-8"
                      placeholder="oi, menu, ajuda (separados por vírgula)"
                      value={active.trigger_keywords.join(", ")}
                      onChange={(e) =>
                        patchActive((f) => ({
                          ...f,
                          trigger_keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <ReactFlowProvider>
                    <FlowBuilder flow={active} onChange={patchActive} />
                  </ReactFlowProvider>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </DashboardLayout>
  );
}
