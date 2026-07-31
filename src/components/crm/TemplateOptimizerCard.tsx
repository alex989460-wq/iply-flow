import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles, ShieldCheck, AlertTriangle, Wand2 } from 'lucide-react';

export interface OptimizedTemplate {
  name: string;
  category: string;
  language: string;
  body: string;
  footer?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone?: string }>;
  variables?: Array<{ name: string; example?: string }>;
  risk?: string;
  reasoning?: string;
  warnings?: string[];
}

const riskStyle: Record<string, string> = {
  LOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  HIGH: 'border-red-500/30 bg-red-500/10 text-red-400',
};

export default function TemplateOptimizerCard({ onUse }: { onUse: (t: OptimizedTemplate) => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizedTemplate | null>(null);

  const optimize = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('template-optimizer', {
        body: { message },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data.template as OptimizedTemplate);
    } catch (e: any) {
      toast({ title: 'Não foi possível otimizar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
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
          rows={4}
          placeholder="Ex.: Oi João! Sua assinatura vence dia 10/08. Renove agora e continue assistindo sem interrupção."
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <div className="flex justify-end">
          <Button onClick={optimize} disabled={loading || !message.trim()}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Otimizar mensagem
          </Button>
        </div>

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

            <div className="rounded-xl border border-border/40 bg-card/60 p-3 text-sm whitespace-pre-wrap">
              {result.body}
              {result.footer && <div className="mt-2 text-xs text-muted-foreground">{result.footer}</div>}
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

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={optimize} disabled={loading}>Gerar outra versão</Button>
              <Button size="sm" onClick={() => onUse(result)}>Usar este template</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
