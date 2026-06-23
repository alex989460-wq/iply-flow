import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertCircle, Loader2, MessageCircleMore, MoreVertical, RefreshCw, Search, Send,
  Settings as SettingsIcon, Zap, Phone, Smile,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import QuickRenewalPanel from '@/components/chat/QuickRenewalPanel';

type Contact = { id: string; name?: string | null; phone?: string | null; email?: string | null };
type Conversation = { id: string; contact_id?: string; updated_at?: string; last_message?: string | null; contacts?: Contact | null };
type Message = { id: string; conversation_id?: string; direction: 'in' | 'out'; body: string; created_at?: string };

const QUICK_REPLIES = [
  'Bom dia! 😊', 'Boa tarde!', 'Boa noite!',
  'Pix gerado, segue: ', 'Obrigado pela preferência! 🙏',
  'Renovação confirmada ✅', 'Em instantes te respondo',
];

function initials(src: string) {
  const parts = src.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || src.slice(0, 2).toUpperCase();
}

export default function CrmOficialChat() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
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
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      const body = r?.conversations?.body as { conversations?: Conversation[] } | undefined;
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
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
        inputRef.current?.focus();
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

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || !selectedConvo) return;
    const phone = selectedConvo.contacts?.phone;
    if (!phone) {
      toast({ title: 'Sem telefone', description: 'Esse contato não tem telefone válido.', variant: 'destructive' });
      return;
    }
    setSending(true);
    if (!override) setInput('');
    try {
      await invoke('send-whatsapp', { phone, body: text, name: selectedConvo.contacts?.name });
      setMessages(m => [...m, {
        id: `tmp-${Date.now()}`,
        conversation_id: selectedConvo.id,
        direction: 'out',
        body: text,
        created_at: new Date().toISOString(),
      }]);
      requestAnimationFrame(() => {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
        inputRef.current?.focus();
      });
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
    <DashboardLayout noPadding>
      <div className="flex flex-col lg:flex-row h-[calc(100dvh-56px)] animate-fade-in bg-background">
        {/* Sidebar conversas */}
        <div className="flex flex-col border-r border-border bg-card/30 w-full lg:w-80 xl:w-96">
          <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-gradient-to-r from-emerald-600/15 via-primary/10 to-cyan-500/10">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                Chat CRM Oficial
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">API</span>
              </h2>
              <p className="text-[10px] text-muted-foreground leading-tight">WhatsApp Cloud + Webchat</p>
            </div>
            <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" title="Gerenciar canais">
              <Link to="/crm-oficial-channels"><Phone className="w-4 h-4" /></Link>
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={loadConversations} title="Atualizar">
              <RefreshCw className={cn('w-3.5 h-3.5', loadingConvos && 'animate-spin')} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Mais ações">
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/settings"><SettingsIcon className="w-4 h-4 mr-2" /> Configurações</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/crm-oficial-channels"><Phone className="w-4 h-4 mr-2" /> Canais</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar conversa..."
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {loadingConvos && conversations.length === 0 && (
              <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            )}
            {!loadingConvos && filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa.</div>
            )}
            <div className="divide-y divide-border/40">
              {filtered.map(c => {
                const name = c.contacts?.name || c.contacts?.phone || 'Contato';
                const phone = c.contacts?.phone || '';
                const active = c.id === selectedConvoId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConvoId(c.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left hover:bg-accent/40 transition-colors',
                      active && 'bg-emerald-500/10 border-l-2 border-l-emerald-500'
                    )}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-500 text-xs">{initials(name)}</AvatarFallback>
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
        </div>

        {/* Conversa */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {!selectedConvo ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageCircleMore className="w-12 h-12 opacity-40" />
              <p className="text-sm font-medium">Selecione uma conversa</p>
              <p className="text-xs">Escolha um contato ao lado para começar</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card/30">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-emerald-500/15 text-emerald-500 text-xs">
                    {initials(selectedConvo.contacts?.name || selectedConvo.contacts?.phone || '?')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {selectedConvo.contacts?.name || selectedConvo.contacts?.phone || 'Contato'}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{selectedConvo.contacts?.phone || ''}</div>
                </div>
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">CRM Oficial</Badge>
              </div>

              <ScrollArea className="flex-1 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--muted)/0.3),transparent)]">
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

              {/* Quick replies */}
              <div className="px-3 py-2 border-t border-border bg-card/20 flex gap-1.5 overflow-x-auto">
                {QUICK_REPLIES.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    disabled={sending}
                    className="text-xs whitespace-nowrap px-2.5 py-1 rounded-full bg-muted hover:bg-emerald-500/15 hover:text-emerald-400 transition disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="p-3 border-t border-border flex items-center gap-2 bg-card/30">
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"><Smile className="w-4 h-4" /></Button>
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Digite uma mensagem..."
                  className="rounded-full bg-background"
                  disabled={sending}
                />
                <Button onClick={() => sendMessage()} disabled={sending || !input.trim()} className="rounded-full h-10 w-10 p-0 bg-emerald-500 hover:bg-emerald-600 shrink-0">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Painel direito: Renovação Rápida */}
        <div className="hidden xl:flex flex-col w-[400px] border-l border-border bg-card/20 overflow-hidden">
          <ScrollArea className="flex-1">
            <QuickRenewalPanel
              initialPhone={selectedConvo?.contacts?.phone || null}
            />
          </ScrollArea>
        </div>
      </div>
    </DashboardLayout>
  );
}
