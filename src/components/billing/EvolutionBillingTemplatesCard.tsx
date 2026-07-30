import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Save, Loader2, FileText, Image as ImageIcon, Link2, X, Plus, Trash2, AlertTriangle,
} from 'lucide-react';

export interface BillingTemplate {
  id?: string;
  user_id?: string;
  label: string;
  days_offset: number;
  is_enabled: boolean;
  message: string;
  image_url: string | null;
  button_enabled: boolean;
  button_label: string | null;
  button_url: string | null;
  sort_order: number;
}

export const offsetLabel = (o: number) => {
  if (o > 1) return `Vence em ${o} dias`;
  if (o === 1) return 'Vence amanhã';
  if (o === 0) return 'Vence hoje';
  if (o === -1) return 'Venceu ontem';
  return `Venceu há ${Math.abs(o)} dias`;
};

const DEFAULT_TEMPLATES: BillingTemplate[] = [
  { label: 'Vence amanhã', days_offset: 1, is_enabled: false, message: 'Olá *{{nome}}*! Sua assinatura vence *amanhã* ({{vencimento}}).', image_url: null, button_enabled: false, button_label: 'Renovar agora', button_url: null, sort_order: 0 },
  { label: 'Vence hoje', days_offset: 0, is_enabled: false, message: 'Olá *{{nome}}*! Sua assinatura vence *hoje* ({{vencimento}}).', image_url: null, button_enabled: false, button_label: 'Renovar agora', button_url: null, sort_order: 1 },
  { label: 'Venceu ontem', days_offset: -1, is_enabled: false, message: 'Olá *{{nome}}*! Sua assinatura *venceu* em {{vencimento}}.', image_url: null, button_enabled: false, button_label: 'Renovar agora', button_url: null, sort_order: 2 },
];

export function EvolutionBillingTemplatesCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [templates, setTemplates] = useState<BillingTemplate[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [changed, setChanged] = useState(false);

  const { data: dbRules, isLoading } = useQuery({
    queryKey: ['evo-billing-rules', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('evolution_billing_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BillingTemplate[];
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (dbRules) setTemplates(dbRules.length ? dbRules : DEFAULT_TEMPLATES);
    setChanged(false);
  }, [dbRules]);

  const update = (idx: number, patch: Partial<BillingTemplate>) => {
    setTemplates(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setChanged(true);
  };

  const addTemplate = () => {
    setTemplates(prev => [...prev, {
      label: 'Nova mensagem',
      days_offset: prev.length ? Math.min(...prev.map(r => r.days_offset)) - 1 : 0,
      is_enabled: false,
      message: 'Olá *{{nome}}*! Sua assinatura venceu em {{vencimento}}.',
      image_url: null,
      button_enabled: false,
      button_label: 'Renovar agora',
      button_url: null,
      sort_order: prev.length,
    }]);
    setChanged(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Sem usuário');
      const { error: delErr } = await supabase
        .from('evolution_billing_rules')
        .delete()
        .eq('user_id', user.id);
      if (delErr) throw delErr;

      if (templates.length) {
        const { error: insErr } = await supabase.from('evolution_billing_rules').insert(
          templates.map((r, i) => ({
            user_id: user.id,
            label: r.label?.trim() || offsetLabel(r.days_offset),
            days_offset: Number(r.days_offset) || 0,
            is_enabled: r.is_enabled,
            message: r.message || '',
            image_url: r.image_url?.trim() || null,
            button_enabled: r.button_enabled,
            button_label: r.button_label?.trim() || 'Renovar agora',
            button_url: r.button_url?.trim() || null,
            sort_order: i,
          })),
        );
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast({ title: 'Modelos salvos!', description: 'Suas mensagens foram atualizadas.' });
      qc.invalidateQueries({ queryKey: ['evo-billing-rules'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleUpload = async (idx: number, file: File) => {
    if (!user?.id) return;
    setUploadingIdx(idx);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/billing-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('evolution-media')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from('evolution-media')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = signed?.signedUrl;
      if (!url) throw new Error('Falha ao gerar URL');
      update(idx, { image_url: url });
      toast({ title: 'Imagem carregada!', description: 'Lembre de salvar.' });
    } catch (e: any) {
      toast({ title: 'Erro upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploadingIdx(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-border/50 border-l-4 border-l-sky-500">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-500" />
              Modelos de Mensagem (API Não Oficial)
            </CardTitle>
            <CardDescription className="mt-1">
              Crie e edite aqui suas mensagens, com imagem e botão. Elas só são disparadas automaticamente
              se você marcar “Usar no disparo automático”.
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addTemplate}>
            <Plus className="w-4 h-4 mr-1" /> Nova
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p>
            <strong>Variáveis:</strong>{' '}
            <code>{'{{nome}}'}</code>, <code>{'{{vencimento}}'}</code>, <code>{'{{telefone}}'}</code>,{' '}
            <code>{'{{valor}}'}</code>, <code>{'{{usuario}}'}</code>, <code>{'{{plano}}'}</code>,{' '}
            <code>{'{{status}}'}</code>, <code>{'{{telas}}'}</code>, <code>{'{{servidor}}'}</code>,{' '}
            <code>{'{{link}}'}</code>
          </p>
        </div>

        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
            Nenhum modelo criado. Clique em “Nova”.
          </p>
        )}

        {templates.map((r, idx) => (
          <div key={idx} className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Input
                className="h-9 font-medium"
                value={r.label}
                placeholder="Nome da mensagem"
                onChange={e => update(idx, { label: e.target.value })}
              />
              <Button
                type="button" variant="ghost" size="icon"
                className="h-9 w-9 text-destructive"
                onClick={() => { setTemplates(prev => prev.filter((_, i) => i !== idx)); setChanged(true); }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2">
              <Label className="text-xs font-medium">Usar no disparo automático</Label>
              <Switch checked={r.is_enabled} onCheckedChange={v => update(idx, { is_enabled: v })} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
              <div>
                <Label className="text-xs mb-1 block">Dias em relação ao vencimento</Label>
                <Input
                  type="number"
                  value={r.days_offset}
                  onChange={e => update(idx, { days_offset: Number(e.target.value) || 0 })}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:mt-5">
                {offsetLabel(r.days_offset)} — use positivo para antes do vencimento e negativo para vencidos.
              </p>
            </div>

            <Textarea
              rows={3}
              className="text-sm"
              value={r.message}
              onChange={e => update(idx, { message: e.target.value })}
            />

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs font-medium">
                <ImageIcon className="w-3.5 h-3.5" /> Imagem desta mensagem (opcional)
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="https://... (cole uma URL ou faça upload)"
                  value={r.image_url || ''}
                  onChange={e => update(idx, { image_url: e.target.value })}
                  className="flex-1 h-9"
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={uploadingIdx === idx} asChild>
                    <label className="cursor-pointer">
                      {uploadingIdx === idx ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                      <span className="ml-1">Upload</span>
                      <input
                        type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(idx, f); e.target.value = ''; }}
                      />
                    </label>
                  </Button>
                  {r.image_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => update(idx, { image_url: null })}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              {r.image_url && <img src={r.image_url} alt="pré-visualização" className="max-h-28 rounded border border-border/50" />}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <Link2 className="w-3.5 h-3.5" /> Botão “Renovar” no final
                </Label>
                <Switch checked={r.button_enabled} onCheckedChange={v => update(idx, { button_enabled: v })} />
              </div>
              {r.button_enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    className="h-9" placeholder="Texto do botão"
                    value={r.button_label || ''}
                    onChange={e => update(idx, { button_label: e.target.value })}
                  />
                  <Input
                    className="h-9" placeholder="https://seusite.com/renovar"
                    value={r.button_url || ''}
                    onChange={e => update(idx, { button_url: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>
        ))}

        <Button onClick={() => save.mutate()} disabled={!changed || save.isPending} className="w-full">
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar modelos
        </Button>
      </CardContent>
    </Card>
  );
}

export default EvolutionBillingTemplatesCard;
