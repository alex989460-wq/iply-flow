import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Search, Loader2, Flame, Globe, Phone, MapPin, Save, ListChecks, Trash2, Pencil,
  Download, Send, AlertTriangle, CheckCircle2, BarChart3, MessageSquare,
} from 'lucide-react';

type ScrapedLead = {
  name: string;
  phone: string | null;
  site: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
  whatsapp_available: boolean;
  score: string;
  source_query?: string;
};

const SCORE_META: Record<string, { label: string; className: string }> = {
  quente: { label: '🔥 Quente', className: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
  morno: { label: '🟡 Morno', className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  frio: { label: '⚪ Sem classificação', className: 'bg-muted text-muted-foreground border-border' },
};

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  entregue: 'Entregue',
  respondido: 'Respondido',
  falhou: 'Falhou',
  nao_enviar: 'Não enviar',
  bloqueado: 'Bloqueado',
  contatado: 'Já contatado',
};

function fmtPhone(p?: string | null) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  return p || '—';
}

export default function LeadProspecting() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ScrapedLead[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // filtros
  const [fPhone, setFPhone] = useState(true);
  const [fWhats, setFWhats] = useState<'todos' | 'com' | 'sem'>('todos');
  const [fSite, setFSite] = useState<'todos' | 'com' | 'sem'>('todos');
  const [fScore, setFScore] = useState<'todos' | 'quente' | 'morno' | 'frio'>('todos');
  const [fDup, setFDup] = useState<'todos' | 'novos' | 'duplicados'>('todos');
  const [fCity, setFCity] = useState('todas');
  const [fCategory, setFCategory] = useState('todas');

  const [saveOpen, setSaveOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [targetList, setTargetList] = useState<string>('nova');

  const [activeListId, setActiveListId] = useState<string>('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendText, setSendText] = useState('Olá {{nome}}, tudo bem? ');
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0, fail: 0 });
  const [sendApi, setSendApi] = useState<'evolution' | 'official'>('evolution');
  const [sendInstance, setSendInstance] = useState('');
  const [sendChannelId, setSendChannelId] = useState('');
  const [sendTemplate, setSendTemplate] = useState('');

  // ── canais de envio (não oficial / oficial) ──
  const { data: instances = [] } = useQuery({
    queryKey: ['leads-evo-instances', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('evolution-send', { body: { action: 'list-instances' } });
      if (error) return [];
      return ((data as any)?.instances || []) as Array<{ name: string; phone?: string; state?: string }>;
    },
  });

  const { data: crmSettings } = useQuery({
    queryKey: ['leads-crm-settings', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('crm_oficial_settings').select('api_key, enabled').eq('user_id', user!.id).maybeSingle();
      return data;
    },
  });

  const { data: officialChannels = [] } = useQuery({
    queryKey: ['leads-official-channels', crmSettings?.api_key],
    enabled: !!crmSettings?.api_key && !!crmSettings?.enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-channels', data: { apiKey: crmSettings!.api_key } },
      });
      if (error) return [];
      const body = (data as any)?.results?.channels?.body;
      const raw: any[] = Array.isArray(body) ? body
        : Array.isArray(body?.channels) ? body.channels
        : Array.isArray(body?.data) ? body.data
        : Array.isArray(body?.items) ? body.items : [];
      return raw
        .filter((c: any) => {
          const kind = String(c.kind || c.type || '').toLowerCase();
          if (kind.includes('evolution') || kind.includes('baileys')) return false;
          return !c.evolution_instance_name;
        })
        .map((c: any, i: number) => ({
          id: String(c.phone_number_id || c.phoneNumberId || c.id || `wa-${i}`),
          label: String(c.verified_name || c.name || c.display_phone_number || c.phone || 'Número oficial'),
        }))
        .filter((c: any) => !!c.id);
    },
  });

  const { data: officialTemplates = [] } = useQuery({
    queryKey: ['leads-official-templates', crmSettings?.api_key],
    enabled: sendApi === 'official' && !!crmSettings?.api_key,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('meta-templates', {
        body: { action: 'list', apiKey: crmSettings!.api_key, limit: 250 },
      });
      if (error) return [];
      const body = (data as any)?.data ?? data;
      const list: any[] = Array.isArray(body) ? body : (body?.data ?? body?.templates ?? body?.results ?? []);
      return list
        .filter((t: any) => String(t.status || '').toUpperCase() === 'APPROVED')
        .map((t: any) => ({ name: String(t.name), language: t.language || 'pt_BR' }));
    },
  });

  useEffect(() => {
    if (!sendInstance && (instances as any[]).length) {
      const online = (instances as any[]).find((i: any) => /open|connected|online/i.test(String(i.state || '')));
      setSendInstance((online || (instances as any[])[0]).name);
    }
  }, [instances, sendInstance]);

  useEffect(() => {
    if (!sendChannelId && (officialChannels as any[]).length) setSendChannelId((officialChannels as any[])[0].id);
  }, [officialChannels, sendChannelId]);




  // ── dados persistidos ──
  const { data: lists = [] } = useQuery({
    queryKey: ['lead-lists', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_lists').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: allLeads = [] } = useQuery({
    queryKey: ['leads-all', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('leads').select('*').order('created_at', { ascending: false }).limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: listItems = [] } = useQuery({
    queryKey: ['lead-list-items', activeListId],
    queryFn: async () => {
      if (!activeListId) return [];
      const { data, error } = await (supabase as any)
        .from('lead_list_items').select('*, leads(*)').eq('list_id', activeListId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeListId,
  });

  const knownPhones = useMemo(() => {
    const map = new Map<string, any>();
    for (const l of allLeads as any[]) if (l.phone) map.set(String(l.phone), l);
    return map;
  }, [allLeads]);

  // ── pesquisa ──
  async function runSearch() {
    if (!query.trim()) { toast.error('Digite uma pesquisa. Ex.: bares em Curitiba'); return; }
    setSearching(true);
    setResults([]);
    setSelected({});
    try {
      const { data, error } = await supabase.functions.invoke('google-lead-scraper', {
        body: { query: query.trim(), limit },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const leads: ScrapedLead[] = (data as any).leads || [];
      setResults(leads);
      const pre: Record<string, boolean> = {};
      leads.forEach((l, i) => { if (l.phone && !knownPhones.has(l.phone)) pre[String(i)] = true; });
      setSelected(pre);
      toast.success(`${leads.length} leads encontrados em ${(data as any).city || 'sua pesquisa'}`);
    } catch (e: any) {
      toast.error(e.message || 'Falha na pesquisa de leads');
    } finally {
      setSearching(false);
    }
  }

  const cities = useMemo(() => Array.from(new Set(results.map(r => r.city).filter(Boolean))) as string[], [results]);
  const categories = useMemo(() => Array.from(new Set(results.map(r => r.category).filter(Boolean))) as string[], [results]);

  const filtered = useMemo(() => {
    return results.map((r, i) => ({ ...r, _i: i, _dup: !!(r.phone && knownPhones.has(r.phone)) }))
      .filter(r => {
        if (fPhone && !r.phone) return false;
        if (fWhats === 'com' && !r.whatsapp_available) return false;
        if (fWhats === 'sem' && r.whatsapp_available) return false;
        if (fSite === 'com' && !r.site) return false;
        if (fSite === 'sem' && r.site) return false;
        if (fScore !== 'todos' && r.score !== fScore) return false;
        if (fDup === 'novos' && r._dup) return false;
        if (fDup === 'duplicados' && !r._dup) return false;
        if (fCity !== 'todas' && r.city !== fCity) return false;
        if (fCategory !== 'todas' && r.category !== fCategory) return false;
        return true;
      });
  }, [results, knownPhones, fPhone, fWhats, fSite, fScore, fDup, fCity, fCategory]);

  const selectedRows = filtered.filter(r => selected[String(r._i)]);
  const dupCount = results.filter(r => r.phone && knownPhones.has(r.phone)).length;

  // ── salvar em lista ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Não autenticado');
      if (!selectedRows.length) throw new Error('Selecione ao menos um lead');

      let listId = targetList;
      if (targetList === 'nova') {
        const name = listName.trim() || `${query.trim() || 'Leads'} — ${new Date().toLocaleDateString('pt-BR')}`;
        const { data, error } = await (supabase as any)
          .from('lead_lists').insert({ user_id: user.id, name, status: 'ativa' }).select('id').single();
        if (error) throw error;
        listId = data.id;
      }

      let created = 0, reused = 0;
      for (const row of selectedRows) {
        if (!row.phone) continue;
        const existing = knownPhones.get(row.phone);
        let leadId = existing?.id as string | undefined;
        if (!leadId) {
          const { data, error } = await (supabase as any).from('leads').insert({
            user_id: user.id,
            phone: row.phone,
            name: row.name,
            address: row.address,
            city: row.city,
            category: row.category,
            site: row.site,
            whatsapp_available: row.whatsapp_available,
            score: row.score,
            source_query: query.trim(),
            status: 'pendente',
          }).select('id').single();
          if (error) {
            const { data: found } = await (supabase as any)
              .from('leads').select('id').eq('user_id', user.id).eq('phone', row.phone).maybeSingle();
            leadId = found?.id;
            reused++;
          } else {
            leadId = data.id;
            created++;
          }
        } else {
          reused++;
        }
        if (!leadId) continue;
        await (supabase as any).from('lead_list_items')
          .upsert({ list_id: listId, lead_id: leadId, status: 'pendente' }, { onConflict: 'list_id,lead_id' });
        await (supabase as any).from('lead_history')
          .insert({ lead_id: leadId, action: 'adicionado_lista', result: 'ok', metadata: { list_id: listId, query } });
      }
      return { listId, created, reused };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['lead-lists'] });
      qc.invalidateQueries({ queryKey: ['leads-all'] });
      qc.invalidateQueries({ queryKey: ['lead-list-items'] });
      setSaveOpen(false);
      setListName('');
      setActiveListId(r.listId);
      toast.success(`${r.created} novos leads salvos · ${r.reused} já existiam`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── gestão de listas ──
  const renameMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('lead_lists').update({ name: renameValue.trim() }).eq('id', activeListId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-lists'] }); setRenameOpen(false); toast.success('Lista renomeada'); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from('lead_list_items').delete().eq('list_id', id);
      const { error } = await (supabase as any).from('lead_lists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-lists'] }); setActiveListId(''); toast.success('Lista excluída'); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await (supabase as any).from('lead_list_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-list-items'] }); toast.success('Lead removido da lista'); },
    onError: (e: any) => toast.error(e.message),
  });

  const setLeadStatus = useMutation({
    mutationFn: async ({ leadId, itemId, status }: { leadId: string; itemId: string; status: string }) => {
      await (supabase as any).from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', leadId);
      await (supabase as any).from('lead_list_items').update({ status }).eq('id', itemId);
      await (supabase as any).from('lead_history').insert({ lead_id: leadId, action: 'status', result: status });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-list-items'] });
      qc.invalidateQueries({ queryKey: ['leads-all'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function exportList() {
    const rows = (listItems as any[]).map(it => it.leads).filter(Boolean);
    const header = ['nome', 'telefone', 'whatsapp', 'cidade', 'categoria', 'endereco', 'site', 'classificacao', 'status', 'envios', 'ultimo_envio'];
    const csv = [header.join(';')].concat(rows.map((l: any) => [
      l.name, l.phone, l.whatsapp_available ? 'sim' : 'nao', l.city || '', l.category || '',
      l.address || '', l.site || '', l.score || '', l.status || '', l.send_count ?? 0, l.last_sent_at || '',
    ].map(v => String(v ?? '').replace(/;/g, ',')).join(';'))).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${(lists as any[]).find(l => l.id === activeListId)?.name || 'lista'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── envio ──
  async function sendToPending() {
    const pend = (listItems as any[]).filter(it => it.leads && !['enviado', 'nao_enviar', 'bloqueado'].includes(it.leads.status));
    if (!pend.length) { toast.error('Nenhum contato pendente nesta lista'); return; }
    if (sendApi === 'evolution' && !sendInstance) { toast.error('Selecione o número (instância) de envio'); return; }
    if (sendApi === 'official' && !sendTemplate) { toast.error('Selecione um template aprovado para a API Oficial'); return; }
    if (sendApi === 'evolution' && !sendText.trim()) { toast.error('Digite a mensagem'); return; }
    setSending(true);
    setSendProgress({ done: 0, total: pend.length, fail: 0 });
    let fail = 0;
    for (let i = 0; i < pend.length; i++) {
      const lead = pend[i].leads;
      const text = sendText.replace(/\{\{nome\}\}/gi, lead.name || '').trim();
      try {
        const tpl = (officialTemplates as any[]).find(t => t.name === sendTemplate);
        const { data, error } = sendApi === 'official'
          ? await supabase.functions.invoke('crm-oficial-sync', {
              body: {
                action: 'send-whatsapp',
                data: {
                  phone: lead.phone,
                  name: lead.name,
                  phone_number_id: sendChannelId || undefined,
                  channel_id: sendChannelId || undefined,
                  template_name: sendTemplate,
                  template_language: tpl?.language || 'pt_BR',
                  template_params: [lead.name || ''],
                },
              },
            })
          : await supabase.functions.invoke('evolution-send', {
              body: { action: 'send', phone: lead.phone, text, instance: sendInstance },
            });
        const ok = !error && !(data as any)?.error
          && (sendApi === 'official' ? (data as any)?.results?.send?.ok !== false : true);
        const now = new Date().toISOString();

        await (supabase as any).from('leads').update({
          status: ok ? 'enviado' : 'falhou',
          last_result: ok ? 'ok' : String((data as any)?.error || error?.message || 'falha'),
          first_sent_at: lead.first_sent_at || now,
          last_sent_at: now,
          send_count: (lead.send_count || 0) + 1,
          updated_at: now,
        }).eq('id', lead.id);
        await (supabase as any).from('lead_list_items')
          .update({ status: ok ? 'enviado' : 'falhou', last_sent_at: now }).eq('id', pend[i].id);
        await (supabase as any).from('lead_history')
          .insert({ lead_id: lead.id, action: 'envio', result: ok ? 'enviado' : 'falhou', metadata: { list_id: activeListId } });
        if (!ok) fail++;
      } catch {
        fail++;
      }
      setSendProgress({ done: i + 1, total: pend.length, fail });
      await new Promise(r => setTimeout(r, 1500));
    }
    setSending(false);
    qc.invalidateQueries({ queryKey: ['lead-list-items'] });
    qc.invalidateQueries({ queryKey: ['leads-all'] });
    toast.success(`Envio concluído: ${pend.length - fail} enviados, ${fail} falhas`);
  }

  // ── métricas ──
  const stats = useMemo(() => {
    const arr = allLeads as any[];
    return {
      total: arr.length,
      validos: arr.filter(l => l.phone).length,
      whats: arr.filter(l => l.whatsapp_available).length,
      contatados: arr.filter(l => ['enviado', 'entregue', 'respondido', 'contatado'].includes(l.status)).length,
      pendentes: arr.filter(l => l.status === 'pendente').length,
      enviadas: arr.reduce((s, l) => s + (l.send_count || 0), 0),
      falhas: arr.filter(l => l.status === 'falhou').length,
      respostas: arr.filter(l => l.status === 'respondido').length,
      quentes: arr.filter(l => l.score === 'quente').length,
    };
  }, [allLeads]);

  const listStats = useMemo(() => {
    const items = listItems as any[];
    const leads = items.map(i => i.leads).filter(Boolean);
    return {
      total: leads.length,
      comTelefone: leads.filter(l => l.phone).length,
      validos: leads.filter(l => l.whatsapp_available).length,
      enviados: leads.filter(l => ['enviado', 'entregue', 'respondido'].includes(l.status)).length,
      pendentes: leads.filter(l => l.status === 'pendente').length,
    };
  }, [listItems]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pesquisa" className="space-y-6">
        <TabsList className="bg-card/50 backdrop-blur border border-border/50 rounded-2xl p-1">
          <TabsTrigger value="pesquisa" className="rounded-xl text-xs font-bold uppercase tracking-wide"><Search className="w-3.5 h-3.5 mr-1.5" /> Pesquisa</TabsTrigger>
          <TabsTrigger value="listas" className="rounded-xl text-xs font-bold uppercase tracking-wide"><ListChecks className="w-3.5 h-3.5 mr-1.5" /> Listas</TabsTrigger>
          <TabsTrigger value="painel" className="rounded-xl text-xs font-bold uppercase tracking-wide"><BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Painel</TabsTrigger>
        </TabsList>

        {/* ─────────── PESQUISA ─────────── */}
        <TabsContent value="pesquisa" className="space-y-4">
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl rounded-3xl overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
                    placeholder="Ex.: bares em Curitiba · clínicas odontológicas em Curitiba · academias em Londrina"
                    className="h-12 pl-9 rounded-2xl bg-background/60 border-border/50"
                  />
                </div>
                <Input
                  type="number" min={10} max={500} value={limit}
                  onChange={e => setLimit(Number(e.target.value))}
                  className="h-12 w-full sm:w-24 rounded-2xl bg-background/60 border-border/50"
                />
                <Button onClick={runSearch} disabled={searching} className="h-12 px-6 rounded-2xl font-black uppercase text-xs tracking-wider">
                  {searching ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Buscando…</> : <><Search className="w-4 h-4 mr-2" /> Pesquisar</>}
                </Button>
              </div>

              {results.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full">{results.length} encontrados</Badge>
                    <Badge variant="outline" className="rounded-full">{results.filter(r => r.phone).length} com telefone</Badge>
                    <Badge variant="outline" className="rounded-full">{results.filter(r => r.whatsapp_available).length} com WhatsApp</Badge>
                    {dupCount > 0 && (
                      <Badge className="rounded-full bg-amber-500/15 text-amber-500 border-amber-500/30">
                        <AlertTriangle className="w-3 h-3 mr-1" /> {dupCount} já cadastrados
                      </Badge>
                    )}
                    <Badge className="rounded-full bg-orange-500/15 text-orange-500 border-orange-500/30">
                      <Flame className="w-3 h-3 mr-1" /> {results.filter(r => r.score === 'quente').length} quentes
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium p-2 rounded-xl border border-border/50 bg-background/40">
                      <Checkbox checked={fPhone} onCheckedChange={v => setFPhone(!!v)} /> Só com telefone
                    </label>
                    <Select value={fWhats} onValueChange={(v: any) => setFWhats(v)}>
                      <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">WhatsApp: todos</SelectItem>
                        <SelectItem value="com">Com WhatsApp</SelectItem>
                        <SelectItem value="sem">Sem WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={fSite} onValueChange={(v: any) => setFSite(v)}>
                      <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Site: todos</SelectItem>
                        <SelectItem value="com">Com site</SelectItem>
                        <SelectItem value="sem">Sem site</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={fScore} onValueChange={(v: any) => setFScore(v)}>
                      <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Classificação: todas</SelectItem>
                        <SelectItem value="quente">🔥 Quentes</SelectItem>
                        <SelectItem value="morno">🟡 Mornos</SelectItem>
                        <SelectItem value="frio">⚪ Sem classificação</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={fDup} onValueChange={(v: any) => setFDup(v)}>
                      <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Duplicados: todos</SelectItem>
                        <SelectItem value="novos">Somente novos</SelectItem>
                        <SelectItem value="duplicados">Somente já cadastrados</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={fCity} onValueChange={setFCity}>
                      <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Cidade: todas</SelectItem>
                        {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={fCategory} onValueChange={setFCategory}>
                      <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Categoria: todas</SelectItem>
                        {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={filtered.length > 0 && selectedRows.length === filtered.length}
                        onCheckedChange={(v) => {
                          const next: Record<string, boolean> = { ...selected };
                          filtered.forEach(r => { next[String(r._i)] = !!v; });
                          setSelected(next);
                        }}
                      />
                      Selecionar todos os {filtered.length} filtrados · <strong className="text-foreground">{selectedRows.length}</strong> selecionados
                    </div>
                    <Button onClick={() => setSaveOpen(true)} disabled={!selectedRows.length} className="rounded-xl font-black uppercase text-[11px] tracking-wider">
                      <Save className="w-4 h-4 mr-2" /> Salvar em lista
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(r => (
              <Card key={r._i} className={`rounded-2xl border transition-all ${selected[String(r._i)] ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-card/40'}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={!!selected[String(r._i)]}
                      onCheckedChange={v => setSelected(s => ({ ...s, [String(r._i)]: !!v }))}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.category} · {r.city || '—'}</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] font-bold rounded-full ${SCORE_META[r.score]?.className || ''}`}>
                      {SCORE_META[r.score]?.label || r.score}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-[11px] text-muted-foreground pl-7">
                    <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {fmtPhone(r.phone)}</p>
                    {r.address && <p className="flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 shrink-0" /> {r.address}</p>}
                    {r.site && <p className="flex items-center gap-1.5 truncate"><Globe className="w-3 h-3 shrink-0" /> {r.site}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1 pl-7">
                    {r.whatsapp_available && <Badge variant="outline" className="text-[9px] rounded-full bg-emerald-500/10 text-emerald-500 border-emerald-500/30">WhatsApp</Badge>}
                    {r._dup && <Badge variant="outline" className="text-[9px] rounded-full bg-amber-500/10 text-amber-500 border-amber-500/30">⚠️ Já cadastrado</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─────────── LISTAS ─────────── */}
        <TabsContent value="listas" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
            <Card className="rounded-3xl border-border/50 bg-card/50 backdrop-blur-xl h-fit">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-black uppercase tracking-wide">Minhas listas</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(lists as any[]).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma lista criada ainda.</p>}
                {(lists as any[]).map(l => (
                  <button
                    key={l.id}
                    onClick={() => setActiveListId(l.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${activeListId === l.id ? 'border-primary bg-primary/10' : 'border-border/50 bg-background/40 hover:bg-muted/40'}`}
                  >
                    <p className="text-sm font-bold truncate">{l.name}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleDateString('pt-BR')}</p>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/50 bg-card/50 backdrop-blur-xl">
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-black uppercase tracking-wide">
                  {activeListId ? (lists as any[]).find(l => l.id === activeListId)?.name : 'Selecione uma lista'}
                </CardTitle>
                {activeListId && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { setRenameValue((lists as any[]).find(l => l.id === activeListId)?.name || ''); setRenameOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={exportList}><Download className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive" onClick={() => deleteListMutation.mutate(activeListId)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {!activeListId ? (
                  <p className="text-xs text-muted-foreground">Escolha uma lista à esquerda para ver os contatos e o histórico de envios.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        ['Total', listStats.total], ['Com telefone', listStats.comTelefone], ['Com WhatsApp', listStats.validos],
                        ['Enviados', listStats.enviados], ['Pendentes', listStats.pendentes],
                      ].map(([label, value]) => (
                        <div key={label as string} className="p-3 rounded-xl bg-background/50 border border-border/50">
                          <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{label}</p>
                          <p className="text-lg font-black">{value as number}</p>
                        </div>
                      ))}
                    </div>

                    <Button onClick={() => setSendOpen(true)} disabled={!listStats.pendentes} className="rounded-xl font-black uppercase text-[11px] tracking-wider">
                      <Send className="w-4 h-4 mr-2" /> Enviar para pendentes ({listStats.pendentes})
                    </Button>

                    <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                      {(listItems as any[]).map(item => {
                        const l = item.leads;
                        if (!l) return null;
                        return (
                          <div key={item.id} className="p-3 rounded-xl border border-border/50 bg-background/40 flex flex-wrap items-center gap-3">
                            <div className="flex-1 min-w-[180px]">
                              <p className="text-sm font-bold truncate">{l.name}</p>
                              <p className="text-[11px] text-muted-foreground">{fmtPhone(l.phone)} · {l.city || '—'}</p>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              <p>Envios: <strong>{l.send_count || 0}</strong></p>
                              <p>Último: {l.last_sent_at ? new Date(l.last_sent_at).toLocaleString('pt-BR') : '—'}</p>
                            </div>
                            <Select value={l.status} onValueChange={(v) => setLeadStatus.mutate({ leadId: l.id, itemId: item.id, status: v })}>
                              <SelectTrigger className="h-8 w-[150px] rounded-lg text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUS_LABEL).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive" onClick={() => removeItemMutation.mutate(item.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─────────── PAINEL ─────────── */}
        <TabsContent value="painel" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {[
              { label: 'Leads capturados', value: stats.total, icon: ListChecks },
              { label: 'Leads válidos', value: stats.validos, icon: CheckCircle2 },
              { label: 'Com WhatsApp', value: stats.whats, icon: MessageSquare },
              { label: 'Leads quentes', value: stats.quentes, icon: Flame },
              { label: 'Já contatados', value: stats.contatados, icon: Send },
              { label: 'Pendentes', value: stats.pendentes, icon: AlertTriangle },
              { label: 'Mensagens enviadas', value: stats.enviadas, icon: Send },
              { label: 'Falhas', value: stats.falhas, icon: AlertTriangle },
              { label: 'Respostas', value: stats.respostas, icon: MessageSquare },
            ].map(s => (
              <Card key={s.label} className="rounded-2xl border-border/50 bg-card/50 backdrop-blur-xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <s.icon className="w-3.5 h-3.5 text-primary" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{s.label}</p>
                  </div>
                  <p className="text-2xl font-black">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-3xl border-border/50 bg-card/50 backdrop-blur-xl">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-black uppercase tracking-wide">Desempenho das listas</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(lists as any[]).length === 0 && <p className="text-xs text-muted-foreground">Crie sua primeira lista na aba Pesquisa.</p>}
              {(lists as any[]).map(l => (
                <button key={l.id} onClick={() => setActiveListId(l.id)} className="w-full flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background/40 hover:bg-muted/40">
                  <span className="text-sm font-bold">{l.name}</span>
                  <span className="text-[11px] text-muted-foreground">{new Date(l.created_at).toLocaleDateString('pt-BR')}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Salvar em lista */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Salvar {selectedRows.length} leads</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Lista de destino</Label>
              <Select value={targetList} onValueChange={setTargetList}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nova">➕ Criar nova lista</SelectItem>
                  {(lists as any[]).map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {targetList === 'nova' && (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nome da lista</Label>
                <Input value={listName} onChange={e => setListName(e.target.value)} placeholder={`${query || 'Leads'} — ${new Date().toLocaleDateString('pt-BR')}`} className="h-11 rounded-xl" />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Telefones já cadastrados não são duplicados: o lead existente é reaproveitado e apenas vinculado à lista.
            </p>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full h-11 rounded-xl font-black uppercase text-[11px] tracking-wider">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar leads'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Renomear lista */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Renomear lista</DialogTitle></DialogHeader>
          <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} className="h-11 rounded-xl" />
          <Button onClick={() => renameMutation.mutate()} className="w-full h-11 rounded-xl font-black uppercase text-[11px]">Salvar</Button>
        </DialogContent>
      </Dialog>

      {/* Envio */}
      <Dialog open={sendOpen} onOpenChange={(v) => { if (!sending) setSendOpen(v); }}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Enviar para {listStats.pendentes} contatos pendentes</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Tipo de API</Label>
                <Select value={sendApi} onValueChange={(v: any) => { setSendApi(v); }}>
                  <SelectTrigger className="h-10 rounded-xl bg-background/50">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evolution">WhatsApp (Não Oficial)</SelectItem>
                    <SelectItem value="official">WhatsApp (API Oficial)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Número/Canal</Label>
                {sendApi === 'evolution' ? (
                  <Select value={sendInstance} onValueChange={setSendInstance}>
                    <SelectTrigger className="h-10 rounded-xl bg-background/50">
                      <SelectValue placeholder={(instances as any[]).length ? 'Selecione a instância' : 'Nenhuma conexão'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(instances as any[]).map((i: any) => (
                        <SelectItem key={i.name} value={i.name}>
                          {i.phone ? `${i.phone} · ${i.name}` : i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={sendChannelId} onValueChange={setSendChannelId}>
                    <SelectTrigger className="h-10 rounded-xl bg-background/50">
                      <SelectValue placeholder={(officialChannels as any[]).length ? 'Selecione o número oficial' : 'Nenhum canal oficial'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(officialChannels as any[]).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {sendApi === 'official' ? (
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Template aprovado</Label>
                <Select value={sendTemplate} onValueChange={setSendTemplate}>
                  <SelectTrigger className="h-10 rounded-xl bg-background/50">
                    <SelectValue placeholder={(officialTemplates as any[]).length ? 'Selecione o template' : 'Carregando templates…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(officialTemplates as any[]).map((t: any) => (
                      <SelectItem key={t.name} value={t.name}>{t.name} ({t.language})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">A API Oficial exige template aprovado. O nome do lead é enviado como primeira variável.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Mensagem</Label>
                <Textarea value={sendText} onChange={e => setSendText(e.target.value)} rows={5} className="rounded-xl bg-background/50" placeholder="Digite sua mensagem..." />
                <p className="text-[11px] text-muted-foreground">Use <span className="font-mono">{'{{nome}}'}</span> para inserir o nome do lead. Envio com intervalo de segurança.</p>
              </div>
            )}


            {sending && (
              <div className="space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${sendProgress.total ? Math.round((sendProgress.done / sendProgress.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs font-bold text-primary animate-pulse">Enviando {sendProgress.done}/{sendProgress.total} · {sendProgress.fail} falhas</p>
              </div>
            )}

            <Button onClick={sendToPending} disabled={sending} className="w-full h-12 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg shadow-primary/20">
              {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando Envio…</> : <><Send className="w-4 h-4 mr-2" /> Iniciar Disparo em Massa</>}
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}
