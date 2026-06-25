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
import { Clock, Save, Loader2, Zap, Timer, AlertTriangle, Send, Image as ImageIcon, Link2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface EvoSchedule {
  id: string;
  user_id: string;
  is_enabled: boolean;
  send_time: string;
  send_d_minus_1: boolean;
  send_d0: boolean;
  send_d_plus_1: boolean;
  message_d_minus_1: string;
  message_d0: string;
  message_d_plus_1: string;
  min_delay_seconds: number;
  max_delay_seconds: number;
  last_run_at: string | null;
  last_run_status: string | null;
  image_url: string | null;
  renew_button_enabled: boolean;
  renew_button_label: string | null;
  renew_button_url: string | null;
}

export function EvolutionBillingScheduleCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [sendTime, setSendTime] = useState('09:00');
  const [d1, setD1] = useState(true);
  const [d0, setD0] = useState(true);
  const [dp1, setDp1] = useState(true);
  const [msgD1, setMsgD1] = useState('');
  const [msgD0, setMsgD0] = useState('');
  const [msgDp1, setMsgDp1] = useState('');
  const [minDelay, setMinDelay] = useState(15);
  const [maxDelay, setMaxDelay] = useState(30);
  const [imageUrl, setImageUrl] = useState('');
  const [btnEnabled, setBtnEnabled] = useState(false);
  const [btnLabel, setBtnLabel] = useState('Renovar agora');
  const [btnUrl, setBtnUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [changed, setChanged] = useState(false);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['evo-billing-schedule', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('evolution_billing_schedule')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as EvoSchedule | null;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (schedule) {
      setEnabled(schedule.is_enabled);
      setSendTime(schedule.send_time.substring(0, 5));
      setD1(schedule.send_d_minus_1);
      setD0(schedule.send_d0);
      setDp1(schedule.send_d_plus_1);
      setMsgD1(schedule.message_d_minus_1 || '');
      setMsgD0(schedule.message_d0 || '');
      setMsgDp1(schedule.message_d_plus_1 || '');
      setMinDelay(schedule.min_delay_seconds ?? 15);
      setMaxDelay(schedule.max_delay_seconds ?? 30);
      setImageUrl(schedule.image_url || '');
      setBtnEnabled(!!schedule.renew_button_enabled);
      setBtnLabel(schedule.renew_button_label || 'Renovar agora');
      setBtnUrl(schedule.renew_button_url || '');
    }
    setChanged(false);
  }, [schedule]);

  useEffect(() => { setChanged(true); },
    [enabled, sendTime, d1, d0, dp1, msgD1, msgD0, msgDp1, minDelay, maxDelay, imageUrl, btnEnabled, btnLabel, btnUrl]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Sem usuário');
      const payload = {
        user_id: user.id,
        is_enabled: enabled,
        send_time: `${sendTime}:00`,
        send_d_minus_1: d1,
        send_d0: d0,
        send_d_plus_1: dp1,
        message_d_minus_1: msgD1,
        message_d0: msgD0,
        message_d_plus_1: msgDp1,
        min_delay_seconds: Math.max(5, minDelay),
        max_delay_seconds: Math.max(minDelay, maxDelay),
        image_url: imageUrl.trim() || null,
        renew_button_enabled: btnEnabled,
        renew_button_label: btnLabel.trim() || 'Renovar agora',
        renew_button_url: btnUrl.trim() || null,
      };
      if (schedule) {
        const { error } = await supabase
          .from('evolution_billing_schedule')
          .update(payload).eq('id', schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('evolution_billing_schedule')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Salvo!', description: 'Cobrança via Evolution atualizada.' });
      qc.invalidateQueries({ queryKey: ['evo-billing-schedule'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const sendNow = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Sem usuário');
      const { data, error } = await supabase.functions.invoke('scheduled-billing-evolution', {
        body: { force: true, userId: user.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const r = data?.results?.[0];
      toast({
        title: 'Disparo concluído',
        description: r ? `${r.sent} enviadas, ${r.errors} erros` : 'Sem clientes para envio agora.',
      });
      qc.invalidateQueries({ queryKey: ['evo-billing-schedule'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleUpload = async (file: File) => {
    if (!user?.id) return;
    setUploading(true);
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
      setImageUrl(url);
      toast({ title: 'Imagem carregada!', description: 'Lembre de Salvar.' });
    } catch (e: any) {
      toast({ title: 'Erro upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
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
    <Card className="glass-card border-border/50 border-l-4 border-l-emerald-500">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Cobrança Automática via API Não Oficial
            </CardTitle>
            <CardDescription className="mt-1">
              Envia mensagens (com imagem e botão de renovação) pela sua instância Evolution
            </CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className={cn('space-y-5 transition-opacity', !enabled && 'opacity-50 pointer-events-none')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4" />Horário</Label>
              <Input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-2"><Timer className="w-4 h-4" />Delay mín (s)</Label>
              <Input type="number" min={5} max={300} value={minDelay} onChange={e => setMinDelay(Number(e.target.value) || 15)} />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-2"><Timer className="w-4 h-4" />Delay máx (s)</Label>
              <Input type="number" min={5} max={300} value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value) || 30)} />
            </div>
          </div>

          <div className="text-xs text-muted-foreground flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p>Intervalo recomendado: 15-30s para evitar banimento.</p>
              <p>
                <strong>Variáveis:</strong>{' '}
                <code>{'{{nome}}'}</code>, <code>{'{{vencimento}}'}</code>, <code>{'{{telefone}}'}</code>,{' '}
                <code>{'{{valor}}'}</code>, <code>{'{{usuario}}'}</code>, <code>{'{{plano}}'}</code>,{' '}
                <code>{'{{status}}'}</code>, <code>{'{{telas}}'}</code>, <code>{'{{servidor}}'}</code>,{' '}
                <code>{'{{link}}'}</code>
              </p>
            </div>
          </div>

          {/* Image attachment */}
          <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <ImageIcon className="w-4 h-4" /> Imagem anexada à mensagem (opcional)
            </Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="https://... (cole uma URL ou faça upload)"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  asChild
                >
                  <label className="cursor-pointer">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                    <span className="ml-1">Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
                    />
                  </label>
                </Button>
                {imageUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl('')}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            {imageUrl && (
              <img src={imageUrl} alt="preview" className="max-h-32 rounded border border-border/50" />
            )}
          </div>

          {/* Renew button */}
          <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="w-4 h-4" /> Botão "Renovar" (link no final da mensagem)
              </Label>
              <Switch checked={btnEnabled} onCheckedChange={setBtnEnabled} />
            </div>
            {btnEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="Texto do botão (ex: Renovar agora)"
                  value={btnLabel}
                  onChange={e => setBtnLabel(e.target.value)}
                />
                <Input
                  placeholder="https://seusite.com/renovar"
                  value={btnUrl}
                  onChange={e => setBtnUrl(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-warning/40 bg-warning/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-warning">D-1 — Vencem amanhã</span>
                <Switch checked={d1} onCheckedChange={setD1} />
              </div>
              {d1 && <Textarea rows={3} value={msgD1} onChange={e => setMsgD1(e.target.value)} className="text-sm" />}
            </div>
            <div className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-primary">D0 — Vencem hoje</span>
                <Switch checked={d0} onCheckedChange={setD0} />
              </div>
              {d0 && <Textarea rows={3} value={msgD0} onChange={e => setMsgD0(e.target.value)} className="text-sm" />}
            </div>
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-destructive">D+1 — Venceram ontem</span>
                <Switch checked={dp1} onCheckedChange={setDp1} />
              </div>
              {dp1 && <Textarea rows={3} value={msgDp1} onChange={e => setMsgDp1(e.target.value)} className="text-sm" />}
            </div>
          </div>
        </div>

        {schedule?.last_run_at && (
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40">
            Última execução: {format(new Date(schedule.last_run_at), 'dd/MM/yyyy HH:mm')} — {schedule.last_run_status}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => save.mutate()} disabled={!changed || save.isPending} className="flex-1">
            {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar configuração
          </Button>
          <Button
            variant="secondary"
            onClick={() => sendNow.mutate()}
            disabled={sendNow.isPending || changed}
            className="flex-1"
            title={changed ? 'Salve antes de enviar' : 'Enviar agora (reenvia mesmo se já foi)'}
          >
            {sendNow.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar agora (Reenviar)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
