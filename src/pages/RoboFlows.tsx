import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Bot, Plus, Trash2, MessageSquare, ListChecks, LogOut, ArrowRight,
  Save, Loader2, Flag, PlayCircle, X, Settings2,
  Image as ImageIcon, Video, Music, FileText, User as UserIcon,
  Star, Tag, IdCard, GitBranch, Clock, Shuffle, Globe, Sparkles,
  Instagram, Layout, FileBadge, HelpCircle,
} from "lucide-react";
// Ensure d3-transition side-effects are registered (fixes "$r.interrupt is not a function" in prod)
import "d3-transition";
import ReactFlow, {
  Background, Controls, MiniMap, Handle, Position, addEdge,
  useNodesState, useEdgesState, type Node, type Edge, type Connection,
  type NodeProps, MarkerType, ReactFlowProvider, useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";

/* ---------------- Types ---------------- */

type StepType =
  | "text" | "image" | "video" | "audio" | "file" | "contact"
  | "menu" | "transfer" | "end" | "question" | "rating" | "tags" | "save_contact" | "save_card"
  | "condition" | "delay" | "ab_test"
  | "api_call" | "gpt"
  | "ig_comment"
  | "wa_flow" | "wa_template";

type FlowButton = { id: string; label: string; next_step_id: string | null };

type Step = {
  id: string;
  type: StepType;
  title?: string;
  text?: string;
  buttons?: FlowButton[];
  children?: Step[];
  menu_style?: "buttons" | "list" | "numbered";
  position?: { x: number; y: number };
  // media
  media_url?: string;
  caption?: string;
  // contact
  contact_name?: string;
  contact_phone?: string;
  // question
  variable?: string;
  // tags / save
  tags?: string[];
  // delay
  delay_ms?: number;
  // condition
  condition_variable?: string;
  condition_rules?: { id: string; op: "eq" | "contains" | "starts" | "regex"; value: string; next_step_id: string | null }[];
  // ab test
  ab_weight_a?: number;
  // api
  api_url?: string;
  api_method?: "GET" | "POST" | "PUT" | "DELETE";
  api_headers?: string; // JSON
  api_body?: string;
  // gpt
  gpt_prompt?: string;
  gpt_model?: string;
  // transfer
  transfer_department?: string;
  // rating
  rating_scale?: number;
  // wa
  wa_template_name?: string;
  wa_flow_id?: string;
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

/* ---------------- Type registry ---------------- */

type TypeMeta = {
  label: string;
  icon: JSX.Element;
  color: string;          // tailwind bg-* for header
  category: "Conteúdos" | "Ações" | "Lógicas" | "Integrações" | "Instagram" | "WhatsApp Oficial";
};

const TYPE_META: Record<StepType, TypeMeta> = {
  text:         { label: "Texto",          icon: <MessageSquare className="w-3.5 h-3.5" />, color: "bg-blue-500",   category: "Conteúdos" },
  image:        { label: "Imagem",         icon: <ImageIcon    className="w-3.5 h-3.5" />, color: "bg-pink-500",   category: "Conteúdos" },
  video:        { label: "Vídeo",          icon: <Video        className="w-3.5 h-3.5" />, color: "bg-purple-500", category: "Conteúdos" },
  audio:        { label: "Áudio",          icon: <Music        className="w-3.5 h-3.5" />, color: "bg-cyan-500",   category: "Conteúdos" },
  file:         { label: "Arquivo",        icon: <FileText     className="w-3.5 h-3.5" />, color: "bg-slate-500",  category: "Conteúdos" },
  contact:      { label: "Contato",        icon: <UserIcon     className="w-3.5 h-3.5" />, color: "bg-teal-500",   category: "Conteúdos" },

  menu:         { label: "Menu",           icon: <ListChecks   className="w-3.5 h-3.5" />, color: "bg-violet-500", category: "Ações" },
  question:     { label: "Pergunta",       icon: <HelpCircle   className="w-3.5 h-3.5" />, color: "bg-orange-500", category: "Ações" },
  rating:       { label: "Avaliação",      icon: <Star         className="w-3.5 h-3.5" />, color: "bg-yellow-500", category: "Ações" },
  tags:         { label: "Etiquetas",      icon: <Tag          className="w-3.5 h-3.5" />, color: "bg-lime-600",   category: "Ações" },
  save_contact: { label: "Salvar contato", icon: <UserIcon     className="w-3.5 h-3.5" />, color: "bg-emerald-600",category: "Ações" },
  save_card:    { label: "Salvar card",    icon: <IdCard       className="w-3.5 h-3.5" />, color: "bg-emerald-700",category: "Ações" },
  transfer:     { label: "Transferência",  icon: <LogOut       className="w-3.5 h-3.5" />, color: "bg-amber-500",  category: "Ações" },
  end:          { label: "Finalizar",      icon: <ArrowRight   className="w-3.5 h-3.5" />, color: "bg-rose-500",   category: "Ações" },

  condition:    { label: "Condicional",    icon: <GitBranch    className="w-3.5 h-3.5" />, color: "bg-indigo-500", category: "Lógicas" },
  delay:        { label: "Delay",          icon: <Clock        className="w-3.5 h-3.5" />, color: "bg-zinc-500",   category: "Lógicas" },
  ab_test:      { label: "Teste A/B",      icon: <Shuffle      className="w-3.5 h-3.5" />, color: "bg-fuchsia-500",category: "Lógicas" },

  api_call:     { label: "Chamada API",    icon: <Globe        className="w-3.5 h-3.5" />, color: "bg-sky-600",    category: "Integrações" },
  gpt:          { label: "Resposta GPT",   icon: <Sparkles     className="w-3.5 h-3.5" />, color: "bg-emerald-500",category: "Integrações" },

  ig_comment:   { label: "Comentário IG",  icon: <Instagram    className="w-3.5 h-3.5" />, color: "bg-pink-600",   category: "Instagram" },

  wa_flow:      { label: "Flows WhatsApp", icon: <Layout       className="w-3.5 h-3.5" />, color: "bg-green-600",  category: "WhatsApp Oficial" },
  wa_template:  { label: "Template WA",    icon: <FileBadge    className="w-3.5 h-3.5" />, color: "bg-green-700",  category: "WhatsApp Oficial" },
};

const LEGACY_STEP_TYPES: Record<string, StepType> = {
  message: "text",
  buttons: "menu",
  list: "menu",
  wait: "delay",
  webhook: "api_call",
  human: "transfer",
  finish: "end",
};

function normalizeStepType(type: unknown): StepType {
  if (typeof type !== "string") return "text";
  if (type in TYPE_META) return type as StepType;
  return LEGACY_STEP_TYPES[type] ?? "text";
}

function normalizeStep(step: any, index: number): Step {
  const normalizedType = normalizeStepType(step?.type);
  const fallback = makeStep(normalizedType);
  return {
    ...fallback,
    ...(step ?? {}),
    id: step?.id || fallback.id,
    type: normalizedType,
    title: step?.title || (step?.type === "message" ? "Texto" : TYPE_META[normalizedType].label),
    buttons: Array.isArray(step?.buttons) ? step.buttons : fallback.buttons,
    children: Array.isArray(step?.children) ? step.children.map(normalizeInlineStep) : [],
    condition_rules: Array.isArray(step?.condition_rules) ? step.condition_rules : fallback.condition_rules,
    tags: Array.isArray(step?.tags) ? step.tags : fallback.tags,
    position: step?.position ?? fallback.position ?? { x: 120 + (index % 4) * 320, y: 100 + Math.floor(index / 4) * 260 },
  };
}

function normalizeInlineStep(step: any, index: number): Step {
  const normalizedType = normalizeStepType(step?.type);
  const fallback = makeStep(normalizedType);
  return {
    ...fallback,
    ...(step ?? {}),
    id: step?.id || fallback.id,
    type: normalizedType,
    title: step?.title || TYPE_META[normalizedType].label,
    buttons: Array.isArray(step?.buttons) ? step.buttons : fallback.buttons,
    children: Array.isArray(step?.children) ? step.children.map(normalizeInlineStep) : [],
    condition_rules: Array.isArray(step?.condition_rules) ? step.condition_rules : fallback.condition_rules,
    tags: Array.isArray(step?.tags) ? step.tags : fallback.tags,
    position: undefined,
  };
}

function normalizeFlow(row: any): Flow {
  const steps = Array.isArray(row?.steps) ? row.steps.map(normalizeStep) : [];
  return {
    ...row,
    steps,
    trigger_keywords: Array.isArray(row?.trigger_keywords) ? row.trigger_keywords : [],
    start_step_id: row?.start_step_id && steps.some((s) => s.id === row.start_step_id)
      ? row.start_step_id
      : steps[0]?.id ?? null,
  } as Flow;
}

const CATEGORIES: TypeMeta["category"][] = [
  "Conteúdos", "Ações", "Lógicas", "Integrações", "Instagram", "WhatsApp Oficial",
];

/* ---------------- Step factories ---------------- */

const NEXT_BTN = (): FlowButton[] => [{ id: "next", label: "Próximo", next_step_id: null }];

function makeStep(type: StepType): Step {
  const base: Step = {
    id: uid(),
    type,
    title: TYPE_META[type].label,
    children: [],
    position: { x: 200 + Math.random() * 300, y: 200 + Math.random() * 200 },
  };
  switch (type) {
    case "text":
      return { ...base, text: "Digite sua mensagem...", buttons: NEXT_BTN() };
    case "image":
    case "video":
    case "audio":
    case "file":
      return { ...base, text: "", media_url: "", caption: "", buttons: NEXT_BTN() };
    case "contact":
      return { ...base, contact_name: "", contact_phone: "", buttons: NEXT_BTN() };
    case "menu":
      return {
        ...base,
        text: "Escolha uma opção:",
        menu_style: "buttons",
        buttons: [
          { id: uid(), label: "Opção 1", next_step_id: null },
          { id: uid(), label: "Opção 2", next_step_id: null },
        ],
      };
    case "question":
      return { ...base, text: "Qual seu nome?", variable: "nome", buttons: NEXT_BTN() };
    case "rating":
      return { ...base, text: "Avalie de 1 a 5", rating_scale: 5, variable: "avaliacao", buttons: NEXT_BTN() };
    case "tags":
      return { ...base, tags: ["cliente"], buttons: NEXT_BTN() };
    case "save_contact":
    case "save_card":
      return { ...base, buttons: NEXT_BTN() };
    case "transfer":
      return { ...base, text: "Transferindo para um atendente...", transfer_department: "", buttons: [] };
    case "end":
      return { ...base, text: "Obrigado pelo contato!", buttons: [] };
    case "delay":
      return { ...base, delay_ms: 2000, buttons: NEXT_BTN() };
    case "ab_test":
      return {
        ...base,
        ab_weight_a: 50,
        buttons: [
          { id: "a", label: "Variante A", next_step_id: null },
          { id: "b", label: "Variante B", next_step_id: null },
        ],
      };
    case "condition":
      return {
        ...base,
        condition_variable: "ultima_resposta",
        condition_rules: [{ id: uid(), op: "eq", value: "sim", next_step_id: null }],
        buttons: [{ id: "default", label: "Senão", next_step_id: null }],
      };
    case "api_call":
      return {
        ...base,
        api_url: "https://",
        api_method: "POST",
        api_headers: '{"Content-Type":"application/json"}',
        api_body: "{}",
        variable: "api_response",
        buttons: NEXT_BTN(),
      };
    case "gpt":
      return {
        ...base,
        gpt_prompt: "Responda de forma educada a: {{ultima_mensagem}}",
        gpt_model: "google/gemini-2.5-flash",
        variable: "gpt_resposta",
        buttons: NEXT_BTN(),
      };
    case "ig_comment":
      return { ...base, text: "Obrigado pelo comentário!", buttons: NEXT_BTN() };
    case "wa_flow":
      return { ...base, wa_flow_id: "", text: "Flow do WhatsApp", buttons: NEXT_BTN() };
    case "wa_template":
      return { ...base, wa_template_name: "", text: "Template oficial", buttons: NEXT_BTN() };
  }
}

function emptyFlow(owner_id: string): Omit<Flow, "id"> {
  const start = makeStep("menu");
  start.title = "Boas-vindas";
  start.text = "Olá! Como posso ajudar?";
  start.position = { x: 280, y: 160 };
  start.buttons = [
    { id: uid(), label: "Renovar", next_step_id: null },
    { id: uid(), label: "Suporte", next_step_id: null },
  ];
  return {
    owner_id,
    name: "Novo fluxo",
    enabled: true,
    trigger_keywords: [],
    start_step_id: start.id,
    steps: [start],
  };
}

function edgesFromSteps(steps: Step[]): Edge[] {
  const list: Edge[] = [];
  for (const rawStep of steps) {
    const s = normalizeStep(rawStep, 0);
    if (s.type === "menu" || s.type === "ab_test") {
      for (const b of s.buttons ?? []) {
        if (b.next_step_id) list.push({
          id: `${s.id}-${b.id}`, source: s.id, sourceHandle: `btn-${b.id}`, target: b.next_step_id,
          animated: true, markerEnd: { type: MarkerType.ArrowClosed }, deletable: true,
        });
      }
    } else if (s.type === "condition") {
      for (const r of s.condition_rules ?? []) {
        if (r.next_step_id) list.push({
          id: `${s.id}-${r.id}`, source: s.id, sourceHandle: `rule-${r.id}`, target: r.next_step_id,
          animated: true, markerEnd: { type: MarkerType.ArrowClosed }, deletable: true,
        });
      }
      const def = s.buttons?.find((b) => b.id === "default");
      if (def?.next_step_id) list.push({
        id: `${s.id}-default`, source: s.id, sourceHandle: "rule-default", target: def.next_step_id,
        animated: true, markerEnd: { type: MarkerType.ArrowClosed }, deletable: true,
      });
    } else if (s.type !== "end" && s.type !== "transfer") {
      const nxt = s.buttons?.[0]?.next_step_id;
      if (nxt) list.push({
        id: `${s.id}-next`, source: s.id, sourceHandle: "next", target: nxt,
        animated: true, markerEnd: { type: MarkerType.ArrowClosed }, deletable: true,
      });
    }
  }
  return list;
}

function clearRemovedEdges(flow: Flow, removed: Edge[]): Flow {
  return {
    ...flow,
    steps: flow.steps.map((s) => {
      const hits = removed.filter((e) => e.source === s.id);
      if (!hits.length) return s;
      let next = s;
      for (const hit of hits) {
        const handle = hit.sourceHandle ?? "next";
        if (handle.startsWith("rule-")) {
          const ruleId = handle.replace("rule-", "");
          next = ruleId === "default"
            ? { ...next, buttons: next.buttons?.map((b) => b.id === "default" ? { ...b, next_step_id: null } : b) }
            : { ...next, condition_rules: next.condition_rules?.map((r) => r.id === ruleId ? { ...r, next_step_id: null } : r) };
        } else if (handle.startsWith("btn-")) {
          const btnId = handle.replace("btn-", "");
          next = { ...next, buttons: next.buttons?.map((b) => b.id === btnId ? { ...b, next_step_id: null } : b) };
        } else {
          next = { ...next, buttons: [{ id: "next", label: "Próximo", next_step_id: null }] };
        }
      }
      return next;
    }),
  };
}

/* ---------------- Node ---------------- */

type StepNodeData = {
  step: Step;
  isStart: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSetStart: (id: string) => void;
  onDropChild: (parentId: string, event: DragEvent) => void;
};

function NodeBody({ step }: { step: Step }) {
  const showText = step.text && (
    <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-3">{step.text}</p>
  );
  const children = (step.children ?? []).length > 0 && (
    <div className="flex flex-wrap gap-1 pt-1">
      {(step.children ?? []).slice(0, 4).map((child) => (
        <Badge key={child.id} variant="secondary" className="text-[10px] gap-1">
          {TYPE_META[normalizeStepType(child.type)].icon}{child.title || TYPE_META[normalizeStepType(child.type)].label}
        </Badge>
      ))}
      {(step.children ?? []).length > 4 && <Badge variant="outline" className="text-[10px]">+{(step.children ?? []).length - 4}</Badge>}
    </div>
  );
  switch (step.type) {
    case "image":
      return (
        <div className="space-y-1.5">
          {children}
          {showText}
          {step.media_url
            ? <img src={step.media_url} alt="" className="w-full max-h-32 object-cover rounded" />
            : <div className="w-full h-16 bg-muted rounded flex items-center justify-center text-[10px] text-muted-foreground">sem imagem</div>}
          {step.caption && <p className="text-[11px] line-clamp-2">{step.caption}</p>}
        </div>
      );
    case "video":
    case "audio":
    case "file":
      return (
        <div className="space-y-1">
          {children}
          {showText}
          <div className="text-[11px] text-muted-foreground truncate">
            {step.media_url || <span className="italic">sem URL</span>}
          </div>
          {step.caption && <p className="text-[11px] line-clamp-2">{step.caption}</p>}
        </div>
      );
    case "contact":
      return (
        <div className="text-xs">
          <div className="font-medium">{step.contact_name || "Nome"}</div>
          <div className="text-muted-foreground">{step.contact_phone || "Telefone"}</div>
        </div>
      );
    case "delay":
      return <div className="text-xs">⏱ {(step.delay_ms ?? 0) / 1000}s</div>;
    case "tags":
      return (
        <div className="flex flex-wrap gap-1">
          {(step.tags ?? []).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
        </div>
      );
    case "api_call":
      return <div className="text-[11px] truncate"><span className="font-mono">{step.api_method}</span> {step.api_url}</div>;
    case "gpt":
      return <div className="text-[11px] line-clamp-3 italic">{step.gpt_prompt}</div>;
    case "rating":
      return <div className="text-xs">⭐ 1 a {step.rating_scale}</div>;
    case "condition":
      return (
        <div className="text-[11px]">
          var <span className="font-mono">{step.condition_variable}</span>
          <div className="text-muted-foreground">{(step.condition_rules ?? []).length} regra(s)</div>
        </div>
      );
    case "ab_test":
      return <div className="text-xs">A {step.ab_weight_a ?? 50}% / B {100 - (step.ab_weight_a ?? 50)}%</div>;
    case "wa_template":
      return <div className="text-[11px]">tpl: <span className="font-mono">{step.wa_template_name || "—"}</span></div>;
    case "wa_flow":
      return <div className="text-[11px]">flow: <span className="font-mono">{step.wa_flow_id || "—"}</span></div>;
    default:
      return (
        <div className="space-y-1">
          {children}
          {showText || <span className="text-muted-foreground italic text-xs">(vazio)</span>}
        </div>
      );
  }
}

function StepNode({ data, selected }: NodeProps<StepNodeData>) {
  const { step, isStart, onEdit, onDelete, onSetStart, onDropChild } = data;
  const safeType = normalizeStepType(step.type);
  const safeStep = safeType === step.type ? step : { ...step, type: safeType };
  const meta = TYPE_META[safeType];

  // Decide branching style
  const branching = safeStep.type === "menu" || safeStep.type === "condition" || safeStep.type === "ab_test";
  const hasNext = safeStep.type !== "end" && safeStep.type !== "transfer" && !branching;

  return (
    <div
      className={`rounded-xl border bg-card shadow-sm min-w-[230px] max-w-[260px] transition ${selected ? "ring-2 ring-primary" : "border-border"}`}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }}
      onDrop={(event) => onDropChild(safeStep.id, event)}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-muted-foreground" />

      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl text-white text-xs font-medium ${meta.color}`}>
        <div className="flex items-center gap-1.5 truncate">
          {meta.icon}
          <span className="truncate">{safeStep.title || meta.label}</span>
        </div>
        {isStart && (
          <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 shrink-0">
            <Flag className="w-3 h-3" /> início
          </span>
        )}
      </div>

      <div className="px-3 py-2 space-y-2">
        <NodeBody step={safeStep} />

        {safeStep.type === "menu" && safeStep.buttons && safeStep.buttons.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border">
            {safeStep.buttons.map((b) => (
              <div key={b.id} className="relative flex items-center justify-between text-xs bg-muted/60 rounded px-2 py-1.5">
                <span className="truncate">{b.label || "Botão"}</span>
                <Handle type="source" position={Position.Right} id={`btn-${b.id}`} className="!w-2.5 !h-2.5 !bg-violet-500 !-right-[7px]" style={{ top: "50%" }} />
              </div>
            ))}
          </div>
        )}

        {safeStep.type === "condition" && (
          <div className="space-y-1 pt-1 border-t border-border">
            {(safeStep.condition_rules ?? []).map((r) => (
              <div key={r.id} className="relative flex items-center justify-between text-[11px] bg-indigo-500/10 rounded px-2 py-1.5">
                <span className="truncate">{r.op} "{r.value}"</span>
                <Handle type="source" position={Position.Right} id={`rule-${r.id}`} className="!w-2.5 !h-2.5 !bg-indigo-500 !-right-[7px]" style={{ top: "50%" }} />
              </div>
            ))}
            <div className="relative flex items-center justify-between text-[11px] bg-muted rounded px-2 py-1.5">
              <span className="truncate text-muted-foreground">Senão</span>
              <Handle type="source" position={Position.Right} id="rule-default" className="!w-2.5 !h-2.5 !bg-muted-foreground !-right-[7px]" style={{ top: "50%" }} />
            </div>
          </div>
        )}

        {safeStep.type === "ab_test" && safeStep.buttons && (
          <div className="space-y-1 pt-1 border-t border-border">
            {safeStep.buttons.map((b) => (
              <div key={b.id} className="relative flex items-center justify-between text-xs bg-fuchsia-500/10 rounded px-2 py-1.5">
                <span className="truncate">{b.label}</span>
                <Handle type="source" position={Position.Right} id={`btn-${b.id}`} className="!w-2.5 !h-2.5 !bg-fuchsia-500 !-right-[7px]" style={{ top: "50%" }} />
              </div>
            ))}
          </div>
        )}

        {hasNext && (
          <div className="relative h-2">
            <Handle type="source" position={Position.Right} id="next" className="!w-2.5 !h-2.5 !bg-primary" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border bg-muted/30 rounded-b-xl">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onEdit(safeStep.id)}>
          <Settings2 className="w-3 h-3 mr-1" /> Editar
        </Button>
        {!isStart && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onSetStart(safeStep.id)}>
            <Flag className="w-3 h-3" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-rose-500 ml-auto" onClick={() => onDelete(safeStep.id)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

const nodeTypes = { step: StepNode };

/* ---------------- Editor panel ---------------- */

function EditorPanel({
  step, onChange, onClose,
}: {
  step: Step;
  onChange: (patch: Partial<Step>) => void;
  onClose: () => void;
}) {
  const t = step.type;
  return (
    <div className="absolute top-0 right-0 h-full w-[380px] bg-card border-l shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${TYPE_META[t].color}`} />
          <h3 className="font-medium text-sm">Editar — {TYPE_META[t].label}</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <Label className="text-xs">Título (interno)</Label>
          <Input className="h-9" value={step.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} />
        </div>

        {(t === "text" || t === "menu" || t === "question" || t === "rating" || t === "transfer" || t === "end" || t === "ig_comment") && (
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea rows={4} value={step.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          </div>
        )}

        {(t === "image" || t === "video" || t === "audio" || t === "file") && (
          <>
            <div>
              <Label className="text-xs">Texto antes da mídia (opcional)</Label>
              <Textarea rows={3} value={step.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">URL do {TYPE_META[t].label.toLowerCase()}</Label>
              <Input className="h-9" placeholder="https://..." value={step.media_url ?? ""} onChange={(e) => onChange({ media_url: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Legenda (opcional)</Label>
              <Textarea rows={2} value={step.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} />
            </div>
          </>
        )}

        {t === "contact" && (
          <>
            <div>
              <Label className="text-xs">Nome</Label>
              <Input className="h-9" value={step.contact_name ?? ""} onChange={(e) => onChange({ contact_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input className="h-9" placeholder="55119..." value={step.contact_phone ?? ""} onChange={(e) => onChange({ contact_phone: e.target.value })} />
            </div>
          </>
        )}

        {t === "question" && (
          <div>
            <Label className="text-xs">Salvar resposta em variável</Label>
            <Input className="h-9" value={step.variable ?? ""} onChange={(e) => onChange({ variable: e.target.value })} />
          </div>
        )}

        {t === "rating" && (
          <>
            <div>
              <Label className="text-xs">Escala (1 a N)</Label>
              <Input type="number" min={2} max={10} className="h-9" value={step.rating_scale ?? 5} onChange={(e) => onChange({ rating_scale: +e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Variável</Label>
              <Input className="h-9" value={step.variable ?? ""} onChange={(e) => onChange({ variable: e.target.value })} />
            </div>
          </>
        )}

        {t === "tags" && (
          <div>
            <Label className="text-xs">Etiquetas (separadas por vírgula)</Label>
            <Input className="h-9" value={(step.tags ?? []).join(", ")}
              onChange={(e) => onChange({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>
        )}

        {t === "transfer" && (
          <div>
            <Label className="text-xs">Departamento (opcional)</Label>
            <Input className="h-9" value={step.transfer_department ?? ""} onChange={(e) => onChange({ transfer_department: e.target.value })} />
          </div>
        )}

        {t === "delay" && (
          <div>
            <Label className="text-xs">Atraso (ms)</Label>
            <Input type="number" min={0} step={500} className="h-9" value={step.delay_ms ?? 0} onChange={(e) => onChange({ delay_ms: +e.target.value })} />
          </div>
        )}

        {t === "ab_test" && (
          <div>
            <Label className="text-xs">% da Variante A</Label>
            <Input type="number" min={0} max={100} className="h-9" value={step.ab_weight_a ?? 50} onChange={(e) => onChange({ ab_weight_a: +e.target.value })} />
          </div>
        )}

        {t === "condition" && (
          <>
            <div>
              <Label className="text-xs">Variável a comparar</Label>
              <Input className="h-9" value={step.condition_variable ?? ""} onChange={(e) => onChange({ condition_variable: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Regras</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => onChange({
                    condition_rules: [...(step.condition_rules ?? []), { id: uid(), op: "eq", value: "", next_step_id: null }],
                  })}>
                  <Plus className="w-3 h-3 mr-1" /> Regra
                </Button>
              </div>
              {(step.condition_rules ?? []).map((r) => (
                <div key={r.id} className="flex gap-1 items-center">
                  <Select value={r.op} onValueChange={(v: any) => onChange({
                    condition_rules: step.condition_rules!.map((x) => x.id === r.id ? { ...x, op: v } : x),
                  })}>
                    <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">é igual</SelectItem>
                      <SelectItem value="contains">contém</SelectItem>
                      <SelectItem value="starts">começa com</SelectItem>
                      <SelectItem value="regex">regex</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="h-8 text-xs" value={r.value} onChange={(e) => onChange({
                    condition_rules: step.condition_rules!.map((x) => x.id === r.id ? { ...x, value: e.target.value } : x),
                  })} />
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-rose-500"
                    onClick={() => onChange({ condition_rules: step.condition_rules!.filter((x) => x.id !== r.id) })}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">Conecte cada regra (ou Senão) a um próximo passo arrastando do círculo à direita.</p>
            </div>
          </>
        )}

        {t === "api_call" && (
          <>
            <div className="flex gap-2">
              <div className="w-28">
                <Label className="text-xs">Método</Label>
                <Select value={step.api_method ?? "POST"} onValueChange={(v: any) => onChange({ api_method: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["GET", "POST", "PUT", "DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">URL</Label>
                <Input className="h-9" value={step.api_url ?? ""} onChange={(e) => onChange({ api_url: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Headers (JSON)</Label>
              <Textarea rows={3} className="font-mono text-xs" value={step.api_headers ?? ""} onChange={(e) => onChange({ api_headers: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Body</Label>
              <Textarea rows={4} className="font-mono text-xs" value={step.api_body ?? ""} onChange={(e) => onChange({ api_body: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Salvar resposta em</Label>
              <Input className="h-9" value={step.variable ?? ""} onChange={(e) => onChange({ variable: e.target.value })} />
            </div>
          </>
        )}

        {t === "gpt" && (
          <>
            <div>
              <Label className="text-xs">Modelo</Label>
              <Select value={step.gpt_model ?? "google/gemini-2.5-flash"} onValueChange={(v) => onChange({ gpt_model: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash (rápido)</SelectItem>
                  <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prompt (use {"{{variavel}}"})</Label>
              <Textarea rows={5} value={step.gpt_prompt ?? ""} onChange={(e) => onChange({ gpt_prompt: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Salvar resposta em</Label>
              <Input className="h-9" value={step.variable ?? ""} onChange={(e) => onChange({ variable: e.target.value })} />
            </div>
          </>
        )}

        {t === "wa_template" && (
          <div>
            <Label className="text-xs">Nome do template aprovado</Label>
            <Input className="h-9" value={step.wa_template_name ?? ""} onChange={(e) => onChange({ wa_template_name: e.target.value })} />
          </div>
        )}

        {t === "wa_flow" && (
          <div>
            <Label className="text-xs">Flow ID</Label>
            <Input className="h-9" value={step.wa_flow_id ?? ""} onChange={(e) => onChange({ wa_flow_id: e.target.value })} />
          </div>
        )}

        {t === "menu" && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Formato de envio</Label>
              <Select value={step.menu_style ?? "buttons"} onValueChange={(v: any) => onChange({ menu_style: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buttons">Botões reais</SelectItem>
                  <SelectItem value="list">Lista real</SelectItem>
                  <SelectItem value="numbered">Texto numerado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Botões</Label>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => onChange({
                  buttons: [...(step.buttons ?? []), { id: uid(), label: `Opção ${(step.buttons?.length ?? 0) + 1}`, next_step_id: null }],
                })}>
                <Plus className="w-3 h-3 mr-1" /> Botão
              </Button>
            </div>
            {step.buttons?.map((b) => (
              <div key={b.id} className="flex gap-1">
                <Input className="h-8" value={b.label}
                  onChange={(e) => onChange({ buttons: step.buttons!.map((x) => x.id === b.id ? { ...x, label: e.target.value } : x) })} />
                <Button size="sm" variant="ghost" className="h-8 px-2 text-rose-500"
                  onClick={() => onChange({ buttons: step.buttons!.filter((x) => x.id !== b.id) })}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Arraste do círculo violeta de cada botão até outro passo para conectar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Builder ---------------- */

function FlowBuilder({ flow, onChange }: { flow: Flow; onChange: (updater: (f: Flow) => Flow) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const { screenToFlowPosition } = useReactFlow();

  function patchStep(id: string, patch: Partial<Step>) {
    onChange((f) => ({ ...f, steps: f.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }

  function handleSetStart(id: string) {
    onChange((f) => ({ ...f, start_step_id: id }));
  }

  function handleDelete(id: string) {
    onChange((f) => {
      const steps = f.steps.filter((s) => s.id !== id).map((s) => ({
        ...s,
        buttons: s.buttons?.map((b) => (b.next_step_id === id ? { ...b, next_step_id: null } : b)),
        condition_rules: s.condition_rules?.map((r) => (r.next_step_id === id ? { ...r, next_step_id: null } : r)),
      }));
      return { ...f, steps, start_step_id: f.start_step_id === id ? steps[0]?.id ?? null : f.start_step_id };
    });
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setNodes((nds) => nds.filter((n) => n.id !== id));
  }

  const initialNodes: Node<StepNodeData>[] = useMemo(
    () => flow.steps.map((s, i) => ({
      id: s.id,
      type: "step",
      position: s.position ?? { x: 120 + (i % 4) * 320, y: 100 + Math.floor(i / 4) * 260 },
      data: { step: s, isStart: flow.start_step_id === s.id, onEdit: setEditingId, onDelete: handleDelete, onSetStart: handleSetStart },
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow.id],
  );

  const initialEdges: Edge[] = useMemo(() => {
    return edgesFromSteps(flow.steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState<StepNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

  // Sync nodes/edges when steps change, including newly clicked palette options.
  useEffect(() => {
    setNodes((nds) => flow.steps.map((s, i) => {
      const current = nds.find((n) => n.id === s.id);
      return {
        id: s.id,
        type: "step",
        position: current?.position ?? s.position ?? { x: 300 + (i % 3) * 320, y: 180 + Math.floor(i / 3) * 250 },
        data: { step: s, isStart: flow.start_step_id === s.id, onEdit: setEditingId, onDelete: handleDelete, onSetStart: handleSetStart },
      };
    }));
    setEdges(edgesFromSteps(flow.steps));
  }, [flow.steps, flow.start_step_id, setNodes]);

  function addStep(type: StepType, position?: { x: number; y: number }, patch?: Partial<Step>) {
    const s = makeStep(type);
    s.position = position ?? { x: 360 + (flow.steps.length % 3) * 300, y: 160 + Math.floor(flow.steps.length / 3) * 230 };
    Object.assign(s, patch ?? {});
    onChange((f) => ({ ...f, steps: [...f.steps, s] }));
    setEditingId(s.id);
  }

  const addDroppedFile = async (file: File, position: { x: number; y: number }) => {
    const mediaType: StepType = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "file";
    let mediaUrl = URL.createObjectURL(file);
    try {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-");
      const path = `${flow.owner_id}/bot-flow-${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("reseller-assets").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (!error) {
        const { data } = supabase.storage.from("reseller-assets").getPublicUrl(path);
        mediaUrl = data.publicUrl || mediaUrl;
      }
    } catch { /* keep local preview if upload is unavailable */ }
    addStep(mediaType, position, { title: file.name, media_url: mediaUrl });
  };

  const onConnect = useCallback((params: Edge | Connection) => {
    setEdges((eds) => {
      const cleaned = eds.filter((e) => !(e.source === params.source && e.sourceHandle === params.sourceHandle));
      return addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed }, deletable: true }, cleaned);
    });
    onChange((f) => ({
      ...f,
      steps: f.steps.map((s) => {
        if (s.id !== params.source) return s;
        const handle = params.sourceHandle ?? "next";
        // condition rule branch
        if (handle.startsWith("rule-")) {
          const ruleId = handle.replace("rule-", "");
          if (ruleId === "default") {
            return {
              ...s,
              buttons: (s.buttons ?? []).some((b) => b.id === "default")
                ? s.buttons!.map((b) => b.id === "default" ? { ...b, next_step_id: params.target ?? null } : b)
                : [...(s.buttons ?? []), { id: "default", label: "Senão", next_step_id: params.target ?? null }],
            };
          }
          return {
            ...s,
            condition_rules: s.condition_rules?.map((r) => r.id === ruleId ? { ...r, next_step_id: params.target ?? null } : r),
          };
        }
        // menu/ab button
        if (handle.startsWith("btn-")) {
          const btnId = handle.replace("btn-", "");
          return { ...s, buttons: s.buttons?.map((b) => b.id === btnId ? { ...b, next_step_id: params.target ?? null } : b) };
        }
        // simple next
        return { ...s, buttons: [{ id: "next", label: "Próximo", next_step_id: params.target ?? null }] };
      }),
    }));
  }, [onChange, setEdges]);

  const onEdgesDelete = useCallback((removed: Edge[]) => {
    onChange((f) => clearRemovedEdges(f, removed));
    setSelectedEdgeIds((ids) => ids.filter((id) => !removed.some((e) => e.id === id)));
  }, [onChange]);

  const deleteSelectedEdges = useCallback(() => {
    const removed = edges.filter((e) => selectedEdgeIds.includes(e.id));
    if (!removed.length) return;
    onChange((f) => clearRemovedEdges(f, removed));
    setEdges((eds) => eds.filter((e) => !selectedEdgeIds.includes(e.id)));
    setSelectedEdgeIds([]);
  }, [edges, onChange, selectedEdgeIds, setEdges]);

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    onChange((f) => ({ ...f, steps: f.steps.map((s) => s.id === node.id ? { ...s, position: node.position } : s) }));
  }, [onChange]);

  const editing = editingId ? flow.steps.find((s) => s.id === editingId) ?? null : null;

  return (
    <div className="relative h-full w-full">
      {/* Floating palette */}
      <div className="absolute top-3 left-3 z-10 w-56 bg-card/95 backdrop-blur rounded-lg border shadow-sm max-h-[calc(100%-1.5rem)] overflow-y-auto">
        <div className="p-2 space-y-3">
          {CATEGORIES.map((cat) => {
            const items = (Object.keys(TYPE_META) as StepType[]).filter((k) => TYPE_META[k].category === cat);
            return (
              <div key={cat}>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1 mb-1">{cat}</p>
                <div className="grid grid-cols-2 gap-1">
                  {items.map((t) => (
                    <Button key={t} size="sm" variant="outline" className="h-7 text-[11px] justify-start gap-1 px-2"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("application/x-flow-step", t); e.dataTransfer.effectAllowed = "copy"; }}
                      onClick={() => addStep(t)}>
                      {TYPE_META[t].icon}
                      <span className="truncate">{TYPE_META[t].label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedEdgeIds.length > 0 && (
        <div className="absolute top-3 left-[250px] z-10 bg-card/95 backdrop-blur rounded-lg border shadow-sm p-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{selectedEdgeIds.length} ligação selecionada(s)</span>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={deleteSelectedEdges}>
            <Trash2 className="w-3 h-3 mr-1" /> Excluir ligação
          </Button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={(_, edge) => setSelectedEdgeIds([edge.id])}
        onSelectionChange={({ edges: selected }) => setSelectedEdgeIds(selected.map((e) => e.id))}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDrop={async (event) => {
          event.preventDefault();
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const droppedType = event.dataTransfer.getData("application/x-flow-step") as StepType;
          const uri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
          const file = event.dataTransfer.files?.[0];
          if (droppedType && droppedType in TYPE_META) addStep(droppedType, position);
          else if (file) await addDroppedFile(file, position);
          else if (/^https?:\/\//i.test(uri)) addStep(/\.(mp4|mov|webm)(\?|$)/i.test(uri) ? "video" : /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(uri) ? "audio" : /\.(pdf|zip|docx?|xlsx?)(\?|$)/i.test(uri) ? "file" : "image", position, { media_url: uri });
        }}
        nodeTypes={nodeTypes}
        fitView
        defaultEdgeOptions={{ animated: true, markerEnd: { type: MarkerType.ArrowClosed } }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap pannable zoomable className="!bg-card" />
      </ReactFlow>

      {editing && (
        <EditorPanel
          step={editing}
          onChange={(patch) => patchStep(editing.id, patch)}
          onClose={() => setEditingId(null)}
        />
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

  useEffect(() => { if (user) void load(); /* eslint-disable-next-line */ }, [user]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("bot_flows" as any).select("*").order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error("Erro ao carregar fluxos"); return; }
    const list = ((data ?? []) as any[]).map(normalizeFlow);
    setFlows(list);
    if (list.length && !activeId) setActiveId(list[0].id);
  }

  async function createFlow() {
    if (!user) return;
    const payload = emptyFlow(user.id);
    const { data, error } = await supabase.from("bot_flows" as any).insert(payload as any).select().single();
    if (error || !data) { toast.error("Erro ao criar fluxo"); return; }
    const newF = normalizeFlow(data as any);
    setFlows((p) => [newF, ...p]);
    setActiveId(newF.id);
  }

  async function saveActive() {
    if (!active) return;
    setSaving(true);
    const { error } = await supabase.from("bot_flows" as any).update({
      name: active.name,
      enabled: active.enabled,
      trigger_keywords: active.trigger_keywords,
      start_step_id: active.start_step_id,
      steps: active.steps as any,
    }).eq("id", active.id);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success("Fluxo salvo");
  }

  async function deleteFlow(id: string) {
    if (!confirm("Excluir este fluxo?")) return;
    const { error } = await supabase.from("bot_flows" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    setFlows((p) => p.filter((f) => f.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function patchActive(updater: (f: Flow) => Flow) {
    setFlows((prev) => prev.map((f) => (f.id === activeId ? updater(f) : f)));
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <h1 className="font-semibold">Robô — Construtor de Fluxos</h1>
            <Badge variant="secondary" className="text-[10px]">Beta</Badge>
          </div>
          <div className="flex items-center gap-2">
            {active && (
              <Button size="sm" onClick={saveActive} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={createFlow}>
              <Plus className="w-4 h-4 mr-1" /> Novo fluxo
            </Button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
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
                <button key={f.id} onClick={() => setActiveId(f.id)}
                  className={`w-full text-left px-2 py-2 rounded-md text-sm flex items-center justify-between group ${
                    activeId === f.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}>
                  <span className="truncate flex items-center gap-1.5">
                    <PlayCircle className={`w-3.5 h-3.5 ${f.enabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                    {f.name}
                  </span>
                  <Trash2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-rose-500"
                    onClick={(e) => { e.stopPropagation(); deleteFlow(f.id); }} />
                </button>
              ))}
            </div>
          </aside>

          <main className="flex-1 relative bg-muted/10">
            {!active ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Selecione ou crie um fluxo para começar.
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 border-b bg-card flex flex-wrap items-center gap-3">
                  <Input className="h-8 max-w-xs font-medium" value={active.name}
                    onChange={(e) => patchActive((f) => ({ ...f, name: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <Switch checked={active.enabled} onCheckedChange={(v) => patchActive((f) => ({ ...f, enabled: v }))} />
                    <Label className="text-xs">Ativo</Label>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Label className="text-xs whitespace-nowrap">Gatilhos:</Label>
                    <Input className="h-8" placeholder="oi, menu, ajuda (separados por vírgula)"
                      value={active.trigger_keywords.join(", ")}
                      onChange={(e) => patchActive((f) => ({
                        ...f, trigger_keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      }))} />
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
