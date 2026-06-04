import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import {
  Loader2, Send, Zap, Plus, RefreshCw, Search, MessageSquare,
  Phone, X, Smile, Mic, Paperclip, Trash2, Image as ImageIcon, FileText, Sticker, QrCode,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
  external_id?: string | null;
  raw?: unknown;
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

function getNestedValue(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), source);
}

function rawBase64From(raw: unknown) {
  const paths = [
    ['data', 'Message', 'base64'], ['Message', 'base64'], ['base64'],
    ['data', 'Message', 'imageMessage', 'base64'], ['data', 'Message', 'stickerMessage', 'base64'],
  ];
  for (const path of paths) {
    const value = getNestedValue(raw, path);
    if (typeof value === 'string' && value.length > 80) return value;
  }
  return null;
}

function mediaSource(m: EvoMessage) {
  if (m.media_url) return m.media_url;
  const base64 = rawBase64From(m.raw);
  if (!base64) return null;
  const mime = m.media_mime || (m.message_type === 'sticker' ? 'image/webp' : 'image/jpeg');
  return base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`;
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
  const [previewImage, setPreviewImage] = useState<{ url: string; caption: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [imageToSend, setImageToSend] = useState<{ file: File; url: string; caption: string } | null>(null);
  const [docToSend, setDocToSend] = useState<{ file: File; caption: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'media'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const avatarFetchRef = useRef<Set<string>>(new Set());
  const contactSyncRef = useRef(false);

  const mergeMessage = useCallback((prev: EvoMessage[], incoming: EvoMessage) => {
    if (prev.some((m) => m.id === incoming.id)) return prev;
    if (incoming.external_id && prev.some((m) => m.external_id === incoming.external_id)) return prev;

    const tempIndex = [...prev].reverse().findIndex((m) =>
      m.id.startsWith('tmp-') &&
      m.phone === incoming.phone &&
      m.direction === incoming.direction &&
      m.message_type === incoming.message_type &&
      Math.abs(new Date(m.created_at).getTime() - new Date(incoming.created_at).getTime()) < 120000 &&
      (m.content === incoming.content || incoming.message_type !== 'text')
    );

    if (tempIndex >= 0) {
      const realIndex = prev.length - 1 - tempIndex;
      const copy = [...prev];
      copy[realIndex] = incoming;
      return copy;
    }

    return [...prev, incoming];
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [msgRes, contRes] = await Promise.all([
      supabase.from('evolution_messages').select('*').eq('user_id', user.id).order('created_at', { ascending: true }).limit(3000),
      supabase.from('evolution_contacts').select('phone, name, profile_pic_url').eq('user_id', user.id),
    ]);
    setLoading(false);
    if (msgRes.error) {
      toast({ title: 'Erro', description: msgRes.error.message, variant: 'destructive' });
      return;
    }
    setMessages((((msgRes.data || []) as unknown) as EvoMessage[]).reduce((acc, msg) => mergeMessage(acc, msg), [] as EvoMessage[]));
    const cmap: Record<string, EvoContact> = {};
    for (const c of ((contRes.data || []) as EvoContact[])) cmap[c.phone] = c;
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
          return mergeMessage(prev, m);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evolution_contacts', filter: `user_id=eq.${user.id}` }, (payload) => {
        const c = payload.new as EvoContact;
        if (c?.phone) setContacts(prev => ({ ...prev, [c.phone]: c }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, mergeMessage]);

  // Fetch profile pic when opening a conversation without one
  useEffect(() => {
    if (!selectedPhone) return;
    const c = contacts[selectedPhone];
    if (c?.profile_pic_url) return;
    if (avatarFetchRef.current.has(selectedPhone)) return;
    avatarFetchRef.current.add(selectedPhone);
    supabase.functions.invoke('evolution-send', {
      body: { action: 'fetch-profile-pic', phone: selectedPhone },
    }).then(({ data }) => {
      if (data?.url) setContacts(prev => ({
        ...prev,
        [selectedPhone]: { phone: selectedPhone, name: prev[selectedPhone]?.name || null, profile_pic_url: data.url },
      }));
    }).catch(() => {});
  }, [selectedPhone, contacts]);

  useEffect(() => {
    if (!user || contactSyncRef.current) return;
    contactSyncRef.current = true;
    supabase.functions.invoke('evolution-send', { body: { action: 'sync-contacts' } }).catch(() => undefined);
  }, [user]);

  const conversations = useMemo(() => {
    const map = new Map<string, { phone: string; name: string | null; last: EvoMessage | null; unread: number; lastAt: string }>();
    Object.values(contacts).forEach((c) => {
      map.set(c.phone, { phone: c.phone, name: c.name, last: null, unread: 0, lastAt: c.phone === selectedPhone ? new Date().toISOString() : '' });
    });
    for (const m of messages) {
      const cur = map.get(m.phone);
      if (!cur) {
        map.set(m.phone, { phone: m.phone, name: m.contact_name, last: m, unread: m.direction === 'in' ? 1 : 0, lastAt: m.created_at });
      } else {
        if (!cur.last || new Date(m.created_at) > new Date(cur.last.created_at)) cur.last = m;
        if (m.contact_name && !cur.name) cur.name = m.contact_name;
        if (m.direction === 'in') cur.unread += 1;
        cur.lastAt = cur.last?.created_at || cur.lastAt;
      }
    }
    const arr = Array.from(map.values()).sort((a, b) =>
      new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime()
    );
    let filtered = arr;
    if (filter === 'unread') filtered = arr.filter(c => c.unread > 0 && c.last?.direction === 'in');
    else if (filter === 'media') filtered = arr.filter(c => c.last && ['image', 'audio', 'document', 'sticker'].includes(c.last.message_type));
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(c =>
      c.phone.includes(q.replace(/\D/g, '')) ||
      (c.name || contacts[c.phone]?.name || '').toLowerCase().includes(q) ||
      (c.last?.content || '').toLowerCase().includes(q)
    );
  }, [messages, search, contacts, selectedPhone, filter]);

  const thread = useMemo(() => messages.filter((m) => m.phone === selectedPhone), [messages, selectedPhone]);
  const selectedContact = useMemo(() => contacts[selectedPhone || ''] || null, [contacts, selectedPhone]);
  const selectedName = selectedContact?.name || conversations.find(c => c.phone === selectedPhone)?.name || null;

  useEffect(() => {
    const pending = conversations
      .map((c) => c.phone)
      .filter((phone) => !contacts[phone]?.profile_pic_url && !avatarFetchRef.current.has(phone))
      .slice(0, 8);
    pending.forEach((phone) => {
      avatarFetchRef.current.add(phone);
      supabase.functions.invoke('evolution-send', { body: { action: 'fetch-profile-pic', phone } })
        .then(({ data }) => {
          if (data?.url) setContacts(prev => ({
            ...prev,
            [phone]: { phone, name: prev[phone]?.name || null, profile_pic_url: data.url },
          }));
        })
        .catch(() => undefined);
    });
  }, [conversations, contacts]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread.length, selectedPhone]);

  const startConversation = async () => {
    const digits = newPhone.replace(/\D/g, '');
    if (!digits || !user) return;
    const phone = digits.startsWith('55') ? digits : `55${digits}`;
    setContacts(prev => ({ ...prev, [phone]: prev[phone] || { phone, name: null, profile_pic_url: null } }));
    setSelectedPhone(phone);
    setNewPhone('');
    await supabase.from('evolution_contacts').upsert({ user_id: user.id, phone }, { onConflict: 'user_id,phone' });
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

  const sendMedia = async (file: File, mediaType: 'image' | 'audio' | 'document' | 'sticker', caption = '') => {
    if (!selectedPhone) return;
    setSending(true);
    const tempId = `tmp-${Date.now()}`;
    const previewUrl = URL.createObjectURL(file);
    const labelFallback = mediaType === 'audio' ? '🎤 Áudio' : mediaType === 'image' ? '📷 Imagem' : mediaType === 'sticker' ? '🌟 Sticker' : `📎 ${file.name}`;
    const optimistic: EvoMessage = {
      id: tempId, phone: selectedPhone, contact_name: null, direction: 'out',
      content: caption || labelFallback,
      message_type: mediaType, media_url: previewUrl, media_mime: file.type,
      created_at: new Date().toISOString(), _pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('evolution-send', {
        body: {
          action: 'send-media',
          phone: selectedPhone,
          mediaType,
          mimetype: file.type || (mediaType === 'audio' ? 'audio/ogg' : 'application/octet-stream'),
          filename: file.name || `media-${Date.now()}`,
          mediaBase64: base64,
          caption,
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
    } catch (e: unknown) {
      toast({ title: 'Microfone bloqueado', description: e instanceof Error ? e.message : 'Permita o acesso ao microfone.', variant: 'destructive' });
    }
  };

  const stopRecording = (cancel = false) => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    const rec = recorderRef.current;
    if (!rec) return;
    if (cancel) { recordChunks.current = []; }
    try { rec.stop(); } catch { recorderRef.current = null; }
    recorderRef.current = null;
  };

  const onPickFile = (kind: 'image' | 'document' | 'sticker') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (kind === 'image') {
        setImageToSend({ file: f, url: URL.createObjectURL(f), caption: '' });
      } else if (kind === 'sticker') {
        sendMedia(f, 'sticker' as 'image');
      } else {
        setDocToSend({ file: f, caption: '' });
      }
    }
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
    const src = mediaSource(m);
    if ((m.message_type === 'image' || m.message_type === 'sticker') && src) {
      const label = m.content.replace(/^📷\s*/, '').replace(/^\[sticker\]$/, 'Sticker');
      return (
        <div className="space-y-1">
          <button type="button" onClick={() => setPreviewImage({ url: src, caption: label })} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">
            <img src={src} alt={label || 'Imagem da conversa'} className={cn('rounded-lg object-cover', m.message_type === 'sticker' ? 'max-w-32 max-h-32' : 'max-w-full max-h-64')} loading="lazy" />
          </button>
          {label && label !== 'Imagem' && <div className="text-sm">{label}</div>}
        </div>
      );
    }
    if (m.message_type === 'image' && !m.media_url) {
      return <div className="whitespace-pre-wrap break-words leading-snug">Imagem recebida</div>;
    }
    if (m.message_type === 'sticker' && !m.media_url) {
      return <div className="whitespace-pre-wrap break-words leading-snug">Sticker recebido</div>;
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
          <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-gradient-to-r from-emerald-600/15 via-primary/10 to-cyan-500/10">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm leading-tight">Evolution Chat</h2>
              <p className="text-[10px] text-muted-foreground leading-tight">WhatsApp Multi-Sessão</p>
            </div>
            <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" title="Conectar / Gerenciar instâncias">
              <Link to="/evolution-instances"><QrCode className="w-4 h-4" /></Link>
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={load} title="Atualizar">
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
            <div className="flex gap-1">
              {([
                { id: 'all', label: 'Todas' },
                { id: 'unread', label: 'Não lidas' },
                { id: 'media', label: 'Mídia' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={cn(
                    'flex-1 text-[11px] px-2 py-1 rounded-md border transition-colors',
                    filter === t.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent border-border text-muted-foreground'
                  )}
                >
                  {t.label}
                </button>
              ))}
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
                const isOut = c.last?.direction === 'out';
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
                        <div className="text-[10px] text-muted-foreground shrink-0">{c.last ? relativeTime(c.last.created_at) : 'novo'}</div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="text-[11px] text-muted-foreground truncate">
                          {isOut && <span className="text-primary mr-1">✓</span>}
                          {c.last?.content || 'Nova conversa'}
                        </div>
                        {!active && c.unread > 0 && c.last?.direction === 'in' && (
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
              <div className="px-3 py-2 border-b border-[#0b1115] bg-[#202c33] flex items-center gap-3 shadow-sm">
                {isMobile && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-[#aebac1] hover:bg-white/5" onClick={() => setSelectedPhone(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => selectedContact?.profile_pic_url && setAvatarPreview(selectedContact.profile_pic_url)}
                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  aria-label="Ver avatar"
                >
                  <Avatar className="h-10 w-10 hover:opacity-80 transition-opacity ring-1 ring-white/10">
                    {selectedContact?.profile_pic_url && <AvatarImage src={selectedContact.profile_pic_url} />}
                    <AvatarFallback className="text-xs bg-[#00a884]/20 text-[#00a884]">
                      {initials(selectedName, selectedPhone)}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate text-[#e9edef]">{selectedName || formatPhone(selectedPhone)}</div>
                  <div className="text-[11px] text-[#8696a0] flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> {formatPhone(selectedPhone)}
                  </div>
                </div>
                {isMobile && (
                  <Button size="sm" variant={showRenewalPanel ? 'default' : 'outline'} className="h-7 text-[11px] px-2"
                    onClick={() => setShowRenewalPanel(v => !v)}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Renovar
                  </Button>
                )}
              </div>

              <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-3 space-y-2 bg-[#0b141a]"
                style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)', backgroundSize: '22px 22px' }}>
                {groupedThread.length === 0 && (
                  <div className="text-xs text-[#8696a0] text-center py-10">Sem mensagens. Envie a primeira abaixo.</div>
                )}
                {groupedThread.map((g) => (
                  <div key={g.date} className="space-y-1.5">
                    <div className="flex justify-center my-2">
                      <span className="text-[11px] px-3 py-1 rounded-md bg-[#1d282f] text-[#aebac1] shadow-sm">{g.date}</span>
                    </div>
                    {g.items.map((m) => (
                      <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[78%] md:max-w-[65%] rounded-lg px-2 py-1 text-sm shadow-sm relative text-[#e9edef]',
                          m.direction === 'out' ? 'bg-[#005c4b] rounded-tr-sm' : 'bg-[#202c33] rounded-tl-sm',
                          m._failed && 'ring-1 ring-destructive',
                        )}>
                          <div className="px-1.5 pt-0.5">
                            {renderMessageBody(m)}
                          </div>
                          <div className="flex items-center justify-end gap-1 px-1.5 pb-0.5 mt-0.5 text-[10px] text-[#aebac1]">
                            <span>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            {m.direction === 'out' && (
                              m._failed ? <span className="text-destructive">⚠️</span>
                              : m._pending ? <span>⏳</span>
                              : <span className="text-[#53bdeb] font-bold leading-none">✓✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {showQuickReplies && (
                <div className="px-2 py-1.5 border-t border-[#0b1115] bg-[#1d282f] flex gap-1 overflow-x-auto">
                  {QUICK_REPLIES.map((q) => (
                    <button key={q}
                      className="h-7 px-2.5 text-[11px] shrink-0 rounded-full bg-[#2a3942] text-[#e9edef] hover:bg-[#374248] transition-colors"
                      onClick={() => setDraft(d => (d ? d + ' ' : '') + q)}>{q}</button>
                  ))}
                </div>
              )}

              {/* Composer */}
              <div className="px-2 py-2 border-t border-[#0b1115] bg-[#202c33] flex items-end gap-1.5">
                <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={onPickFile('image')} />
                <input ref={fileInputRef} type="file" hidden onChange={onPickFile('document')} />
                <input ref={stickerInputRef} type="file" accept="image/webp,image/png" hidden onChange={onPickFile('sticker')} />

                {recording ? (
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/15 border border-destructive/30">
                    <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    <span className="text-xs font-medium text-[#e9edef]">Gravando... {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</span>
                    <div className="flex-1" />
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/5" onClick={() => stopRecording(true)} title="Cancelar">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                    <Button size="icon" className="h-8 w-8 bg-[#00a884] hover:bg-[#06cf9c] text-white" onClick={() => stopRecording(false)} title="Enviar">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-[#aebac1] hover:bg-white/5 hover:text-[#e9edef]" title="Emoji">
                          <Smile className="w-5 h-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="p-0 border-0 w-auto bg-transparent shadow-none">
                        <EmojiPicker
                          onEmojiClick={(e) => setDraft(d => d + e.emoji)}
                          theme={Theme.DARK}
                          emojiStyle={EmojiStyle.NATIVE}
                          width={320}
                          height={380}
                          searchPlaceholder="Buscar emoji..."
                          previewConfig={{ showPreview: false }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-[#aebac1] hover:bg-white/5 hover:text-[#e9edef]"
                      onClick={() => stickerInputRef.current?.click()} title="Sticker (.webp)" disabled={sending}>
                      <Sticker className="w-5 h-5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-[#aebac1] hover:bg-white/5 hover:text-[#e9edef]"
                      onClick={() => setShowQuickReplies(v => !v)} title="Respostas rápidas">
                      <Zap className={cn('w-5 h-5', showQuickReplies && 'text-[#00a884]')} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-[#aebac1] hover:bg-white/5 hover:text-[#e9edef]"
                      onClick={() => imgInputRef.current?.click()} title="Imagem" disabled={sending}>
                      <ImageIcon className="w-5 h-5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-[#aebac1] hover:bg-white/5 hover:text-[#e9edef]"
                      onClick={() => fileInputRef.current?.click()} title="Arquivo" disabled={sending}>
                      <Paperclip className="w-5 h-5" />
                    </Button>
                    <textarea
                      placeholder="Digite uma mensagem..."
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                      rows={1}
                      className="flex-1 resize-none rounded-lg border-0 bg-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0] px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#00a884] max-h-32"
                      style={{ minHeight: 40 }}
                    />
                    {draft.trim() ? (
                      <Button onClick={send} size="icon" className="h-10 w-10 shrink-0 rounded-full bg-[#00a884] hover:bg-[#06cf9c] text-white">
                        <Send className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button onClick={startRecording} size="icon" className="h-10 w-10 shrink-0 rounded-full bg-[#00a884] hover:bg-[#06cf9c] text-white" title="Gravar áudio">
                        <Mic className="w-4 h-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Quick Renewal Panel — sempre visível no desktop, modal no mobile */}
        {!isMobile && (
          <div className="hidden md:block border-l border-border">
            <QuickRenewalPanel />
          </div>
        )}
        {isMobile && showRenewalPanel && (
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
        )}
      </div>

      {/* Lightbox de imagens das conversas */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-5xl p-2 bg-background/95 border-border">
          {previewImage && (
            <img src={previewImage.url} alt={previewImage.caption || 'Imagem ampliada'} className="max-h-[85vh] w-full object-contain rounded-md" />
          )}
        </DialogContent>
      </Dialog>

      {/* Preview do avatar do contato */}
      <Dialog open={!!avatarPreview} onOpenChange={(open) => !open && setAvatarPreview(null)}>
        <DialogContent className="max-w-md p-2 bg-background/95 border-border">
          {avatarPreview && (
            <img src={avatarPreview} alt="Avatar do contato" className="w-full h-auto object-contain rounded-md" />
          )}
        </DialogContent>
      </Dialog>

      {/* Pré-visualização de imagem com legenda antes de enviar */}
      <Dialog open={!!imageToSend} onOpenChange={(open) => { if (!open) { if (imageToSend) URL.revokeObjectURL(imageToSend.url); setImageToSend(null); } }}>
        <DialogContent className="max-w-lg p-4 bg-background border-border">
          {imageToSend && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Enviar imagem</div>
              <div className="rounded-md overflow-hidden bg-muted/40 flex items-center justify-center max-h-[55vh]">
                <img src={imageToSend.url} alt="Pré-visualização" className="max-h-[55vh] w-auto object-contain" />
              </div>
              <textarea
                placeholder="Adicionar legenda (opcional)..."
                value={imageToSend.caption}
                onChange={(e) => setImageToSend(s => s ? { ...s, caption: e.target.value } : s)}
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { URL.revokeObjectURL(imageToSend.url); setImageToSend(null); }}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={sending} onClick={() => {
                  const data = imageToSend;
                  setImageToSend(null);
                  sendMedia(data.file, 'image', data.caption.trim());
                  URL.revokeObjectURL(data.url);
                }}>
                  <Send className="w-3.5 h-3.5 mr-1" /> Enviar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
