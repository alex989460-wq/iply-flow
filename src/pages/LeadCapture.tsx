import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Send, UserPlus, ShieldCheck, AlertTriangle, CheckCircle, XCircle, Upload } from 'lucide-react';

const RATE_MARKETING_BRL = 0.34; // ~US$0.0625 * R$5.40 — só estimativa
const RATE_UTILITY_BRL = 0.043;

interface Tpl { id: string; name: string; language?: string; status?: string; category?: string }

function normalize(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length < 10) return null;
  // garante 55 se for número BR sem código do país (10-11 dígitos)
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}

export default function LeadCapture() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [raw, setRaw] = useState('');
  const [phones, setPhones] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState(0);

  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [usdRate, setUsdRate] = useState(5.40);
  const [headerImage, setHeaderImage] = useState('');

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, errors: 0, total: 0 });
  const [logs, setLogs] = useState<{ phone: string; ok: boolean; error?: string }[]>([]);
  const cancelRef = useRef(false);

  async function loadTemplates() {
    setLoadingTpl(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', { body: { action: 'list-templates' } });
      if (error) throw error;
      const list = (data?.data ?? data?.templates ?? data ?? []) as any[];
      const tpls = list
        .filter((t) => (t.status || '').toUpperCase() === 'APPROVED')
        .map((t) => ({ id: t.id || t.name, name: t.name, language: t.language, status: t.status, category: t.category }));
      setTemplates(tpls);
    } catch (e: any) {
      toast({ title: 'Erro ao carregar templates', description: e.message, variant: 'destructive' });
    } finally { setLoadingTpl(false); }
  }
  useEffect(() => { loadTemplates(); }, []);

  function parsePhones() {
    const tokens = raw.split(/[\s,;\n]+/).filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    const bad: string[] = [];
    let dup = 0;
    for (const t of tokens) {
      const n = normalize(t);
      if (!n) { bad.push(t); continue; }
      if (seen.has(n)) { dup++; continue; }
      seen.add(n); valid.push(n);
    }
    setPhones(valid); setInvalid(bad); setDuplicates(dup);
    toast({ title: 'Lista processada', description: `${valid.length} válidos, ${bad.length} inválidos, ${dup} duplicados.` });
  }

  async function handleFile(file: File) {
    const text = await file.text();
    setRaw(text);
    setTimeout(parsePhones, 50);
  }

  const selectedTpl = useMemo(() => templates.find((t) => t.name === templateName), [templates, templateName]);
  const isMarketing = (selectedTpl?.category || '').toUpperCase() === 'MARKETING';
  const rateBrl = isMarketing ? RATE_MARKETING_BRL : RATE_UTILITY_BRL;
  const estCost = phones.length * rateBrl * (usdRate / 5.40);

  async function send() {
    if (!templateName) { toast({ title: 'Selecione um template', variant: 'destructive' }); return; }
    if (phones.length === 0) { toast({ title: 'Sem números', variant: 'destructive' }); return; }
    const msg = `Confirmar envio do template "${templateName}" para ${phones.length} números?\n\n` +
                `Custo estimado: R$ ${estCost.toFixed(2)} (${isMarketing ? 'Marketing' : 'Utilidade'})`;
    if (!confirm(msg)) return;

    setSending(true); cancelRef.current = false; setLogs([]);
    setProgress({ sent: 0, errors: 0, total: phones.length });

    for (let i = 0; i < phones.length; i++) {
      if (cancelRef.current) break;
      const number = phones[i];
      try {
        const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
          body: {
            action: 'sendTemplate',
            number,
            template_name: templateName,
            language: selectedTpl?.language || 'pt_BR',
            user_id: user?.id,
            header_image_url: headerImage || undefined,
          },
        });
        const ok = !error && (data?.success !== false);
        setLogs((p) => [...p, { phone: number, ok, error: error?.message || data?.error }]);
        setProgress((p) => ({ ...p, sent: p.sent + (ok ? 1 : 0), errors: p.errors + (ok ? 0 : 1) }));
      } catch (e: any) {
        setLogs((p) => [...p, { phone: number, ok: false, error: e.message }]);
        setProgress((p) => ({ ...p, errors: p.errors + 1 }));
      }
      // anti-bloqueio: 1.2s entre envios
      await new Promise((r) => setTimeout(r, 1200));
    }
    setSending(false);
    toast({ title: 'Disparo concluído' });
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <UserPlus className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Captura de Leads Frios — API Oficial</h1>
        </div>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Envio só com <strong>templates aprovados</strong> (Meta exige). Use templates de <strong>Marketing</strong> para prospecção.
            Sistema com intervalo de 1.2s entre envios para reduzir risco de bloqueio. Recomendado: até 250 envios/dia por canal novo.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Importar números</CardTitle>
            <CardDescription>Cole os números (qualquer formato: 5541999999999, (41) 99999-9999, etc) ou faça upload de CSV/TXT.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6} placeholder="41999999999&#10;(11) 98888-7777&#10;..." />
            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={parsePhones} variant="secondary" size="sm">Processar lista</Button>
              <label className="cursor-pointer">
                <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
                <Button asChild variant="outline" size="sm"><span><Upload className="w-4 h-4 mr-1" />Upload CSV/TXT</span></Button>
              </label>
              {phones.length > 0 && (
                <>
                  <Badge variant="secondary"><CheckCircle className="w-3 h-3 mr-1" />{phones.length} válidos</Badge>
                  {invalid.length > 0 && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />{invalid.length} inválidos</Badge>}
                  {duplicates > 0 && <Badge variant="outline">{duplicates} duplicados removidos</Badge>}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Template & estimativa de custo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Template aprovado</Label>
                <Select value={templateName} onValueChange={setTemplateName}>
                  <SelectTrigger><SelectValue placeholder={loadingTpl ? 'Carregando...' : 'Selecione'} /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name} <span className="text-xs text-muted-foreground ml-2">[{t.category || '—'}]</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>URL imagem header (opcional)</Label>
                <Input value={headerImage} onChange={(e) => setHeaderImage(e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Cotação USD→BRL</Label>
                <Input type="number" step="0.01" value={usdRate} onChange={(e) => setUsdRate(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            {selectedTpl && phones.length > 0 && (
              <div className="rounded-lg border p-3 bg-muted/30 text-sm">
                <div className="flex justify-between"><span>Categoria:</span><strong>{isMarketing ? 'Marketing' : 'Utilidade'}</strong></div>
                <div className="flex justify-between"><span>Mensagens:</span><strong>{phones.length}</strong></div>
                <div className="flex justify-between text-primary"><span>Custo estimado:</span><strong>R$ {estCost.toFixed(2)}</strong></div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          {sending && <Button variant="destructive" onClick={() => (cancelRef.current = true)}>Cancelar</Button>}
          <Button onClick={send} disabled={sending || phones.length === 0 || !templateName} size="lg">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para {phones.length}
          </Button>
        </div>

        {(sending || progress.total > 0) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Progresso</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Progress value={progress.total ? ((progress.sent + progress.errors) / progress.total) * 100 : 0} />
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" />{progress.sent}</span>
                <span className="text-destructive flex items-center gap-1"><XCircle className="w-4 h-4" />{progress.errors}</span>
                <span className="text-muted-foreground">{progress.sent + progress.errors}/{progress.total}</span>
              </div>
              <div className="max-h-60 overflow-auto border rounded text-xs">
                {logs.slice(-300).reverse().map((l, i) => (
                  <div key={i} className={`flex justify-between px-2 py-1 border-b ${l.ok ? 'text-green-600' : 'text-destructive'}`}>
                    <span>{l.phone}</span><span>{l.ok ? 'OK' : (l.error || 'erro').slice(0, 80)}</span>
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
