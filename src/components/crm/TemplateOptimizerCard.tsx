import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles, ShieldCheck, AlertTriangle, Wand2, Plus, Info, Image as ImageIcon } from 'lucide-react';

export interface OptimizedTemplate {
  name: string;
  category: string;
  language: string;
  header?: { type: 'NONE' | 'TEXT' | 'IMAGE'; text?: string };
  imagePrompt?: string;
  imageUrl?: string;
  body: string;
  footer?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone?: string }>;
  variables?: Array<{ name: string; example?: string }>;
  risk?: string;
  reasoning?: string;
  warnings?: string[];
}


// Renderiza a formatação do WhatsApp (*negrito*, _itálico_) e destaca variáveis
function renderWhatsApp(text: string) {
  const parts = String(text).split(/(\*[^*\n]+\*|_[^_\n]+_|\{\{[a-zA-Z0-9_]+\}\})/g);
  return parts.map((p, i) => {
    if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_\n]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^\{\{[a-zA-Z0-9_]+\}\}$/.test(p))
      return <span key={i} className="rounded bg-violet-500/20 px-1 font-mono text-[11px] text-violet-300">{p}</span>;
    return <span key={i}>{p}</span>;
  });
}


const riskStyle: Record<string, string> = {
  LOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  HIGH: 'border-red-500/30 bg-red-500/10 text-red-400',
};

const VARIABLES: Array<{ name: string; label: string }> = [
  { name: 'nome', label: 'Nome do cliente' },
  { name: 'vencimento', label: 'Data de vencimento' },
  { name: 'valor', label: 'Valor' },
  { name: 'plano', label: 'Plano' },
  { name: 'usuario', label: 'Usuário' },
  { name: 'senha', label: 'Senha' },
  { name: 'link', label: 'Link de pagamento' },
  { name: 'data', label: 'Data' },
];

const IMAGE_STYLES: Array<{ id: string; label: string }> = [
  { id: 'moderno', label: 'Moderno 3D' },
  { id: 'minimalista', label: 'Minimalista' },
  { id: 'neon', label: 'Neon' },
  { id: 'corporativo', label: 'Corporativo' },
];

export default function TemplateOptimizerCard({ onUse }: { onUse: (t: OptimizedTemplate) => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lowRiskLoading, setLowRiskLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [imageStyle, setImageStyle] = useState('moderno');

  const [result, setResult] = useState<OptimizedTemplate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (name: string) => {
    const token = `{{${name}}}`;
    const el = textareaRef.current;
    if (!el) {
      setMessage(m => m + token);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const optimize = async (targetRisk?: 'LOW') => {
    if (!message.trim()) return;
    const setBusy = targetRisk === 'LOW' ? setLowRiskLoading : setLoading;
    setBusy(true);
    setNotice(null);
    if (!targetRisk) setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('template-optimizer', {
        body: { message, targetRisk },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const tpl = data.template as OptimizedTemplate;
      setResult(r => (targetRisk === 'LOW' && r?.imageUrl ? { ...tpl, imageUrl: r.imageUrl, header: { type: 'IMAGE', text: tpl.header?.text } } : tpl));
      if (data?.notice) setNotice(data.notice as string);
      if (targetRisk === 'LOW') toast({ title: 'Nova versão de risco baixo gerada' });
    } catch (e: any) {
      toast({ title: 'Não foi possível otimizar', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const generateImage = async () => {
    if (!result) return;
    setImgLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('template-optimizer', {
        body: {
          action: 'generate-image',
          imageStyle,
          imagePrompt: result.imagePrompt || result.header?.text || result.name,
          imageText: result.header?.text || result.body,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao gerar imagem');
      setResult(r => (r ? { ...r, imageUrl: data.imageUrl, header: { type: 'IMAGE', text: r.header?.text } } : r));
      if (data?.notice) setNotice(data.notice as string);
      toast({
        title: data?.fallback ? 'Banner local gerado' : 'Imagem gerada',
        description: 'Ela será anexada ao cabeçalho do template.',
      });

    } catch (e: any) {
      toast({ title: 'Não foi possível gerar a imagem', description: e.message, variant: 'destructive' });
    } finally {
      setImgLoading(false);
    }
  };



  return (
    <Card className="border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-card to-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" /> Otimizador para categoria UTILITY
        </CardTitle>
        <CardDescription>
          Cole sua mensagem. A IA reescreve no padrão transacional da Meta para ser aprovada como UTILITY (e não MARKETING).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          ref={textareaRef}
          rows={4}
          placeholder="Ex.: Olá {{nome}}, sua assinatura vence em {{vencimento}}."
          value={message}
          onChange={e => setMessage(e.target.value)}
        />

        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Clique para inserir variáveis na posição do cursor:</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map(v => (
              <button
                key={v.name}
                type="button"
                title={v.label}
                onClick={() => insertVariable(v.name)}
                className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-mono text-violet-300 transition hover:bg-violet-500/20"
              >
                <Plus className="w-3 h-3" />{`{{${v.name}}}`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => optimize()} disabled={loading || !message.trim()}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Otimizar mensagem
          </Button>
        </div>

        {notice && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{notice}</span>
          </div>
        )}

        {result && (
          <div className="rounded-2xl border border-border/60 bg-background/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                <ShieldCheck className="w-3 h-3 mr-1" /> UTILITY
              </Badge>
              {result.risk && (
                <Badge variant="outline" className={riskStyle[result.risk] || ''}>
                  Risco de rejeição: {result.risk}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground font-mono">{result.name}</span>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-[#0b1a12] p-3 text-sm shadow-inner">
              {result.imageUrl ? (
                <img src={result.imageUrl} alt="Cabeçalho do template" className="mb-2 w-full rounded-lg object-cover" />
              ) : result.header?.type === 'IMAGE' ? (
                <div className="mb-2 flex h-24 items-center justify-center rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 text-[11px] text-emerald-300/80">
                  <ImageIcon className="mr-1.5 h-4 w-4" /> Cabeçalho com mídia — gere a imagem abaixo
                </div>
              ) : null}

              {result.header?.type === 'TEXT' && result.header.text && (
                <div className="mb-1.5 text-sm font-semibold text-emerald-300">{result.header.text}</div>
              )}
              <div className="whitespace-pre-wrap leading-relaxed text-foreground/90">{renderWhatsApp(result.body)}</div>
              {result.footer && <div className="mt-2 text-[11px] text-muted-foreground">{result.footer}</div>}
            </div>


            {!!result.buttons?.length && (
              <div className="flex flex-wrap gap-2">
                {result.buttons.map((b, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{b.type}: {b.text}</Badge>
                ))}
              </div>
            )}

            {!!result.variables?.length && (
              <p className="text-xs text-muted-foreground">
                Variáveis: {result.variables.map(v => `{{${v.name}}}${v.example ? ` (ex.: ${v.example})` : ''}`).join(' · ')}
              </p>
            )}

            {result.reasoning && <p className="text-xs text-muted-foreground">{result.reasoning}</p>}

            {!!result.warnings?.length && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Trechos que seriam vistos como MARKETING
                </p>
                <ul className="text-xs text-amber-300/90 list-disc pl-4">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1">Estilo da imagem:</span>
              {IMAGE_STYLES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setImageStyle(s.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    imageStyle === s.id
                      ? 'border-violet-400/60 bg-violet-500/25 text-violet-200'
                      : 'border-border/60 bg-background/40 text-muted-foreground hover:bg-violet-500/10'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={generateImage} disabled={imgLoading}>
                {imgLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-1.5" />}
                {result.imageUrl ? 'Gerar outra imagem' : 'Gerar imagem do cabeçalho'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => optimize('LOW')}
                disabled={lowRiskLoading || loading}
              >
                {lowRiskLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                Gerar versão de risco BAIXO
              </Button>
              <Button variant="outline" size="sm" onClick={() => optimize()} disabled={loading}>Gerar outra versão</Button>
              <Button size="sm" onClick={() => onUse(result)}>Usar este template</Button>
            </div>


          </div>
        )}
      </CardContent>
    </Card>
  );
}
