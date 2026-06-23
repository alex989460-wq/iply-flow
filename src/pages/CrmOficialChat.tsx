import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Loader2, MessageCircleMore, RefreshCw, Search, Send, Settings as SettingsIcon, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Contact = { id: string; name?: string | null; phone?: string | null; email?: string | null };
type Conversation = { id: string; contact_id?: string; updated_at?: string; last_message?: string | null; contacts?: Contact | null };
type Message = { id: string; conversation_id?: string; direction: 'in' | 'out'; body: string; created_at?: string };

export default function CrmOficialChat() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [bootLoading, setBootLoading] = useState(true);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(false);

  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // load saved api key
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('crm_oficial_settings')
        .select('api_key, enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      setApiKey(data?.api_key ?? null);
      setEnabled(!!data?.enabled);
      setBootLoading(false);
    })();
  }, [user]);

  const invoke = async (action: string, data: Record<string, unknown> = {}) => {
    const { data: res, error } = await supabase.functions.invoke('crm-oficial-sync', {
      body: { action, data: { apiKey, ...data } },
    });
    if (error) throw error;
    if (!res?.success) throw new Error(res?.error || 'Falha na chamada');
    return res.results;
  };

  const loadConversations = async () => {
    if (!apiKey) return;
    setLoadingConvos(true);
    try {
      const r = await invoke('list-conversations');
      const raw = r?.conversations;
      const body = raw?.body as { conversations?: Conversation[] } | undefined;
      setConversations(body?.conversations ?? []);
    } catch (e: any) {
      toast({ title: 'Erro ao carregar conversas', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingConvos(false);
    }
  };

  const loadMessages = async (id: string) => {
    if (!apiKey) return;
    setLoadingMsgs(true);
    try {
      const r = await invoke('list-messages', { conversation_id: id });
      const body = r?.messages?.body as { messages?: Message[] } | undefined;
      setMessages(body?.messages ?? []);
      requestAnimationFrame(() => {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
      });
    } catch (e: any) {
      toast({ title: 'Erro ao carregar mensagens', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => { if (apiKey) loadConversations(); }, [apiKey]);
  useEffect(() => { if (selectedConvoId) loadMessages(selectedConvoId); }, [selectedConvoId]);

  const selectedConvo = useMemo(
    () => conversations.find(c => c.id === selectedConvoId) || null,
    [conversations, selectedConvoId]
  );

  const sendMessage = async () => {
    if (!input.trim() || !selectedConvo) return;
    const phone = selectedConvo.contacts?.phone;
    if (!phone) {
      toast({ title: 'Sem telefone', description: 'Esse contato não tem telefone válido.', variant: 'destructive' });
      return;
    }
    setSending(true);
    const text = input.trim();
    setInput('');
    try {
      await invoke('send-whatsapp', { phone, body: text, name: selectedConvo.contacts?.name });
      // optimistic append
      setMessages(m => [...m, {
        id: `tmp-${Date.now()}`,
        conversation_id: selectedConvo.id,
        direction: 'out',
        body: text,
        created_at: new Date().toISOString(),
      }]);
      requestAnimationFrame(() => {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
      });
      // refresh in background
      setTimeout(() => loadMessages(selectedConvo.id), 1500);
    } catch (e: any) {
      toast({ title: 'Falha ao enviar', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const filtered = conversations.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.contacts?.name ?? '').toLowerCase().includes(q) ||
      (c.contacts?.phone ?? '').toLowerCase().includes(q)
    );
  });

  if (bootLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!apiKey || !enabled) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto mt-8 space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Para usar o chat do CRM Oficial, ative a integração e cole sua chave de API em{' '}
              <strong>Configurações → CRM Oficial</strong>.
            </AlertDescription>
          </Alert>
          <Button asChild>
            <Link to="/settings">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Abrir configurações
            </Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] flex gap-3">
        {/* Conversations list */}
        <Card className="w-80 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border/60 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-500" />
            <span className="font-semibold text-sm">Chat CRM Oficial</span>
            <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={loadConversations} disabled={loadingConvos}>
              {loadingConvos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <div className="p-2 border-b border-border/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar conversa..."
                className="pl-8 h-8 text-sm rounded-full"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {loadingConvos && conversations.length === 0 && (
              <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            )}
            {!loadingConvos && filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhuma conversa encontrada.
              </div>
            )}
            <div className="divide-y divide-border/40">
              {filtered.map(c => {
                const name = c.contacts?.name || c.contacts?.phone || 'Contato';
                const phone = c.contacts?.phone || '';
                const initials = name.slice(0, 2).toUpperCase();
                const active = c.id === selectedConvoId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConvoId(c.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left hover:bg-accent/40 transition-colors',
                      active && 'bg-accent/60'
                    )}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-500 text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{phone}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        {/* Conversation panel */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {!selectedConvo ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageCircleMore className="w-10 h-10 opacity-50" />
              <p className="text-sm">Selecione uma conversa para começar</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border/60 flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-emerald-500/15 text-emerald-500 text-xs">
                    {(selectedConvo.contacts?.name || selectedConvo.contacts?.phone || '?').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {selectedConvo.contacts?.name || selectedConvo.contacts?.phone || 'Contato'}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{selectedConvo.contacts?.phone || ''}</div>
                </div>
                <Badge variant="outline" className="text-[10px]">via CRM Oficial</Badge>
              </div>

              <ScrollArea className="flex-1 bg-muted/20">
                <div ref={scrollerRef} className="p-4 space-y-2">
                  {loadingMsgs && messages.length === 0 && (
                    <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  )}
                  {messages.map(m => (
                    <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm break-words whitespace-pre-wrap',
                          m.direction === 'out'
                            ? 'bg-emerald-500 text-white rounded-br-md'
                            : 'bg-card text-foreground border border-border/60 rounded-bl-md'
                        )}
                      >
                        {m.body}
                        {m.created_at && (
                          <div className={cn(
                            'text-[10px] mt-1 text-right',
                            m.direction === 'out' ? 'text-white/70' : 'text-muted-foreground'
                          )}>
                            {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-border/60 flex items-center gap-2">
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Digite uma mensagem..."
                  className="rounded-full"
                  disabled={sending}
                />
                <Button onClick={sendMessage} disabled={sending || !input.trim()} className="rounded-full h-10 w-10 p-0 bg-emerald-500 hover:bg-emerald-600">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
