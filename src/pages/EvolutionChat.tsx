import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Send, Zap, Plus, RefreshCw, Search, MessageSquare, Phone, X, Smile } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import QuickRenewalPanel from '@/components/chat/QuickRenewalPanel';

interface EvoMessage {
  id: string;
  phone: string;
  contact_name: string | null;
  direction: 'in' | 'out';
  content: string;
  message_type: string;
  created_at: string;
}

const QUICK_REPLIES = [
  'Bom dia! 😊',
  'Boa tarde!',
  'Boa noite!',
  'Pix gerado, segue: ',
  'Obrigado pela preferência! 🙏',
  'Renovação confirmada ✅',
  'Em instantes te respondo',
];

function initials(name?: string | null, phone?: string) {
  const src = (name || phone || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || (phone?.slice(-2) ?? '?');
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, '');
  if (d.length >= 12) {
    const cc = d.slice(0, 2), ddd = d.slice(2, 4), rest = d.slice(4);
    const mid = rest.length > 8 ? rest.slice(0, rest.length - 4) : rest.slice(0, rest.length - 4);
    return `+${cc} (${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return p;
}

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function EvolutionChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<EvoMessage[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [showRenewalPanel, setShowRenewalPanel] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('evolution_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(3000);
    setLoading(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setMessages((data || []) as EvoMessage[]);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('evolution_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evolution_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as EvoMessage]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const conversations = useMemo(() => {
    const map = new Map<string, { phone: string; name: string | null; last: EvoMessage; unread: number }>();
    for (const m of messages) {
      const cur = map.get(m.phone);
      if (!cur) {
        map.set(m.phone, { phone: m.phone, name: m.contact_name, last: m, unread: m.direction === 'in' ? 1 : 0 });
      } else {
        if (new Date(m.created_at) > new Date(cur.last.created_at)) cur.last = m;
        if (m.contact_name && !cur.name) cur.name = m.contact_name;
        if (m.direction === 'in') cur.unread += 1;
      }
    }
    const arr = Array.from(map.values()).sort((a, b) =>
      new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime()
    );
    if (!search.trim()) return arr;
    const q = search.toLowerCase();
    return arr.filter(c =>
      c.phone.includes(q.replace(/\D/g, '')) ||
      (c.name || '').toLowerCase().includes(q) ||
      c.last.content.toLowerCase().includes(q)
    );
  }, [messages, search]);

  const thread = useMemo(
    () => messages.filter((m) => m.phone === selectedPhone),
    [messages, selectedPhone]
  );

  const selectedContact = useMemo(
    () => conversations.find(c => c.phone === selectedPhone),
    [conversations, selectedPhone]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread.length, selectedPhone]);

  const startConversation = () => {
    const digits = newPhone.replace(/\D/g, '');
    if (!digits) return;
    const phone = digits.startsWith('55') ? digits : `55${digits}`;
    setSelectedPhone(phone);
    setNewPhone('');
  };

  const send = async () => {
    if (!selectedPhone || !draft.trim()) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke('evolution-send', {
      body: { action: 'send', phone: selectedPhone, text: draft.trim() },
    });
    setSending(false);
    if (error || data?.error) {
      toast({
        title: 'Erro ao enviar',
        description: error?.message || data?.error || 'Falha desconhecida',
        variant: 'destructive',
      });
      return;
    }
    setDraft('');
  };

  // Group thread messages by day
  const groupedThread = useMemo(() => {
    const groups: Array<{ date: string; items: EvoMessage[] }> = [];
    for (const m of thread) {
      const d = new Date(m.created_at).toLocaleDateString('pt-BR');
      const last = groups[groups.length - 1];
      if (last && last.date === d) last.items.push(m);
      else groups.push({ date: d, items: [m] });
    }
    return groups;
  }, [thread]);

  return (
    <DashboardLayout noPadding>
      <div className="flex flex-col md:flex-row h-[calc(100vh-56px)] animate-fade-in bg-background">
        {/* Conversations sidebar */}
        <div className={cn(
          'flex flex-col border-r border-border bg-card/30',
          isMobile && selectedPhone ? 'hidden' : 'flex',
          'w-full md:w-80 lg:w-96'
        )}>
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <h2 className="font-semibold text-sm flex-1">Evolution Chat</h2>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={load} title="Atualizar">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
          </div>

          <div className="p-2 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Pesquisar conversa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>
            <div className="flex gap-1">
              <Input
                placeholder="Novo número (DDD + nº)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startConversation()}
                className="h-8 text-xs"
              />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={startConversation} title="Iniciar conversa">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-xs text-muted-foreground text-center space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto opacity-30" />
                <div>Nenhuma conversa ainda.<br />Inicie pelo número acima.</div>
              </div>
            ) : (
              conversations.map((c) => {
                const active = selectedPhone === c.phone;
                const isOut = c.last.direction === 'out';
                return (
                  <button
                    key={c.phone}
                    onClick={() => setSelectedPhone(c.phone)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 border-b border-border/40 hover:bg-accent/50 transition-colors flex gap-2.5 items-start',
                      active && 'bg-accent'
                    )}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-[11px] bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                        {initials(c.name, c.phone)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">{c.name || formatPhone(c.phone)}</div>
                        <div className="text-[10px] text-muted-foreground shrink-0">{relativeTime(c.last.created_at)}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="text-[11px] text-muted-foreground truncate">
                          {isOut && <span className="text-primary mr-1">✓</span>}
                          {c.last.content}
                        </div>
                        {!active && c.unread > 0 && c.last.direction === 'in' && (
                          <Badge className="h-4 min-w-4 px-1 text-[9px] bg-primary">{c.unread > 99 ? '99+' : c.unread}</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={cn(
          'flex-1 flex flex-col min-w-0',
          isMobile && !selectedPhone && 'hidden'
        )}>
          {!selectedPhone ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-muted/10">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="w-7 h-7 text-primary" />
              </div>
              <div className="text-base font-semibold">Selecione uma conversa</div>
              <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                Escolha um contato ao lado ou inicie uma nova conversa pelo número.
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-3 py-2 border-b border-border bg-card/50 flex items-center gap-2">
                {isMobile && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedPhone(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-[11px] bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                    {initials(selectedContact?.name, selectedPhone)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {selectedContact?.name || formatPhone(selectedPhone)}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> {formatPhone(selectedPhone)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={showRenewalPanel ? 'default' : 'outline'}
                  className="h-7 text-[11px] px-2"
                  onClick={() => setShowRenewalPanel(v => !v)}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Renovar
                </Button>
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-auto p-3 space-y-2"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.06) 1px, transparent 0)',
                  backgroundSize: '18px 18px',
                }}
              >
                {groupedThread.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-10">
                    Sem mensagens. Envie a primeira abaixo.
                  </div>
                )}
                {groupedThread.map((g) => (
                  <div key={g.date} className="space-y-1.5">
                    <div className="flex justify-center my-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">
                        {g.date}
                      </span>
                    </div>
                    {g.items.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          'flex',
                          m.direction === 'out' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[78%] md:max-w-[65%] rounded-2xl px-3 py-1.5 text-sm shadow-sm relative',
                            m.direction === 'out'
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-card border border-border rounded-bl-sm'
                          )}
                        >
                          <div className="whitespace-pre-wrap break-words leading-snug">{m.content}</div>
                          <div className={cn(
                            'text-[9px] mt-0.5 text-right opacity-70',
                            m.direction === 'out' ? 'text-primary-foreground' : 'text-muted-foreground'
                          )}>
                            {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            {m.direction === 'out' && <span className="ml-1">✓✓</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Quick replies bar */}
              {showQuickReplies && (
                <div className="px-2 py-1.5 border-t border-border bg-card/50 flex gap-1 overflow-x-auto">
                  {QUICK_REPLIES.map((q) => (
                    <Button
                      key={q}
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] shrink-0"
                      onClick={() => setDraft(d => (d ? d + ' ' : '') + q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              )}

              {/* Composer */}
              <div className="p-2 border-t border-border bg-card/30 flex items-end gap-1.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setShowQuickReplies(v => !v)}
                  title="Respostas rápidas"
                >
                  <Smile className={cn('w-4 h-4', showQuickReplies && 'text-primary')} />
                </Button>
                <textarea
                  placeholder="Digite uma mensagem..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  disabled={sending}
                  rows={1}
                  className="flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
                  style={{ minHeight: 36 }}
                />
                <Button onClick={send} disabled={sending || !draft.trim()} size="icon" className="h-9 w-9 shrink-0 rounded-full">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Quick Renewal Panel */}
        {showRenewalPanel && (
          isMobile ? (
            <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <h2 className="text-sm font-semibold">Renovação Rápida</h2>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowRenewalPanel(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-auto">
                  <QuickRenewalPanel isMobile onClose={() => setShowRenewalPanel(false)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden md:block border-l border-border">
              <QuickRenewalPanel />
            </div>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
