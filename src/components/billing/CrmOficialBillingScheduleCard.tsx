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
import { Clock, Save, Loader2, Zap, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrmSchedule {
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

export function CrmOficialBillingScheduleCard() {
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
    queryKey: ['crm-billing-schedule', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from('crm_oficial_billing_schedule')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as CrmSchedule | null;
    },
    enabled: !!user?.id,
  });

  const { data: crmSettings } = useQuery({
    queryKey: ['crm-oficial-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('crm_oficial_settings')
        .select('enabled, api_key')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
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
      setMsgD1(schedule.message_d_minus_1);
      setMsgD0(schedule.message_d0);
      setMsgDp1(schedule.message_d_plus_1);
      setMinDelay(schedule.min_delay_seconds);
      setMaxDelay(schedule.max_delay_seconds);
      setChanged(false);
    }
  }, [schedule]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Não autenticado');
      const payload = {
        user_id: user.id,
        is_enabled: enabled,
        send_time: sendTime + ':00',
        send_d_minus_1: d1,
        send_d0: d0,
        send_d_plus_1: dp1,
        message_d_minus_1: msgD1,
        message_d0: msgD0,
        message_d_plus_1: msgDp1,
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
      };
      const { error } = await (supabase as any)
        .from('crm_oficial_billing_schedule')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-billing-schedule'] });
      setChanged(false);
      toast({ title: 'Salvo', description: 'Configuração de cobrança CRM Oficial atualizada.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const integrationActive = !!crmSettings?.enabled && !!crmSettings?.api_key;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-500" />
          Cobrança via CRM Oficial
          {enabled && integrationActive && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 ml-2">
              ATIVO
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Envia cobranças automáticas usando o endpoint <code className="text-xs">/whatsapp-send</code> do CRM Oficial.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!integrationActive && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              Ative a integração CRM Oficial em <strong>Configurações → CRM Oficial</strong> antes de habilitar este envio.
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div>
            <Label className="font-semibold">Envio automático</Label>
            <p className="text-xs text-muted-foreground">Dispara as cobranças no horário configurado, todos os dias.</p>
          </div>
          <Switch
            checked={enabled}
            disabled={!integrationActive}
            onCheckedChange={(v) => { setEnabled(v); setChanged(true); }}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Horário</Label>
            <Input type="time" value={sendTime} onChange={(e) => { setSendTime(e.target.value); setChanged(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Delay mín. (s)</Label>
            <Input type="number" min={5} value={minDelay} onChange={(e) => { setMinDelay(Number(e.target.value)); setChanged(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Delay máx. (s)</Label>
            <Input type="number" min={5} value={maxDelay} onChange={(e) => { setMaxDelay(Number(e.target.value)); setChanged(true); }} />
          </div>
        </div>

        {[
          { label: 'D-1 (1 dia antes)', state: d1, setState: setD1, msg: msgD1, setMsg: setMsgD1 },
          { label: 'D0 (no dia do vencimento)', state: d0, setState: setD0, msg: msgD0, setMsg: setMsgD0 },
          { label: 'D+1 (1 dia depois)', state: dp1, setState: setDp1, msg: msgDp1, setMsg: setMsgDp1 },
        ].map((row, idx) => (
          <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-medium">{row.label}</Label>
              <Switch checked={row.state} onCheckedChange={(v) => { row.setState(v); setChanged(true); }} />
            </div>
            <Textarea
              value={row.msg}
              onChange={(e) => { row.setMsg(e.target.value); setChanged(true); }}
              rows={2}
              className="text-sm"
              placeholder="Use {{nome}}, {{vencimento}}, {{valor}}, {{usuario}}..."
              disabled={!row.state}
            />
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          Variáveis disponíveis: <code>{'{{nome}}'}</code>, <code>{'{{vencimento}}'}</code>, <code>{'{{valor}}'}</code>, <code>{'{{usuario}}'}</code>, <code>{'{{plano}}'}</code>
        </p>

        {schedule?.last_run_at && (
          <p className="text-xs text-muted-foreground">
            Última execução: {new Date(schedule.last_run_at).toLocaleString('pt-BR')}
            {schedule.last_run_status && <> — <span className={cn(schedule.last_run_status === 'success' ? 'text-emerald-500' : 'text-red-500')}>{schedule.last_run_status}</span></>}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!changed || save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
