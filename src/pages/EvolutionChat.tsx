import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Zap, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface EvoMessage {
  id: string;
  phone: string;
  contact_name: string | null;
  direction: 'in' | 'out';
  content: string;
  message_type: string;
  created_at: string;
}

export default function EvolutionChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<EvoMessage[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('evolution_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(2000);
    setLoading(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setMessages((data || []) as EvoMessage[]);
  };

  useEffect(() => { load(); }, [user]);

  // Realtime
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
    const map = new Map<string, { phone: string; name: string | null; last: EvoMessage }>();
    for (const m of messages) {
      const cur = map.get(m.phone);
      if (!cur || new Date(m.created_at) > new Date(cur.last.created_at)) {
        map.set(m.phone, { phone: m.phone, name: m.contact_name, last: m });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime()
    );
  }, [messages]);

  const thread = useMemo(
    () => messages.filter((m) => m.phone === selectedPhone),
    [messages, selectedPhone]
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
      toast({ title: 'Erro ao enviar', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    setDraft('');
  };

  return (
    <DashboardLayout noPadding>
      <div className="flex h-[calc(100vh-56px)] animate-fade-in">
        {/* Sidebar conversas */}
        <div className="w-72 border-r border-border flex flex-col bg-background/50">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm flex-1">Evolution Chat</h2>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="p-2 border-b border-border flex gap-1">
            <Input
              placeholder="Novo número..."
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startConversation()}
              className="h-8 text-xs"
            />
            <Button size="icon" className="h-8 w-8" onClick={startConversation}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                Nenhuma conversa ainda. Inicie pelo número acima.
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.phone}
                  onClick={() => setSelectedPhone(c.phone)}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b border-border/50 hover:bg-accent/50 transition-colors',
                    selectedPhone === c.phone && 'bg-accent'
                  )}
                >
                  <div className="text-sm font-medium truncate">{c.name || c.phone}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{c.last.content}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedPhone ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa ou inicie uma nova.
            </div>
          ) : (
            <>
              <div className="px-4 py-2 border-b border-border bg-background/50">
                <div className="text-sm font-semibold">{selectedPhone}</div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-2 bg-muted/20">
                {thread.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    Sem mensagens. Envie a primeira abaixo.
                  </div>
                )}
                {thread.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm',
                      m.direction === 'out'
                        ? 'ml-auto bg-primary text-primary-foreground'
                        : 'bg-card border border-border'
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    <div className="text-[10px] opacity-70 mt-1 text-right">
                      {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-border flex gap-2 bg-background">
                <Input
                  placeholder="Digite uma mensagem..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  disabled={sending}
                />
                <Button onClick={send} disabled={sending || !draft.trim()}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
