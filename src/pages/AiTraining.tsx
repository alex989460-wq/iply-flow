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

  const runImport = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-training-import', { body: { source: 'evolution' } });
      if (error) throw error;
      toast({
        title: 'Importação concluída',
        description: `${data?.conversations_created ?? 0} novas conversas de ${data?.messages_read ?? 0} mensagens. Puladas: ${data?.skippedOneSided ?? 0} sem ida+volta, ${data?.skippedDuplicate ?? 0} duplicadas.`,
      });
      await reload();
    } catch (e) {
      toast({ title: 'Erro na importação', description: String((e as Error).message), variant: 'destructive' });
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

  return (
    <DashboardLayout>
      <div className="container max-w-6xl py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-primary" /> Treinamento da IA</h1>
          <p className="text-sm text-muted-foreground">Transforma o histórico dos seus atendimentos em respostas prontas para o robô — nada é publicado sem sua aprovação.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Conversas importadas" value={stats.conversations} />
          <StatCard label="Já analisadas" value={stats.analyzed} />
          <StatCard label="Aguardando aprovação" value={stats.candidates} />
          <StatCard label="Aprovadas" value={stats.approved} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="import"><RefreshCw className="w-4 h-4 mr-1" /> Importar / Analisar</TabsTrigger>
            <TabsTrigger value="approve"><BookOpen className="w-4 h-4 mr-1" /> Aprovação ({candidates.length})</TabsTrigger>
            <TabsTrigger value="stats"><BarChart3 className="w-4 h-4 mr-1" /> Estatísticas</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4 mt-4">
            <Card className="p-4 space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button onClick={runImport} disabled={importing}>
                  {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                  Importar histórico do WhatsApp (Evolution)
                </Button>
                <Button variant="secondary" onClick={runAnalyze} disabled={analyzing}>
                  {analyzing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Analisar próximas 10 conversas
                </Button>
                <Button variant="outline" onClick={reload} disabled={loading}>Atualizar</Button>
              </div>
              <p className="text-xs text-muted-foreground">A importação é incremental: só cria conversas novas, reconhece direções in/out e ignora mensagens sem ida+volta para não treinar a IA com monólogos ou duplicidades.</p>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-2">Últimos jobs</h3>
              <div className="space-y-2">
                {jobs.length === 0 && <p className="text-xs text-muted-foreground">Nenhum job ainda.</p>}
                {jobs.map(j => (
                  <div key={j.id} className="flex items-center justify-between text-xs border border-border rounded p-2">
                    <div>
                      <b>{j.kind}</b> • {j.status} • {j.message ?? '-'}
                    </div>
                    <div className="text-muted-foreground">{new Date(j.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                ))}
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value.toLocaleString('pt-BR')}</div>
    </Card>
  );
}
