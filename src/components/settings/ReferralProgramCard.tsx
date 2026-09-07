import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Gift, Loader2, Users, TrendingUp, Wallet } from 'lucide-react';

interface Settings {
  enabled: boolean;
  reward_amount: number;
  referee_discount: number;
  max_rewards_per_month: number;
  min_order_amount: number;
  max_discount_percent: number;
  credit_expire_days: number;
  headline: string;
  terms: string;
}

const DEFAULTS: Settings = {
  enabled: false,
  reward_amount: 10,
  referee_discount: 0,
  max_rewards_per_month: 10,
  min_order_amount: 0,
  max_discount_percent: 50,
  credit_expire_days: 90,
  headline: 'Indique e ganhe desconto na sua próxima renovação',
  terms: 'O desconto é liberado somente depois que o indicado paga a primeira mensalidade.',
};

const brl = (v: number) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

export default function ReferralProgramCard() {
  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ total: 0, rewarded: 0, cost: 0 });

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { setLoading(false); return; }

      const [{ data: s }, { data: refs }] = await Promise.all([
        supabase.from('referral_settings').select('*').eq('owner_id', uid).maybeSingle(),
        supabase.from('referrals').select('status, reward_amount').eq('owner_id', uid).limit(1000),
      ]);
      if (s) setForm({ ...DEFAULTS, ...(s as any), headline: (s as any).headline || DEFAULTS.headline, terms: (s as any).terms || DEFAULTS.terms });
      const list = refs || [];
      setStats({
        total: list.length,
        rewarded: list.filter((r: any) => r.status === 'rewarded').length,
        cost: list.reduce((sum: number, r: any) => sum + Number(r.reward_amount || 0), 0),
      });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('Sessão expirada');
      const { error } = await supabase.from('referral_settings').upsert({ owner_id: uid, ...form }, { onConflict: 'owner_id' });
      if (error) throw error;
      toast.success('Programa de indicação salvo');
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((p) => ({ ...p, [k]: v }));

  if (loading) {
    return <Card><CardContent className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  const maxMonthlyCost = Number(form.reward_amount) * Number(form.max_rewards_per_month);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Gift className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Programa de Indicação</CardTitle>
              <CardDescription>
                Seus clientes indicam novos clientes e ganham desconto na próxima renovação — liberado só após o indicado pagar.
              </CardDescription>
            </div>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => set('enabled', v)} />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="w-3.5 h-3.5" /> Indicações</div>
            <div className="text-2xl font-bold mt-1">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="w-3.5 h-3.5" /> Convertidas</div>
            <div className="text-2xl font-bold mt-1">{stats.rewarded}</div>
          </div>
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="w-3.5 h-3.5" /> Custo em prêmios</div>
            <div className="text-2xl font-bold mt-1">{brl(stats.cost)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Desconto para quem indica (R$)</Label>
            <Input type="number" min={0} step="0.01" value={form.reward_amount}
              onChange={(e) => set('reward_amount', Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Creditado por cada indicado que pagar.</p>
          </div>
          <div className="space-y-2">
            <Label>Desconto de boas-vindas para o indicado (R$)</Label>
            <Input type="number" min={0} step="0.01" value={form.referee_discount}
              onChange={(e) => set('referee_discount', Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Deixe 0 para não dar desconto ao novo cliente.</p>
          </div>
          <div className="space-y-2">
            <Label>Máximo de indicações premiadas por mês</Label>
            <Input type="number" min={1} value={form.max_rewards_per_month}
              onChange={(e) => set('max_rewards_per_month', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Teto de desconto por pagamento (%)</Label>
            <Input type="number" min={1} max={100} value={form.max_discount_percent}
              onChange={(e) => set('max_discount_percent', Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Impede que uma renovação fique quase de graça.</p>
          </div>
          <div className="space-y-2">
            <Label>Valor mínimo do pagamento para premiar (R$)</Label>
            <Input type="number" min={0} step="0.01" value={form.min_order_amount}
              onChange={(e) => set('min_order_amount', Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Validade do crédito (dias)</Label>
            <Input type="number" min={1} value={form.credit_expire_days}
              onChange={(e) => set('credit_expire_days', Number(e.target.value))} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Chamada exibida no checkout</Label>
          <Input value={form.headline} onChange={(e) => set('headline', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Regras (texto curto para o cliente)</Label>
          <Textarea rows={3} value={form.terms} onChange={(e) => set('terms', e.target.value)} />
        </div>

        <div className="rounded-xl bg-muted/40 p-4 text-sm space-y-1">
          <div className="font-semibold flex items-center gap-2">
            Controle de custo <Badge variant="secondary">estimativa</Badge>
          </div>
          <p className="text-muted-foreground">
            No pior caso, cada cliente pode gerar até <strong>{brl(maxMonthlyCost)}</strong> de desconto por mês
            ({form.max_rewards_per_month} indicações × {brl(form.reward_amount)}), e só depois que esses indicados pagarem.
            Como o prêmio sai de uma venda nova já confirmada, o programa se paga sozinho enquanto o valor da
            recompensa for menor que sua margem por cliente.
          </p>
        </div>

        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />}
          Salvar programa de indicação
        </Button>
      </CardContent>
    </Card>
  );
}
