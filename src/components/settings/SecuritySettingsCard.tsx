import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function SecuritySettingsCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('two_factor_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      setTwoFactorEnabled(!!data?.two_factor_enabled);
      setLoading(false);
    })();
  }, [user?.id]);

  const toggle = async (value: boolean) => {
    if (!user?.id) return;
    setSaving(true);
    setTwoFactorEnabled(value);

    const { data: existing } = await supabase
      .from('platform_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { error } = existing?.id
      ? await supabase
          .from('platform_settings')
          .update({ two_factor_enabled: value })
          .eq('id', existing.id)
      : await supabase
          .from('platform_settings')
          .insert({ user_id: user.id, two_factor_enabled: value });

    setSaving(false);
    if (error) {
      setTwoFactorEnabled(!value);
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: value ? 'Verificação em 2 etapas ativada' : 'Verificação em 2 etapas desativada',
      description: value
        ? 'A cada login vamos enviar um código de 6 dígitos para o seu e-mail.'
        : 'O login passa a ser feito apenas com e-mail e senha.',
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Segurança da conta
        </CardTitle>
        <CardDescription>
          Você controla o nível de segurança do acesso à sua própria conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div className="pr-4">
            <Label className="text-sm font-medium">Autenticação em 2 fatores (por e-mail)</Label>
            <p className="text-xs text-muted-foreground">
              Ativado: a cada login enviamos um código de 6 dígitos para o e-mail da conta.
              Desativado: o login é feito apenas com e-mail e senha.
            </p>
          </div>
          <Switch checked={twoFactorEnabled} onCheckedChange={toggle} disabled={saving} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          E-mail da conta: <span className="font-mono">{user?.email}</span>
        </p>
        <p className="text-[11px] text-amber-500">
          Atenção: com o 2 fatores ativo, o login só é concluído com o código do e-mail.
          Se o e-mail não chegar (verifique spam), você não conseguirá entrar — mantenha desativado
          se não tiver acesso garantido a esta caixa de entrada.
        </p>
      </CardContent>
    </Card>
  );
}
