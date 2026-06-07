import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2, BookOpen, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface KbEntry {
  id: string;
  user_id: string;
  title: string;
  category: string;
  keywords: string[];
  response_template: string;
  requires_human: boolean;
  is_enabled: boolean;
  sort_order: number;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'renovacao', label: '🔄 Renovação' },
  { value: 'pagamento', label: '💳 Pagamento' },
  { value: 'instalar_app', label: '📱 Instalar App' },
  { value: 'suporte', label: '🛠 Suporte' },
  { value: 'outros', label: '💬 Outros' },
];

const STARTER_ENTRIES: Omit<KbEntry, 'id' | 'user_id' | 'sort_order'>[] = [
  {
    title: 'Cliente quer renovar',
    category: 'renovacao',
    keywords: ['renovar', 'renovação', 'renovacao', 'pix', 'pagar', 'pagamento'],
    response_template: 'Olá! 😊 Para renovar é só acessar nosso site: https://SEU-SITE.com\nLá você gera o PIX automaticamente e a sua assinatura é liberada na hora. Qualquer dúvida estou por aqui!',
    requires_human: false,
    is_enabled: true,
  },
  {
    title: 'Como instalar na LG / Samsung',
    category: 'instalar_app',
    keywords: ['lg', 'samsung', 'smart tv', 'instalar', 'app', 'aplicativo'],
    response_template: 'Para instalar na sua TV LG/Samsung, baixe o aplicativo *XCloud TV* na loja da TV. Depois me envie seu MAC ou e-mail que eu ativo. ✅',
    requires_human: false,
    is_enabled: true,
  },
  {
    title: 'Problema técnico / suporte humano',
    category: 'suporte',
    keywords: ['não funciona', 'parou', 'travando', 'sem sinal', 'erro', 'bug', 'problema'],
    response_template: '',
    requires_human: true,
    is_enabled: true,
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function KnowledgeBaseDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<KbEntry[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    supabase
      .from('ai_knowledge_entries' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
          return;
        }
        setEntries((data || []) as unknown as KbEntry[]);
      });
  }, [open, user, toast]);

  const seedStarter = async () => {
    if (!user) return;
    setSaving(true);
    const rows = STARTER_ENTRIES.map((e, i) => ({ ...e, user_id: user.id, sort_order: i }));
    const { data, error } = await supabase.from('ai_knowledge_entries' as any).insert(rows).select();
    setSaving(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setEntries((data || []) as unknown as KbEntry[]);
    toast({ title: '✅ Exemplos criados — edite com suas informações reais' });
  };

  const addBlank = () => {
    if (!user) return;
    setEntries(prev => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        user_id: user.id,
        title: 'Nova entrada',
        category: 'outros',
        keywords: [],
        response_template: '',
        requires_human: false,
        is_enabled: true,
        sort_order: prev.length,
      },
    ]);
  };

  const updateEntry = (id: string, patch: Partial<KbEntry>) => {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
  };

  const removeEntry = async (id: string) => {
    if (id.startsWith('new-')) {
      setEntries(prev => prev.filter(e => e.id !== id));
      return;
    }
    const { error } = await supabase.from('ai_knowledge_entries' as any).delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Upsert each: new ids replaced
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const payload = {
          user_id: user.id,
          title: e.title.trim() || 'Sem título',
          category: e.category,
          keywords: e.keywords.map(k => k.trim()).filter(Boolean),
          response_template: e.response_template,
          requires_human: e.requires_human,
          is_enabled: e.is_enabled,
          sort_order: i,
        };
        if (e.id.startsWith('new-')) {
          await supabase.from('ai_knowledge_entries' as any).insert(payload);
        } else {
          await supabase.from('ai_knowledge_entries' as any).update(payload).eq('id', e.id);
        }
      }
      toast({ title: '✅ Base de conhecimento salva' });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: String((err as Error).message), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-4 bg-background border-border">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" /> Base de Conhecimento da IA
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              A IA consulta essas entradas para responder seus clientes. Quando o cliente manda algo que combina com uma entrada, ela responde com o texto pronto.
              Marque "precisa de humano" para temas que devem ir pra aba <b>Suporte</b> sem auto-resposta.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-auto mt-3 space-y-2 pr-1">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <div className="text-sm text-muted-foreground">Nenhuma entrada ainda.</div>
              <Button size="sm" onClick={seedStarter} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                Criar exemplos iniciais
              </Button>
              <div className="text-[11px] text-muted-foreground">ou</div>
              <Button size="sm" variant="outline" onClick={addBlank}><Plus className="w-3.5 h-3.5 mr-1" /> Criar do zero</Button>
            </div>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="rounded-md border border-border p-2 space-y-2 bg-card">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={e.title}
                    onChange={(ev) => updateEntry(e.id, { title: ev.target.value })}
                    className="h-7 text-xs font-medium flex-1"
                    placeholder="Título (ex: Cliente quer renovar)"
                  />
                  <select
                    value={e.category}
                    onChange={(ev) => updateEntry(e.id, { category: ev.target.value })}
                    className="h-7 text-[11px] rounded-md border border-border bg-background px-1"
                  >
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <input type="checkbox" checked={e.is_enabled} onChange={(ev) => updateEntry(e.id, { is_enabled: ev.target.checked })} className="h-3 w-3" />
                    Ativo
                  </label>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeEntry(e.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Input
                  value={e.keywords.join(', ')}
                  onChange={(ev) => updateEntry(e.id, { keywords: ev.target.value.split(',').map(k => k.trim()) })}
                  className="h-7 text-xs"
                  placeholder="Palavras-chave separadas por vírgula (ex: renovar, pix, pagar)"
                />
                {e.requires_human ? (
                  <div className="text-[11px] text-amber-600 bg-amber-500/10 rounded-md p-2 border border-amber-500/30">
                    🛠 Quando bater, a conversa vai pra aba <b>Suporte</b> e nenhuma resposta automática é enviada.
                  </div>
                ) : (
                  <textarea
                    value={e.response_template}
                    onChange={(ev) => updateEntry(e.id, { response_template: ev.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-border bg-background p-2 text-xs"
                    placeholder="Resposta automática que será enviada (ex: 'Para renovar acesse https://...')"
                  />
                )}
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={e.requires_human} onChange={(ev) => updateEntry(e.id, { requires_human: ev.target.checked })} className="h-3 w-3" />
                  Esta entrada precisa de atendimento humano (vai pra aba Suporte)
                </label>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border mt-2">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addBlank}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar</Button>
            {entries.length === 0 && !loading && (
              <Button size="sm" variant="outline" onClick={seedStarter} disabled={saving}>Criar exemplos</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
              Salvar tudo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
