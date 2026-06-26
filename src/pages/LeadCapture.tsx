import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Loader2, Send, UserPlus, ShieldCheck, AlertTriangle, CheckCircle, XCircle, Upload,
  ShieldAlert, Crown, Search, Sparkles, Wand2,

} from 'lucide-react';

// Estimativa Meta (USD aprox.) — categoria BR utility/marketing 2026
const RATE_USD_MARKETING = 0.0625;
const RATE_USD_UTILITY = 0.008;
// Cotação USD→BRL automática (fallback se API falhar)
const FALLBACK_USD_BRL = 5.4;

// DDDs válidos no Brasil
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68,
  69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95,
  96, 97, 98, 99,
]);

const DAILY_LIMIT_NON_ADMIN = 250;

interface Tpl { id: string; name: string; language?: string; status?: string; category?: string }

function normalize(raw: string): { phone: string | null; reason?: string } {
  const d = raw.replace(/\D/g, '');
  if (d.length < 10) return { phone: null, reason: 'curto' };
  // 10 ou 11 dígitos → assume BR
  let full = d;
  if (d.length === 10 || d.length === 11) full = '55' + d;
  // Se começa com 55 e tem 12-13 dígitos, valida DDD BR
  if (full.startsWith('55') && (full.length === 12 || full.length === 13)) {
    const ddd = parseInt(full.slice(2, 4), 10);
    if (!VALID_DDDS.has(ddd)) return { phone: null, reason: 'DDD inválido' };
    const local = full.slice(4);
    // Celular válido: começa com 9 e tem 9 dígitos OU fixo 8 dígitos começando 2-5
    if (local.length === 9 && local[0] !== '9') return { phone: null, reason: 'celular sem 9' };
    if (local.length === 8 && !'2345'.includes(local[0])) return { phone: null, reason: 'fixo inválido' };
    return { phone: full };
  }
  // Internacional — só valida tamanho razoável
  if (full.length >= 11 && full.length <= 15) return { phone: full };
  return { phone: null, reason: 'formato' };
}

export default function LeadCapture() {
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [raw, setRaw] = useState('');
  const [phones, setPhones] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<{ raw: string; reason: string }[]>([]);
  const [duplicates, setDuplicates] = useState(0);

  const [apiKey, setApiKey] = useState('');
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [usdBrl, setUsdBrl] = useState(FALLBACK_USD_BRL);
  const [channels, setChannels] = useState<{ id: string; phone_number_id: string; display_phone_number?: string; verified_name?: string }[]>([]);
  const [channelId, setChannelId] = useState<string>('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [consent, setConsent] = useState(false);

  const [todaySent, setTodaySent] = useState(0);
  const dailyLimit = isAdmin ? Infinity : DAILY_LIMIT_NON_ADMIN;
  const remaining = Math.max(0, dailyLimit - todaySent);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, errors: 0, total: 0 });
  const [logs, setLogs] = useState<{ phone: string; ok: boolean; error?: string }[]>([]);
  const cancelRef = useRef(false);

  const [validating, setValidating] = useState(false);
  const [validateProgress, setValidateProgress] = useState({ done: 0, total: 0 });
  const [realCheck, setRealCheck] = useState<{ total: number; valid: number; removed: number } | null>(null);

  async function validateRealWhatsapp() {
    if (phones.length === 0) return;
    setValidating(true);
    setRealCheck(null);
    const chunkSize = 50;
    const allValid: string[] = [];
    const allInvalid: string[] = [];
    setValidateProgress({ done: 0, total: phones.length });
    try {
      for (let i = 0; i < phones.length; i += chunkSize) {
        const chunk = phones.slice(i, i + chunkSize);
        const { data, error } = await supabase.functions.invoke('whatsapp-validate', { body: { numbers: chunk } });
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        allValid.push(...((data as any)?.valid || []));
        allInvalid.push(...((data as any)?.invalid || []));
        setValidateProgress({ done: Math.min(i + chunkSize, phones.length), total: phones.length });
      }
      const before = phones.length;
      const kept = Array.from(new Set(allValid));
      setPhones(kept);
      setRealCheck({ total: before, valid: kept.length, removed: before - kept.length });
      toast({
        title: 'Validação concluída',
        description: `${kept.length} com WhatsApp ativo · ${before - kept.length} removidos`,
      });
    } catch (e: any) {
      toast({ title: 'Erro na validação', description: e.message, variant: 'destructive' });
    } finally {
      setValidating(false);
    }
  }


  // Gerador de leads (números próximos do telefone semente)
  const [seedPhone, setSeedPhone] = useState('');
  const [seedCount, setSeedCount] = useState(1000);
  const [seedMode, setSeedMode] = useState<'sequencial' | 'aleatorio'>('aleatorio');

  function generateFromSeed() {
    const digits = seedPhone.replace(/\D/g, '');
    const { phone } = normalize(digits);
    if (!phone || !phone.startsWith('55') || phone.length !== 13) {
      toast({ title: 'Semente inválida', description: 'Use um celular brasileiro completo, ex.: 5541991758392', variant: 'destructive' });
      return;
    }
    const ddd = phone.slice(2, 4);
    // Mantém prefixo de 5 dígitos (9 + 4 dígitos da operadora) e varia os 4 últimos
    const prefix = phone.slice(0, 9); // 55 + DDD + 9 + XXXX
    const baseTail = parseInt(phone.slice(9), 10); // últimos 4 dígitos
    const max = Math.min(Math.max(seedCount, 1), isAdmin ? 50000 : 2000);
    const set = new Set<string>();
    set.add(phone);
    if (seedMode === 'sequencial') {
      // espalha ±max/2 em torno da semente
      const half = Math.floor(max / 2);
      for (let i = 1; set.size < max && i <= max * 2; i++) {
        const delta = i % 2 === 0 ? i / 2 : -((i + 1) / 2);
        const tail = baseTail + delta;
        if (tail < 0 || tail > 9999) continue;
        set.add(prefix + String(tail).padStart(4, '0'));
      }
    } else {
      // aleatório dentro do mesmo prefixo de operadora
      let guard = 0;
      while (set.size < max && guard < max * 10) {
        const tail = Math.floor(Math.random() * 10000);
        set.add(prefix + String(tail).padStart(4, '0'));
        guard++;
      }
    }
    const arr = Array.from(set);
    setRaw(arr.join('\n'));
    toast({
      title: `${arr.length} números gerados`,
      description: `DDD ${ddd} · prefixo ${prefix.slice(4)}-XXXX. Use Validar lista para conferir.`,
    });
    setTimeout(parsePhones, 50);
  }


  // Carrega cotação USD→BRL automática
  useEffect(() => {
    fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
      .then((r) => r.json())
      .then((d) => {
        const v = parseFloat(d?.USDBRL?.bid);
        if (v > 0) setUsdBrl(v);
      })
      .catch(() => {});
  }, []);

  // Carrega api_key + templates + envios do dia
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: s } = await supabase
        .from('crm_oficial_settings')
        .select('api_key, enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (s?.api_key && s.enabled) setApiKey(s.api_key);
      await refreshTodayCount();
    })();
  }, [user]);

  useEffect(() => { if (apiKey) { void loadTemplates(); void loadChannels(); } }, [apiKey]);

  async function loadChannels() {
    setLoadingChannels(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-channels', data: { apiKey } },
      });
      if (error) throw error;
      const node = data?.results?.channels ?? data?.results ?? data;
      const body = node?.body ?? node;
      const list: any[] = Array.isArray(body) ? body : (body?.data ?? body?.channels ?? []);
      const chs = list
        .filter((c) => (c.kind || 'whatsapp_cloud') === 'whatsapp_cloud' && (c.is_active ?? true))
        .map((c) => ({
          id: String(c.id),
          phone_number_id: String(c.phone_number_id || ''),
          display_phone_number: c.display_phone_number || c.phone || '',
          verified_name: c.verified_name || c.name || '',
        }))
        .filter((c) => c.phone_number_id);
      setChannels(chs);
      if (chs.length && !channelId) setChannelId(chs[0].id);
    } catch (e: any) {
      toast({ title: 'Erro ao carregar canais', description: e.message, variant: 'destructive' });
    } finally { setLoadingChannels(false); }
  }

  async function refreshTodayCount() {
    if (!user) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'lead_capture')
      .gte('created_at', start.toISOString());
    setTodaySent(count || 0);
  }

  async function loadTemplates() {
    setLoadingTpl(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-templates', data: { apiKey, limit: 250 } },
      });
      if (error) throw error;
      // Response: { results: { templates: { ok, status, body: { data:[...] } } } }
      const node = data?.results?.templates ?? data?.results ?? data;
      const body = node?.body ?? node;
      const list: any[] = Array.isArray(body)
        ? body
        : (body?.data ?? body?.templates ?? body?.results ?? []);
      const tpls = list
        .filter((t) => (t.status || '').toUpperCase() === 'APPROVED')
        .map((t) => ({
          id: String(t.id || t.name),
          name: String(t.name),
          language: t.language || 'pt_BR',
          status: t.status,
          category: (t.category || 'UTILITY').toUpperCase(),
        }));
      setTemplates(tpls);
      if (tpls.length === 0) {
        toast({ title: 'Nenhum template aprovado', description: 'Crie/aprove um template na aba Templates.', variant: 'destructive' });
      }

    } catch (e: any) {
      toast({ title: 'Erro ao carregar templates', description: e.message, variant: 'destructive' });
    } finally { setLoadingTpl(false); }
  }

  function parsePhones() {
    const tokens = raw.split(/[\s,;\n]+/).filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    const bad: { raw: string; reason: string }[] = [];
    let dup = 0;
    for (const t of tokens) {
      const { phone, reason } = normalize(t);
      if (!phone) { bad.push({ raw: t, reason: reason || 'inválido' }); continue; }
      if (seen.has(phone)) { dup++; continue; }
      seen.add(phone); valid.push(phone);
    }
    setPhones(valid); setInvalid(bad); setDuplicates(dup);
    toast({ title: 'Lista processada', description: `${valid.length} válidos · ${bad.length} inválidos · ${dup} duplicados` });
  }

  async function handleFile(file: File) {
    const text = await file.text();
    setRaw(text);
    setTimeout(parsePhones, 50);
  }

  const selectedTpl = useMemo(() => templates.find((t) => t.name === templateName), [templates, templateName]);
  const isMarketing = (selectedTpl?.category || '').toUpperCase() === 'MARKETING';
  const rateBrl = (isMarketing ? RATE_USD_MARKETING : RATE_USD_UTILITY) * usdBrl;

  // Quantos podemos enviar respeitando o limite
  const allowedCount = Math.min(phones.length, remaining);
  const estCost = allowedCount * rateBrl;
  const wouldHitLimit = phones.length > remaining;

  function openConfirm() {
    if (!templateName) return toast({ title: 'Selecione um template', variant: 'destructive' });
    if (phones.length === 0) return toast({ title: 'Sem números válidos', variant: 'destructive' });
    if (!consent) return toast({ title: 'Confirme a consciência sobre disparo frio', variant: 'destructive' });
    if (allowedCount === 0) return toast({ title: 'Limite diário atingido', description: `${todaySent}/${DAILY_LIMIT_NON_ADMIN} envios hoje.`, variant: 'destructive' });
    setConfirmOpen(true);
  }

  async function send() {
    setConfirmOpen(false);
    setSending(true); cancelRef.current = false; setLogs([]);
    const toSend = phones.slice(0, allowedCount);
    setProgress({ sent: 0, errors: 0, total: toSend.length });

    for (let i = 0; i < toSend.length; i++) {
      if (cancelRef.current) break;
      const number = toSend[i];
      let ok = false; let errMsg: string | undefined;
      try {
        const selCh = channels.find((c) => c.id === channelId);
        const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
          body: {
            action: 'sendTemplate',
            number,
            template_name: templateName,
            language: selectedTpl?.language || 'pt_BR',
            user_id: user?.id,
            channel_id: selCh?.id,
            phone_number_id: selCh?.phone_number_id,
          },
        });
        ok = !error && (data?.success !== false);
        errMsg = error?.message || data?.error || data?.send?.error;
      } catch (e: any) {
        errMsg = e.message;
      }

      // Loga no message_logs (conta cota diária)
      try {
        await supabase.from('message_logs').insert({
          user_id: user?.id,
          customer_phone: number,
          message_type: 'template',
          source: 'lead_capture',
          status: ok ? 'sent' : 'failed',
          error_message: ok ? null : (errMsg || 'erro'),
          metadata: { template: templateName, category: selectedTpl?.category },
        });
      } catch {}

      setLogs((p) => [...p, { phone: number, ok, error: errMsg }]);
      setProgress((p) => ({ ...p, sent: p.sent + (ok ? 1 : 0), errors: p.errors + (ok ? 0 : 1) }));
      await new Promise((r) => setTimeout(r, 1200));
    }
    setSending(false);
    await refreshTodayCount();
    toast({ title: 'Disparo concluído' });
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Captura de Leads Frios — API Oficial</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {isAdmin ? (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Crown className="w-3 h-3 mr-1" />Admin · ilimitado</Badge>
            ) : (
              <Badge variant="outline">Hoje: <strong className="mx-1">{todaySent}</strong>/{DAILY_LIMIT_NON_ADMIN} · restam {remaining}</Badge>
            )}
          </div>
        </div>

        <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/5 text-amber-200">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Aviso: Disparo para números frios</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <div>Você está enviando mensagens para pessoas que <strong>nunca interagiram</strong> com seu WhatsApp. Isso pode:</div>
            <ul className="list-disc pl-5">
              <li>Reduzir a <strong>qualidade do seu número</strong> (verde → amarelo → vermelho).</li>
              <li>Levar a <strong>bloqueio temporário ou permanente</strong> pela Meta.</li>
              <li>Custar mais (categoria <strong>Marketing</strong> obrigatória).</li>
            </ul>
            <div className="pt-1">Recomendado: começar com volumes pequenos (≤100/dia em canal novo), templates relevantes e mensagens com opt-out.</div>
          </AlertDescription>
        </Alert>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" /> Gerador de leads por DDD/prefixo
            </CardTitle>
            <CardDescription>
              Informe um telefone semente (ex.: <code>5541991758392</code>) e o sistema gera centenas/milhares de números
              com o <strong>mesmo DDD e mesmo prefixo de operadora</strong>, variando apenas os últimos 4 dígitos. Validação real
              de existência no WhatsApp é feita no primeiro envio (sem custo de conversa quando o número não existe).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-[1fr_140px_160px_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Telefone semente</Label>
                <Input value={seedPhone} onChange={(e) => setSeedPhone(e.target.value)} placeholder="5541991758392" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantidade</Label>
                <Input type="number" min={1} max={isAdmin ? 50000 : 2000} value={seedCount}
                  onChange={(e) => setSeedCount(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modo</Label>
                <Select value={seedMode} onValueChange={(v: any) => setSeedMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aleatorio">Aleatório (mesmo prefixo)</SelectItem>
                    <SelectItem value="sequencial">Sequencial (em torno da semente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={generateFromSeed} className="sm:self-end">
                <Sparkles className="w-4 h-4 mr-1" /> Gerar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Limite: {isAdmin ? '50.000 (admin)' : '2.000 por geração'}. Os números gerados são preenchidos no campo abaixo
              e validados (DDD + formato celular brasileiro). Para checagem real de existência sem usar a API Oficial,
              não existe método público gratuito da Meta — a validação efetiva acontece quando você dispara o template
              (números inexistentes falham no envio sem gerar custo de conversa cobrada).
            </p>
          </CardContent>
        </Card>

        <Card>

          <CardHeader>
            <CardTitle className="text-base">1. Importar números</CardTitle>
            <CardDescription>Cole os números (qualquer formato) ou faça upload de CSV/TXT. Validamos DDD e formato celular brasileiro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6} placeholder="41999999999&#10;(11) 98888-7777&#10;..." />
            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={parsePhones} variant="secondary" size="sm"><Search className="w-4 h-4 mr-1" />Validar lista</Button>
              <label className="cursor-pointer">
                <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
                <Button asChild variant="outline" size="sm"><span><Upload className="w-4 h-4 mr-1" />Upload CSV/TXT</span></Button>
              </label>
              <Button
                onClick={validateRealWhatsapp}
                variant="outline"
                size="sm"
                disabled={validating || phones.length === 0}
                title="Usa a Evolution API (API Não Oficial) para conferir quais números realmente têm WhatsApp ativo — sem custo de conversa pela Meta."
              >
                {validating
                  ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Checando {validateProgress.done}/{validateProgress.total}</>
                  : <><ShieldCheck className="w-4 h-4 mr-1" />Checar WhatsApp real</>}
              </Button>
              {phones.length > 0 && (
                <>
                  <Badge variant="secondary"><CheckCircle className="w-3 h-3 mr-1" />{phones.length} válidos</Badge>
                  {invalid.length > 0 && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />{invalid.length} inválidos</Badge>}
                  {duplicates > 0 && <Badge variant="outline">{duplicates} duplicados removidos</Badge>}
                  {realCheck && (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      WhatsApp real: {realCheck.valid}/{realCheck.total} · {realCheck.removed} removidos
                    </Badge>
                  )}
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              <ShieldCheck className="inline w-3 h-3 mr-1" />
              "Checar WhatsApp real" usa sua Evolution conectada (protocolo WhatsApp Web / Baileys — mesma técnica usada por
              ferramentas como umnico.com) para confirmar quem realmente tem conta ativa. Não gera custo de conversa pela Meta
              e remove automaticamente os números inválidos antes do disparo.
            </p>

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Template aprovado</CardTitle>
            <CardDescription>A imagem/vídeo do header é a que está cadastrada no template oficial da Meta (não editável aqui).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Canal de envio (número WhatsApp)</Label>
              <Select value={channelId} onValueChange={setChannelId} disabled={loadingChannels || channels.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingChannels ? 'Carregando canais...' : (channels.length ? 'Selecione o número' : 'Nenhum canal ativo')} />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.verified_name ? `${c.verified_name} · ` : ''}{c.display_phone_number || c.phone_number_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Esse é o número da API Oficial que vai disparar as mensagens. Cadastre mais canais em Conexões.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={templateName} onValueChange={setTemplateName} disabled={loadingTpl}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingTpl ? 'Carregando...' : (templates.length ? 'Selecione' : 'Nenhum template aprovado')} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name} <span className="text-xs text-muted-foreground ml-2">[{t.category}]</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={loadTemplates} disabled={loadingTpl}>
                  {loadingTpl && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Recarregar
                </Button>
              </div>
              {selectedTpl && (
                <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
                  <div className="flex justify-between"><span>Categoria:</span><strong>{isMarketing ? 'Marketing' : 'Utilidade'}</strong></div>
                  <div className="flex justify-between"><span>Idioma:</span><strong>{selectedTpl.language}</strong></div>
                  <div className="flex justify-between"><span>Custo unitário:</span><strong>R$ {rateBrl.toFixed(4)}</strong></div>
                  <div className="text-[10px] text-muted-foreground">Cotação USD→BRL automática: R$ {usdBrl.toFixed(2)}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 flex items-start gap-3">
            <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
            <Label htmlFor="consent" className="text-xs leading-relaxed font-normal">
              Estou ciente de que este é um <strong>disparo para números frios</strong> (sem opt-in prévio), que pode reduzir a qualidade do meu canal,
              gerar bloqueios pela Meta e que sou o único responsável pelo conteúdo enviado.
            </Label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 items-center">
          {wouldHitLimit && !isAdmin && (
            <span className="text-xs text-amber-400">Apenas {allowedCount} serão enviados (limite diário).</span>
          )}
          {sending && <Button variant="destructive" onClick={() => (cancelRef.current = true)}>Cancelar</Button>}
          <Button onClick={openConfirm} disabled={sending || allowedCount === 0 || !templateName || !consent} size="lg">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar para {allowedCount}
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

        {invalid.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Números descartados ({invalid.length})</CardTitle></CardHeader>
            <CardContent className="max-h-40 overflow-auto text-xs space-y-1">
              {invalid.slice(0, 200).map((x, i) => (
                <div key={i} className="flex justify-between border-b py-1">
                  <span>{x.raw}</span><span className="text-muted-foreground">{x.reason}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar disparo</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>Template: <strong>{templateName}</strong> · <Badge variant="outline" className="ml-1">{isMarketing ? 'Marketing' : 'Utilidade'}</Badge></div>
                  <div>Destinatários: <strong>{allowedCount}</strong>{wouldHitLimit && !isAdmin && <span className="text-amber-400"> (cortado pelo limite diário)</span>}</div>
                  <div className="text-lg">Custo estimado: <strong className="text-primary">R$ {estCost.toFixed(2)}</strong></div>
                  <div className="text-xs text-muted-foreground">Cotação automática R$ {usdBrl.toFixed(2)} · R$ {rateBrl.toFixed(4)}/msg</div>
                  <div className="text-xs">Intervalo de 1.2s entre envios para reduzir bloqueios.</div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={send}>Confirmar e enviar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
