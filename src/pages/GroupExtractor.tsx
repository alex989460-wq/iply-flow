import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Users2, LogIn, Download, Copy, RefreshCw, Loader2, Puzzle, Trash2, Folder, ShieldCheck, Search, ContactRound, ExternalLink } from 'lucide-react';

type GroupItem = { id: string; subject: string; size: number | null };
type ContactRow = { id: string; phone: string; name: string | null; group_name: string | null; source: string };

export default function GroupExtractor() {
  const { user } = useAuth();
  const [invite, setInvite] = useState('');
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string>('all');

  const call = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('whatsapp-group-extract', { body: payload });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const loadContacts = async () => {
    const { data } = await supabase
      .from('whatsapp_group_contacts')
      .select('id, phone, name, group_name, source')
      .order('created_at', { ascending: false })
      .limit(1000);
    setContacts((data as ContactRow[]) || []);
  };

  useEffect(() => { if (user) loadContacts(); }, [user]);

  const groupBuckets = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts) {
      const key = c.group_name || 'Sem grupo';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [contacts]);

  const visibleContacts = useMemo(
    () => (activeGroup === 'all' ? contacts : contacts.filter((c) => (c.group_name || 'Sem grupo') === activeGroup)),
    [contacts, activeGroup],
  );

  const clearContacts = async (groupName?: string) => {
    const label = groupName ? `os contatos do grupo "${groupName}"` : 'TODOS os contatos extraídos';
    if (!confirm(`Deseja apagar ${label}?`)) return;
    let query = supabase.from('whatsapp_group_contacts').delete();
    query = groupName
      ? (groupName === 'Sem grupo' ? query.is('group_name', null) : query.eq('group_name', groupName))
      : query.not('id', 'is', null);
    const { error } = await query;
    if (error) {
      toast({ title: 'Erro ao limpar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Contatos removidos' });
    setActiveGroup('all');
    await loadContacts();
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' }); }
    setBusy(null);
  };

  const exportCsv = () => {
    const csv = ['telefone,nome,grupo,origem', ...visibleContacts.map(c => `${c.phone},"${c.name || ''}","${c.group_name || ''}",${c.source}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'contatos-grupos.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExtension = () => {
    fetch('/supergestor-extension.zip')
      .then((res) => {
        if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'supergestor-extension.zip';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => toast({ title: 'Erro no download', description: err.message, variant: 'destructive' }));
  };


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users2 className="h-6 w-6 text-primary" /> Extrair Contatos de Grupos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escolha um grupo, importe membros e organize cada lista para suas campanhas.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-xl font-bold">{groupBuckets.length}</p><p className="text-xs text-muted-foreground">Grupos</p></div>
            <div><p className="text-xl font-bold">{contacts.length}</p><p className="text-xs text-muted-foreground">Contatos</p></div>
            <div><ShieldCheck className="mx-auto h-5 w-5 text-primary" /><p className="text-xs text-muted-foreground">Sem admins</p></div>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">1. Entrar em um grupo por link</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input placeholder="https://chat.whatsapp.com/..." value={invite} onChange={(e) => setInvite(e.target.value)} />
            <Button
              disabled={busy === 'join'}
              onClick={() => run('join', async () => {
                const res = await call({ action: 'join', invite });
                toast({ title: 'Entrou no grupo', description: res.group_name || res.group_jid || 'ok' });
                setInvite('');
              })}
            >
              {busy === 'join' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Entrar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">2. Grupos da instância</CardTitle>
            <Button variant="outline" size="sm" disabled={busy === 'groups'}
              onClick={() => run('groups', async () => {
                const res = await call({ action: 'groups' });
                setGroups(res.groups || []);
              })}>
              {busy === 'groups' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Carregar
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo carregado.</p>}
            {groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{g.subject}</p>
                  <p className="text-xs text-muted-foreground">{g.size ? `${g.size} membros` : g.id}</p>
                </div>
                <Button size="sm" variant="secondary" disabled={busy === g.id}
                  onClick={() => run(g.id, async () => {
                    const res = await call({ action: 'extract', group_jid: g.id, group_name: g.subject });
                    toast({ title: 'Extração concluída', description: `${res.extracted} contatos` });
                    await loadContacts();
                  })}>
                  {busy === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Extrair
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Puzzle className="h-4 w-4" /> 3. Extensão inteligente do WhatsApp Web</CardTitle></CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A nova versão detecta os grupos exibidos no filtro <strong>Grupos</strong>, permite selecionar um deles e percorre toda a lista de participantes. Administradores e o seu próprio contato são ignorados automaticamente.
            </p>
            <div className="flex flex-wrap gap-2">
            <Button onClick={downloadExtension} className="gap-2">
              <Download className="h-4 w-4" /> Baixar extensão (.zip)
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => window.open('https://web.whatsapp.com', '_blank')}>
              <ExternalLink className="h-4 w-4" /> Abrir WhatsApp Web
            </Button>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={token} placeholder="Clique em gerar token" />
              <Button variant="outline" disabled={busy === 'token'}
                onClick={() => run('token', async () => {
                  const res = await call({ action: 'get-token' });
                  setToken(res.token);
                })}>Gerar</Button>
              <Button variant="outline" disabled={!token} onClick={() => { navigator.clipboard.writeText(token); toast({ title: 'Token copiado' }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-sm font-semibold">Instalação e uso</p>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2"><Badge>1</Badge><span>Descompacte e carregue a pasta em <code>chrome://extensions</code>.</span></li>
                <li className="flex gap-2"><Badge>2</Badge><span>Recarregue o WhatsApp Web e clique em <strong>Atualizar lista de grupos</strong>.</span></li>
                <li className="flex gap-2"><Badge>3</Badge><span>Escolha o grupo e clique em <strong>Extrair membros</strong>.</span></li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><ContactRound className="h-4 w-4" /> Contatos extraídos <Badge variant="secondary">{visibleContacts.length}</Badge></CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadContacts}><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={!visibleContacts.length}
                onClick={() => clearContacts(activeGroup === 'all' ? undefined : activeGroup)}>
                <Trash2 className="h-4 w-4" /> {activeGroup === 'all' ? 'Limpar tudo' : 'Limpar grupo'}
              </Button>
              <Button size="sm" onClick={exportCsv} disabled={!visibleContacts.length}><Download className="h-4 w-4" /> CSV</Button>
            </div>
          </CardHeader>
          <CardContent className="pb-0">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={activeGroup === 'all' ? 'default' : 'outline'} className="h-7 rounded-full text-xs"
                onClick={() => setActiveGroup('all')}>
                Todos <Badge variant="secondary" className="ml-2">{contacts.length}</Badge>
              </Button>
              {groupBuckets.map((g) => (
                <Button key={g.name} size="sm" variant={activeGroup === g.name ? 'default' : 'outline'}
                  className="h-7 rounded-full text-xs" onClick={() => setActiveGroup(g.name)}>
                  <Folder className="h-3 w-3 mr-1" /> {g.name} <Badge variant="secondary" className="ml-2">{g.count}</Badge>
                </Button>
              ))}
            </div>
          </CardContent>
          <CardContent className="max-h-[420px] overflow-auto space-y-1">
            {visibleContacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-mono">{c.phone}</span>
                <span className="truncate px-2 text-muted-foreground">{c.name || '—'}</span>
                <Badge variant="outline">{c.group_name || c.source}</Badge>
              </div>
            ))}
            {!visibleContacts.length && <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><Search className="h-8 w-8" /><p className="text-sm">Nenhum contato neste grupo.</p><p className="text-xs">Use a extensão no WhatsApp Web e atualize esta lista.</p></div>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
