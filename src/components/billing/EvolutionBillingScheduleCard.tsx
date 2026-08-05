import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, Save, Loader2, Zap, Timer, AlertTriangle, Send, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { offsetLabel, type BillingTemplate } from './EvolutionBillingTemplatesCard';

interface EvoSchedule {
  id: string;
  user_id: string;
  is_enabled: boolean;
  send_time: string;
  min_delay_seconds: number;
  max_delay_seconds: number;
  last_run_at: string | null;
  last_run_status: string | null;
}

export function EvolutionBillingScheduleCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [sendTime, setSendTime] = useState('09:00');
  const [minDelay, setMinDelay] = useState(15);
  const [maxDelay, setMaxDelay] = useState(30);
  const [changed, setChanged] = useState(false);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['evo-billing-schedule', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('evolution_billing_schedule')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as EvoSchedule | null;
    },
    enabled: !!user?.id,
    refetchInterval: (q: any) => {
      const s = q?.state?.data as EvoSchedule | null;
      return s?.last_run_status?.startsWith('in_progress') ? 4000 : false;
    },
  });

  const { data: rules } = useQuery({
    queryKey: ['evo-billing-rules', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('evolution_billing_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BillingTemplate[];
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (schedule) {
      setEnabled(schedule.is_enabled);
      setSendTime(String(schedule.send_time).substring(0, 5));
      setMinDelay(schedule.min_delay_seconds ?? 15);
      setMaxDelay(schedule.max_delay_seconds ?? 30);
    }
    setChanged(false);
  }, [schedule]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Sem usuário');
      const payload = {
        user_id: user.id,
        is_enabled: enabled,
        send_time: `${sendTime}:00`,
        min_delay_seconds: Math.max(5, minDelay),
        max_delay_seconds: Math.max(minDelay, maxDelay),
      };
      if (schedule) {
        const { error } = await supabase.from('evolution_billing_schedule').update(payload).eq('id', schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('evolution_billing_schedule').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Salvo!', description: 'Agendamento de cobrança atualizado.' });
      qc.invalidateQueries({ queryKey: ['evo-billing-schedule'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('evolution_billing_rules')
        .update({ is_enabled: value })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evo-billing-rules'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const sendNow = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Sem usuário');
      const { data, error } = await supabase.functions.invoke('scheduled-billing-evolution', {
        body: { force: true, userId: user.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const r = data?.results?.[0];
      const remaining = r?.remaining ?? 0;
      toast({
        title: 'Disparo concluído',
        description: r
          ? `${r.sent ?? 0} enviadas, ${r.errors ?? 0} erros${remaining > 0 ? ` — ${remaining} restantes, clique novamente para continuar` : ''}`
          : r?.skipped
            ? `Ignorado: ${r.skipped}`
            : 'Sem clientes para envio agora.',
      });
      qc.invalidateQueries({ queryKey: ['evo-billing-schedule'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const allRules = rules || [];
  const active = allRules.filter(r => r.is_enabled);

  return (
    <Card className="glass-card border-border/50 border-l-4 border-l-emerald-500">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Cobrança Automática via API Não Oficial
            </CardTitle>
            <CardDescription className="mt-1">
              Usa a instância Evolution já conectada. As mensagens são criadas em “Modelos de Mensagem”.
            </CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); setChanged(true); }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className={cn('space-y-5 transition-opacity', !enabled && 'opacity-50 pointer-events-none')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4" />Horário</Label>
              <Input type="time" value={sendTime} onChange={e => { setSendTime(e.target.value); setChanged(true); }} />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-2"><Timer className="w-4 h-4" />Delay mín (s)</Label>
              <Input type="number" min={5} max={300} value={minDelay} onChange={e => { setMinDelay(Number(e.target.value) || 15); setChanged(true); }} />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-2"><Timer className="w-4 h-4" />Delay máx (s)</Label>
              <Input type="number" min={5} max={300} value={maxDelay} onChange={e => { setMaxDelay(Number(e.target.value) || 30); setChanged(true); }} />
            </div>
          </div>

          <div className="text-xs text-muted-foreground flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p>Intervalo recomendado: 15-30s para evitar banimento.</p>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" /> Selecione as mensagens que serão disparadas
            </Label>
            {allRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum modelo criado ainda. Crie em <strong>Cobranças → Template Não Oficial</strong>.
              </p>
            ) : (
              <div className="space-y-2">
                {allRules.map((r, i) => (
                  <div
                    key={r.id || i}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.label}</p>
                      <p className="text-xs text-muted-foreground">{offsetLabel(r.days_offset)}</p>
                    </div>
                    <Switch
                      checked={r.is_enabled}
                      disabled={!r.id || toggleRule.isPending}
                      onCheckedChange={(v) => r.id && toggleRule.mutate({ id: r.id, value: v })}
                    />
                  </div>
                ))}
                {active.length === 0 && (
                  <p className="text-xs text-amber-500">
                    Nenhuma mensagem selecionada — nada será enviado automaticamente.
                  </p>
                )}
              </div>
            )}
          </div>

        </div>

        {schedule?.last_run_at && (
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40">
            Última execução: {format(new Date(schedule.last_run_at), 'dd/MM/yyyy HH:mm')} — {schedule.last_run_status}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => save.mutate()} disabled={!changed || save.isPending} className="flex-1">
            {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar configuração
          </Button>
          <Button
            variant="secondary"
            onClick={() => sendNow.mutate()}
            disabled={sendNow.isPending || changed}
            className="flex-1"
            title={changed ? 'Salve antes de enviar' : 'Enviar agora (reenvia mesmo se já foi)'}
          >
            {sendNow.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar agora (Reenviar)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
