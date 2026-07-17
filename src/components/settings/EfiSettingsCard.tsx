import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Save, Upload, Zap, CheckCircle2, AlertCircle, Radio } from 'lucide-react';

interface EfiSettings {
  id?: string;
  user_id?: string;
  enabled: boolean;
  environment: 'sandbox' | 'production';
  client_id: string;
  client_secret: string;
  pix_key: string;
  cert_p12_base64: string;
  cert_password: string;
  webhook_configured_at?: string | null;
  last_verified_at?: string | null;
  last_error?: string | null;
}

const EMPTY: EfiSettings = {
  enabled: false,
  environment: 'sandbox',
  client_id: '',
  client_secret: '',
  pix_key: '',
  cert_p12_base64: '',
  cert_password: '',
};

export default function EfiSettingsCard() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState<EfiSettings>(EMPTY);
  const [certFileName, setCertFileName] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase.from('efi_settings' as any).select('*').eq('user_id', user.id).maybeSingle() as any);
      if (data) {
        setForm({
          ...EMPTY,
          ...data,
          client_secret: data.client_secret || '',
          cert_p12_base64: data.cert_p12_base64 || '',
          cert_password: data.cert_password || '',
        });
        if (data.cert_p12_base64) setCertFileName('Certificado carregado');
      }
      setLoading(false);
    })();
  }, [user]);

  const handleUploadCert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.p12') && !file.name.toLowerCase().endsWith('.pfx')) {
      toast.error('Envie um arquivo .p12 ou .pfx do painel Efí.');
      return;
    }
    if (file.size > 200 * 1024) {
      toast.error('Certificado muito grande (máx 200 KB).');
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    setForm(f => ({ ...f, cert_p12_base64: b64 }));
    setCertFileName(file.name);
    toast.success('Certificado carregado. Não esqueça de salvar.');
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: any = {
        user_id: user.id,
        enabled: form.enabled,
        environment: form.environment,
        client_id: form.client_id.trim(),
        client_secret: form.client_secret,
        pix_key: form.pix_key.trim(),
        cert_p12_base64: form.cert_p12_base64,
        cert_password: form.cert_password || '',
      };
      const { error } = await (supabase.from('efi_settings' as any).upsert(payload, { onConflict: 'user_id' }) as any);
      if (error) throw error;
      toast.success('Configurações Efí salvas');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('efi-pix', { body: { action: 'verify-connection' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Conexão OK (${data?.environment}). Token gerado com sucesso.`);
    } catch (e: any) {
      toast.error('Falha ao verificar', { description: e.message });
    } finally {
      setTesting(false);
    }
  };

  const registerWebhook = async () => {
    setRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke('efi-pix', { body: { action: 'register-webhook' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.ok) throw new Error(`Efí retornou status ${data?.status}: ${JSON.stringify(data?.body).slice(0, 200)}`);
      toast.success('Webhook registrado na Efí!');
      // Reload settings
      const { data: fresh } = await (supabase.from('efi_settings' as any).select('*').eq('user_id', user!.id).maybeSingle() as any);
      if (fresh) setForm(f => ({ ...f, webhook_configured_at: fresh.webhook_configured_at }));
    } catch (e: any) {
      toast.error('Falha ao registrar webhook', { description: e.message });
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
    );
  }

  const hasCert = !!form.cert_p12_base64;
  const canTest = form.client_id && form.client_secret && form.pix_key && hasCert;

  return (
    <Card className="border-emerald-500/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <img src={pixLogo.url} alt="Pix" className="w-6 h-6" /> Efí Pix (Gerencianet)
            </CardTitle>
            <CardDescription>
              Segundo meio de pagamento no checkout público. Não afeta o Cakto — os dois convivem lado a lado.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${form.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
              {form.enabled ? 'Ativado' : 'Desativado'}
            </span>
            <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Ambiente</Label>
            <Select value={form.environment} onValueChange={v => setForm(f => ({ ...f, environment: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (homologação)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Comece em sandbox pra testar tudo antes de trocar.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Chave Pix (recebedora)</Label>
            <Input placeholder="email@dominio.com ou CPF/CNPJ ou aleatória" value={form.pix_key} onChange={e => setForm(f => ({ ...f, pix_key: e.target.value }))} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Client ID</Label>
            <Input value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} placeholder="Client_Id_..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Client Secret</Label>
            <Input type="password" value={form.client_secret} onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))} placeholder="••••••••••••" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Certificado (.p12 / .pfx)</Label>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".p12,.pfx" onChange={handleUploadCert} className="hidden" />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1" /> {hasCert ? 'Trocar certificado' : 'Enviar certificado'}
            </Button>
            {hasCert && (
              <span className="text-xs text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {certFileName || 'Certificado carregado'}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Baixe no painel Efí em <b>API → Meus Certificados</b>. Arquivo salvo criptografado no banco.</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Senha do certificado (opcional)</Label>
          <Input type="password" value={form.cert_password} onChange={e => setForm(f => ({ ...f, cert_password: e.target.value }))} placeholder="Deixe vazio se o .p12 não tiver senha" />
        </div>

        {form.last_error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs p-2 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5" /> <span>{form.last_error}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar
          </Button>
          <Button variant="outline" onClick={testConnection} disabled={testing || !canTest}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />} Testar conexão
          </Button>
          <Button variant="outline" onClick={registerWebhook} disabled={registering || !canTest}>
            {registering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Radio className="w-4 h-4 mr-2" />}
            {form.webhook_configured_at ? 'Re-registrar webhook' : 'Registrar webhook'}
          </Button>
          {form.webhook_configured_at && (
            <span className="text-xs text-emerald-500 self-center flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Webhook ativo
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
