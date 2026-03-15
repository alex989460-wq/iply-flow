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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Clock, 
  Calendar, 
  Save, 
  Loader2,
  CheckCircle,
  AlertCircle,
  Timer,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface BillingSchedule {
  id: string;
  user_id: string;
  is_enabled: boolean;
  send_time: string;
  send_d_minus_1: boolean;
  send_d0: boolean;
  send_d_plus_1: boolean;
  template_d_minus_1: string;
  template_d0: string;
  template_d_plus_1: string;
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
  const [templateDMinus1, setTemplateDMinus1] = useState('vence_amanha');
  const [templateD0, setTemplateD0] = useState('hoje01');
  const [templateDPlus1, setTemplateDPlus1] = useState('vencido');
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch available Meta templates
  const { data: metaTemplates = [], isLoading: loadingTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ['meta-templates-list-schedule', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        const { data, error } = await supabase.functions.invoke('meta-templates', {
          body: { action: 'list' },
        });
        if (error) throw error;
        return data?.templates || [];
      } catch (e) {
        console.error('Error fetching meta templates:', e);
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

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
    refetchInterval: 30000, // Refetch every 30 seconds to catch updates
  });

  // Subscribe to realtime updates for this user's billing schedule
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('billing-schedule-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'billing_schedule',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Invalidate query to refetch when schedule is updated
          queryClient.invalidateQueries({ queryKey: ['billing-schedule', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Update local state when schedule is loaded
  useEffect(() => {
    if (schedule) {
      setIsEnabled(schedule.is_enabled);
      setSendTime(schedule.send_time.substring(0, 5));
      setSendDMinus1(schedule.send_d_minus_1);
      setSendD0(schedule.send_d0);
      setSendDPlus1(schedule.send_d_plus_1);
      setTemplateDMinus1((schedule as any).template_d_minus_1 || 'vence_amanha');
      setTemplateD0((schedule as any).template_d0 || 'hoje01');
      setTemplateDPlus1((schedule as any).template_d_plus_1 || 'vencido');
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
        sendDPlus1 !== schedule.send_d_plus_1 ||
        templateDMinus1 !== ((schedule as any).template_d_minus_1 || 'vence_amanha') ||
        templateD0 !== ((schedule as any).template_d0 || 'hoje01') ||
        templateDPlus1 !== ((schedule as any).template_d_plus_1 || 'vencido')
      );
    }
  }, [isEnabled, sendTime, sendDMinus1, sendD0, sendDPlus1, templateDMinus1, templateD0, templateDPlus1, schedule]);

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
        template_d_minus_1: templateDMinus1,
        template_d0: templateD0,
        template_d_plus_1: templateDPlus1,
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
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Tipos de Cobrança e Templates</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchTemplates()}
              disabled={loadingTemplates}
              title="Recarregar templates da Meta"
            >
              {loadingTemplates ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5 text-xs">Templates</span>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {/* D-1 */}
            <div className={cn(
              'p-3 rounded-lg border transition-colors space-y-2',
              sendDMinus1 ? 'border-warning bg-warning/10' : 'border-border bg-secondary/30'
            )}>
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch checked={sendDMinus1} onCheckedChange={setSendDMinus1} />
                <div>
                  <p className="font-medium text-warning">D-1</p>
                  <p className="text-xs text-muted-foreground">Vencem amanhã</p>
                </div>
              </label>
              {sendDMinus1 && (
                <Select value={templateDMinus1} onValueChange={setTemplateDMinus1}>
                  <SelectTrigger className="font-mono text-xs h-8">
                    <SelectValue placeholder="Template D-1" />
                  </SelectTrigger>
                  <SelectContent>
                    {metaTemplates.map((t: any) => (
                      <SelectItem key={t.name} value={t.name}>
                        <span className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${t.status === 'APPROVED' ? 'bg-green-500' : t.status === 'PENDING' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                    {metaTemplates.length === 0 && (
                      <SelectItem value={templateDMinus1}>{templateDMinus1}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* D0 */}
            <div className={cn(
              'p-3 rounded-lg border transition-colors space-y-2',
              sendD0 ? 'border-primary bg-primary/10' : 'border-border bg-secondary/30'
            )}>
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch checked={sendD0} onCheckedChange={setSendD0} />
                <div>
                  <p className="font-medium text-primary">D0</p>
                  <p className="text-xs text-muted-foreground">Vencem hoje</p>
                </div>
              </label>
              {sendD0 && (
                <Select value={templateD0} onValueChange={setTemplateD0}>
                  <SelectTrigger className="font-mono text-xs h-8">
                    <SelectValue placeholder="Template D0" />
                  </SelectTrigger>
                  <SelectContent>
                    {metaTemplates.map((t: any) => (
                      <SelectItem key={t.name} value={t.name}>
                        <span className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${t.status === 'APPROVED' ? 'bg-green-500' : t.status === 'PENDING' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                    {metaTemplates.length === 0 && (
                      <SelectItem value={templateD0}>{templateD0}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* D+1 */}
            <div className={cn(
              'p-3 rounded-lg border transition-colors space-y-2',
              sendDPlus1 ? 'border-destructive bg-destructive/10' : 'border-border bg-secondary/30'
            )}>
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch checked={sendDPlus1} onCheckedChange={setSendDPlus1} />
                <div>
                  <p className="font-medium text-destructive">D+1</p>
                  <p className="text-xs text-muted-foreground">Venceram ontem</p>
                </div>
              </label>
              {sendDPlus1 && (
                <Select value={templateDPlus1} onValueChange={setTemplateDPlus1}>
                  <SelectTrigger className="font-mono text-xs h-8">
                    <SelectValue placeholder="Template D+1" />
                  </SelectTrigger>
                  <SelectContent>
                    {metaTemplates.map((t: any) => (
                      <SelectItem key={t.name} value={t.name}>
                        <span className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${t.status === 'APPROVED' ? 'bg-green-500' : t.status === 'PENDING' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                    {metaTemplates.length === 0 && (
                      <SelectItem value={templateDPlus1}>{templateDPlus1}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
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