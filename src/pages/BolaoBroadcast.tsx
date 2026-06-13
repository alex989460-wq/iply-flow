import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Send, Trophy, RefreshCw, Image as ImageIcon, MessageSquare, CheckCircle, XCircle } from 'lucide-react';

const DEFAULT_IMAGE_URL =
  'https://fphqfgxfeaylldpxjqan.supabase.co/storage/v1/object/public/reseller-assets/bolao/bolao_copa_2026.png';

const DEFAULT_TEXT = `🎁 Quer participar do BOLÃO DIÁRIO da Copa 2026?

R$ 11,00 por rodada · premiação em tempo real
🥇 50% · 🥈 25% · 🥉 10%

Entre em qualquer dia! Faltam 5 minutos para o 1º jogo.

👉 https://planos.socialplay.com.br/bolao`;

interface Target {
  phone: string;
  name?: string;
}

type Source = 'window24h' | 'window48h' | 'all_customers';

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  // remove '55' prefix to dedupe; we'll add back on send
  const noCC = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  return noCC;
}

export default function BolaoBroadcast() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [imageUrl, setImageUrl] = useState(DEFAULT_IMAGE_URL);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [source, setSource] = useState<Source>('window24h');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, errors: 0, total: 0 });
  const [logs, setLogs] = useState<{ phone: string; ok: boolean; error?: string }[]>([]);

  async function loadDepartment() {
    if (!user) return;
    const { data: zap } = await supabase
      .from('zap_responder_settings')
      .select('selected_department_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (zap?.selected_department_id) setDepartmentId(zap.selected_department_id);
  }

  async function loadTargets() {
    setLoading(true);
    try {
      const map = new Map<string, Target>();

      if (source === 'window24h' || source === 'window48h') {
        const hours = source === 'window24h' ? 24 : 48;
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        // Pagination — evolution_messages can be large
        const pageSize = 1000;
        for (let from = 0; from < 50000; from += pageSize) {
          const { data, error } = await supabase
            .from('evolution_messages')
            .select('phone, contact_name')
            .eq('direction', 'in')
            .gte('created_at', since)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const m of data) {
            const p = normalizePhone(m.phone);
            if (!p) continue;
            if (!map.has(p)) map.set(p, { phone: p, name: m.contact_name || undefined });
          }
          if (data.length < pageSize) break;
        }
      } else if (source === 'all_customers') {
        const pageSize = 1000;
        for (let from = 0; from < 100000; from += pageSize) {
          const { data, error } = await supabase
            .from('customers')
            .select('phone, name')
            .not('phone', 'is', null)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const c of data) {
            const p = normalizePhone(c.phone);
            if (!p) continue;
            if (!map.has(p)) map.set(p, { phone: p, name: c.name || undefined });
          }
          if (data.length < pageSize) break;
        }
      }

      const arr = Array.from(map.values());
      setTargets(arr);
      toast({ title: 'Lista carregada', description: `${arr.length} destinatários encontrados.` });
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Erro ao carregar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDepartment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  async function handleSend() {
    if (!departmentId) {
      toast({ title: 'Departamento não configurado', description: 'Configure o departamento do Zap Responder em Configurações.', variant: 'destructive' });
      return;
    }
    if (targets.length === 0) {
      toast({ title: 'Sem destinatários', variant: 'destructive' });
      return;
    }
    if (!confirm(`Confirmar envio para ${targets.length} clientes?`)) return;

    setSending(true);
    setLogs([]);
    setProgress({ sent: 0, errors: 0, total: targets.length });

    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      const number = c.phone.startsWith('55') ? c.phone : `55${c.phone}`;
      try {
        const { data, error } = await supabase.functions.invoke('zap-responder', {
          body: {
            action: 'enviar-mensagem',
            department_id: departmentId,
            number,
            text,
            image_url: imageUrl || undefined,
          },
        });
        const ok = !error && data?.success;
        setLogs((prev) => [...prev, { phone: number, ok, error: error?.message || data?.error }]);
        setProgress((p) => ({ ...p, sent: p.sent + (ok ? 1 : 0), errors: p.errors + (ok ? 0 : 1) }));
      } catch (e: any) {
        setLogs((prev) => [...prev, { phone: number, ok: false, error: e.message }]);
        setProgress((p) => ({ ...p, errors: p.errors + 1 }));
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    setSending(false);
    toast({ title: 'Disparo concluído' });
  }

  const pct = progress.total > 0 ? ((progress.sent + progress.errors) / progress.total) * 100 : 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Disparo Bolão Copa 2026</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Origem dos destinatários</CardTitle>
            <CardDescription>
              A API do Zap Responder não permite listar conversas abertas, então usamos as mensagens recebidas
              recentemente (janela ativa do WhatsApp) ou a base de clientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <Select value={source} onValueChange={(v) => setSource(v as Source)}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="window24h">Janela aberta (últimas 24h)</SelectItem>
                  <SelectItem value="window48h">Janela ampliada (últimas 48h)</SelectItem>
                  <SelectItem value="all_customers">Todos os clientes (com telefone)</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadTargets} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Atualizar lista
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-base px-3 py-1">
                {loading ? '...' : targets.length} destinatários
              </Badge>
              {departmentId ? (
                <span className="text-xs text-muted-foreground">Departamento Zap Responder ✓</span>
              ) : (
                <span className="text-xs text-destructive">⚠ Sem departamento configurado</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Imagem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>URL da Imagem</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
            {imageUrl && (
              <img src={imageUrl} alt="Preview" className="max-h-72 rounded-lg border" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Mensagem
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={sending || loading || targets.length === 0} size="lg">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para {targets.length} clientes
          </Button>
        </div>

        {(sending || progress.total > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progresso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={pct} />
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="w-4 h-4" /> {progress.sent} enviadas
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="w-4 h-4" /> {progress.errors} erros
                </span>
                <span className="text-muted-foreground">
                  {progress.sent + progress.errors} / {progress.total}
                </span>
              </div>
              <div className="max-h-60 overflow-auto border rounded text-xs">
                {logs.slice(-200).reverse().map((l, idx) => (
                  <div
                    key={idx}
                    className={`flex justify-between px-2 py-1 border-b ${l.ok ? 'text-green-600' : 'text-destructive'}`}
                  >
                    <span>{l.phone}</span>
                    <span>{l.ok ? 'OK' : l.error || 'erro'}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
