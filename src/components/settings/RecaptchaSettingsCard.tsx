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

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('recaptcha_enabled, recaptcha_site_key')
        .eq('singleton', true)
        .maybeSingle();
      if (data) {
        setEnabled(!!data.recaptcha_enabled);
        setSiteKey(data.recaptcha_site_key ?? '');
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
    setSaving(true);
    const { error } = await supabase
      .from('platform_settings')
      .update({
        recaptcha_enabled: enabled,
        recaptcha_site_key: siteKey.trim() || null,
      })
      .eq('singleton', true);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Configurações salvas', description: 'Cloudflare Turnstile atualizado com sucesso.' });
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
          Proteção Cloudflare Turnstile
        </CardTitle>
        <CardDescription>
          Ative a verificação anti-robô no login e cadastro. A chave secreta permanece protegida no backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div>
            <Label className="text-sm font-medium">Ativar Turnstile</Label>
            <p className="text-xs text-muted-foreground">Quando desativado, o login funciona normalmente sem verificação.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && !siteKey.trim() && (
          <p className="text-xs text-destructive">
            Turnstile marcado como ativo, mas sem Chave do site — o login ficará sem a verificação até você preencher a chave.
          </p>
        )}

        <div className="space-y-1.5">
            <Label className="text-xs">Chave do site (Site key)</Label>
            <Input
              value={siteKey}
              onChange={(e) => setSiteKey(e.target.value)}
              placeholder="0x4AAAAAAA..."
              className="font-mono text-xs"
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
