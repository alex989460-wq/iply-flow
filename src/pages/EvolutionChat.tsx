import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Loader2, Send, Zap, Plus, RefreshCw, Search, MessageSquare,
  Phone, X, Smile, Mic, Paperclip, Square, Trash2, Image as ImageIcon, FileText,
} from 'lucide-react';
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
  media_url: string | null;
  media_mime: string | null;
  created_at: string;
  _pending?: boolean;
  _failed?: boolean;
}

interface EvoContact {
  phone: string;
  name: string | null;
  profile_pic_url: string | null;
}

const QUICK_REPLIES = [
  'Bom dia! 😊', 'Boa tarde!', 'Boa noite!',
  'Pix gerado, segue: ', 'Obrigado pela preferência! 🙏',
  'Renovação confirmada ✅', 'Em instantes te respondo',
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

async function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function EvolutionChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<EvoMessage[]>([]);
  const [contacts, setContacts] = useState<Record<string, EvoContact>>({});
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [showRenewalPanel, setShowRenewalPanel] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [msgRes, contRes] = await Promise.all([
      supabase.from('evolution_messages').select('*').eq('user_id', user.id).order('created_at', { ascending: true }).limit(3000),
      (supabase as any).from('evolution_contacts').select('phone, name, profile_pic_url').eq('user_id', user.id),
    ]);
    setLoading(false);
    if (msgRes.error) {
      toast({ title: 'Erro', description: msgRes.error.message, variant: 'destructive' });
      return;
    }
    setMessages(((msgRes.data || []) as unknown) as EvoMessage[]);
    const cmap: Record<string, EvoContact> = {};
    for (const c of (((contRes as any)?.data || []) as EvoContact[])) cmap[c.phone] = c;
    setContacts(cmap);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('evolution_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evolution_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        const m = payload.new as EvoMessage;
        setMessages((prev) => {
          // dedupe: replace pending optimistic message with same phone+content+out
          const idx = prev.findIndex(p => p._pending && p.phone === m.phone && p.direction === 'out' && p.content === m.content);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = m;
            return copy;
          }
          if (prev.some(p => p.id === m.id)) return prev;
          return [...prev, m];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evolution_contacts', filter: `user_id=eq.${user.id}` }, (payload) => {
        const c = payload.new as EvoContact;
        if (c?.phone) setContacts(prev => ({ ...prev, [c.phone]: c }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Fetch profile pic when opening a conversation without one
  useEffect(() => {
    if (!selectedPhone) return;
    const c = contacts[selectedPhone];
    if (c?.profile_pic_url) return;
    supabase.functions.invoke('evolution-send', {
      body: { action: 'fetch-profile-pic', phone: selectedPhone },
    }).then(({ data }) => {
      if (data?.url) setContacts(prev => ({
        ...prev,
        [selectedPhone]: { phone: selectedPhone, name: prev[selectedPhone]?.name || null, profile_pic_url: data.url },
      }));
    }).catch(() => {});
  }, [selectedPhone]);

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
      (c.name || contacts[c.phone]?.name || '').toLowerCase().includes(q) ||
      c.last.content.toLowerCase().includes(q)
    );
  }, [messages, search, contacts]);

  const thread = useMemo(() => messages.filter((m) => m.phone === selectedPhone), [messages, selectedPhone]);
  const selectedContact = useMemo(() => contacts[selectedPhone || ''] || null, [contacts, selectedPhone]);
  const selectedName = selectedContact?.name || conversations.find(c => c.phone === selectedPhone)?.name || null;

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

  // OPTIMISTIC TEXT SEND — message appears instantly, request goes in background
  const send = () => {
    if (!selectedPhone || !draft.trim()) return;
    const text = draft.trim();
    const tempId = `tmp-${Date.now()}`;
    const optimistic: EvoMessage = {
      id: tempId, phone: selectedPhone, contact_name: null, direction: 'out',
      content: text, message_type: 'text', media_url: null, media_mime: null,
      created_at: new Date().toISOString(), _pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setDraft('');

    supabase.functions.invoke('evolution-send', {
      body: { action: 'send', phone: selectedPhone, text },
    }).then(({ data, error }) => {
      if (error || data?.error) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m));
        toast({ title: 'Erro ao enviar', description: error?.message || data?.error || 'Falha', variant: 'destructive' });
        return;
      }
      // Mark as sent immediately; realtime insert may replace it
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false } : m));
    });
  };

  const sendMedia = async (file: File, mediaType: 'image' | 'audio' | 'document') => {
    if (!selectedPhone) return;
    setSending(true);
    try {
      const base64 = await fileToBase64(file);
      const tempId = `tmp-${Date.now()}`;
      const previewUrl = URL.createObjectURL(file);
      const optimistic: EvoMessage = {
        id: tempId, phone: selectedPhone, contact_name: null, direction: 'out',
        content: mediaType === 'audio' ? '🎤 Áudio' : mediaType === 'image' ? '📷 Imagem' : `📎 ${file.name}`,
        message_type: mediaType, media_url: previewUrl, media_mime: file.type,
        created_at: new Date().toISOString(), _pending: true,
      };
      setMessages(prev => [...prev, optimistic]);

      const { data, error } = await supabase.functions.invoke('evolution-send', {
        body: {
          action: 'send-media',
          phone: selectedPhone,
          mediaType,
          mimetype: file.type || (mediaType === 'audio' ? 'audio/ogg' : 'application/octet-stream'),
          filename: file.name || `media-${Date.now()}`,
          mediaBase64: base64,
        },
      });
      if (error || data?.error) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m));
        toast({ title: 'Erro ao enviar', description: error?.message || data?.error, variant: 'destructive' });
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, media_url: data?.mediaUrl || previewUrl } : m));
      }
    } finally {
      setSending(false);
    }
  };

  // AUDIO RECORDING
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: 'Não suportado', description: 'Seu navegador não permite gravar áudio aqui.', variant: 'destructive' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recordChunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) recordChunks.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordChunks.current, { type: mime });
        if (blob.size > 0) {
          const file = new File([blob], `audio-${Date.now()}.${mime.includes('ogg') ? 'ogg' : 'webm'}`, { type: mime });
          await sendMedia(file, 'audio');
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch (e: any) {
      toast({ title: 'Microfone bloqueado', description: e?.message || 'Permita o acesso ao microfone.', variant: 'destructive' });
    }
  };

  const stopRecording = (cancel = false) => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    const rec = recorderRef.current;
    if (!rec) return;
    if (cancel) { recordChunks.current = []; }
    try { rec.stop(); } catch {}
    recorderRef.current = null;
  };

  const onPickFile = (kind: 'image' | 'document') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) sendMedia(f, kind);
    e.target.value = '';
  };

  // Group thread by day
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

  const renderMessageBody = (m: EvoMessage) => {
    if (m.message_type === 'image' && m.media_url) {
      return (
        <div className="space-y-1">
          <img src={m.media_url} alt="" className="rounded-lg max-w-full max-h-64 object-cover" />
          {m.content && !m.content.startsWith('📷') && <div className="text-sm">{m.content}</div>}
        </div>
      );
    }
    if (m.message_type === 'audio' && m.media_url) {
      return <audio controls src={m.media_url} className="max-w-[240px] h-9" />;
    }
    if (m.message_type === 'document' && m.media_url) {
      return (
        <a href={m.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline text-sm">
          <FileText className="w-4 h-4" /> {m.content.replace(/^📎 /, '')}
        </a>
      );
    }
    return <div className="whitespace-pre-wrap break-words leading-snug">{m.content}</div>;
  };

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
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={load}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
          </div>

          <div className="p-2 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Pesquisar conversa..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs pl-8" />
            </div>
            <div className="flex gap-1">
              <Input placeholder="Novo número (DDD + nº)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startConversation()} className="h-8 text-xs" />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={startConversation}><Plus className="w-4 h-4" /></Button>
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
                const cc = contacts[c.phone];
                const displayName = cc?.name || c.name || formatPhone(c.phone);
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
                      {cc?.profile_pic_url && <AvatarImage src={cc.profile_pic_url} alt={displayName} />}
                      <AvatarFallback className="text-[11px] bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                        {initials(displayName, c.phone)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">{displayName}</div>
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
        <div className={cn('flex-1 flex flex-col min-w-0', isMobile && !selectedPhone && 'hidden')}>
          {!selectedPhone ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-muted/10">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="w-7 h-7 text-primary" />
              </div>
              <div className="text-base font-semibold">Selecione uma conversa</div>
              <div className="text-xs text-muted-foreground mt-1 max-w-xs">Escolha um contato ao lado ou inicie uma nova conversa.</div>
            </div>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-border bg-card/50 flex items-center gap-2">
                {isMobile && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedPhone(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <Avatar className="h-8 w-8">
                  {selectedContact?.profile_pic_url && <AvatarImage src={selectedContact.profile_pic_url} />}
                  <AvatarFallback className="text-[11px] bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                    {initials(selectedName, selectedPhone)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{selectedName || formatPhone(selectedPhone)}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> {formatPhone(selectedPhone)}
                  </div>
                </div>
                <Button size="sm" variant={showRenewalPanel ? 'default' : 'outline'} className="h-7 text-[11px] px-2"
                  onClick={() => setShowRenewalPanel(v => !v)}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Renovar
                </Button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-2"
                style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.06) 1px, transparent 0)', backgroundSize: '18px 18px' }}>
                {groupedThread.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-10">Sem mensagens. Envie a primeira abaixo.</div>
                )}
                {groupedThread.map((g) => (
                  <div key={g.date} className="space-y-1.5">
                    <div className="flex justify-center my-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">{g.date}</span>
                    </div>
                    {g.items.map((m) => (
                      <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[78%] md:max-w-[65%] rounded-2xl px-3 py-1.5 text-sm shadow-sm relative',
                          m.direction === 'out' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card border border-border rounded-bl-sm',
                          m._failed && 'ring-1 ring-destructive',
                        )}>
                          {renderMessageBody(m)}
                          <div className={cn('text-[9px] mt-0.5 text-right opacity-70',
                            m.direction === 'out' ? 'text-primary-foreground' : 'text-muted-foreground')}>
                            {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            {m.direction === 'out' && (
                              m._failed ? <span className="ml-1">⚠️</span>
                              : m._pending ? <span className="ml-1">⏳</span>
                              : <span className="ml-1">✓✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {showQuickReplies && (
                <div className="px-2 py-1.5 border-t border-border bg-card/50 flex gap-1 overflow-x-auto">
                  {QUICK_REPLIES.map((q) => (
                    <Button key={q} size="sm" variant="outline" className="h-7 text-[11px] shrink-0"
                      onClick={() => setDraft(d => (d ? d + ' ' : '') + q)}>{q}</Button>
                  ))}
                </div>
              )}

              {/* Composer */}
              <div className="p-2 border-t border-border bg-card/30 flex items-end gap-1.5">
                <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={onPickFile('image')} />
                <input ref={fileInputRef} type="file" hidden onChange={onPickFile('document')} />

                {recording ? (
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-2xl bg-destructive/10 border border-destructive/30">
                    <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    <span className="text-xs font-medium">Gravando... {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</span>
                    <div className="flex-1" />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => stopRecording(true)} title="Cancelar">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                    <Button size="icon" className="h-8 w-8" onClick={() => stopRecording(false)} title="Enviar">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"
                      onClick={() => setShowQuickReplies(v => !v)} title="Respostas rápidas">
                      <Smile className={cn('w-4 h-4', showQuickReplies && 'text-primary')} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"
                      onClick={() => imgInputRef.current?.click()} title="Imagem" disabled={sending}>
                      <ImageIcon className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"
                      onClick={() => fileInputRef.current?.click()} title="Arquivo" disabled={sending}>
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <textarea
                      placeholder="Digite uma mensagem..."
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                      rows={1}
                      className="flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
                      style={{ minHeight: 36 }}
                    />
                    {draft.trim() ? (
                      <Button onClick={send} size="icon" className="h-9 w-9 shrink-0 rounded-full">
                        <Send className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button onClick={startRecording} size="icon" className="h-9 w-9 shrink-0 rounded-full" title="Gravar áudio">
                        <Mic className="w-4 h-4" />
                      </Button>
                    )}
                  </>
                )}
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
