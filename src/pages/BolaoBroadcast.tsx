import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
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

interface OpenChat {
  phone: string;
  name?: string;
}

// Extrai telefone do objeto de conversa (varia conforme provider)
function extractPhone(conv: any): string | null {
  const raw =
    conv?.numero ||
    conv?.phone ||
    conv?.telefone ||
    conv?.chatId ||
    conv?.chat_id ||
    conv?.from ||
    conv?.number ||
    conv?.contact?.numero ||
    conv?.contact?.phone ||
    conv?.cliente?.telefone ||
    conv?.contato?.telefone ||
    '';
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits;
}

function extractName(conv: any): string {
  return (
    conv?.nome ||
    conv?.name ||
    conv?.contact?.nome ||
    conv?.contact?.name ||
    conv?.cliente?.nome ||
    conv?.contato?.nome ||
    '—'
  );
}

export default function BolaoBroadcast() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState<OpenChat[]>([]);
  const [imageUrl, setImageUrl] = useState(DEFAULT_IMAGE_URL);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, errors: 0, total: 0 });
  const [logs, setLogs] = useState<{ phone: string; ok: boolean; error?: string }[]>([]);

  async function loadOpenChats() {
    setLoading(true);
    try {
      // Buscar departamento padrão
      if (user) {
        const { data: zap } = await supabase
          .from('zap_responder_settings')
          .select('selected_department_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (zap?.selected_department_id) setDepartmentId(zap.selected_department_id);
      }

      // Listar conversas com janela aberta
      const all: OpenChat[] = [];
      const seen = new Set<string>();
      let offset = 0;
      const pageSize = 100;
      for (let page = 0; page < 20; page++) {
        const { data, error } = await supabase.functions.invoke('zap-responder', {
          body: { action: 'listar-conversas', status: 'open', limit: pageSize, offset },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Falha ao listar conversas');
        const list: any[] = Array.isArray(data.data) ? data.data : [];
        if (list.length === 0) break;
        for (const c of list) {
          const phone = extractPhone(c);
          if (!phone || seen.has(phone)) continue;
          seen.add(phone);
          all.push({ phone, name: extractName(c) });
        }
        if (list.length < pageSize) break;
        offset += pageSize;
      }
      setChats(all);
      toast({ title: 'Conversas carregadas', description: `${all.length} clientes com janela aberta.` });
    } catch (e: any) {
      toast({ title: 'Erro ao carregar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOpenChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function handleSend() {
    if (!departmentId) {
      toast({ title: 'Departamento não configurado', description: 'Configure o departamento do Zap Responder.', variant: 'destructive' });
      return;
    }
    if (chats.length === 0) {
      toast({ title: 'Sem destinatários', description: 'Nenhuma conversa aberta encontrada.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Confirmar envio para ${chats.length} clientes com janela aberta?`)) return;

    setSending(true);
    setLogs([]);
    setProgress({ sent: 0, errors: 0, total: chats.length });

    for (let i = 0; i < chats.length; i++) {
      const c = chats[i];
      try {
        const { data, error } = await supabase.functions.invoke('zap-responder', {
          body: {
            action: 'enviar-mensagem',
            department_id: departmentId,
            number: c.phone,
            text,
            image_url: imageUrl || undefined,
          },
        });
        const ok = !error && data?.success;
        setLogs((prev) => [...prev, { phone: c.phone, ok, error: error?.message || data?.error }]);
        setProgress((p) => ({ ...p, sent: p.sent + (ok ? 1 : 0), errors: p.errors + (ok ? 0 : 1) }));
      } catch (e: any) {
        setLogs((prev) => [...prev, { phone: c.phone, ok: false, error: e.message }]);
        setProgress((p) => ({ ...p, errors: p.errors + 1 }));
      }
      // pequena pausa entre envios
      await new Promise((r) => setTimeout(r, 800));
    }

    setSending(false);
    toast({ title: 'Disparo concluído', description: `Enviadas ${progress.sent + 1 - 1}, ver detalhes abaixo.` });
  }

  const pct = progress.total > 0 ? ((progress.sent + progress.errors) / progress.total) * 100 : 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Disparo Bolão (Janela Aberta)</h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Clientes com janela aberta no Zap Responder</CardTitle>
              <CardDescription>Só conversas com janela ativa recebem mensagem.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadOpenChats} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Atualizar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-base px-3 py-1">
                {loading ? '...' : chats.length} destinatários
              </Badge>
              {departmentId ? (
                <span className="text-xs text-muted-foreground">Departamento configurado ✓</span>
              ) : (
                <span className="text-xs text-destructive">Sem departamento configurado</span>
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
              <img
                src={imageUrl}
                alt="Preview"
                className="max-h-72 rounded-lg border"
                onError={() => toast({ title: 'Imagem inválida', variant: 'destructive' })}
              />
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
          <Button onClick={handleSend} disabled={sending || loading || chats.length === 0} size="lg">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para {chats.length} clientes
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
                    className={`flex justify-between px-2 py-1 border-b ${
                      l.ok ? 'text-green-600' : 'text-destructive'
                    }`}
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
