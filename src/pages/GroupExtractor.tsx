import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Users2, LogIn, Download, Copy, RefreshCw, Loader2, Puzzle, Trash2, Folder } from 'lucide-react';

type GroupItem = { id: string; subject: string; size: number | null };
type ContactRow = { id: string; phone: string; name: string | null; group_name: string | null; source: string };

export default function GroupExtractor() {
  const { isAdmin } = useAuth();
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

  useEffect(() => { if (isAdmin) loadContacts(); }, [isAdmin]);

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

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <Card><CardContent className="p-8 text-center text-muted-foreground">Ferramenta disponível apenas para administradores.</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users2 className="h-6 w-6 text-primary" /> Extrair Contatos de Grupos</h1>
          <p className="text-sm text-muted-foreground">Entre em grupos por link e extraia os participantes, ou use a extensão no WhatsApp Web.</p>
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
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Puzzle className="h-4 w-4" /> 3. Extensão do WhatsApp Web</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Baixe a extensão, descompacte o ZIP e instale em <code>chrome://extensions</code> (ative o Modo desenvolvedor → Carregar sem compactação). Depois abra o grupo no WhatsApp Web, veja a lista de participantes e clique em “Extrair contatos”. Cole o token abaixo quando solicitado.
            </p>
            <Button onClick={downloadExtension} className="gap-2">
              <Download className="h-4 w-4" /> Baixar extensão (.zip)
            </Button>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Contatos extraídos <Badge variant="secondary">{visibleContacts.length}</Badge></CardTitle>
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
            {!visibleContacts.length && <p className="text-sm text-muted-foreground">Nenhum contato ainda.</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
