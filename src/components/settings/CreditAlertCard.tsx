import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { BellRing, Loader2, Save, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function CreditAlertCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState('10');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('reseller_api_settings')
        .select('credit_alert_enabled, credit_alert_threshold, credit_alert_phone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setEnabled(!!(data as any).credit_alert_enabled);
        setThreshold(String((data as any).credit_alert_threshold ?? 10));
        setPhone((data as any).credit_alert_phone || '');
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    const value = Number(threshold);
    if (!Number.isFinite(value) || value < 0 || value > 100000) {
      toast({ title: 'Quantidade inválida', description: 'Informe um número entre 0 e 100000.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('reseller_api_settings')
      .upsert(
        {
          user_id: user.id,
          credit_alert_enabled: enabled,
          credit_alert_threshold: Math.round(value),
          credit_alert_phone: phone.replace(/\D/g, '') || null,
        } as any,
        { onConflict: 'user_id' },
      );
    setSaving(false);
    if (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Aviso de créditos atualizado', description: enabled ? 'Vamos avisar você no WhatsApp quando os créditos ficarem baixos.' : 'Aviso desligado.' });
  };

  const testNow = async () => {
    if (!user?.id) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('credit-monitor', {
        body: { user_id: user.id, force: true },
      });
      if (error) throw error;
      const item = (data as any)?.report?.[0];
      if (item?.sent) {
        toast({ title: 'Aviso enviado', description: 'Confira o WhatsApp informado.' });
      } else if (item?.low?.length === 0) {
        toast({ title: 'Tudo certo', description: 'Nenhum painel está abaixo do mínimo agora.' });
      } else {
        toast({ title: 'Não foi possível avisar', description: item?.skipped || item?.error || 'Verifique o telefone e o WhatsApp conectado.', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Erro na verificação', description: e?.message || 'Tente novamente', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="w-4 h-4 text-amber-500" />
          Aviso de créditos baixos
        </CardTitle>
        <CardDescription>
          A cada 1 hora conferimos os créditos dos seus painéis e avisamos no WhatsApp quando ficarem abaixo do mínimo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">Receber aviso no WhatsApp</p>
                <p className="text-xs text-muted-foreground">Enviamos no máximo um aviso a cada 6 horas.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="credit_threshold">Avisar quando ficar com até</Label>
                <Input
                  id="credit_threshold"
                  inputMode="numeric"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="10"
                />
                <p className="text-xs text-muted-foreground">Quantidade de créditos no painel.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="credit_phone">WhatsApp que recebe o aviso</Label>
                <Input
                  id="credit_phone"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="5541999999999"
                />
                <p className="text-xs text-muted-foreground">Vazio usa o telefone das notificações de cobrança.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
              <Button variant="outline" onClick={testNow} disabled={testing || !enabled}>
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Verificar agora
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
