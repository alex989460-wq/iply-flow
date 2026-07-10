import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Save, Loader2, AlertTriangle, Monitor } from 'lucide-react';

export default function P2CineCredentialsCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [form, setForm] = useState({ base_url: '', is_enabled: false });
  const [existing, setExisting] = useState(false);

  const downloadExtension = () => {
    fetch('/p2cine-extension.zip')
      .then(r => { if (!r.ok) throw new Error('Falha ao baixar'); return r.blob(); })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'p2cine-extension.zip';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(e => toast.error(e.message));
  };

  const copyToken = async () => {
    setTokenLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('p2cine-extension-token');
      if (error) throw error;
      if (!data?.token) throw new Error('Token indisponível');
      await navigator.clipboard.writeText(data.token);
      toast.success('Token copiado! Cole no popup da extensão.');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao obter token');
    } finally {
      setTokenLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('activation_panel_credentials')
          .select('*')
          .eq('user_id', user.id)
          .eq('panel_type', 'p2cine')
          .maybeSingle();
        if (data) {
          setExisting(true);
          setForm({
            base_url: data.username || '',
            is_enabled: false,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (!form.base_url.trim()) {
      toast.error('URL do painel é obrigatória');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        panel_type: 'p2cine',
        username: form.base_url.trim().replace(/\/+$/, ''),
        password: '',
        is_enabled: false,
      };
      const { error } = await (supabase as any)
        .from('activation_panel_credentials')
        .upsert(payload, { onConflict: 'user_id,panel_type' });
      if (error) throw error;
      setExisting(true);
      toast.success('P2Cine salvo como renovação manual.');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                P2Cine {existing && <span className="text-green-500 text-sm">●</span>}
              </CardTitle>
              <CardDescription>
                Renovação manual protegida
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>URL do painel</Label>
                <Input
                  value={form.base_url}
                  onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://painel.p2cine.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Input value="Renovação automática desativada" readOnly />
              </div>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs space-y-2">
                <p>
                  <strong>Renovação automática via extensão do navegador:</strong> como o P2Cine
                  derruba a sessão quando reutilizamos o <span className="font-mono">PHPSESSID</span> no
                  backend, criamos uma extensão que roda dentro do <em>seu</em> Chrome, usando a sua
                  sessão real logada em <span className="font-mono">daily3.news</span>. Sem burla, sem
                  captcha bypass — apenas automatiza os cliques.
                </p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Baixe o ZIP abaixo e descompacte.</li>
                  <li>Abra <span className="font-mono">chrome://extensions</span>, ative "Modo desenvolvedor".</li>
                  <li>Clique "Carregar sem compactação" e selecione a pasta descompactada.</li>
                  <li>Abra o ícone da extensão, cole o token, ative e mantenha uma aba do painel P2Cine logada.</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Extensão SuperGestor P2Cine</p>
                  <p className="text-xs text-muted-foreground">Roda a cada 20s enquanto sua aba estiver logada.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={downloadExtension}>
                  Baixar extensão
                </Button>
              </div>
              <div className="text-xs">
                <p className="text-muted-foreground mb-1">Token da extensão (cole no popup):</p>
                <p className="font-mono text-[11px] bg-background border rounded px-2 py-1 break-all">
                  Gerado automaticamente no backend — clique em "Copiar token" abaixo.
                </p>
                <Button size="sm" variant="outline" className="mt-2" onClick={copyToken} disabled={tokenLoading}>
                  {tokenLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Copiar token
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar URL
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
