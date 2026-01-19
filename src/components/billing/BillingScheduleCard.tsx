import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Clock, 
  Calendar, 
  Save, 
  Loader2,
  CheckCircle,
  AlertCircle,
  Timer
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface BillingSchedule {
  id: string;
  user_id: string;
  is_enabled: boolean;
  send_time: string;
  send_d_minus_1: boolean;
  send_d0: boolean;
  send_d_plus_1: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  updated_at: string;
}

export function BillingScheduleCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEnabled, setIsEnabled] = useState(false);
  const [sendTime, setSendTime] = useState('09:00');
  const [sendDMinus1, setSendDMinus1] = useState(true);
  const [sendD0, setSendD0] = useState(true);
  const [sendDPlus1, setSendDPlus1] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current schedule
  const { data: schedule, isLoading } = useQuery({
    queryKey: ['billing-schedule', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('billing_schedule')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as BillingSchedule | null;
    },
    enabled: !!user?.id,
  });

  // Update local state when schedule is loaded
  useEffect(() => {
    if (schedule) {
      setIsEnabled(schedule.is_enabled);
      // Convert time from HH:MM:SS to HH:MM for input
      setSendTime(schedule.send_time.substring(0, 5));
      setSendDMinus1(schedule.send_d_minus_1);
      setSendD0(schedule.send_d0);
      setSendDPlus1(schedule.send_d_plus_1);
    }
    setHasChanges(false);
  }, [schedule]);

  // Track changes
  useEffect(() => {
    if (!schedule) {
      setHasChanges(isEnabled || sendTime !== '09:00' || !sendDMinus1 || !sendD0 || !sendDPlus1);
    } else {
      const scheduleTime = schedule.send_time.substring(0, 5);
      setHasChanges(
        isEnabled !== schedule.is_enabled ||
        sendTime !== scheduleTime ||
        sendDMinus1 !== schedule.send_d_minus_1 ||
        sendD0 !== schedule.send_d0 ||
        sendDPlus1 !== schedule.send_d_plus_1
      );
    }
  }, [isEnabled, sendTime, sendDMinus1, sendD0, sendDPlus1, schedule]);

  // Save schedule mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const scheduleData = {
        user_id: user.id,
        is_enabled: isEnabled,
        send_time: `${sendTime}:00`,
        send_d_minus_1: sendDMinus1,
        send_d0: sendD0,
        send_d_plus_1: sendDPlus1,
      };

      if (schedule) {
        // Update existing
        const { error } = await supabase
          .from('billing_schedule')
          .update(scheduleData)
          .eq('id', schedule.id);
        
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('billing_schedule')
          .insert(scheduleData);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: 'Agendamento salvo!',
        description: isEnabled 
          ? `Cobranças serão enviadas automaticamente às ${sendTime}`
          : 'Agendamento automático desativado',
      });
      queryClient.invalidateQueries({ queryKey: ['billing-schedule'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    },
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
    <Card className="glass-card border-border/50">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Timer className="w-5 h-5 text-primary" />
              Agendamento Automático
            </CardTitle>
            <CardDescription className="mt-1">
              Configure o envio automático diário de cobranças
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="schedule-enabled" className="text-sm text-muted-foreground">
              {isEnabled ? 'Ativado' : 'Desativado'}
            </Label>
            <Switch
              id="schedule-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Time selector */}
        <div className={cn(
          'space-y-3 transition-opacity',
          !isEnabled && 'opacity-50 pointer-events-none'
        )}>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="send-time" className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Horário de Envio
              </Label>
              <Input
                id="send-time"
                type="time"
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                className="w-full max-w-[150px]"
              />
            </div>
            <div className="flex-1">
              <Label className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                Frequência
              </Label>
              <p className="text-sm text-muted-foreground">
                Todos os dias às {sendTime}
              </p>
            </div>
          </div>
        </div>

        {/* Billing types to send */}
        <div className={cn(
          'space-y-3 transition-opacity',
          !isEnabled && 'opacity-50 pointer-events-none'
        )}>
          <Label className="text-sm font-medium">Tipos de Cobrança</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className={cn(
              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              sendDMinus1 ? 'border-warning bg-warning/10' : 'border-border bg-secondary/30'
            )}>
              <Switch
                checked={sendDMinus1}
                onCheckedChange={setSendDMinus1}
              />
              <div>
                <p className="font-medium text-warning">D-1</p>
                <p className="text-xs text-muted-foreground">Vencem amanhã</p>
              </div>
            </label>

            <label className={cn(
              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              sendD0 ? 'border-primary bg-primary/10' : 'border-border bg-secondary/30'
            )}>
              <Switch
                checked={sendD0}
                onCheckedChange={setSendD0}
              />
              <div>
                <p className="font-medium text-primary">D0</p>
                <p className="text-xs text-muted-foreground">Vencem hoje</p>
              </div>
            </label>

            <label className={cn(
              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
              sendDPlus1 ? 'border-destructive bg-destructive/10' : 'border-border bg-secondary/30'
            )}>
              <Switch
                checked={sendDPlus1}
                onCheckedChange={setSendDPlus1}
              />
              <div>
                <p className="font-medium text-destructive">D+1</p>
                <p className="text-xs text-muted-foreground">Venceram ontem</p>
              </div>
            </label>
          </div>
        </div>

        {/* Last run info */}
        {schedule?.last_run_at && (
          <div className={cn(
            'p-3 rounded-lg border',
            schedule.last_run_status?.includes('success') 
              ? 'bg-success/10 border-success/20' 
              : 'bg-muted border-border'
          )}>
            <div className="flex items-center gap-2 text-sm">
              {schedule.last_run_status?.includes('success') ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : schedule.last_run_status?.includes('error') ? (
                <AlertCircle className="w-4 h-4 text-destructive" />
              ) : (
                <Clock className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">Última execução:</span>
              <span className="font-medium">
                {format(new Date(schedule.last_run_at), 'dd/MM/yyyy HH:mm')}
              </span>
              {schedule.last_run_status && (
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  schedule.last_run_status.includes('success')
                    ? 'bg-success/20 text-success'
                    : 'bg-destructive/20 text-destructive'
                )}>
                  {schedule.last_run_status}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end">
          <Button 
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            variant={hasChanges ? 'glow' : 'outline'}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Agendamento
          </Button>
        </div>

        {/* Info notice */}
        {isEnabled && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm text-muted-foreground">
              <strong className="text-primary">Nota:</strong> O agendamento automático executará o envio de cobranças todos os dias no horário configurado. 
              Certifique-se de ter um atendente selecionado na aba de Configuração.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}