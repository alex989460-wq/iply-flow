import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Save, Globe, Copy, RefreshCw, ExternalLink, Key, Upload, X } from 'lucide-react';

interface Settings {
  id?: string;
  user_id?: string;
  slug: string;
  display_name: string;
  logo_url: string;
  brand_color: string;
  headline: string;
  subheadline: string;
  enable_efi: boolean;
  enable_cakto: boolean;
  api_key: string;
  webhook_url: string;
  is_active: boolean;
}

const EMPTY: Settings = {
  slug: '', display_name: '', logo_url: '', brand_color: '#e11d48',
  headline: '', subheadline: '',
  enable_efi: true, enable_cakto: true,
  api_key: '', webhook_url: '', is_active: true,
};

function genApiKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'sk_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function ResellerCheckoutCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<Settings>(EMPTY);

  const uploadLogo = async (file: File) => {
    if (!user) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Logo muito grande (máx 3MB)'); return; }
    if (!/^image\//.test(file.type)) { toast.error('Envie um arquivo de imagem'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('reseller-assets').upload(path, file, {
        cacheControl: '3600', upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('reseller-assets').getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: pub.publicUrl }));
      toast.success('Logo enviada! Clique em Salvar para aplicar.');
    } catch (e: any) {
      toast.error(e.message || 'Falha no upload');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase.from('reseller_checkout_settings' as any).select('*').eq('user_id', user.id).maybeSingle() as any);
      if (data) {
        setForm({
          ...EMPTY,
          ...data,
          slug: data.slug ?? '',
          display_name: data.display_name ?? '',
          logo_url: data.logo_url ?? '',
          brand_color: data.brand_color ?? '#e11d48',
          headline: data.headline ?? '',
          subheadline: data.subheadline ?? '',
          api_key: data.api_key ?? '',
          webhook_url: data.webhook_url ?? '',
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const publicUrl = form.slug ? `${window.location.origin}/r/${form.slug}` : '';
  const apiBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reseller-api`;

  const save = async () => {
    if (!user) return;
    const slugClean = (form.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slugClean)) {
      toast.error('Slug inválido: use 3–40 caracteres, letras minúsculas, números e hífens.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        user_id: user.id,
        slug: slugClean,
        display_name: (form.display_name || '').trim() || null,
        logo_url: (form.logo_url || '').trim() || null,
        brand_color: form.brand_color || '#e11d48',
        headline: (form.headline || '').trim() || null,
        subheadline: (form.subheadline || '').trim() || null,
        enable_efi: form.enable_efi,
        enable_cakto: form.enable_cakto,
        api_key: form.api_key || genApiKey(),
        webhook_url: (form.webhook_url || '').trim() || null,
        is_active: form.is_active,
      };
      const { error, data } = await (supabase.from('reseller_checkout_settings' as any).upsert(payload, { onConflict: 'user_id' }).select().single() as any);
      if (error) {
        if (String(error.message || '').includes('duplicate') || error.code === '23505') {
          toast.error('Esse slug já está sendo usado por outro revendedor.');
        } else {
          throw error;
        }
        return;
      }
      setForm({
        ...EMPTY,
        ...data,
        slug: data.slug ?? '',
        display_name: data.display_name ?? '',
        logo_url: data.logo_url ?? '',
        brand_color: data.brand_color ?? '#e11d48',
        headline: data.headline ?? '',
        subheadline: data.subheadline ?? '',
        api_key: data.api_key ?? '',
        webhook_url: data.webhook_url ?? '',
      });
      toast.success('Checkout público salvo!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const rotateApiKey = () => {
    if (!confirm('Gerar uma nova chave? A antiga deixará de funcionar imediatamente.')) return;
    setForm((f) => ({ ...f, api_key: genApiKey() }));
    toast.info('Nova chave gerada — clique em Salvar para aplicar.');
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (loading) {
    return <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /> Checkout Público (link do revendedor)</CardTitle>
            <CardDescription>
              Página pública onde seus clientes renovam sozinhos. Um link só seu, com sua marca. Aceita Pix Efí e/ou Cakto.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${form.is_active ? 'text-emerald-500' : 'text-muted-foreground'}`}>{form.is_active ? 'Ativo' : 'Desativado'}</span>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Slug do link</Label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground shrink-0">{window.location.origin}/r/</span>
              <Input placeholder="socialtv" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Nome exibido</Label>
            <Input placeholder="Ex: Social TV" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">URL do logo (opcional)</Label>
            <Input placeholder="https://…/logo.png" value={form.logo_url} onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Cor da marca</Label>
            <div className="flex items-center gap-2">
              <Input type="color" value={form.brand_color} onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))} className="w-16 h-10 p-1 cursor-pointer" />
              <Input value={form.brand_color} onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Frase de destaque</Label>
            <Input placeholder="ÁREA DO CLIENTE" value={form.headline} onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Subtítulo</Label>
            <Input placeholder="Informe seu telefone para renovar" value={form.subheadline} onChange={(e) => setForm((f) => ({ ...f, subheadline: e.target.value }))} />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 items-center border-t pt-4">
          <div className="flex items-center gap-2">
            <Switch checked={form.enable_efi} onCheckedChange={(v) => setForm((f) => ({ ...f, enable_efi: v }))} />
            <span className="text-sm">Aceitar Pix (Efí)</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.enable_cakto} onCheckedChange={(v) => setForm((f) => ({ ...f, enable_cakto: v }))} />
            <span className="text-sm">Aceitar Cakto (link do plano)</span>
          </div>
        </div>

        {publicUrl && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Link público</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={publicUrl} className="text-xs" />
              <Button size="sm" variant="outline" onClick={() => copy(publicUrl, 'Link')}><Copy className="w-4 h-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => window.open(publicUrl, '_blank')}><ExternalLink className="w-4 h-4" /></Button>
            </div>
          </div>
        )}

        {/* API para sites externos */}
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-bold">API para sites externos</p>
                <p className="text-xs text-muted-foreground">Use esta chave em sistemas externos (ex: planos.socialplay.com.br) para gerar cobranças automaticamente.</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={rotateApiKey}><RefreshCw className="w-4 h-4 mr-1" /> Nova chave</Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sua chave (x-api-key)</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={form.api_key || '(gerada ao salvar)'} className="text-xs font-mono" />
              {form.api_key && <Button size="sm" variant="outline" onClick={() => copy(form.api_key, 'Chave')}><Copy className="w-4 h-4" /></Button>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Endpoint base</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={apiBase} className="text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={() => copy(apiBase, 'Endpoint')}><Copy className="w-4 h-4" /></Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Endpoints: <code>GET /plans</code> · <code>POST /lookup</code> · <code>POST /charge</code> · <code>GET /charge/&#123;txid&#125;</code>. Envie <code>x-api-key</code> em todas.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Webhook (opcional)</Label>
            <Input placeholder="https://seusite.com/webhook-pix" value={form.webhook_url} onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))} />
            <p className="text-[11px] text-muted-foreground">Se preenchido, avisaremos essa URL quando um Pix for pago.</p>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
