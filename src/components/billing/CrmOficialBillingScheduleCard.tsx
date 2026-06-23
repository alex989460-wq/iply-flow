import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, Save, Loader2, Zap, AlertTriangle, RefreshCw, FileText, Plus, ExternalLink, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface CrmSchedule {
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
  template_d_minus_1?: string | null;
  template_d0?: string | null;
  template_d_plus_1?: string | null;
  template_lang_d_minus_1?: string | null;
  template_lang_d0?: string | null;
  template_lang_d_plus_1?: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
}

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components?: Array<{ type: string; text?: string; format?: string }>;
}

interface CrmChannel {
  id: string;
  kind?: string;
  name?: string;
  verified_name?: string;
  display_phone_number?: string;
  phone_number?: string;
  phone_number_id?: string;
  primary?: boolean;
  is_primary?: boolean;
  is_active?: boolean;
}

function normalizeTemplates(body: any): MetaTemplate[] {
  const raw = Array.isArray(body)
    ? body
    : Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.templates)
        ? body.templates
        : Array.isArray(body?.items)
          ? body.items
          : [];
  return raw.map((t: any, index: number) => ({
    id: String(t.id || `${t.name || 'template'}-${t.language || 'pt_BR'}-${index}`),
    name: String(t.name || ''),
    status: String(t.status || ''),
    language: String(t.language || 'pt_BR'),
    category: String(t.category || ''),
    components: Array.isArray(t.components) ? t.components : [],
  })).filter((t: MetaTemplate) => t.name);
}

function normalizeChannels(body: any): CrmChannel[] {
  const fromChannels = Array.isArray(body) ? body : Array.isArray(body?.channels) ? body.channels : [];
  const raw = fromChannels.length
    ? fromChannels.filter((c: any) => String(c.kind || c.type || 'whatsapp_cloud').toLowerCase().includes('whatsapp') || c.phone_number_id || c.primary)
    : Array.isArray(body?.whatsapp)
      ? body.whatsapp
      : body?.whatsapp
        ? [body.whatsapp]
        : [];
  return raw.map((c: any, index: number) => ({
    ...c,
    id: String(c.id || c.phone_number_id || (c.primary ? 'primary' : '') || `whatsapp-${index}`),
    kind: c.kind || c.type || 'whatsapp_cloud',
    name: c.name || c.title || c.verified_name || c.display_name,
    verified_name: c.verified_name || c.verifiedName || c.business_name || c.name,
    display_phone_number: c.display_phone_number || c.displayPhoneNumber || c.phone_display,
    phone_number: c.phone_number || c.phone || c.number,
    primary: Boolean(c.primary || c.is_primary || c.id === 'primary'),
    is_active: Boolean(c.is_active ?? c.active ?? c.connected ?? c.primary),
  }));
}

type RowKey = 'd1' | 'd0' | 'dp1';

export function CrmOficialBillingScheduleCard() {
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
  const [tplD1, setTplD1] = useState<string>('');
  const [tplD0, setTplD0] = useState<string>('');
  const [tplDp1, setTplDp1] = useState<string>('');
  const [minDelay, setMinDelay] = useState(15);
  const [maxDelay, setMaxDelay] = useState(30);
  const [changed, setChanged] = useState(false);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['crm-billing-schedule', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from('crm_oficial_billing_schedule')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as CrmSchedule | null;
    },
    enabled: !!user?.id,
  });

  const { data: crmSettings } = useQuery({
    queryKey: ['crm-oficial-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('crm_oficial_settings')
        .select('enabled, api_key')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: templates, isLoading: loadingTpls, refetch: refetchTpls } = useQuery({
    queryKey: ['crm-oficial-templates-list', user?.id, crmSettings?.api_key],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-templates', data: { apiKey: crmSettings?.api_key, limit: 250 } },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao carregar templates');
      const result = data?.results?.templates;
      if (result && !result.ok) throw new Error(`CRM Oficial retornou status ${result.status}`);
      const all = normalizeTemplates(result?.body);
      return all.filter(t => (t.status || '').toUpperCase() === 'APPROVED');
    },
    enabled: !!user?.id && !!crmSettings?.api_key,
    retry: false,
  });

  const { data: channels, isLoading: loadingChannels, refetch: refetchChannels } = useQuery({
    queryKey: ['crm-oficial-channels-billing', user?.id, crmSettings?.api_key],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-channels', data: { apiKey: crmSettings?.api_key } },
      });
      if (error) throw error;
      return normalizeChannels(data?.results?.channels?.body);
    },
    enabled: !!user?.id && !!crmSettings?.api_key,
    retry: false,
  });

  const primaryChannel = useMemo(
    () => channels?.find((c) => c.primary || c.is_primary) || channels?.find((c) => c.is_active) || channels?.[0] || null,
    [channels]
  );

  useEffect(() => {
    if (schedule) {
      setEnabled(schedule.is_enabled);
      setSendTime(schedule.send_time.substring(0, 5));
      setD1(schedule.send_d_minus_1);
      setD0(schedule.send_d0);
      setDp1(schedule.send_d_plus_1);
      setMsgD1(schedule.message_d_minus_1);
      setMsgD0(schedule.message_d0);
      setMsgDp1(schedule.message_d_plus_1);
      // Reconstroi o composite name|language esperado pelo Select.
      const composite = (name?: string | null, lang?: string | null) =>
        name ? `${name}|${lang || 'pt_BR'}` : '';
      setTplD1(composite(schedule.template_d_minus_1, schedule.template_lang_d_minus_1));
      setTplD0(composite(schedule.template_d0, schedule.template_lang_d0));
      setTplDp1(composite(schedule.template_d_plus_1, schedule.template_lang_d_plus_1));
      setMinDelay(schedule.min_delay_seconds);
      setMaxDelay(schedule.max_delay_seconds);
      setChanged(false);
    }
  }, [schedule]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Não autenticado');
      const langOf = (name: string) => templates?.find(t => `${t.name}|${t.language}` === name)?.language || null;
      const nameOf = (composite: string) => composite ? composite.split('|')[0] : null;
      const payload = {
        user_id: user.id,
        is_enabled: enabled,
        send_time: sendTime + ':00',
        send_d_minus_1: d1,
        send_d0: d0,
        send_d_plus_1: dp1,
        message_d_minus_1: msgD1,
        message_d0: msgD0,
        message_d_plus_1: msgDp1,
        template_d_minus_1: nameOf(tplD1),
        template_d0: nameOf(tplD0),
        template_d_plus_1: nameOf(tplDp1),
        template_lang_d_minus_1: langOf(tplD1),
        template_lang_d0: langOf(tplD0),
        template_lang_d_plus_1: langOf(tplDp1),
        min_delay_seconds: minDelay,
        max_delay_seconds: maxDelay,
      };
      const { error } = await (supabase as any)
        .from('crm_oficial_billing_schedule')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-billing-schedule'] });
      setChanged(false);
      toast({ title: 'Salvo', description: 'Configuração de cobrança CRM Oficial atualizada.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const integrationActive = !!crmSettings?.enabled && !!crmSettings?.api_key;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const rows: Array<{ key: RowKey; label: string; on: boolean; setOn: (v: boolean) => void; msg: string; setMsg: (v: string) => void; tpl: string; setTpl: (v: string) => void; }> = [
    { key: 'd1', label: 'D-1 (1 dia antes)', on: d1, setOn: setD1, msg: msgD1, setMsg: setMsgD1, tpl: tplD1, setTpl: setTplD1 },
    { key: 'd0', label: 'D0 (no dia do vencimento)', on: d0, setOn: setD0, msg: msgD0, setMsg: setMsgD0, tpl: tplD0, setTpl: setTplD0 },
    { key: 'dp1', label: 'D+1 (1 dia depois)', on: dp1, setOn: setDp1, msg: msgDp1, setMsg: setMsgDp1, tpl: tplDp1, setTpl: setTplDp1 },
  ];

  return (
    <Card className="border-emerald-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-500" />
          Cobrança via CRM Oficial
          {enabled && integrationActive && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 ml-2">
              ATIVO
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Envia cobranças automáticas via <code className="text-xs">/whatsapp-send</code> usando templates oficiais Meta ou texto livre.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!integrationActive && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              Ative a integração CRM Oficial em <strong>Configurações → CRM Oficial</strong> antes de habilitar este envio.
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div>
            <Label className="font-semibold">Envio automático</Label>
            <p className="text-xs text-muted-foreground">Dispara as cobranças no horário configurado, todos os dias.</p>
          </div>
          <Switch
            checked={enabled}
            disabled={!integrationActive}
            onCheckedChange={(v) => { setEnabled(v); setChanged(true); }}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Horário</Label>
            <Input type="time" value={sendTime} onChange={(e) => { setSendTime(e.target.value); setChanged(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Delay mín. (s)</Label>
            <Input type="number" min={5} value={minDelay} onChange={(e) => { setMinDelay(Number(e.target.value)); setChanged(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Delay máx. (s)</Label>
            <Input type="number" min={5} value={maxDelay} onChange={(e) => { setMaxDelay(Number(e.target.value)); setChanged(true); }} />
          </div>
        </div>

        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" />
            <span>
              <strong>{templates?.length ?? 0}</strong> templates aprovados do CRM Oficial disponíveis
              {loadingTpls && <Loader2 className="w-3 h-3 ml-2 inline animate-spin" />}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" asChild className="h-7 text-xs">
              <Link to="/crm-oficial-templates"><Plus className="w-3 h-3 mr-1" /> Criar/enviar</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => refetchTpls()} disabled={loadingTpls || !crmSettings?.api_key} className="h-7 text-xs">
              <RefreshCw className={cn('w-3 h-3 mr-1', loadingTpls && 'animate-spin')} /> Recarregar
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-xs flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="truncate">
              Canal de envio: <strong>{primaryChannel ? `${primaryChannel.verified_name || primaryChannel.name || 'WhatsApp'}${primaryChannel.display_phone_number || primaryChannel.phone_number ? ` • ${primaryChannel.display_phone_number || primaryChannel.phone_number}` : ''}` : 'nenhum canal WhatsApp encontrado'}</strong>
              {loadingChannels && <Loader2 className="w-3 h-3 ml-2 inline animate-spin" />}
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetchChannels()} disabled={loadingChannels || !crmSettings?.api_key} className="h-7 text-xs">
            <RefreshCw className={cn('w-3 h-3 mr-1', loadingChannels && 'animate-spin')} /> Recarregar canais
          </Button>
        </div>

        {rows.map((row) => {
          const composite = row.tpl;
          const tpl = templates?.find(t => `${t.name}|${t.language}` === composite);
          const bodyText = tpl?.components?.find(c => c.type === 'BODY')?.text;
          const headerImg = (() => {
            const h: any = tpl?.components?.find(c => c.type === 'HEADER' && (c as any).format === 'IMAGE');
            return h?.example?.header_handle?.[0] || h?.example?.header_url?.[0] || null;
          })();
          return (
            <div key={row.key} className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium">{row.label}</Label>
                <Switch checked={row.on} onCheckedChange={(v) => { row.setOn(v); setChanged(true); }} />
              </div>
              <Select value={composite} onValueChange={(v) => { row.setTpl(v); setChanged(true); }} disabled={!row.on}>
                <SelectTrigger><SelectValue placeholder="Selecione um template aprovado…" /></SelectTrigger>
                <SelectContent>
                  {(templates || []).map(t => (
                    <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                      {t.name} <span className="text-[10px] text-muted-foreground ml-1">({t.language})</span>
                    </SelectItem>
                  ))}
                  {(!templates || templates.length === 0) && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      Nenhum template aprovado encontrado. <Link to="/crm-oficial-templates" className="text-emerald-500 inline-flex items-center gap-1">Abrir biblioteca <ExternalLink className="w-3 h-3" /></Link>
                    </div>
                  )}
                </SelectContent>
              </Select>
              {(headerImg || bodyText) && (
                <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs space-y-2">
                  {headerImg && (
                    <img src={headerImg} alt={tpl?.name} className="w-full max-h-40 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  {bodyText && <div className="whitespace-pre-wrap text-muted-foreground">{bodyText}</div>}
                </div>
              )}
            </div>
          );
        })}

        <p className="text-xs text-muted-foreground">
          Os templates seguem os parâmetros aprovados pela Meta. Variáveis disponíveis nos parâmetros: <code>{'{{nome}}'}</code>, <code>{'{{vencimento}}'}</code>, <code>{'{{valor}}'}</code>, <code>{'{{usuario}}'}</code>, <code>{'{{plano}}'}</code>.
        </p>

        {schedule?.last_run_at && (
          <p className="text-xs text-muted-foreground">
            Última execução: {new Date(schedule.last_run_at).toLocaleString('pt-BR')}
            {schedule.last_run_status && <> — <span className={cn(schedule.last_run_status === 'success' ? 'text-emerald-500' : 'text-red-500')}>{schedule.last_run_status}</span></>}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!changed || save.isPending}>
            {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
