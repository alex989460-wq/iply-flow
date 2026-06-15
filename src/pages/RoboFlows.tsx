import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Bot, Plus, Trash2, MessageSquare, ListChecks, LogOut, ArrowRight, Save, Loader2, Sparkles } from "lucide-react";

type StepType = "message" | "menu" | "transfer" | "end";

type Button = { id: string; label: string; next_step_id: string | null };

type Step = {
  id: string;
  type: StepType;
  title?: string;
  text: string;
  buttons?: Button[];
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
        text: "Olá! Como posso ajudar?\n\n1️⃣ Renovar plano\n2️⃣ Suporte\n3️⃣ Falar com atendente",
        buttons: [
          { id: uid(), label: "Renovar", next_step_id: null },
          { id: uid(), label: "Suporte", next_step_id: null },
          { id: uid(), label: "Atendente", next_step_id: null },
        ],
      },
    ],
  };
}

const stepIcon: Record<StepType, JSX.Element> = {
  message: <MessageSquare className="w-4 h-4" />,
  menu: <ListChecks className="w-4 h-4" />,
  transfer: <LogOut className="w-4 h-4" />,
  end: <ArrowRight className="w-4 h-4" />,
};

const stepLabel: Record<StepType, string> = {
  message: "Mensagem",
  menu: "Menu com botões",
  transfer: "Transferir p/ humano",
  end: "Encerrar",
};

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
    const list = (data as any[] as Flow[]) || [];
    setFlows(list);
    if (!activeId && list.length) setActiveId(list[0].id);
  }

  async function createFlow() {
    if (!user) return;
    const payload = emptyFlow(user.id);
    const { data, error } = await supabase.from("bot_flows" as any).insert(payload).select().single();
    if (error) return toast.error("Erro ao criar fluxo");
    const f = data as any as Flow;
    setFlows((cur) => [f, ...cur]);
    setActiveId(f.id);
  }

  async function deleteFlow(id: string) {
    if (!confirm("Excluir este fluxo?")) return;
    const { error } = await supabase.from("bot_flows" as any).delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir");
    setFlows((cur) => cur.filter((f) => f.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function patchActive(patch: Partial<Flow>) {
    if (!active) return;
    setFlows((cur) => cur.map((f) => (f.id === active.id ? { ...f, ...patch } : f)));
  }

  function patchStep(stepId: string, patch: Partial<Step>) {
    if (!active) return;
    patchActive({
      steps: active.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    });
  }

  function addStep(type: StepType) {
    if (!active) return;
    const newStep: Step = {
      id: uid(),
      type,
      title: stepLabel[type],
      text: type === "message" ? "Sua mensagem aqui" : "",
      buttons: type === "menu" ? [{ id: uid(), label: "Opção 1", next_step_id: null }] : undefined,
    };
    patchActive({ steps: [...active.steps, newStep] });
  }

  function removeStep(stepId: string) {
    if (!active) return;
    const steps = active.steps.filter((s) => s.id !== stepId).map((s) => ({
      ...s,
      buttons: s.buttons?.map((b) => (b.next_step_id === stepId ? { ...b, next_step_id: null } : b)),
    }));
    patchActive({
      steps,
      start_step_id: active.start_step_id === stepId ? steps[0]?.id ?? null : active.start_step_id,
    });
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
    if (error) return toast.error("Erro ao salvar");
    toast.success("Fluxo salvo");
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Robô <Sparkles className="w-4 h-4 text-primary" />
              </h1>
              <p className="text-sm text-muted-foreground">
                Crie fluxos de atendimento com botões e encadeamento de etapas
              </p>
            </div>
          </div>
          <Button onClick={createFlow}>
            <Plus className="w-4 h-4 mr-1" /> Novo fluxo
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* lista de fluxos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Fluxos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : flows.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Nenhum fluxo. Clique em "Novo fluxo".
                </p>
              ) : (
                flows.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveId(f.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 transition ${
                      activeId === f.id ? "bg-primary/15 text-primary" : "hover:bg-secondary/60"
                    }`}
                  >
                    <span className="truncate">{f.name}</span>
                    {f.enabled ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        on
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        off
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* editor */}
          {!active ? (
            <Card className="flex items-center justify-center h-[60vh]">
              <p className="text-muted-foreground text-sm">Selecione ou crie um fluxo</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
                    <div>
                      <Label className="text-xs">Nome do fluxo</Label>
                      <Input
                        value={active.name}
                        onChange={(e) => patchActive({ name: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={active.enabled}
                        onCheckedChange={(v) => patchActive({ enabled: v })}
                      />
                      <span className="text-sm">{active.enabled ? "Ativo" : "Inativo"}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => deleteFlow(active.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button onClick={saveActive} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span className="ml-1">Salvar</span>
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Palavras-gatilho (separadas por vírgula)</Label>
                    <Input
                      placeholder="oi, olá, menu, ajuda"
                      value={active.trigger_keywords.join(", ")}
                      onChange={(e) =>
                        patchActive({
                          trigger_keywords: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Etapa inicial</Label>
                    <Select
                      value={active.start_step_id ?? ""}
                      onValueChange={(v) => patchActive({ start_step_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {active.steps.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.title || s.id} · {stepLabel[s.type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center mr-1">Adicionar etapa:</span>
                {(["message", "menu", "transfer", "end"] as StepType[]).map((t) => (
                  <Button key={t} size="sm" variant="outline" onClick={() => addStep(t)}>
                    {stepIcon[t]}
                    <span className="ml-1">{stepLabel[t]}</span>
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                {active.steps.map((step, idx) => (
                  <Card key={step.id} className="border-l-4 border-l-primary/50">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          #{idx + 1}
                        </Badge>
                        <Badge className="text-[10px] gap-1">
                          {stepIcon[step.type]}
                          {stepLabel[step.type]}
                        </Badge>
                        {active.start_step_id === step.id && (
                          <Badge variant="secondary" className="text-[10px]">
                            início
                          </Badge>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeStep(step.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs">Título interno</Label>
                        <Input
                          value={step.title || ""}
                          onChange={(e) => patchStep(step.id, { title: e.target.value })}
                        />
                      </div>
                      {step.type !== "end" && (
                        <div>
                          <Label className="text-xs">
                            {step.type === "transfer" ? "Mensagem antes de transferir" : "Mensagem enviada"}
                          </Label>
                          <Textarea
                            rows={3}
                            value={step.text}
                            onChange={(e) => patchStep(step.id, { text: e.target.value })}
                          />
                        </div>
                      )}
                      {step.type === "menu" && (
                        <div className="space-y-2">
                          <Label className="text-xs">Botões / opções</Label>
                          {(step.buttons || []).map((b, bi) => (
                            <div key={b.id} className="flex gap-2 items-center">
                              <span className="text-xs text-muted-foreground w-5">{bi + 1}.</span>
                              <Input
                                placeholder="Texto do botão"
                                value={b.label}
                                onChange={(e) =>
                                  patchStep(step.id, {
                                    buttons: step.buttons!.map((x) =>
                                      x.id === b.id ? { ...x, label: e.target.value } : x
                                    ),
                                  })
                                }
                              />
                              <Select
                                value={b.next_step_id ?? "__none__"}
                                onValueChange={(v) =>
                                  patchStep(step.id, {
                                    buttons: step.buttons!.map((x) =>
                                      x.id === b.id ? { ...x, next_step_id: v === "__none__" ? null : v } : x
                                    ),
                                  })
                                }
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue placeholder="Próxima etapa" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— sem ação —</SelectItem>
                                  {active.steps
                                    .filter((s) => s.id !== step.id)
                                    .map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.title || s.id}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  patchStep(step.id, {
                                    buttons: step.buttons!.filter((x) => x.id !== b.id),
                                  })
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patchStep(step.id, {
                                buttons: [
                                  ...(step.buttons || []),
                                  { id: uid(), label: `Opção ${(step.buttons?.length || 0) + 1}`, next_step_id: null },
                                ],
                              })
                            }
                          >
                            <Plus className="w-4 h-4 mr-1" /> Adicionar botão
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <p className="text-xs text-muted-foreground border-t pt-3">
                💡 Os fluxos ficam salvos aqui. Em breve serão executados automaticamente pelo robô do Evolution / Meta quando o cliente enviar uma das palavras-gatilho.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
