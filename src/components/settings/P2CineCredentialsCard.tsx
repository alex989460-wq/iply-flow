import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Save, Loader2, AlertCircle, Monitor } from 'lucide-react';

export default function P2CineCredentialsCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCookie, setShowCookie] = useState(false);
  const [form, setForm] = useState({ base_url: '', cookie: '', is_enabled: true });
  const [existing, setExisting] = useState(false);

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
            cookie: data.password || '',
            is_enabled: data.is_enabled ?? true,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (!form.base_url.trim() || !form.cookie.trim()) {
      toast.error('URL do painel e PHPSESSID são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        panel_type: 'p2cine',
        username: form.base_url.trim().replace(/\/+$/, ''),
        password: form.cookie.trim(),
        is_enabled: form.is_enabled,
      };
      const { error } = await (supabase as any)
        .from('activation_panel_credentials')
        .upsert(payload, { onConflict: 'user_id,panel_type' });
      if (error) throw error;
      setExisting(true);
      toast.success('Credenciais P2Cine salvas!');
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
                Renovação automática via sessão do painel (PHPSESSID)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="p2-enabled" className="text-xs">Renovação automática</Label>
            <Switch
              id="p2-enabled"
              checked={form.is_enabled}
              onCheckedChange={v => setForm(f => ({ ...f, is_enabled: v }))}
            />
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
                <Label>PHPSESSID / Cookie</Label>
                <div className="relative">
                  <Input
                    type={showCookie ? 'text' : 'password'}
                    autoComplete="off"
                    value={form.cookie}
                    onChange={e => setForm(f => ({ ...f, cookie: e.target.value }))}
                    placeholder="PHPSESSID=xxxxxxxxxxxx"
                    className="font-mono text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCookie(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showCookie ? 'Ocultar' : 'Mostrar'}
                  >
                    {showCookie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                O P2Cine tem <b>hCaptcha</b> no login. Faça login manual no painel, abra o DevTools (F12) → <b>Application</b> → <b>Cookies</b>, copie o valor de <span className="font-mono">PHPSESSID</span> e cole aqui (aceita JSON exportado ou <span className="font-mono">PHPSESSID=xxx</span>). O sistema mantém a sessão viva com pings automáticos e, se expirar, você recebe pendência para renovar.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar credenciais
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
