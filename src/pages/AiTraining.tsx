import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Play, RefreshCw, Check, X, Sparkles, BookOpen, BarChart3, MessageSquare, Database, CheckCircle2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Candidate {
  id: string;
  canonical_question: string;
  similar_questions: string[];
  best_answer: string;
  category: string;
  keywords: string[];
  usage_count: number;
  success_rate: number;
  status: string;
  source_conversation_ids: string[];
}

interface Job { id: string; kind: string; status: string; total: number; processed: number; message: string | null; created_at: string; }

const CATEGORIES = ['instalacao','configuracao','login','ativacao','renovacao','pagamento','pix','teste','suporte','compatibilidade','atualizacao','financeiro','revendedor','outros'];

export default function AiTraining() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('import');
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stats, setStats] = useState({ conversations: 0, analyzed: 0, candidates: 0, approved: 0 });
  const [loading, setLoading] = useState(false);

  const pollRef = useRef<number | null>(null);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: jobsData }, { data: candsData }, { count: cConv }, { count: cAnalyzed }, { count: cCands }, { count: cApproved }] = await Promise.all([
      supabase.from('ai_training_jobs' as any).select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('ai_knowledge_candidates' as any).select('*').eq('user_id', user.id).eq('status', 'pending').order('usage_count', { ascending: false }).limit(100),
      supabase.from('ai_training_conversations' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('ai_training_conversations' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id).not('analyzed_at', 'is', null),
      supabase.from('ai_knowledge_candidates' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending'),
      supabase.from('ai_knowledge_candidates' as any).select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'approved'),
    ]);
    setJobs((jobsData ?? []) as unknown as Job[]);
    setCandidates((candsData ?? []) as unknown as Candidate[]);
    setStats({ conversations: cConv ?? 0, analyzed: cAnalyzed ?? 0, candidates: cCands ?? 0, approved: cApproved ?? 0 });
    setLoading(false);
  };

  useEffect(() => { reload(); }, [user]);

  // Poll enquanto houver job em execução para atualizar a barra em tempo real
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'running');
    if (hasRunning && !pollRef.current) {
      pollRef.current = window.setInterval(reload, 1500);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current); pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [jobs]);

  const runImport = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-training-import', { body: { source: 'evolution' } });
      if (error) throw error;
      toast({
        title: 'Importação iniciada',
        description: `Processando ${data?.total ?? 0} mensagens em segundo plano. Acompanhe o progresso na barra abaixo.`,
      });
      // Não espera terminar: polling assume daqui em diante
      setTimeout(() => reload(), 800);
    } catch (e) {
      toast({ title: 'Erro ao iniciar', description: String((e as Error).message), variant: 'destructive' });
    } finally { setImporting(false); }
  };


  const runAnalyze = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-training-analyze', { body: { batch: 10 } });
      if (error) throw error;
      toast({ title: 'Análise concluída', description: `Processadas: ${data?.processed ?? 0} • Novos: ${data?.intentsCreated ?? 0} • Agrupados: ${data?.intentsMerged ?? 0}` });
      await reload();
    } catch (e) {
      toast({ title: 'Erro na análise', description: String((e as Error).message), variant: 'destructive' });
    } finally { setAnalyzing(false); }
  };

  const runningJob = jobs.find(j => j.status === 'running');
  const runningPct = runningJob && runningJob.total > 0 ? Math.min(100, Math.round((runningJob.processed / runningJob.total) * 100)) : 0;

  const updateCandidate = (id: string, patch: Partial<Candidate>) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const approve = async (c: Candidate) => {
    const { error } = await supabase.functions.invoke('ai-training-approve', {
      body: {
        candidate_id: c.id,
        action: 'approve',
        patch: {
          canonical_question: c.canonical_question,
          best_answer: c.best_answer,
          category: c.category,
          keywords: c.keywords,
        },
      },
    });
    if (error) { toast({ title: 'Erro ao aprovar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: '✅ Conhecimento aprovado', description: 'O robô já pode usar esta resposta.' });
    setCandidates(prev => prev.filter(x => x.id !== c.id));
    reload();
  };

  const reject = async (c: Candidate) => {
    const { error } = await supabase.functions.invoke('ai-training-approve', { body: { candidate_id: c.id, action: 'reject' } });
    if (error) { toast({ title: 'Erro ao rejeitar', description: error.message, variant: 'destructive' }); return; }
    setCandidates(prev => prev.filter(x => x.id !== c.id));
  };

  const cancelJob = async (jobId: string) => {
    await supabase.from('ai_training_jobs' as any).update({ status: 'cancelled' }).eq('id', jobId);
    toast({ title: 'Cancelando...', description: 'O processo será interrompido no próximo lote.' });
    reload();
  };

  const forceKillStuck = async () => {
    if (!user) return;
    await supabase.from('ai_training_jobs' as any)
      .update({ status: 'failed', message: 'Marcado como falho manualmente' })
      .eq('user_id', user.id).eq('status', 'running');
    toast({ title: 'Jobs presos liberados' });
    reload();
  };

  return (
    <DashboardLayout>
      <div className="container max-w-6xl py-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </span>
              Treinamento da IA
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Transforma o histórico dos seus atendimentos em respostas prontas para o robô — nada é publicado sem sua aprovação.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={forceKillStuck}>
              <X className="w-3.5 h-3.5 mr-1" /> Liberar jobs presos
            </Button>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Conversas importadas" value={stats.conversations} icon={<MessageSquare className="w-4 h-4" />} tone="primary" />
          <StatCard label="Já analisadas" value={stats.analyzed} icon={<Database className="w-4 h-4" />} tone="info" />
          <StatCard label="Aguardando aprovação" value={stats.candidates} icon={<Clock className="w-4 h-4" />} tone="warn" />
          <StatCard label="Aprovadas" value={stats.approved} icon={<CheckCircle2 className="w-4 h-4" />} tone="success" />
        </div>

        {runningJob && (
          <Card className="p-4 border-l-4 border-l-primary bg-primary/5 shadow-lg">
            <div className="flex items-center justify-between text-sm mb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                {runningJob.kind === 'import' ? 'Importando histórico' : 'Analisando conversas'}...
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-muted-foreground tabular-nums">
                  {runningJob.processed.toLocaleString('pt-BR')} / {runningJob.total.toLocaleString('pt-BR')} ({runningPct}%)
                </div>
                <Button size="sm" variant="destructive" onClick={() => cancelJob(runningJob.id)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Parar
                </Button>
              </div>
            </div>
            <Progress value={runningPct} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">{runningJob.message ?? 'Processando...'}</p>
          </Card>
        )}


        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="import"><RefreshCw className="w-4 h-4 mr-1" /> Importar / Analisar</TabsTrigger>
            <TabsTrigger value="approve"><BookOpen className="w-4 h-4 mr-1" /> Aprovação ({candidates.length})</TabsTrigger>
            <TabsTrigger value="stats"><BarChart3 className="w-4 h-4 mr-1" /> Estatísticas</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4 mt-4">
            <Card className="p-5 space-y-4 bg-gradient-to-br from-card to-muted/20">
              <div className="grid md:grid-cols-2 gap-3">
                <button
                  onClick={runImport}
                  disabled={importing || !!runningJob}
                  className="group text-left p-4 rounded-xl border border-border hover:border-primary/60 bg-background transition disabled:opacity-60"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20">
                      {importing ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Play className="w-4 h-4 text-primary" />}
                    </div>
                    <span className="font-semibold text-sm">Importar histórico (Evolution)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Lê todas as mensagens do WhatsApp e agrupa em conversas. Processamento em lotes com barra de progresso ao vivo.</p>
                </button>

                <button
                  onClick={runAnalyze}
                  disabled={analyzing || !!runningJob}
                  className="group text-left p-4 rounded-xl border border-border hover:border-primary/60 bg-background transition disabled:opacity-60"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20">
                      {analyzing ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Sparkles className="w-4 h-4 text-primary" />}
                    </div>
                    <span className="font-semibold text-sm">Analisar próximas 10 conversas</span>
                  </div>
                  <p className="text-xs text-muted-foreground">A IA extrai perguntas e respostas, deduplica por similaridade e gera candidatos para você aprovar.</p>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">100% seguro: apenas leitura no seu banco. Nada é enviado ao WhatsApp — sem risco de bloqueio.</p>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> Últimos jobs</h3>
              <div className="space-y-2">
                {jobs.length === 0 && <p className="text-xs text-muted-foreground">Nenhum job ainda.</p>}
                {jobs.map(j => {
                  const pct = j.total > 0 ? Math.min(100, Math.round((j.processed / j.total) * 100)) : (j.status === 'done' ? 100 : 0);
                  const statusColor = j.status === 'done' ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : j.status === 'running' ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-destructive/15 text-destructive border-destructive/30';
                  return (
                    <div key={j.id} className="border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={statusColor}>{j.status}</Badge>
                          <span className="font-medium capitalize">{j.kind}</span>
                          <span className="text-muted-foreground">{j.message ?? '-'}</span>
                        </div>
                        <span className="text-muted-foreground tabular-nums">{new Date(j.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                      {j.total > 0 && (
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-[10px] text-muted-foreground tabular-nums w-24 text-right">
                            {j.processed.toLocaleString('pt-BR')}/{j.total.toLocaleString('pt-BR')} ({pct}%)
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>


          <TabsContent value="approve" className="space-y-3 mt-4">
            {candidates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum candidato pendente. Rode "Analisar" para gerar novos.</p>}
            {candidates.map(c => (
              <Card key={c.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge>{c.category}</Badge>
                    <Badge variant="secondary">{c.usage_count}× visto</Badge>
                    <Badge variant="outline">{Math.round((c.success_rate ?? 0) * 100)}% sucesso</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => reject(c)}><X className="w-3.5 h-3.5 mr-1" /> Rejeitar</Button>
                    <Button size="sm" onClick={() => approve(c)}><Check className="w-3.5 h-3.5 mr-1" /> Aprovar</Button>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Pergunta canônica</label>
                  <Input value={c.canonical_question} onChange={e => updateCandidate(c.id, { canonical_question: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Melhor resposta</label>
                  <textarea
                    value={c.best_answer}
                    onChange={e => updateCandidate(c.id, { best_answer: e.target.value })}
                    rows={4}
                    className="w-full rounded-md border border-border bg-background p-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground">Categoria</label>
                    <select value={c.category} onChange={e => updateCandidate(c.id, { category: e.target.value })} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
                      {CATEGORIES.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Palavras-chave</label>
                    <Input value={c.keywords.join(', ')} onChange={e => updateCandidate(c.id, { keywords: e.target.value.split(',').map(s => s.trim()) })} />
                  </div>
                </div>
                {c.similar_questions.length > 1 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{c.similar_questions.length} perguntas semelhantes agrupadas</summary>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      {c.similar_questions.slice(0, 20).map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </details>
                )}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Conversas totais" value={stats.conversations} />
                <StatCard label="Analisadas" value={stats.analyzed} />
                <StatCard label="Não classificadas" value={Math.max(0, stats.conversations - stats.analyzed)} />
                <StatCard label="Conhecimentos aprovados" value={stats.approved} />
              </div>
              <p className="text-xs text-muted-foreground mt-4">Rode a análise em lotes até processar todo o histórico. Quanto mais conversas analisadas, mais completa a base fica.</p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ label, value, icon, tone = 'primary' }: { label: string; value: number; icon?: React.ReactNode; tone?: 'primary' | 'info' | 'warn' | 'success' }) {
  const tones: Record<string, { bar: string; iconBg: string; iconColor: string; label: string; glow: string }> = {
    primary: { bar: 'bg-violet-500', iconBg: 'bg-violet-500/15', iconColor: 'text-violet-400', label: 'text-violet-300/80', glow: 'shadow-[0_0_24px_-8px_rgba(139,92,246,0.5)]' },
    info: { bar: 'bg-emerald-500', iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', label: 'text-emerald-300/80', glow: 'shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)]' },
    warn: { bar: 'bg-amber-500', iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400', label: 'text-amber-300/80', glow: 'shadow-[0_0_24px_-8px_rgba(245,158,11,0.5)]' },
    success: { bar: 'bg-rose-500', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', label: 'text-rose-300/80', glow: 'shadow-[0_0_24px_-8px_rgba(244,63,94,0.5)]' },
  };
  const t = tones[tone];
  return (
    <Card className={`relative overflow-hidden p-4 flex items-center gap-3 border-border/50 hover:border-border transition ${t.glow}`}>
      <span className={`absolute left-0 top-0 h-full w-1 ${t.bar}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-[10px] uppercase tracking-wider font-semibold ${t.label} truncate`}>{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value.toLocaleString('pt-BR')}</div>
      </div>
      {icon && <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.iconBg} ${t.iconColor}`}>{icon}</div>}
    </Card>
  );
}
