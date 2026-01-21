import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Bot, 
  Save,
  Loader2,
  AlertTriangle,
  UserPlus,
  RefreshCw,
  Bell,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BotTrigger {
  id?: string;
  user_id: string;
  trigger_type: string;
  is_enabled: boolean;
  days_offset: number;
  bot_department_id?: string;
  bot_department_name?: string;
  message_template?: string;
}

interface Department {
  id: string;
  name: string;
}

const TRIGGER_TYPES = [
  {
    type: 'inadimplente',
    title: 'Cliente Inadimplente',
    description: 'Iniciar bot quando o cliente fica inadimplente',
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    type: 'boas_vindas',
    title: 'Boas-vindas',
    description: 'Iniciar bot automaticamente para novos clientes',
    icon: UserPlus,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    type: 'renovacao',
    title: 'Lembrete de Renovação',
    description: 'Iniciar bot X dias antes do vencimento',
    icon: RefreshCw,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    type: 'lembrete',
    title: 'Lembrete Personalizado',
    description: 'Enviar lembrete em dias específicos',
    icon: Bell,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
];

export default function BotTriggers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [triggers, setTriggers] = useState<Record<string, BotTrigger>>({});

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch departments
      const { data: deptData, error: deptError } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'departamentos', userId: user.id },
      });

      if (!deptError && deptData?.success) {
        setDepartments(deptData.data || []);
      }

      // Fetch existing triggers
      const { data: triggerData, error: triggerError } = await supabase
        .from('bot_triggers')
        .select('*')
        .eq('user_id', user.id);

      if (!triggerError && triggerData) {
        const triggersMap: Record<string, BotTrigger> = {};
        triggerData.forEach((t: any) => {
          triggersMap[t.trigger_type] = t;
        });
        setTriggers(triggersMap);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (triggerType: string, enabled: boolean) => {
    if (!user) return;

    const currentTrigger = triggers[triggerType] || {
      user_id: user.id,
      trigger_type: triggerType,
      is_enabled: false,
      days_offset: triggerType === 'renovacao' ? -3 : 0,
    };

    const updatedTrigger = { ...currentTrigger, is_enabled: enabled };
    setTriggers(prev => ({ ...prev, [triggerType]: updatedTrigger }));

    try {
      if (currentTrigger.id) {
        await supabase
          .from('bot_triggers')
          .update({ is_enabled: enabled })
          .eq('id', currentTrigger.id);
      } else {
        const { data, error } = await supabase
          .from('bot_triggers')
          .insert({
            user_id: user.id,
            trigger_type: triggerType,
            is_enabled: enabled,
            days_offset: updatedTrigger.days_offset,
          })
          .select()
          .single();

        if (!error && data) {
          setTriggers(prev => ({ ...prev, [triggerType]: data }));
        }
      }

      toast({
        title: enabled ? 'Gatilho ativado' : 'Gatilho desativado',
        description: `O gatilho foi ${enabled ? 'ativado' : 'desativado'} com sucesso.`,
      });
    } catch (error) {
      console.error('Error toggling trigger:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o gatilho.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveTrigger = async (triggerType: string) => {
    if (!user) return;

    const trigger = triggers[triggerType];
    if (!trigger) return;

    setSaving(triggerType);

    try {
      if (trigger.id) {
        await supabase
          .from('bot_triggers')
          .update({
            days_offset: trigger.days_offset,
            bot_department_id: trigger.bot_department_id,
            bot_department_name: trigger.bot_department_name,
            message_template: trigger.message_template,
          })
          .eq('id', trigger.id);
      } else {
        const { data, error } = await supabase
          .from('bot_triggers')
          .insert({
            user_id: user.id,
            trigger_type: triggerType,
            is_enabled: trigger.is_enabled,
            days_offset: trigger.days_offset,
            bot_department_id: trigger.bot_department_id,
            bot_department_name: trigger.bot_department_name,
            message_template: trigger.message_template,
          })
          .select()
          .single();

        if (!error && data) {
          setTriggers(prev => ({ ...prev, [triggerType]: data }));
        }
      }

      toast({
        title: 'Salvo!',
        description: 'As configurações do gatilho foram salvas.',
      });
    } catch (error) {
      console.error('Error saving trigger:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  const updateTriggerField = (triggerType: string, field: string, value: any) => {
    if (!user) return;

    const currentTrigger = triggers[triggerType] || {
      user_id: user.id,
      trigger_type: triggerType,
      is_enabled: false,
      days_offset: 0,
    };

    setTriggers(prev => ({
      ...prev,
      [triggerType]: { ...currentTrigger, [field]: value },
    }));
  };

  const handleDepartmentChange = (triggerType: string, departmentId: string) => {
    if (!user) return;
    
    const dept = departments.find(d => d.id === departmentId);
    const currentTrigger = triggers[triggerType] || {
      user_id: user.id,
      trigger_type: triggerType,
      is_enabled: false,
      days_offset: 0,
    };

    setTriggers(prev => ({
      ...prev,
      [triggerType]: { 
        ...currentTrigger, 
        bot_department_id: departmentId,
        bot_department_name: dept?.name || '' 
      },
    }));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Gatilhos Automáticos de Bot
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure quando o bot deve iniciar automaticamente
          </p>
        </div>

        {/* Warning if no departments */}
        {departments.length === 0 && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-500">Configuração necessária</p>
                  <p className="text-sm text-muted-foreground">
                    Você precisa configurar a integração com o Zap Responder nas Configurações 
                    para usar os gatilhos automáticos.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trigger Cards */}
        <div className="grid gap-6">
          {TRIGGER_TYPES.map((triggerConfig) => {
            const trigger = triggers[triggerConfig.type] || {
              is_enabled: false,
              days_offset: triggerConfig.type === 'renovacao' ? -3 : 0,
            };
            const Icon = triggerConfig.icon;

            return (
              <Card key={triggerConfig.type} className={cn(
                "transition-all",
                trigger.is_enabled && "ring-2 ring-primary/20"
              )}>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg", triggerConfig.bgColor)}>
                        <Icon className={cn("w-5 h-5", triggerConfig.color)} />
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {triggerConfig.title}
                          {trigger.is_enabled && (
                            <Badge variant="default" className="text-xs">Ativo</Badge>
                          )}
                        </CardTitle>
                        <CardDescription>{triggerConfig.description}</CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={trigger.is_enabled}
                      onCheckedChange={(checked) => handleToggle(triggerConfig.type, checked)}
                      disabled={departments.length === 0}
                    />
                  </div>
                </CardHeader>

                {trigger.is_enabled && (
                  <CardContent className="space-y-4 border-t pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Department Selection */}
                      <div className="space-y-2">
                        <Label>Departamento do Bot</Label>
                        <Select
                          value={trigger.bot_department_id || ''}
                          onValueChange={(value) => handleDepartmentChange(triggerConfig.type, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o departamento" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Days Offset (for renovacao and lembrete) */}
                      {(triggerConfig.type === 'renovacao' || triggerConfig.type === 'lembrete' || triggerConfig.type === 'inadimplente') && (
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {triggerConfig.type === 'inadimplente' 
                              ? 'Dias após vencimento'
                              : 'Dias antes do vencimento'
                            }
                          </Label>
                          <Input
                            type="number"
                            value={Math.abs(trigger.days_offset || 0)}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              updateTriggerField(
                                triggerConfig.type, 
                                'days_offset', 
                                triggerConfig.type === 'inadimplente' ? value : -value
                              );
                            }}
                            min={0}
                            max={30}
                          />
                        </div>
                      )}
                    </div>

                    {/* Message Template */}
                    <div className="space-y-2">
                      <Label>Mensagem Inicial (opcional)</Label>
                      <Textarea
                        value={trigger.message_template || ''}
                        onChange={(e) => updateTriggerField(triggerConfig.type, 'message_template', e.target.value)}
                        placeholder="Digite uma mensagem inicial para o bot enviar..."
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Variáveis disponíveis: {'{nome}'}, {'{telefone}'}, {'{vencimento}'}, {'{plano}'}
                      </p>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end">
                      <Button
                        onClick={() => handleSaveTrigger(triggerConfig.type)}
                        disabled={saving === triggerConfig.type}
                        className="gap-2"
                      >
                        {saving === triggerConfig.type ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Salvar Configurações
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Info Card */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Bot className="w-5 h-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium text-blue-500">Como funciona</p>
                <p className="text-sm text-muted-foreground">
                  Os gatilhos automáticos verificam diariamente os clientes e iniciam o bot 
                  automaticamente quando as condições são atendidas. Certifique-se de que o 
                  departamento selecionado tenha um fluxo de bot configurado.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
