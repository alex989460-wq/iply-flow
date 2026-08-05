import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CalendarClock, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function TrialDaysCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trialDays, setTrialDays] = useState('30');
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('id, trial_days')
        .is('user_id', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        setTrialDays(String(data.trial_days ?? 7));
        setSettingsId(data.id);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const days = Number(trialDays);
    if (!Number.isFinite(days) || days < 0 || days > 3650) {
      toast({
        title: 'Dias inválidos',
        description: 'Informe um número entre 0 e 3650 dias.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    const payload: any = { trial_days: Math.round(days) };
    if (settingsId) payload.id = settingsId;

    const { error } = await supabase
      .from('platform_settings')
      .upsert(payload);

    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Período de teste atualizado',
      description: `Novas contas passam a receber ${Math.round(days)} dias grátis.`,
    });
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5 text-primary" />
          Dias grátis ao criar conta
        </CardTitle>
        <CardDescription>
          Período de teste aplicado automaticamente a cada nova revenda cadastrada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex py-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Dias</Label>
              <Input
                type="number"
                min={0}
                max={3650}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className="w-32"
              />
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
