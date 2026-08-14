import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Save, Zap, Copy, Wallet } from 'lucide-react';

interface MpSettings {
  enabled: boolean;
  environment: 'sandbox' | 'production';
  access_token: string;
  public_key: string;
  payer_email: string;
  webhook_configured_at?: string | null;
}

const EMPTY: MpSettings = {
  enabled: false,
  environment: 'production',
  access_token: '',
  public_key: '',
  payer_email: '',
};

export default function MercadoPagoSettingsCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<MpSettings>(EMPTY);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase.from('mercadopago_settings' as any).select('*').eq('user_id', user.id).maybeSingle() as any);
      if (data) {
        setForm({
          ...EMPTY,
          ...data,
          access_token: data.access_token || '',
          public_key: data.public_key || '',
          payer_email: data.payer_email || '',
        });
      }
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    supabase.functions
      .invoke('mercadopago-admin', { body: { action: 'webhook-url' } })
      .then(({ data }) => setWebhookUrl((data as any)?.url || ''))
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        enabled: form.enabled,
        environment: form.environment,
        access_token: form.access_token.trim() || null,
        public_key: form.public_key.trim() || null,
        payer_email: form.payer_email.trim() || null,
      };
      const { error } = await (supabase.from('mercadopago_settings' as any).upsert(payload, { onConflict: 'user_id' }) as any);
      if (error) throw error;
      toast.success('Configurações do Mercado Pago salvas.');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('mercadopago-admin', {
        body: { action: 'test', access_token: form.access_token.trim() || undefined },
      });
      if (error) throw error;
      if ((data as any)?.ok) toast.success((data as any).message || 'Conexão OK.');
      else toast.error((data as any)?.message || 'Credenciais inválidas.');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao testar a conexão com o Mercado Pago.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          Mercado Pago (Pix)
        </CardTitle>
        <CardDescription>
          Forma de recebimento adicional. Não altera nada do Cakto nem da Efí — o cliente escolhe no checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="font-medium">Ativar Mercado Pago</p>
            <p className="text-xs text-muted-foreground">Gera Pix com QR Code pela API do Mercado Pago.</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm(f => ({ ...f, enabled: v }))} />
        </div>

        <div className="space-y-2">
          <Label>Ambiente</Label>
          <Select value={form.environment} onValueChange={(v) => setForm(f => ({ ...f, environment: v as any }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Teste (credenciais de teste)</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Access Token</Label>
          <Input
            type="password"
            value={form.access_token}
            onChange={(e) => setForm(f => ({ ...f, access_token: e.target.value }))}
            placeholder="APP_USR-..."
          />
          <p className="text-xs text-muted-foreground">
            Em Mercado Pago → Suas integrações → sua aplicação → Credenciais de produção (ou de teste).
          </p>
        </div>

        <div className="space-y-2">
          <Label>Public Key (opcional)</Label>
          <Input
            value={form.public_key}
            onChange={(e) => setForm(f => ({ ...f, public_key: e.target.value }))}
            placeholder="APP_USR-xxxx-xxxx"
          />
        </div>

        <div className="space-y-2">
          <Label>E-mail padrão do pagador (opcional)</Label>
          <Input
            type="email"
            value={form.payer_email}
            onChange={(e) => setForm(f => ({ ...f, payer_email: e.target.value }))}
            placeholder="cliente@email.com"
          />
          <p className="text-xs text-muted-foreground">Usado quando o cliente não informa e-mail no checkout.</p>
        </div>

        {webhookUrl && (
          <div className="space-y-2">
            <Label>URL de notificação (webhook)</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada.'); }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cadastre essa URL no Mercado Pago em Suas integrações → Webhooks, evento "Pagamentos".
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Testar conexão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
