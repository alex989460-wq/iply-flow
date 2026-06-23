import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Edit, Eye, FileText, Loader2, Plus, RefreshCw, Search, Send, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

interface CrmTemplate {
  id: string;
  metaId?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: TemplateComponent[];
}

const statusClass: Record<string, string> = {
  APPROVED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  PENDING: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  REJECTED: 'border-red-500/30 bg-red-500/10 text-red-400',
};

function normalizeTemplates(body: any): CrmTemplate[] {
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
    metaId: t.id ? String(t.id) : undefined,
    name: String(t.name || ''),
    status: String(t.status || 'PENDING').toUpperCase(),
    category: String(t.category || 'UTILITY').toUpperCase(),
    language: String(t.language || 'pt_BR'),
    components: Array.isArray(t.components) ? t.components : [],
  })).filter((t: CrmTemplate) => t.name);
}

function bodyOf(t?: CrmTemplate | null) {
  return t?.components?.find(c => c.type === 'BODY')?.text || '';
}

export default function CrmOficialTemplates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [templates, setTemplates] = useState<CrmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [dialog, setDialog] = useState<'create' | 'edit' | 'view' | 'send' | null>(null);
  const [selected, setSelected] = useState<CrmTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', category: 'UTILITY', language: 'pt_BR', header: '', body: '', footer: '' });
  const [sendForm, setSendForm] = useState({ phone: '', params: '', body: '' });

  const invoke = async (action: string, data: Record<string, unknown> = {}) => {
    const { data: res, error } = await supabase.functions.invoke('crm-oficial-sync', { body: { action, data: { apiKey, ...data } } });
    if (error) throw error;
    if (!res?.success) throw new Error(res?.error || 'Falha na API CRM Oficial');
    return res.results;
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('crm_oficial_settings')
        .select('api_key, enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      setApiKey(data?.api_key || '');
      setEnabled(!!data?.enabled);
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => { if (!loading) void loadTemplates(); }, [loading, apiKey]);

  const loadTemplates = async () => {
    setSyncing(true);
    setLoadError(null);
    try {
      // 1) Fonte primária: API pública do CRM Oficial (já funciona com a chave atual).
      if (apiKey) {
        const r = await invoke('list-templates', { limit: 250 });
        const result = r?.templates;
        if (result?.ok) {
          setTemplates(normalizeTemplates(result.body));
          return;
        }
        // Se 403/escopo, segue para fallback Meta; senão lança.
        if (result && result.status !== 403) {
          const detail = typeof result.body === 'string' ? result.body : JSON.stringify(result.body).slice(0, 180);
          throw new Error(`CRM Oficial ${result.status}: ${detail}`);
        }
      }

      // 2) Fallback: Meta OAuth direto.
      const { data: oauthRes } = await supabase.functions.invoke('meta-oauth', { body: { action: 'fetch-templates' } });
      if (oauthRes && !oauthRes.error && Array.isArray(oauthRes.templates)) {
        setTemplates(normalizeTemplates(oauthRes.templates));
        return;
      }

      // 3) Fallback: meta-templates dedicado.
      const { data: metaRes } = await supabase.functions.invoke('meta-templates', { body: { action: 'list', limit: 250 } });
      if (metaRes && !metaRes.error && Array.isArray(metaRes.data)) {
        setTemplates(normalizeTemplates(metaRes));
        return;
      }

      throw new Error(oauthRes?.error || metaRes?.error || 'Nenhuma fonte de templates disponível.');
    } catch (e: any) {
      setLoadError(e.message);
      toast({ title: 'Erro ao carregar templates', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => setForm({ name: '', category: 'UTILITY', language: 'pt_BR', header: '', body: '', footer: '' });

  const openCreate = () => { resetForm(); setSelected(null); setDialog('create'); };
  const openEdit = (t: CrmTemplate) => {
    setSelected(t);
    setForm({
      name: t.name,
      category: t.category || 'UTILITY',
      language: t.language || 'pt_BR',
      header: t.components.find(c => c.type === 'HEADER')?.text || '',
      body: bodyOf(t),
      footer: t.components.find(c => c.type === 'FOOTER')?.text || '',
    });
    setDialog('edit');
  };

  const payloadFromForm = () => {
    const components: TemplateComponent[] = [];
    if (form.header.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: form.header.trim() });
    components.push({ type: 'BODY', text: form.body.trim() });
    if (form.footer.trim()) components.push({ type: 'FOOTER', text: form.footer.trim() });
    return {
      name: form.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      category: form.category,
      language: form.language,
      components,
    };
  };

  const saveTemplate = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      toast({ title: 'Campos obrigatórios', description: 'Nome e corpo são obrigatórios.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const template = payloadFromForm();
      // Preferir Meta Graph (oficial). Update via meta-templates requer template_id; sem ele, usa CRM Oficial.
      const useMeta = dialog === 'create' || (dialog === 'edit' && (selected as any)?.metaId);
      if (useMeta) {
        const body = dialog === 'edit'
          ? { action: 'update', template_id: (selected as any).metaId, components: template.components }
          : { action: 'create', name: template.name, category: template.category, language: template.language, components: template.components };
        const { data: res, error: err } = await supabase.functions.invoke('meta-templates', { body });
        if (err || res?.error) throw new Error(res?.error || err?.message || 'Falha na Meta API');
      } else {
        const r = await invoke(dialog === 'edit' ? 'update-template' : 'create-template', dialog === 'edit' ? { template_name: selected?.name, template } : { template });
        const result = r?.template;
        if (result && !result.ok) throw new Error(`Status ${result.status}: ${JSON.stringify(result.body).slice(0, 180)}`);
      }
      toast({ title: dialog === 'edit' ? 'Template atualizado' : 'Template enviado', description: 'Sincronizado com a Meta.' });
      setDialog(null);
      await loadTemplates();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar template', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (t: CrmTemplate) => {
    if (!confirm(`Excluir template "${t.name}"?`)) return;
    try {
      // Tenta Meta Graph primeiro
      const { data: res, error: err } = await supabase.functions.invoke('meta-templates', {
        body: { action: 'delete', template_name: t.name },
      });
      if (err || res?.error) {
        // Fallback CRM Oficial
        const r = await invoke('delete-template', { template_name: t.name });
        if (r?.template && !r.template.ok) throw new Error(`Status ${r.template.status}`);
      }
      toast({ title: 'Template excluído' });
      await loadTemplates();
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
    }
  };


  const openSend = (t: CrmTemplate) => {
    setSelected(t);
    setSendForm({ phone: '', params: '', body: bodyOf(t) });
    setDialog('send');
  };

  const sendTemplate = async () => {
    if (!selected || !sendForm.phone.trim()) return;
    setSaving(true);
    try {
      const params = sendForm.params.split(',').map(p => p.trim()).filter(Boolean);
      const r = await invoke('send-whatsapp', {
        phone: sendForm.phone.replace(/\D/g, '').startsWith('55') ? sendForm.phone.replace(/\D/g, '') : `55${sendForm.phone.replace(/\D/g, '')}`,
        template_name: selected.name,
        template_language: selected.language,
        template_params: params,
        body: sendForm.body || selected.name,
      });
      if (r?.send && !r.send.ok) throw new Error(`Status ${r.send.status}: ${JSON.stringify(r.send.body).slice(0, 180)}`);
      toast({ title: 'Template enviado', description: selected.name });
      setDialog(null);
    } catch (e: any) {
      toast({ title: 'Erro ao enviar template', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return templates.filter(t =>
      (status === 'all' || t.status === status) &&
      (!q || t.name.toLowerCase().includes(q) || bodyOf(t).toLowerCase().includes(q))
    );
  }, [templates, query, status]);

  const stats = {
    total: templates.length,
    approved: templates.filter(t => t.status === 'APPROVED').length,
    media: templates.filter(t => t.components.some(c => c.type === 'HEADER' && c.format && c.format !== 'TEXT')).length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-7xl mx-auto p-4 md:p-6">
        <div className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-card to-card p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 mb-3"><ShieldCheck className="w-3 h-3 mr-1" /> Biblioteca oficial Meta</Badge>
            <h1 className="text-3xl md:text-4xl font-bold">Templates aprovados</h1>
            <p className="text-sm text-muted-foreground mt-1">Lista, cria, edita e dispara templates pelo endpoint público do CRM Oficial.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadTemplates} disabled={syncing}>{syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Sincronizar</Button>
            <Button onClick={openCreate} disabled={!apiKey}><Plus className="w-4 h-4 mr-2" /> Novo template</Button>
          </div>
        </div>

        {!apiKey && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Configure a chave em Configurações → CRM Oficial.</AlertDescription></Alert>}
        {apiKey && !enabled && <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>A integração está desativada, mas a biblioteca ainda pode ser consultada pela chave salva.</AlertDescription></Alert>}
        {loadError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {loadError.includes('templates:read')
                ? 'A chave atual do CRM Oficial não tem o escopo templates:read. Gere/cole uma chave com templates:read ou conecte a Meta Cloud em Configurações → Cobranças.'
                : loadError}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          {[{ label: 'Total', value: stats.total }, { label: 'Aprovados', value: stats.approved }, { label: 'Com mídia', value: stats.media }].map(s => (
            <Card key={s.label} className="border-border/60"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{s.label}</p><p className="text-3xl font-bold mt-1">{s.value}</p></CardContent></Card>
          ))}
        </div>

        <Card className="border-emerald-500/20">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4 text-emerald-500" /> Controle fino de templates</CardTitle>
              <CardDescription>Use somente templates APPROVED para cobranças e envios oficiais.</CardDescription>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar template..." value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="APPROVED">Aprovados</SelectItem>
                  <SelectItem value="PENDING">Pendentes</SelectItem>
                  <SelectItem value="REJECTED">Rejeitados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading || syncing ? (
              <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-emerald-500" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Nenhum template encontrado.</div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">
                {filtered.map(t => {
                  const headerImg = (() => {
                    const h: any = t.components.find(c => c.type === 'HEADER' && (c as any).format === 'IMAGE');
                    return h?.example?.header_handle?.[0] || h?.example?.header_url?.[0] || null;
                  })();
                  return (
                  <div key={t.id} className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden flex min-h-[210px]">
                    <div className="w-36 bg-emerald-500/10 border-r border-border/50 p-3 flex flex-col items-center justify-center gap-2 text-center">
                      <Badge variant="outline" className={cn('text-[10px]', statusClass[t.status] || '')}>{t.status}</Badge>
                      {headerImg ? (
                        <img src={headerImg} alt={t.name} className="w-24 h-24 rounded-lg object-cover border border-emerald-500/30" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 flex items-center justify-center"><FileText className="w-7 h-7 text-emerald-400" /></div>
                      )}
                      <p className="text-xs font-semibold">{headerImg ? 'Com mídia' : 'Sem mídia'}</p>
                      <p className="text-[10px] text-muted-foreground">{t.language}</p>
                    </div>
                    <div className="flex-1 p-4 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-lg truncate">{t.name}</h3>
                          <p className="text-[10px] uppercase text-muted-foreground">Formato: {t.category}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSelected(t); setDialog('view'); }}><Eye className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(t)}><Edit className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400" onClick={() => deleteTemplate(t)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl bg-background/70 border border-border/40 p-3 text-sm whitespace-pre-wrap flex-1">{bodyOf(t) || 'Sem corpo'}</div>
                      <Button size="sm" className="mt-3 self-end" onClick={() => openSend(t)} disabled={t.status !== 'APPROVED'}><Send className="w-3.5 h-3.5 mr-1" /> Enviar</Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialog === 'create' || dialog === 'edit'} onOpenChange={o => !o && setDialog(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{dialog === 'edit' ? 'Editar template' : 'Criar template'}</DialogTitle><DialogDescription>POST/PATCH /api/public/v1/templates com components oficiais da Meta.</DialogDescription></DialogHeader>
            <div className="grid gap-4">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="boas_vindas" disabled={dialog === 'edit'} /></div>
                <div className="space-y-1.5"><Label>Categoria</Label><Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UTILITY">UTILITY</SelectItem><SelectItem value="MARKETING">MARKETING</SelectItem><SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Idioma</Label><Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pt_BR">pt_BR</SelectItem><SelectItem value="en_US">en_US</SelectItem><SelectItem value="es">es</SelectItem></SelectContent></Select></div>
              </div>
              <div className="space-y-1.5"><Label>Cabeçalho</Label><Input value={form.header} onChange={e => setForm(f => ({ ...f, header: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Corpo</Label><Textarea rows={6} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Olá {{1}}, sua assinatura vence em {{2}}." /></div>
              <div className="space-y-1.5"><Label>Rodapé</Label><Input value={form.footer} onChange={e => setForm(f => ({ ...f, footer: e.target.value }))} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button><Button onClick={saveTemplate} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === 'view'} onOpenChange={o => !o && setDialog(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.category} • {selected?.language} • {selected?.status}</DialogDescription></DialogHeader>
            <Tabs defaultValue="preview"><TabsList><TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="json">JSON</TabsTrigger></TabsList><TabsContent value="preview" className="rounded-2xl bg-background/70 border p-4 whitespace-pre-wrap text-sm">{bodyOf(selected)}</TabsContent><TabsContent value="json"><pre className="text-xs bg-background border rounded-xl p-3 overflow-auto max-h-96">{JSON.stringify(selected?.components, null, 2)}</pre></TabsContent></Tabs>
          </DialogContent>
        </Dialog>

        <Dialog open={dialog === 'send'} onOpenChange={o => !o && setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Enviar template</DialogTitle><DialogDescription>{selected?.name} ({selected?.language})</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Telefone</Label><Input value={sendForm.phone} onChange={e => setSendForm(f => ({ ...f, phone: e.target.value }))} placeholder="5511999999999" /></div>
              <div className="space-y-1.5"><Label>Parâmetros, separados por vírgula</Label><Input value={sendForm.params} onChange={e => setSendForm(f => ({ ...f, params: e.target.value }))} placeholder="João, 23/06/2026, R$ 30" /></div>
              <div className="space-y-1.5"><Label>Texto fallback</Label><Textarea rows={4} value={sendForm.body} onChange={e => setSendForm(f => ({ ...f, body: e.target.value }))} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button><Button onClick={sendTemplate} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Enviar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}