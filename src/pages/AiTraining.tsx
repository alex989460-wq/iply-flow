import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Loader2, Play, RefreshCw, Check, X, Sparkles, BookOpen, BarChart3,
  MessageSquare, Database, CheckCircle2, Clock, Brain, Workflow, Target,
  FileText, ShieldCheck, Lightbulb, Edit3, Trash2, GitMerge, StopCircle,
  Zap, TrendingUp, Users,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ================= TYPES =================
type Kind = 'procedure' | 'flow' | 'intent' | 'official_answer' | 'business_rule' | 'tutorial';

interface KItem {
  id: string;
  kind: Kind;
  subject: string;
  problem: string | null;
  solution: string | null;
  steps: string[];
  category: string;
  devices: string[];
  apps: string[];
  keywords: string[];
  usage_count: number;
  resolved_count: number;
  success_rate: number;
  confidence: number;
  operators: { name: string; count: number }[];
  source_conversation_ids: string[];
  status: string;
  last_used_at: string | null;
}

interface Job { id: string; kind: string; status: string; total: number; processed: number; message: string | null; created_at: string; }

// ================= META =================
const KIND_META: Record<Kind, { label: string; icon: any; color: string; border: string; badge: string }> = {
  procedure: { label: 'Procedimento', icon: Workflow, color: 'text-violet-500', border: 'border-l-violet-500', badge: 'bg-violet-500/15 text-violet-500 border-violet-500/30' },
  flow: { label: 'Fluxo', icon: GitMerge, color: 'text-blue-500', border: 'border-l-blue-500', badge: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
  intent: { label: 'Intenção', icon: Target, color: 'text-emerald-500', border: 'border-l-emerald-500', badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  official_answer: { label: 'Resposta Oficial', icon: ShieldCheck, color: 'text-amber-500', border: 'border-l-amber-500', badge: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  business_rule: { label: 'Regra de Negócio', icon: Lightbulb, color: 'text-rose-500', border: 'border-l-rose-500', badge: 'bg-rose-500/15 text-rose-500 border-rose-500/30' },
  tutorial: { label: 'Tutorial', icon: FileText, color: 'text-cyan-500', border: 'border-l-cyan-500', badge: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30' },
};

// ================= STAT CARD =================
function StatCard({ label, value, icon: Icon, tone = 'violet', hint }: { label: string; value: string | number; icon: any; tone?: 'violet'|'emerald'|'amber'|'rose'|'blue'|'cyan'; hint?: string }) {
  const tones: Record<string, { border: string; bg: string; text: string; glow: string }> = {
    violet: { border: 'border-l-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-500', glow: 'hover:shadow-[0_0_24px_-12px_rgba(139,92,246,0.5)]' },
    emerald: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500', glow: 'hover:shadow-[0_0_24px_-12px_rgba(16,185,129,0.5)]' },
    amber: { border: 'border-l-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-500', glow: 'hover:shadow-[0_0_24px_-12px_rgba(245,158,11,0.5)]' },
    rose: { border: 'border-l-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-500', glow: 'hover:shadow-[0_0_24px_-12px_rgba(244,63,94,0.5)]' },
    blue: { border: 'border-l-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-500', glow: 'hover:shadow-[0_0_24px_-12px_rgba(59,130,246,0.5)]' },
    cyan: { border: 'border-l-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-500', glow: 'hover:shadow-[0_0_24px_-12px_rgba(6,182,212,0.5)]' },
  };
  const t = tones[tone];
  return (
    <Card className={`p-4 border-l-4 ${t.border} ${t.glow} transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className={`p-2 rounded-lg ${t.bg} ${t.text}`}><Icon className="h-5 w-5" /></div>
      </div>
    </Card>
  );
}

// ================= PAGE =================
export default function AiTraining() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('dashboard');
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [items, setItems] = useState<KItem[]>([]);
  const [stats, setStats] = useState({
    conversations: 0, analyzed: 0, withSignal: 0,
    pending: 0, approved: 0,
    byKind: {} as Record<string, number>,
    topDevices: [] as { name: string; count: number }[],
    topApps: [] as { name: string; count: number }[],
    topOperators: [] as { name: string; count: number; rate: number }[],
  });
  const [filterKind, setFilterKind] = useState<Kind | 'all'>('all');
  const [editItem, setEditItem] = useState<KItem | null>(null);
  const [showSourceOf, setShowSourceOf] = useState<KItem | null>(null);
  const [sourceMessages, setSourceMessages] = useState<any[]>([]);
  const pollRef = useRef<number | null>(null);
  const analysisLoopRef = useRef(false);

  const reload = async () => {
    if (!user) return;
    const [
      { data: jobsData },
      { data: itemsData },
      { count: cConv },
      { count: cAnalyzed },
      { count: cSignal },
      { count: cPending },
      { count: cApproved },
      { data: convsForStats },
    ] = await Promise.all([
      supabase.from('ai_training_jobs' as any).select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('ai_knowledge_items' as any).select('*').eq('user_id', user.id).in('status', ['pending','approved']).order('usage_count', { ascending: false }).limit(200),
      supabase.from('ai_training_conversations' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('ai_training_conversations' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id).not('analyzed_at', 'is', null),
      supabase.from('ai_training_conversations' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id).in('signal_quality', ['high','medium']),
      supabase.from('ai_knowledge_items' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status','pending'),
      supabase.from('ai_knowledge_items' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status','approved'),
      supabase.from('ai_training_conversations' as any).select('device,app,operator_name,resolved').eq('user_id', user.id).not('analyzed_at','is',null).limit(2000),
    ]);

    setJobs((jobsData ?? []) as unknown as Job[]);
    const list = (itemsData ?? []) as unknown as KItem[];
    setItems(list);

    const byKind: Record<string, number> = {};
    list.forEach((i) => { byKind[i.kind] = (byKind[i.kind] || 0) + 1; });

    const devCount: Record<string, number> = {};
    const appCount: Record<string, number> = {};
    const opCount: Record<string, { total: number; resolved: number }> = {};
    (convsForStats ?? []).forEach((c: any) => {
      if (c.device) devCount[c.device] = (devCount[c.device] || 0) + 1;
      if (c.app) appCount[c.app] = (appCount[c.app] || 0) + 1;
      if (c.operator_name && c.operator_name !== 'desconhecido') {
        const o = opCount[c.operator_name] || { total: 0, resolved: 0 };
        o.total++; if (c.resolved) o.resolved++;
        opCount[c.operator_name] = o;
      }
    });
    const rank = (obj: Record<string, number>) => Object.entries(obj).map(([name, count]) => ({ name, count })).sort((a,b)=>b.count-a.count).slice(0,5);

    setStats({
      conversations: cConv ?? 0,
      analyzed: cAnalyzed ?? 0,
      withSignal: cSignal ?? 0,
      pending: cPending ?? 0,
      approved: cApproved ?? 0,
      byKind,
      topDevices: rank(devCount),
      topApps: rank(appCount),
      topOperators: Object.entries(opCount)
        .map(([name, o]) => ({ name, count: o.total, rate: o.total > 0 ? o.resolved/o.total : 0 }))
        .sort((a,b)=>b.rate-a.rate || b.count-a.count).slice(0,5),
    });
  };

  useEffect(() => { reload(); }, [user]);

  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'running');
    if (hasRunning && !pollRef.current) {
      pollRef.current = window.setInterval(reload, 1500);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current); pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [jobs]);

  const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const waitForJob = async (jobId: string, label: string) => {
    for (let i = 0; i < 900; i++) {
      const { data } = await supabase.from('ai_training_jobs' as any)
        .select('status,message')
        .eq('id', jobId)
        .maybeSingle();
      const jobState = data as { status?: string; message?: string } | null;
      await reload();
      if (!jobState || jobState.status === 'done') return true;
      if (jobState.status === 'failed' || jobState.status === 'cancelled') throw new Error(jobState.message || `${label} interrompido`);
      await delay(1500);
    }
    throw new Error(`${label} demorou demais. O progresso ficou salvo; tente continuar em instantes.`);
  };

  const analyzeUntilDone = async (startedJobId?: string) => {
    if (analysisLoopRef.current) return;
    analysisLoopRef.current = true;
    setAnalyzing(true);
    let jobId = startedJobId;
    try {
      for (let i = 0; i < 2000; i++) {
        const { data, error } = await supabase.functions.invoke('ai-training-analyze', {
          body: { jobId, batch: 3 },
        });
        if (error) throw error;
        jobId = data?.jobId ?? jobId;
        await reload();

        if (data?.cancelled) {
          toast({ title: 'Análise parada', description: 'O processamento foi interrompido com segurança.' });
          return;
        }
        if (data?.done || Number(data?.remaining ?? 0) === 0) {
          toast({ title: 'Análise concluída', description: '100% das conversas pendentes foram processadas.' });
          return;
        }
        await delay(700);
      }
      throw new Error('A análise ainda está em andamento. Clique em Analisar novamente para continuar de onde parou.');
    } finally {
      analysisLoopRef.current = false;
      setAnalyzing(false);
      await reload();
    }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const { error } = await supabase.functions.invoke('ai-training-import', { body: { source: 'evolution' } });
      if (error) throw error;
      toast({ title: 'Importação iniciada', description: 'Rodando em segundo plano...' });
      setTimeout(reload, 800);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setImporting(false); }
  };

  const runAnalyze = async () => {
    try {
      toast({ title: 'Análise iniciada', description: 'Processando em lotes seguros, com progresso atualizado na tela.' });
      await analyzeUntilDone();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };


  const resetCentral = async () => {
    if (!user) return;
    if (!confirm('Isto vai APAGAR todos os conhecimentos e conversas importadas e reimportar do zero. Continuar?')) return;
    try {
      setImporting(true);
      // limpa jobs travados
      await supabase.from('ai_training_jobs' as any).update({ status: 'failed', finished_at: new Date().toISOString(), message: 'Reset' }).eq('user_id', user.id).eq('status','running');
      // apaga tudo
      await supabase.from('ai_knowledge_items' as any).delete().eq('user_id', user.id);
      await supabase.from('ai_training_conversations' as any).delete().eq('user_id', user.id);
      toast({ title: 'Central limpa', description: 'Reimportando e analisando tudo...' });
      // reimporta
      const { data: importData, error: importError } = await supabase.functions.invoke('ai-training-import', { body: { source: 'evolution' } });
      if (importError) throw importError;
      if (importData?.job_id) await waitForJob(importData.job_id, 'Importação');
      setImporting(false);
      toast({ title: 'Importação concluída', description: 'Agora analisando 100% das conversas importadas.' });
      await analyzeUntilDone();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setImporting(false); }
  };

  const cancelJob = async (jobId: string) => {
    await supabase.from('ai_training_jobs' as any).update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', jobId);
    setTimeout(reload, 500);
  };
  const forceKillStuck = async () => {
    if (!user) return;
    await supabase.from('ai_training_jobs' as any)
      .update({ status: 'failed', finished_at: new Date().toISOString(), message: 'Liberado manualmente' })
      .eq('user_id', user.id).eq('status', 'running');
    reload();
  };


  const act = async (item_id: string, action: string, extra: any = {}) => {
    const { error } = await supabase.functions.invoke('ai-training-approve', { body: { item_id, action, ...extra } });
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    toast({ title: 'OK', description: `Ação: ${action}` });
    reload();
    setEditItem(null);
  };

  const openSource = async (item: KItem) => {
    setShowSourceOf(item);
    const { data } = await supabase.from('ai_training_conversations' as any)
      .select('id,contact_phone,contact_name,started_at,problem_summary,solution_summary,resolved')
      .in('id', item.source_conversation_ids.slice(0, 20));
    setSourceMessages(data || []);
  };

  const runningJob = jobs.find(j => j.status === 'running');
  const filtered = useMemo(() => filterKind === 'all' ? items : items.filter(i => i.kind === filterKind), [items, filterKind]);
  const pendingList = filtered.filter(i => i.status === 'pending');

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Brain className="h-7 w-7 text-violet-500" />
              Central de Conhecimento IA
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Aprende com seus atendimentos reais — nada é publicado sem sua aprovação.</p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Aprendizado contínuo ativo — analisa novas conversas a cada 15 min automaticamente
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="h-4 w-4 mr-1" />Atualizar</Button>
            <Button variant="outline" size="sm" onClick={forceKillStuck} className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10">
              <StopCircle className="h-4 w-4 mr-1" />Liberar jobs presos
            </Button>
          </div>
        </div>

        {/* RUNNING JOB PROGRESS */}
        {runningJob && (
          <Card className="p-4 border-l-4 border-l-violet-500 bg-violet-500/5 shadow-[0_0_30px_-12px_rgba(139,92,246,0.4)]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                <div>
                  <p className="font-semibold">{runningJob.kind === 'import' ? 'Importando histórico' : 'Analisando conversas'}</p>
                  <p className="text-xs text-muted-foreground">{runningJob.message ?? '...'}</p>
                </div>
              </div>
              <Button size="sm" variant="destructive" onClick={() => cancelJob(runningJob.id)}>
                <StopCircle className="h-4 w-4 mr-1" />Parar
              </Button>
            </div>
            <Progress value={runningJob.total > 0 ? (runningJob.processed / runningJob.total) * 100 : 0} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {runningJob.processed.toLocaleString()} / {runningJob.total.toLocaleString()}
            </p>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="import"><Database className="h-4 w-4 mr-1" />Importar</TabsTrigger>
            <TabsTrigger value="approve">
              <CheckCircle2 className="h-4 w-4 mr-1" />Aprovação
              {stats.pending > 0 && <Badge className="ml-2 bg-violet-500 text-white">{stats.pending}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="approved"><BookOpen className="h-4 w-4 mr-1" />Base ({stats.approved})</TabsTrigger>
          </TabsList>

          {/* ============ DASHBOARD ============ */}
          <TabsContent value="dashboard" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Conversas" value={stats.conversations.toLocaleString()} icon={MessageSquare} tone="blue" />
              <StatCard label="Analisadas" value={stats.analyzed.toLocaleString()} icon={Brain} tone="violet" />
              <StatCard label="Com sinal útil" value={stats.withSignal.toLocaleString()} icon={Zap} tone="emerald" hint={`${stats.analyzed>0 ? Math.round(stats.withSignal/stats.analyzed*100) : 0}% de aproveitamento`} />
              <StatCard label="Aguardando" value={stats.pending} icon={Clock} tone="amber" />
              <StatCard label="Aprovados" value={stats.approved} icon={CheckCircle2} tone="emerald" />
              <StatCard label="Total conhecimento" value={items.length} icon={BookOpen} tone="cyan" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-violet-500" />Por tipo</h3>
                <div className="space-y-2">
                  {(Object.keys(KIND_META) as Kind[]).map((k) => {
                    const meta = KIND_META[k];
                    const Icon = meta.icon;
                    const n = stats.byKind[k] || 0;
                    return (
                      <div key={k} className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${meta.badge} border`}><Icon className="h-3.5 w-3.5" /></div>
                        <span className="text-sm flex-1">{meta.label}</span>
                        <span className="font-semibold">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-emerald-500" />Top aplicativos</h3>
                {stats.topApps.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados</p> :
                  <div className="space-y-2">
                    {stats.topApps.map((a) => (
                      <div key={a.name} className="flex items-center justify-between text-sm">
                        <span>{a.name}</span><Badge variant="secondary">{a.count}</Badge>
                      </div>
                    ))}
                  </div>}
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-3"><Users className="h-4 w-4 text-amber-500" />Top operadores</h3>
                {stats.topOperators.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados</p> :
                  <div className="space-y-2">
                    {stats.topOperators.map((o) => (
                      <div key={o.name} className="flex items-center justify-between text-sm">
                        <span className="truncate">{o.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">{Math.round(o.rate * 100)}%</Badge>
                          <span className="text-xs text-muted-foreground">{o.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>}
              </Card>
            </div>
          </TabsContent>

          {/* ============ IMPORT ============ */}
          <TabsContent value="import" className="space-y-4 mt-4">
            <Card className="p-6">
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Database className="h-5 w-5 text-blue-500" />Importar histórico de atendimentos</h3>
              <p className="text-sm text-muted-foreground mb-4">Puxa todas as conversas da Evolution API e agrupa em atendimentos (janela de 6h).</p>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={runImport} disabled={importing || !!runningJob}>
                  {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                  Importar histórico (Evolution)
                </Button>
                <Button variant="outline" onClick={runAnalyze} disabled={analyzing || !!runningJob}>
                  {analyzing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Brain className="h-4 w-4 mr-1" />}
                  Analisar (extrair conhecimento)
                </Button>
                <Button variant="destructive" onClick={resetCentral} disabled={importing || analyzing || !!runningJob}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Limpar tudo e reimportar
                </Button>
                {!!runningJob && (
                  <Button variant="outline" onClick={forceKillStuck}>
                    <StopCircle className="h-4 w-4 mr-1" />
                    Liberar jobs presos
                  </Button>
                )}
              </div>
            </Card>


            <Card className="p-4">
              <h3 className="font-semibold mb-3">Últimos jobs</h3>
              {jobs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum job ainda.</p> :
                <div className="space-y-2">
                  {jobs.map((j) => (
                    <div key={j.id} className="flex items-center justify-between p-2 rounded border text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={j.status==='done'?'default':j.status==='running'?'secondary':'destructive'}>{j.status}</Badge>
                        <span className="font-medium">{j.kind}</span>
                        <span className="text-muted-foreground">{j.message ?? ''}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{j.processed}/{j.total}</span>
                    </div>
                  ))}
                </div>}
            </Card>
          </TabsContent>

          {/* ============ APPROVE ============ */}
          <TabsContent value="approve" className="space-y-4 mt-4">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={filterKind==='all'?'default':'outline'} onClick={()=>setFilterKind('all')}>Todos ({items.filter(i=>i.status==='pending').length})</Button>
              {(Object.keys(KIND_META) as Kind[]).map((k) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                const n = items.filter(i=>i.kind===k && i.status==='pending').length;
                return (
                  <Button key={k} size="sm" variant={filterKind===k?'default':'outline'} onClick={()=>setFilterKind(k)} className="gap-1">
                    <Icon className="h-3.5 w-3.5" />{meta.label} ({n})
                  </Button>
                );
              })}
            </div>

            {pendingList.length === 0 ? (
              <Card className="p-12 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum conhecimento pendente. Rode uma análise para gerar novos itens.
              </Card>
            ) : (
              <div className="grid gap-3">
                {pendingList.map((it) => <ItemCard key={it.id} item={it} onAct={act} onEdit={setEditItem} onSource={openSource} />)}
              </div>
            )}
          </TabsContent>

          {/* ============ APPROVED ============ */}
          <TabsContent value="approved" className="space-y-3 mt-4">
            {items.filter(i=>i.status==='approved').length === 0 ? (
              <Card className="p-12 text-center text-muted-foreground">Ainda nenhum conhecimento aprovado.</Card>
            ) : (
              <div className="grid gap-3">
                {items.filter(i=>i.status==='approved').map((it) => <ItemCard key={it.id} item={it} approved onAct={act} onEdit={setEditItem} onSource={openSource} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* EDIT DIALOG */}
      <Dialog open={!!editItem} onOpenChange={(o)=>!o && setEditItem(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar conhecimento</DialogTitle></DialogHeader>
          {editItem && <EditForm item={editItem} onChange={setEditItem} />}
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditItem(null)}>Cancelar</Button>
            <Button onClick={()=>editItem && act(editItem.id,'update',{ patch: {
              subject: editItem.subject, problem: editItem.problem, solution: editItem.solution,
              steps: editItem.steps, category: editItem.category,
            }})}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SOURCE DIALOG */}
      <Dialog open={!!showSourceOf} onOpenChange={(o)=>!o && setShowSourceOf(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Conversas de origem</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {sourceMessages.map((c) => (
              <Card key={c.id} className="p-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{c.contact_name || c.contact_phone}</span>
                  <span className="text-muted-foreground">{new Date(c.started_at).toLocaleString()}</span>
                </div>
                <p className="text-sm"><b>Problema:</b> {c.problem_summary || '—'}</p>
                <p className="text-sm"><b>Solução:</b> {c.solution_summary || '—'}</p>
                {c.resolved && <Badge className="mt-1 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Resolvido</Badge>}
              </Card>
            ))}
            {sourceMessages.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem conversas de origem disponíveis.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ================= ITEM CARD =================
function ItemCard({ item, approved, onAct, onEdit, onSource }: {
  item: KItem; approved?: boolean;
  onAct: (id: string, action: string, extra?: any) => void;
  onEdit: (i: KItem) => void;
  onSource: (i: KItem) => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  return (
    <Card className={`p-4 border-l-4 ${meta.border} hover:shadow-lg transition-shadow`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className={`${meta.badge} gap-1`}><Icon className="h-3 w-3" />{meta.label}</Badge>
            <Badge variant="secondary" className="text-xs">{item.category}</Badge>
            {approved && <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Aprovado</Badge>}
          </div>
          <h4 className="font-semibold text-base">{item.subject}</h4>
          {item.problem && <p className="text-sm text-muted-foreground mt-1"><b>Problema:</b> {item.problem}</p>}
        </div>
        <div className="text-right text-xs shrink-0">
          <div className="flex items-center gap-1 justify-end"><Zap className="h-3 w-3 text-violet-500" /><span className="font-semibold">{Math.round(item.confidence * 100)}%</span></div>
          <p className="text-muted-foreground">confiança</p>
        </div>
      </div>

      {item.solution && <p className="text-sm mb-2"><b>Solução:</b> {item.solution}</p>}

      {item.steps.length > 0 && (
        <div className="bg-muted/40 rounded p-3 mb-3">
          <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Passo a passo</p>
          <ol className="space-y-1 list-decimal list-inside text-sm">
            {item.steps.slice(0, 8).map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {item.devices.map((d) => <Badge key={d} variant="outline" className="text-xs">📱 {d}</Badge>)}
        {item.apps.map((a) => <Badge key={a} variant="outline" className="text-xs">🎬 {a}</Badge>)}
        {item.keywords.slice(0, 6).map((k) => <Badge key={k} variant="secondary" className="text-xs">#{k}</Badge>)}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
        <div className="p-2 rounded bg-muted/30"><p className="text-muted-foreground">Usos</p><p className="font-bold text-base">{item.usage_count}</p></div>
        <div className="p-2 rounded bg-muted/30"><p className="text-muted-foreground">Resolvidos</p><p className="font-bold text-base">{item.resolved_count}</p></div>
        <div className="p-2 rounded bg-muted/30"><p className="text-muted-foreground">Taxa sucesso</p><p className="font-bold text-base text-emerald-500">{Math.round(item.success_rate * 100)}%</p></div>
        <div className="p-2 rounded bg-muted/30"><p className="text-muted-foreground">Conversas</p><p className="font-bold text-base">{item.source_conversation_ids.length}</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!approved && <Button size="sm" onClick={() => onAct(item.id, 'approve')} className="bg-emerald-600 hover:bg-emerald-700"><Check className="h-4 w-4 mr-1" />Aprovar</Button>}
        <Button size="sm" variant="outline" onClick={() => onEdit(item)}><Edit3 className="h-4 w-4 mr-1" />Editar</Button>
        <Button size="sm" variant="outline" onClick={() => onSource(item)}><MessageSquare className="h-4 w-4 mr-1" />{item.source_conversation_ids.length} conversas</Button>
        {!approved && <Button size="sm" variant="outline" className="text-rose-500" onClick={() => onAct(item.id, 'reject')}><Trash2 className="h-4 w-4 mr-1" />Rejeitar</Button>}
      </div>
    </Card>
  );
}

// ================= EDIT FORM =================
function EditForm({ item, onChange }: { item: KItem; onChange: (i: KItem) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold">Assunto</label>
        <Input value={item.subject} onChange={(e) => onChange({ ...item, subject: e.target.value })} />
      </div>
      <div>
        <label className="text-xs font-semibold">Problema</label>
        <Textarea value={item.problem || ''} onChange={(e) => onChange({ ...item, problem: e.target.value })} rows={2} />
      </div>
      <div>
        <label className="text-xs font-semibold">Solução</label>
        <Textarea value={item.solution || ''} onChange={(e) => onChange({ ...item, solution: e.target.value })} rows={4} />
      </div>
      <div>
        <label className="text-xs font-semibold">Passos (um por linha)</label>
        <Textarea
          value={item.steps.join('\n')}
          onChange={(e) => onChange({ ...item, steps: e.target.value.split('\n').map(s=>s.trim()).filter(Boolean) })}
          rows={6}
        />
      </div>
    </div>
  );
}
