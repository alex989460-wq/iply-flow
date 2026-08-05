import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function RecaptchaSettingsCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [trialDays, setTrialDays] = useState('7');
  const [requireEmailConfirmation, setRequireEmailConfirmation] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('id, recaptcha_enabled, recaptcha_site_key, recaptcha_secret_key, trial_days, require_email_confirmation, two_factor_enabled')
        .is('user_id', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        setSettingsId(data.id);
        setEnabled(!!data.recaptcha_enabled);
        setSiteKey(data.recaptcha_site_key ?? '');
        setSecretKey(data.recaptcha_secret_key ?? '');
        setTrialDays(String(data.trial_days ?? 7));
        setRequireEmailConfirmation(!!data.require_email_confirmation);
        setTwoFactorEnabled(!!data.two_factor_enabled);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (enabled && !siteKey.trim()) {
      toast({
        title: 'Chave do site obrigatória',
        description: 'Informe a Chave do site do widget Cloudflare Turnstile.',
        variant: 'destructive',
      });
      return;
    }
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
    const { error } = await supabase
      .from('platform_settings')
      .update({
        recaptcha_enabled: enabled,
        recaptcha_site_key: siteKey.trim() || null,
        recaptcha_secret_key: secretKey.trim() || null,
        trial_days: Math.round(days),
        require_email_confirmation: requireEmailConfirmation,
        two_factor_enabled: twoFactorEnabled,
      })
      .eq('id', settingsId ?? '');

    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Configurações salvas', description: 'Plataforma atualizada com sucesso.' });
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
          Segurança e cadastro da plataforma
        </CardTitle>
        <CardDescription>
          Verificação anti-robô, confirmação de e-mail, 2 fatores e período de teste grátis de novas contas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div>
            <Label className="text-sm font-medium">Ativar Turnstile (Cloudflare)</Label>
            <p className="text-xs text-muted-foreground">Quando desativado, o login funciona normalmente sem verificação.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (!siteKey.trim() || !secretKey.trim()) && (
          <p className="text-xs text-destructive">
            Preencha a Chave do site e a Chave secreta para a verificação funcionar.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Chave do site (Site key)</Label>
            <Input
              value={siteKey}
              onChange={(e) => setSiteKey(e.target.value)}
              placeholder="0x4AAAAAAA..."
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chave secreta (Secret key)</Label>
            <Input
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="0x4AAAAAAA...secret"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Cloudflare → Turnstile → seu widget → Secret key. Fica visível só para o admin.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div className="pr-4">
            <Label className="text-sm font-medium">Exigir confirmação de e-mail</Label>
            <p className="text-xs text-muted-foreground">
              Novas contas recebem um código no e-mail e só liberam o acesso após confirmar.
            </p>
          </div>
          <Switch checked={requireEmailConfirmation} onCheckedChange={setRequireEmailConfirmation} />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div className="pr-4">
            <Label className="text-sm font-medium">Autenticação em 2 fatores (por e-mail)</Label>
            <p className="text-xs text-muted-foreground">
              A cada login, envia um código de 6 dígitos para o e-mail cadastrado.
            </p>
          </div>
          <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
        </div>

        <div className="space-y-1.5 rounded-lg border border-border/60 p-3">
          <Label className="text-sm font-medium">Dias grátis ao criar conta</Label>
          <p className="text-xs text-muted-foreground">
            Período de teste aplicado automaticamente a cada nova revenda cadastrada.
          </p>
          <Input
            type="number"
            min={0}
            max={3650}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            className="w-32"
          />
        </div>

        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
