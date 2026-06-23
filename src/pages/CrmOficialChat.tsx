import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertCircle, Loader2, MessageCircleMore, MoreVertical, RefreshCw, Search, Send,
  Settings as SettingsIcon, Zap, Phone, Smile, Paperclip, FileText, Download, X,
  Image as ImageIcon, Mic, Video, Plus, Globe, Check, CheckCheck,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import QuickRenewalPanel from '@/components/chat/QuickRenewalPanel';

type Contact = { id?: string; name?: string | null; phone?: string | null; email?: string | null; profile_pic_url?: string | null };
type Conversation = {
  id: string;
  contact_id?: string;
  updated_at?: string;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
  channel?: string;
  contacts?: Contact | null;
};
type Message = {
  id: string;
  conversation_id?: string;
  direction: 'in' | 'out';
  body: string;
  created_at?: string;
  media_url?: string | null;
  media_type?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  status?: string;
};
type Channel = {
  id: string;
  kind: 'whatsapp_cloud' | 'webchat' | string;
  name?: string;
  phone_number?: string;
  display_phone_number?: string;
  verified_name?: string;
  phone_number_id?: string;
  primary?: boolean;
  is_primary?: boolean;
  is_active?: boolean;
  status?: string;
  avatar_url?: string | null;
};

const QUICK_REPLIES = [
  'Bom dia! 😊', 'Boa tarde!', 'Boa noite!',
  'Pix gerado, segue: ', 'Obrigado pela preferência! 🙏',
  'Renovação confirmada ✅', 'Em instantes te respondo',
];

function initials(src: string) {
  const parts = (src || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || (src || '?').slice(0, 2).toUpperCase();
}

function formatPhone(p?: string | null) {
  if (!p) return '';
  if (p.startsWith('web-')) return 'Webchat';
  const d = p.replace(/\D/g, '');
  if (d.length >= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return p;
}

function detectMediaKind(mime?: string | null, mediaType?: string | null): 'image' | 'audio' | 'video' | 'document' {
  const m = (mediaType || '').toLowerCase();
  if (m === 'image' || m === 'audio' || m === 'video' || m === 'document') return m as any;
  const t = (mime || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  return 'document';
}

type FilterId = 'all' | 'unread' | 'whatsapp' | 'webchat' | 'media';

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

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [filter, setFilter] = useState<FilterId>('all');
  const [newPhone, setNewPhone] = useState('');

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  // cache: media_url path -> resolved blob/data URL
  const [mediaCache, setMediaCache] = useState<Record<string, string>>({});
  const resolvingRef = useRef<Set<string>>(new Set());

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const loadChannels = async () => {
    if (!apiKey) return;
    try {
      const r = await invoke('list-channels');
      const body = r?.channels?.body as { whatsapp?: any[]; webchat?: any[] } | undefined;
      const list: Channel[] = [];
      (body?.whatsapp || []).forEach((c: any) => list.push({ ...c, kind: 'whatsapp_cloud' }));
      (body?.webchat || []).forEach((c: any) => list.push({ ...c, kind: 'webchat' }));
      setChannels(list);
    } catch (e: any) {
      // silencioso — canais é opcional
      console.warn('list-channels', e?.message);
    }
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

  useEffect(() => { if (apiKey) { loadConversations(); loadChannels(); } }, [apiKey]);
  useEffect(() => { if (selectedConvoId) loadMessages(selectedConvoId); }, [selectedConvoId]);

  // Resolve mídia relativa via proxy edge
  const resolveMedia = async (rawUrl: string) => {
    if (!rawUrl) return;
    if (mediaCache[rawUrl]) return;
    if (resolvingRef.current.has(rawUrl)) return;
    if (/^https?:\/\//i.test(rawUrl) || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      setMediaCache(c => ({ ...c, [rawUrl]: rawUrl }));
      return;
    }
    resolvingRef.current.add(rawUrl);
    try {
      const r = await invoke('get-media', { path: rawUrl });
      const url = r?.media?.url;
      if (url) setMediaCache(c => ({ ...c, [rawUrl]: url }));
    } catch (e: any) {
      // Marca como falha para não tentar de novo
      setMediaCache(c => ({ ...c, [rawUrl]: '' }));
      console.warn('get-media falhou:', rawUrl, e?.message);
    } finally {
      resolvingRef.current.delete(rawUrl);
    }
  };

  useEffect(() => {
    messages.forEach(m => { if (m.media_url) resolveMedia(m.media_url); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const selectedConvo = useMemo(
    () => conversations.find(c => c.id === selectedConvoId) || null,
    [conversations, selectedConvoId]
  );

  const startConversation = async () => {
    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast({ title: 'Número inválido', description: 'Informe DDD + número.', variant: 'destructive' });
      return;
    }
    const phone = digits.startsWith('55') ? digits : `55${digits}`;
    // Procura conversa existente
    const existing = conversations.find(c => (c.contacts?.phone || '').replace(/\D/g, '') === phone);
    if (existing) {
      setSelectedConvoId(existing.id);
      setNewPhone('');
      return;
    }
    // Cria conversa enviando mensagem inicial
    try {
      setSending(true);
      await invoke('send-whatsapp', { phone, body: 'Olá!' });
      toast({ title: 'Conversa iniciada', description: formatPhone(phone) });
      setNewPhone('');
      await loadConversations();
    } catch (e: any) {
      toast({ title: 'Falha ao iniciar', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedConvo) return;
    const phone = selectedConvo.contacts?.phone;
    if (!phone) {
      toast({ title: 'Sem telefone', description: 'Esse contato não tem telefone.', variant: 'destructive' });
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast({ title: 'Arquivo grande demais', description: 'Limite WhatsApp: 16MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const path = `crm-oficial/${user?.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('evolution-media').upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage.from('evolution-media').createSignedUrl(path, 60 * 60 * 24);
      if (sErr || !signed?.signedUrl) throw sErr || new Error('Falha ao gerar URL');
      const kind = detectMediaKind(file.type);
      const caption = input.trim();
      if (caption) setInput('');
      await invoke('send-whatsapp', {
        phone, name: selectedConvo.contacts?.name,
        body: caption || file.name,
        media_url: signed.signedUrl,
        media_type: kind,
        file_name: file.name,
      });
      setMessages(m => [...m, {
        id: `tmp-${Date.now()}`,
        conversation_id: selectedConvo.id,
        direction: 'out',
        body: caption || '',
        created_at: new Date().toISOString(),
        media_url: signed.signedUrl,
        media_type: kind,
        mime_type: file.type,
        file_name: file.name,
      }]);
      toast({ title: 'Enviado', description: `${kind.toUpperCase()} enviado via CRM Oficial.` });
      setTimeout(() => loadMessages(selectedConvo.id), 2000);
    } catch (err: any) {
      toast({ title: 'Falha no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const renderMedia = (m: Message) => {
    if (!m.media_url) return null;
    const kind = detectMediaKind(m.mime_type, m.media_type);
    const resolved = mediaCache[m.media_url];
    const isPending = resolved === undefined;
    const isFailed = resolved === '';
    const url = resolved || '';

    if (isPending) {
      return (
        <div className="mb-1 px-3 py-2 rounded-lg border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando mídia…
        </div>
      );
    }
    if (isFailed) {
      return (
        <div className="mb-1 px-3 py-2 rounded-lg border border-amber-500/40 text-[11px] text-amber-500 bg-amber-500/10">
          ⚠ Mídia indisponível. Sua API key precisa do escopo <code className="font-mono">media:read</code> para abrir arquivos.
        </div>
      );
    }
    if (kind === 'image') {
      return (
        <button onClick={() => setLightbox(url)} className="block mb-1 rounded-lg overflow-hidden hover:opacity-90 transition">
          <img src={url} alt={m.file_name || 'image'} className="max-w-[260px] max-h-[260px] object-cover rounded-lg" />
        </button>
      );
    }
    if (kind === 'video') {
      return (
        <video controls preload="metadata" className="max-w-[260px] rounded-lg mb-1">
          <source src={url} type={m.mime_type || 'video/mp4'} />
        </video>
      );
    }
    if (kind === 'audio') {
      return (
        <audio controls preload="metadata" className="mb-1 w-[240px]">
          <source src={url} type={m.mime_type || 'audio/mpeg'} />
        </audio>
      );
    }
    return (
      <a href={url} target="_blank" rel="noreferrer" download={m.file_name || true}
        className={cn('flex items-center gap-2 mb-1 px-3 py-2 rounded-lg border text-xs',
          m.direction === 'out' ? 'border-white/30 hover:bg-white/10' : 'border-border/60 hover:bg-accent/40')}>
        <FileText className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">{m.file_name || 'documento'}</span>
        <Download className="w-3.5 h-3.5 shrink-0 opacity-70" />
      </a>
    );
  };

  // Filtragem por canal + filtro + busca
  const filtered = useMemo(() => {
    let arr = conversations;
    if (selectedChannel !== 'all') {
      const ch = channels.find(c => c.id === selectedChannel);
      if (ch?.kind === 'webchat') arr = arr.filter(c => c.channel === 'webchat');
      else if (ch?.kind === 'whatsapp_cloud') arr = arr.filter(c => c.channel === 'whatsapp');
    }
    if (filter === 'unread') arr = arr.filter(c => (c.unread_count ?? 0) > 0);
    else if (filter === 'whatsapp') arr = arr.filter(c => c.channel === 'whatsapp');
    else if (filter === 'webchat') arr = arr.filter(c => c.channel === 'webchat');
    else if (filter === 'media') arr = arr.filter(c => /\[(image|video|audio|imagem|vídeo|áudio|documento)\]/i.test(c.last_message || ''));

    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(c =>
        (c.contacts?.name ?? '').toLowerCase().includes(q) ||
        (c.contacts?.phone ?? '').toLowerCase().includes(q) ||
        (c.last_message ?? '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [conversations, channels, selectedChannel, filter, search]);

  const filterCounts = useMemo(() => ({
    all: conversations.length,
    unread: conversations.filter(c => (c.unread_count ?? 0) > 0).length,
    whatsapp: conversations.filter(c => c.channel === 'whatsapp').length,
    webchat: conversations.filter(c => c.channel === 'webchat').length,
    media: conversations.filter(c => /\[(image|video|audio|imagem|vídeo|áudio|documento)\]/i.test(c.last_message || '')).length,
  }), [conversations]);

  const primaryChannel = channels.find(c => c.primary) || channels[0];

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
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-gradient-to-r from-emerald-600/15 via-primary/10 to-cyan-500/10">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                Chat CRM Oficial
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">ON</span>
              </h2>
              <p className="text-[10px] text-muted-foreground leading-tight">WhatsApp Cloud + Webchat</p>
            </div>
            <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" title="Gerenciar canais">
              <Link to="/crm-oficial-channels"><Phone className="w-4 h-4" /></Link>
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { loadConversations(); loadChannels(); }} title="Atualizar">
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

          {/* Toolbar: canal + busca + novo número + filtros */}
          <div className="p-2 space-y-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <Select value={selectedChannel} onValueChange={setSelectedChannel} disabled={channels.length === 0}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder={channels.length === 0 ? 'Nenhum canal' : 'Todos os canais'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="font-medium">Todos os canais</span>
                    </span>
                  </SelectItem>
                  {channels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      <span className="flex items-center gap-2">
                        {ch.kind === 'webchat'
                          ? <Globe className="w-3 h-3 text-cyan-500" />
                          : <span className={cn('w-1.5 h-1.5 rounded-full', ch.status === 'connected' || ch.primary ? 'bg-emerald-500' : 'bg-muted-foreground')} />}
                        <span className="font-medium">{ch.name || (ch.kind === 'webchat' ? 'Webchat' : 'WhatsApp')}</span>
                        {ch.phone_number && <span className="text-muted-foreground text-[10px]">{formatPhone(ch.phone_number)}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={loadChannels} title="Recarregar canais">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar conversa..."
                className="pl-9 h-8 text-xs rounded-full bg-background/60 border-border/60"
              />
            </div>

            <div className="flex gap-1.5">
              <Input
                placeholder="Novo número (DDD + nº)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && startConversation()}
                className="h-8 text-xs rounded-full bg-background/60 border-border/60 px-3"
              />
              <Button size="icon" className="h-8 w-8 shrink-0 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white" onClick={startConversation} disabled={sending}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex gap-1 flex-wrap">
              {([
                { id: 'all', label: 'Todas' },
                { id: 'unread', label: 'Não lidas' },
                { id: 'whatsapp', label: 'WhatsApp' },
                { id: 'webchat', label: 'Webchat' },
                { id: 'media', label: 'Mídia' },
              ] as const).map((t) => {
                const count = filterCounts[t.id];
                const isActive = filter === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setFilter(t.id)}
                    className={cn(
                      'text-[11px] px-3 py-1 rounded-full border transition-all relative whitespace-nowrap inline-flex items-center gap-1',
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
                        : 'bg-transparent hover:bg-accent border-border text-muted-foreground'
                    )}
                  >
                    <span>{t.label}</span>
                    {count > 0 && (
                      <span className={cn(
                        'inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold',
                        t.id === 'unread' ? 'bg-emerald-500 text-black' : isActive ? 'bg-emerald-500/25 text-emerald-500' : 'bg-muted text-muted-foreground'
                      )}>
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </button>
                );
              })}
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
                const isWeb = c.channel === 'webchat';
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
                      <AvatarFallback className={cn('text-xs', isWeb ? 'bg-cyan-500/15 text-cyan-500' : 'bg-emerald-500/15 text-emerald-500')}>
                        {isWeb ? <Globe className="w-4 h-4" /> : initials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium truncate flex-1">{name}</div>
                        {(c.unread_count ?? 0) > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-black">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {c.last_message || formatPhone(phone)}
                      </div>
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
              <p className="text-xs">Escolha um contato ao lado ou inicie uma nova conversa</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card/30">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className={cn('text-xs', selectedConvo.channel === 'webchat' ? 'bg-cyan-500/15 text-cyan-500' : 'bg-emerald-500/15 text-emerald-500')}>
                    {selectedConvo.channel === 'webchat' ? <Globe className="w-4 h-4" /> : initials(selectedConvo.contacts?.name || selectedConvo.contacts?.phone || '?')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {selectedConvo.contacts?.name || selectedConvo.contacts?.phone || 'Contato'}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {formatPhone(selectedConvo.contacts?.phone) || ''}
                    {primaryChannel?.phone_number && selectedConvo.channel === 'whatsapp' && (
                      <span className="ml-2">• via {primaryChannel.name || formatPhone(primaryChannel.phone_number)}</span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className={cn('text-[10px]', selectedConvo.channel === 'webchat' ? 'border-cyan-500/30 text-cyan-400' : 'border-emerald-500/30 text-emerald-400')}>
                  {selectedConvo.channel === 'webchat' ? 'Webchat' : 'CRM Oficial'}
                </Badge>
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
                        {renderMedia(m)}
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
                <input ref={fileRef} type="file" hidden onChange={handleFileSelect}
                  accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.zip" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" disabled={uploading || sending} title="Anexar">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.click(); } }}>
                      <ImageIcon className="w-4 h-4 mr-2" /> Imagem
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { if (fileRef.current) { fileRef.current.accept = 'video/*'; fileRef.current.click(); } }}>
                      <Video className="w-4 h-4 mr-2" /> Vídeo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { if (fileRef.current) { fileRef.current.accept = 'audio/*'; fileRef.current.click(); } }}>
                      <Mic className="w-4 h-4 mr-2" /> Áudio
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { if (fileRef.current) { fileRef.current.accept = '*/*'; fileRef.current.click(); } }}>
                      <FileText className="w-4 h-4 mr-2" /> Documento
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"><Smile className="w-4 h-4" /></Button>
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Digite uma mensagem ou anexe um arquivo..."
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

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <button onClick={() => setLightbox(null)} className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white">
            <X className="w-5 h-5" />
          </button>
          {lightbox && <img src={lightbox} alt="preview" className="w-full max-h-[85vh] object-contain" />}
          {lightbox && (
            <a href={lightbox} target="_blank" rel="noreferrer" download
              className="absolute bottom-2 right-2 z-10 px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Baixar
            </a>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
