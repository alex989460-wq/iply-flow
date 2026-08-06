
import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, ShieldCheck, Zap, Bot, MessageSquare, Search, RefreshCw, 
  Save, AlertTriangle, CheckCircle2, History, Wand2, Filter, 
  ArrowRight, Check, X, Trash2, Brain
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Session {
  id: string;
  base_name: string;
  business_purpose: string;
  trigger_event: string;
  utility_risk: string;
  final_outcome: string | null;
  started_at: string;
  context: any;
}

interface Attempt {
  id: string;
  session_id: string;
  attempt_no: number;
  template_name: string;
  body: string;
  status: string | null;
  category: string | null;
  outcome: string | null;
  rejection_reason: string | null;
}

export default function WhatsappUtility() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [summary, setSummary] = useState<any>(null);
  
  // Intake State
  const [step, setStep] = useState(1);
  const [intakeInput, setIntakeInput] = useState('');
  const [extractedContext, setExtractedContext] = useState<any>(null);
  const [lintIssues, setLintIssues] = useState<string[]>([]);
  
  // Active Session
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [redraftOptions, setRedraftOptions] = useState<any[]>([]);

  useEffect(() => {
    if (isAdmin) {
      loadData();
    }
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, sumRes] = await Promise.all([
        supabase.from('whatsapp_utility_sessions').select('*').order('started_at', { ascending: false }).limit(20),
        supabase.from('whatsapp_utility_summary').select('*').order('summarized_at', { ascending: false }).limit(1).maybeSingle()
      ]);
      
      if (sRes.data) setSessions(sRes.data);
      if (sumRes.data) setSummary(sumRes.data);
    } finally {
      setLoading(false);
    }
  };

  const handleIntake = async () => {
    if (!intakeInput.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-utility-agent', {
        body: { action: 'intake', message: intakeInput }
      });
      
      if (error) throw error;
      setExtractedContext(data.result);
      
      // Linting
      const lintRes = await supabase.functions.invoke('whatsapp-utility-agent', {
        body: { action: 'lint', body: data.result.body }
      });
      setLintIssues(lintRes.data?.issues || []);
      
      setStep(2);
    } catch (e: any) {
      console.error('Erro na análise:', e);
      let errorMsg = 'Ocorreu um erro ao processar sua solicitação.';
      
      if (e.message?.includes('Failed to fetch')) {
        errorMsg = 'Não foi possível conectar ao servidor. Verifique sua conexão.';
      } else if (e.message?.includes('JSON.parse')) {
        errorMsg = 'A resposta da IA veio em um formato inválido. Tente novamente com um texto diferente.';
      } else if (e.message) {
        errorMsg = `Erro: ${e.message}`;
      }
      
      toast({ title: 'Erro na análise', description: errorMsg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startSession = async () => {
    setLoading(true);
    try {
      const { data: session, error: sErr } = await supabase
        .from('whatsapp_utility_sessions')
        .insert({
          user_id: user?.id,
          base_name: extractedContext.base_name,
          business_purpose: extractedContext.business_purpose,
          trigger_event: extractedContext.trigger_event,
          utility_risk: extractedContext.utility_risk,
          context: extractedContext
        })
        .select()
        .single();

      if (sErr) throw sErr;

      // Create first attempt (locally for now, usually you'd submit to API)
      const { data: attempt, error: aErr } = await supabase
        .from('whatsapp_utility_attempts')
        .insert({
          session_id: session.id,
          attempt_no: 1,
          template_name: `${session.base_name}_${Date.now()}`,
          body: extractedContext.body,
          strictness_level: 1,
          status: 'PENDING'
        })
        .select()
        .single();

      if (aErr) throw aErr;

      toast({ title: 'Sessão Iniciada', description: 'O template foi registrado e está aguardando aprovação.' });
      loadData();
      setActiveSession(session);
      setAttempts([attempt]);
      setStep(1);
      setIntakeInput('');
      setExtractedContext(null);
    } catch (e: any) {
      console.error('Erro ao iniciar sessão:', e);
      toast({ 
        title: 'Erro ao iniciar', 
        description: e.message?.includes('permission denied') ? 'Você não tem permissão para realizar esta ação.' : e.message || 'Erro desconhecido ao salvar a sessão.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive">Acesso Negado</h1>
          <p>Esta ferramenta é exclusiva para administradores.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
        {/* HEADER SECTION */}
        <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Badge variant="outline" className="border-primary/30 text-primary mb-3">
              <ShieldCheck className="w-3 h-3 mr-1" /> Motor de Conformidade Meta (Core da IA)
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold">WhatsApp Utility Agent</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Garante que seus templates sejam aprovados como **Utilidade** pela Meta, economizando custos e melhorando a entrega. O agente aprende com cada aprovação e rejeição.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} /> Sincronizar
            </Button>
          </div>
        </div>

        <Tabs defaultValue="new" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="new" className="gap-2">
              <Zap className="w-4 h-4" /> Nova Submissão
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" /> Histórico de Sessões
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-2">
              <Brain className="w-4 h-4" /> Base de Conhecimento
            </TabsTrigger>
          </TabsList>

          {/* TAB: NEW SUBMISSION */}
          <TabsContent value="new" className="space-y-6 animate-in fade-in duration-500">
            {step === 1 && (
              <Card className="border-primary/10 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <MessageSquare className="w-5 h-5 text-primary" /> Como funciona seu template?
                  </CardTitle>
                  <CardDescription>
                    Descreva o propósito da mensagem, o que o cliente fez para recebê-la e o texto que deseja enviar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea 
                    placeholder="Ex: Sou uma loja de eletrônicos. Quando o cliente finaliza o pedido, quero enviar: 'Olá {{1}}, seu pedido {{2}} foi confirmado e está em separação!'. {{1}} é o nome do cliente e {{2}} o número do pedido."
                    className="min-h-[150px] text-base leading-relaxed bg-muted/30"
                    value={intakeInput}
                    onChange={(e) => setIntakeInput(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button 
                      size="lg" 
                      onClick={handleIntake} 
                      disabled={loading || !intakeInput.trim()}
                      className="rounded-xl px-8"
                    >
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                      Analisar com IA
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && extractedContext && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right-4 duration-500">
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Draft Analisado</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-4 rounded-xl bg-muted/50 border space-y-3">
                        <div className="flex justify-between items-start">
                          <Label className="text-xs uppercase font-bold text-muted-foreground">Corpo do Template</Label>
                          <Badge variant="secondary" className="text-[10px]">snake_case: {extractedContext.base_name}</Badge>
                        </div>
                        <p className="text-base font-mono whitespace-pre-wrap">{extractedContext.body}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-border/50">
                          {Object.entries(extractedContext.variables || {}).map(([key, val]: any) => (
                            <div key={key} className="text-xs flex gap-2">
                              <span className="font-bold text-primary">{"{{" + key + "}}"}:</span>
                              <span className="text-muted-foreground">{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Contexto de Negócio</Label>
                          <p className="text-sm font-medium">{extractedContext.business_purpose}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Evento Gatilho</Label>
                          <p className="text-sm font-medium">{extractedContext.trigger_event}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {extractedContext.explanation && (
                    <Card className="border-primary/10 bg-primary/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Brain className="w-4 h-4 text-primary" /> Explicação Detalhada
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground leading-relaxed italic">
                          {extractedContext.explanation}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <div className="flex gap-4">
                    <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar e Editar</Button>
                    <Button onClick={startSession} className="flex-1" disabled={loading}>
                      Iniciar Fluxo de Aprovação
                    </Button>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Score Card */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" /> Score de Conformidade
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span>Utility Score</span>
                          <span className="font-bold">{extractedContext.utility_risk === 'low' ? '90+' : extractedContext.utility_risk === 'medium' ? '50-70' : '<30'}</span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all",
                              extractedContext.utility_risk === 'low' ? "bg-emerald-500 w-[95%]" :
                              extractedContext.utility_risk === 'medium' ? "bg-amber-500 w-[60%]" : "bg-rose-500 w-[20%]"
                            )} 
                          />
                        </div>
                      </div>
                      
                      <div className="pt-2 border-t space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Aprovação Estimada</span>
                          <Badge className={cn(
                            "text-[10px]",
                            extractedContext.approval_chance?.includes('Alta') ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" :
                            extractedContext.approval_chance?.includes('Média') ? "bg-amber-500/15 text-amber-600 border-amber-500/30" : 
                            "bg-rose-500/15 text-rose-600 border-rose-500/30"
                          )} variant="outline">
                            {extractedContext.approval_chance || 'PENDENTE'}
                          </Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Risco Recategorização</span>
                          <span className={cn(
                            "text-xs font-bold",
                            extractedContext.utility_risk === 'low' ? "text-emerald-600" :
                            extractedContext.utility_risk === 'medium' ? "text-amber-600" : "text-rose-600"
                          )}>
                            {extractedContext.report?.risk_level_percent || 0}%
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Checklist Meta */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary" /> Checklist Meta
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {[
                        { label: 'Relacionamento Prévio', val: extractedContext.audit?.context?.previous_relationship },
                        { label: 'Evento Transacional', val: extractedContext.audit?.context?.real_transactional_event },
                        { label: 'Sem Incentivos', val: extractedContext.audit?.commercial_incentives?.length === 0 },
                        { label: 'Finalidade Utility', val: extractedContext.audit?.intent === 'Utility' }
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">{item.label}</span>
                          {item.val ? <Check className="w-3 h-3 text-emerald-500" /> : <X className="w-3 h-3 text-rose-500" />}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB: HISTORY */}
          <TabsContent value="history" className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {sessions.map((s) => (
                <Card key={s.id} className="hover:border-primary/30 transition-colors cursor-pointer group overflow-hidden">
                  <div className="flex items-center">
                    <div className={cn(
                      "w-1 self-stretch",
                      s.final_outcome === 'SUCCESS' ? "bg-emerald-500" :
                      s.final_outcome === 'HARD_STOP' ? "bg-rose-500" : "bg-muted"
                    )} />
                    <div className="flex-1 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold">{s.base_name}</h4>
                          <Badge variant="outline" className="text-[10px]">{s.utility_risk} risk</Badge>
                          {s.final_outcome && (
                            <Badge className={cn(
                              "text-[10px]",
                              s.final_outcome === 'SUCCESS' ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-rose-500/15 text-rose-600 border-rose-500/30"
                            )}>
                              {s.final_outcome}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{s.business_purpose}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex flex-col items-end">
                          <span>{new Date(s.started_at).toLocaleDateString()}</span>
                          <span>Gatilho: {s.trigger_event}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              
              {sessions.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                  Nenhuma sessão encontrada. Inicie uma nova submissão acima.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB: KNOWLEDGE */}
          <TabsContent value="knowledge" className="space-y-6">
            {summary ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Padrões Vencedores
                    </CardTitle>
                    <CardDescription>O que a Meta costuma aprovar como Utilidade.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {summary.clusters?.map((cluster: any, i: number) => (
                      <div key={i} className="space-y-2 p-3 rounded-xl bg-muted/30 border border-border/50">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm">{cluster.name}</span>
                          <span className="text-[10px] text-muted-foreground">{cluster.pass_rate}% aprovação</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {cluster.patterns?.map((p: string, j: number) => (
                            <Badge key={j} variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <X className="w-5 h-5 text-rose-500" /> Gatilhos de Marketing
                    </CardTitle>
                    <CardDescription>Termos que causam recategorização imediata.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {summary.anti_patterns?.map((pattern: string, i: number) => (
                        <Badge key={i} variant="outline" className="border-rose-500/30 text-rose-600 bg-rose-500/5">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground border-2 border-dashed rounded-3xl">
                O Agente ainda está aprendendo. Conclua algumas submissões para gerar a base de conhecimento.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
