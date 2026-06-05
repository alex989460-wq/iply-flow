import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, Save, Loader2, Zap, Timer, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface EvoSchedule {
  id: string;
  user_id: string;
  is_enabled: boolean;
  send_time: string;
  send_d_minus_1: boolean;
  send_d0: boolean;
  send_d_plus_1: boolean;
  message_d_minus_1: string;
  message_d0: string;
  message_d_plus_1: string;
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
  const [d1, setD1] = useState(true);
  const [d0, setD0] = useState(true);
  const [dp1, setDp1] = useState(true);
  const [msgD1, setMsgD1] = useState('');
  const [msgD0, setMsgD0] = useState('');
  const [msgDp1, setMsgDp1] = useState('');
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
      return data as EvoSchedule | null;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (schedule) {
      setEnabled(schedule.is_enabled);
      setSendTime(schedule.send_time.substring(0, 5));
      setD1(schedule.send_d_minus_1);
      setD0(schedule.send_d0);
      setDp1(schedule.send_d_plus_1);
      setMsgD1(schedule.message_d_minus_1 || '');
      setMsgD0(schedule.message_d0 || '');
      setMsgDp1(schedule.message_d_plus_1 || '');
      setMinDelay(schedule.min_delay_seconds ?? 15);
      setMaxDelay(schedule.max_delay_seconds ?? 30);
    }
    setChanged(false);
  }, [schedule]);

  useEffect(() => { setChanged(true); },
    [enabled, sendTime, d1, d0, dp1, msgD1, msgD0, msgDp1, minDelay, maxDelay]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Sem usuário');
      const payload = {
        user_id: user.id,
        is_enabled: enabled,
        send_time: `${sendTime}:00`,
        send_d_minus_1: d1,
        send_d0: d0,
        send_d_plus_1: dp1,
        message_d_minus_1: msgD1,
        message_d0: msgD0,
        message_d_plus_1: msgDp1,
        min_delay_seconds: Math.max(5, minDelay),
        max_delay_seconds: Math.max(minDelay, maxDelay),
      };
      if (schedule) {
        const { error } = await supabase
          .from('evolution_billing_schedule')
          .update(payload).eq('id', schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('evolution_billing_schedule')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Salvo!', description: 'Cobrança via Evolution atualizada.' });
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

  return (
    <Card className="glass-card border-border/50 border-l-4 border-l-emerald-500">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-500" />
              Cobrança Automática via Evolution
            </CardTitle>
            <CardDescription className="mt-1">
              Envia mensagens de texto livres pela sua instância Evolution — independente do Zap Responder
            </CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className={cn('space-y-5 transition-opacity', !enabled && 'opacity-50 pointer-events-none')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4" />Horário</Label>
              <Input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-2"><Timer className="w-4 h-4" />Delay mín (s)</Label>
              <Input type="number" min={5} max={300} value={minDelay} onChange={e => setMinDelay(Number(e.target.value) || 15)} />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-2"><Timer className="w-4 h-4" />Delay máx (s)</Label>
              <Input type="number" min={5} max={300} value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value) || 30)} />
            </div>
          </div>

          <div className="text-xs text-muted-foreground flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span>Intervalo recomendado: 15-30s para evitar banimento. Variáveis disponíveis: <code>{'{{nome}}'}</code>, <code>{'{{vencimento}}'}</code>, <code>{'{{telefone}}'}</code></span>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-warning/40 bg-warning/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-warning">D-1 — Vencem amanhã</span>
                <Switch checked={d1} onCheckedChange={setD1} />
              </div>
              {d1 && <Textarea rows={2} value={msgD1} onChange={e => setMsgD1(e.target.value)} className="text-sm" />}
            </div>
            <div className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-primary">D0 — Vencem hoje</span>
                <Switch checked={d0} onCheckedChange={setD0} />
              </div>
              {d0 && <Textarea rows={2} value={msgD0} onChange={e => setMsgD0(e.target.value)} className="text-sm" />}
            </div>
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-destructive">D+1 — Venceram ontem</span>
                <Switch checked={dp1} onCheckedChange={setDp1} />
              </div>
              {dp1 && <Textarea rows={2} value={msgDp1} onChange={e => setMsgDp1(e.target.value)} className="text-sm" />}
            </div>
          </div>
        </div>

        {schedule?.last_run_at && (
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40">
            Última execução: {format(new Date(schedule.last_run_at), 'dd/MM/yyyy HH:mm')} — {schedule.last_run_status}
          </div>
        )}

        <Button onClick={() => save.mutate()} disabled={!changed || save.isPending} className="w-full">
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar configuração
        </Button>
      </CardContent>
    </Card>
  );
}
