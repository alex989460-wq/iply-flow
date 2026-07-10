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
  const [form, setForm] = useState({ base_url: '', is_enabled: false });
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

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                O P2Cine invalida a sessão quando o mesmo <span className="font-mono">PHPSESSID</span> do navegador é usado pelo backend. Por isso o ping e a renovação automática via cookie foram desativados; pedidos desse painel devem ficar em pendência manual até existir uma API própria do provedor.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar como manual
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
