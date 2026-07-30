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
  const [minScore, setMinScore] = useState('0.5');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('recaptcha_enabled, recaptcha_site_key, recaptcha_min_score')
        .eq('singleton', true)
        .maybeSingle();
      if (data) {
        setEnabled(!!data.recaptcha_enabled);
        setSiteKey(data.recaptcha_site_key ?? '');
        setMinScore(String(data.recaptcha_min_score ?? 0.5));
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('platform_settings')
      .update({
        recaptcha_enabled: enabled,
        recaptcha_site_key: siteKey.trim() || null,
        recaptcha_min_score: Number(minScore) || 0.5,
      })
      .eq('singleton', true);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Configurações salvas', description: 'reCAPTCHA atualizado com sucesso.' });
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
          Proteção reCAPTCHA (Google)
        </CardTitle>
        <CardDescription>
          Ative a verificação anti-robô no login e cadastro. A validação é feita no servidor usando a chave secreta já salva.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div>
            <Label className="text-sm font-medium">Ativar reCAPTCHA</Label>
            <p className="text-xs text-muted-foreground">Quando desativado, o login funciona normalmente sem verificação.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Chave do site (v3)</Label>
            <Input
              value={siteKey}
              onChange={(e) => setSiteKey(e.target.value)}
              placeholder="6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pontuação mínima (0 a 1)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
