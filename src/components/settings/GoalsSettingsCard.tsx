import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Target, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GoalsSettings {
  customers_goal: number;
  revenue_goal: number;
  projection_goal: number;
}

export default function GoalsSettingsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState<GoalsSettings>({
    customers_goal: 200,
    revenue_goal: 10000,
    projection_goal: 15000,
  });

  useEffect(() => {
    if (user) {
      fetchGoals();
    }
  }, [user]);

  const fetchGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('goals_settings')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setGoals({
          customers_goal: data.customers_goal,
          revenue_goal: data.revenue_goal,
          projection_goal: data.projection_goal,
        });
      }
    } catch (error) {
      console.error('Error fetching goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const { data: existing } = await supabase
        .from('goals_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('goals_settings')
          .update({
            ...goals,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('goals_settings')
          .insert({
            user_id: user.id,
            ...goals,
          });
        if (error) throw error;
      }

      toast({
        title: 'Sucesso',
        description: 'Metas salvas com sucesso!',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar metas',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="w-5 h-5 text-primary" />
          Metas do Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="customers_goal">Meta de Clientes Ativos</Label>
            <Input
              id="customers_goal"
              type="number"
              value={goals.customers_goal}
              onChange={(e) => setGoals({ ...goals, customers_goal: parseInt(e.target.value) || 0 })}
              placeholder="200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="revenue_goal">Meta de Receita Mensal (R$)</Label>
            <Input
              id="revenue_goal"
              type="number"
              step="0.01"
              value={goals.revenue_goal}
              onChange={(e) => setGoals({ ...goals, revenue_goal: parseFloat(e.target.value) || 0 })}
              placeholder="10000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projection_goal">Meta de Projeção (R$)</Label>
            <Input
              id="projection_goal"
              type="number"
              step="0.01"
              value={goals.projection_goal}
              onChange={(e) => setGoals({ ...goals, projection_goal: parseFloat(e.target.value) || 0 })}
              placeholder="15000"
            />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Metas
        </Button>
      </CardContent>
    </Card>
  );
}
