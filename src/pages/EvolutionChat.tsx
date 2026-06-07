import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import {
  Loader2, Send, Zap, Plus, RefreshCw, Search, MessageSquare,
  Phone, X, Smile, Mic, Paperclip, Trash2, Image as ImageIcon, FileText, Sticker, QrCode,
  Pin, PinOff, Info, Copy, ExternalLink, MoreVertical, ChevronDown,
  Reply, Forward, Star, StarOff, Trash, Volume2, VolumeX, BookOpen, LifeBuoy, CheckCircle2,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import KnowledgeBaseDialog from '@/components/chat/KnowledgeBaseDialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
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
  status?: string | null;
  message_type: string;
  media_url: string | null;
  media_mime: string | null;
  external_id?: string | null;
  raw?: unknown;
  created_at: string;
  instance_name?: string | null;
  _pending?: boolean;
  _failed?: boolean;
}

interface EvoContact {
  phone: string;
  name: string | null;
  profile_pic_url: string | null;
  needs_human?: boolean;
  ai_category?: string | null;
}

interface QuotedPayload {
  messageId: string;
  fromMe: boolean;
  text: string;
}

interface QuotedRawPayload {
  __quoted?: { id?: string; messageId?: string; fromMe?: boolean; text?: string };
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

function rawString(source: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function sameInstanceName(a?: string | null, b?: string | null) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function ownerPhoneFromRaw(raw: unknown) {
  const sender = rawString(raw, [['data', 'Info', 'Sender'], ['Info', 'Sender']]);
  return sender.split('@')[0].split(':')[0].replace(/\D/g, '');
}

// Newsletter (canal/comunidade) JIDs do WhatsApp são números longos (~18 dígitos) e o chat termina em @newsletter
function isNewsletterPhone(phone: string) {
  return !!phone && /^\d{15,}$/.test(phone);
}
function isGroupJidPhone(phone: string) {
  // group ids @g.us costumam ter formato 12345-67890 ou números muito longos
  return !!phone && (phone.includes('-') || phone.length > 18);
}
function newsletterNameFromRaw(raw: unknown): string | null {
  const meta = (getNestedValue(raw, ['data', 'NewsletterMeta'])
    || getNestedValue(raw, ['NewsletterMeta'])
    || getNestedValue(raw, ['data', 'Info', 'NewsletterMeta'])) as Record<string, unknown> | undefined;
  if (!meta) return null;
  const name = String(meta?.name || meta?.Name || meta?.title || meta?.Title || '').trim();
  return name || null;
}


function rawInstanceName(raw: unknown) {
  return rawString(raw, [
    ['data', 'Info', 'Instance'],
    ['instanceName'],
    ['instance'],
    ['data', 'instanceName'],
    ['data', 'instance'],
    ['instanceId'],
    ['data', 'instanceId'],
  ]);
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

function extractQuotedFromRaw(raw: unknown): { id: string | null; text: string; fromMe: boolean } | null {
  const localQuoted = (getNestedValue(raw, ['__quoted']) || getNestedValue(raw, ['data', '__quoted'])) as Record<string, unknown> | undefined;
  if (localQuoted?.id || localQuoted?.text) {
    return {
      id: String(localQuoted.id || localQuoted.messageId || '') || null,
      text: String(localQuoted.text || ''),
      fromMe: !!localQuoted.fromMe,
    };
  }
  const msg = (getNestedValue(raw, ['data', 'Message']) || getNestedValue(raw, ['Message']) || getNestedValue(raw, ['message']) || {}) as Record<string, unknown>;
  const ctx = (getNestedValue(msg, ['extendedTextMessage', 'contextInfo'])
    || getNestedValue(msg, ['imageMessage', 'contextInfo'])
    || getNestedValue(msg, ['videoMessage', 'contextInfo'])
    || getNestedValue(msg, ['audioMessage', 'contextInfo'])
    || getNestedValue(msg, ['documentMessage', 'contextInfo'])
    || getNestedValue(msg, ['stickerMessage', 'contextInfo'])
    || getNestedValue(msg, ['contextInfo'])) as Record<string, unknown> | undefined;
  if (!ctx) return null;
  const stanzaId = String(ctx?.stanzaId || ctx?.StanzaID || ctx?.stanzaID || '') || null;
  const qm = (ctx?.quotedMessage || ctx?.QuotedMessage || null) as Record<string, unknown> | null;
  if (!stanzaId && !qm) return null;
  const text =
    String(qm?.conversation || getNestedValue(qm, ['extendedTextMessage', 'text']) || getNestedValue(qm, ['imageMessage', 'caption']) || getNestedValue(qm, ['videoMessage', 'caption']) || getNestedValue(qm, ['documentMessage', 'caption']) || '')
    || (qm?.audioMessage ? '🎤 Áudio' : '')
    || (qm?.imageMessage ? '📷 Imagem' : '')
    || (qm?.stickerMessage ? '🌟 Sticker' : '')
    || (qm?.documentMessage ? '📎 Documento' : '')
    || '';
  const participant = String(ctx?.participant || ctx?.Participant || '');
  const fromMe = !!ctx?.fromMe || /@s\.whatsapp\.net/.test(participant) === false;
  return { id: stanzaId, text, fromMe };
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
  const { user, session } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  // Hydrate from sessionStorage so abrir o chat (especialmente no mobile) seja instantâneo
  const cachedMessages = useMemo<EvoMessage[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('evo_cache_messages') || '[]'); } catch { return []; }
  }, []);
  const cachedContacts = useMemo<Record<string, EvoContact>>(() => {
    try { return JSON.parse(sessionStorage.getItem('evo_cache_contacts') || '{}'); } catch { return {}; }
  }, []);
  const [loading, setLoading] = useState(cachedMessages.length === 0);
  const [messages, setMessages] = useState<EvoMessage[]>(cachedMessages);
  const [contacts, setContacts] = useState<Record<string, EvoContact>>(cachedContacts);
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
  const [filter, setFilter] = useState<'all' | 'unread' | 'media' | 'groups' | 'channels' | 'contacts' | 'status' | 'support'>('all');
  const [showKbDialog, setShowKbDialog] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('evo_sound_enabled') !== '0'; } catch { return true; }
  });
  const [showAutoReplySettings, setShowAutoReplySettings] = useState(false);
  const [autoReply, setAutoReply] = useState<{
    enabled: boolean;
    system_prompt: string;
    only_outside_hours: boolean;
    business_start: string;
    business_end: string;
    disabled_phones: string[];
    model: string;
  }>({
    enabled: false,
    system_prompt: '',
    only_outside_hours: false,
    business_start: '08:00',
    business_end: '18:00',
    disabled_phones: [],
    model: 'google/gemini-3-flash-preview',
  });
  const [autoReplyLoading, setAutoReplyLoading] = useState(false);
  const [autoReplySaving, setAutoReplySaving] = useState(false);
  const [showStatusComposer, setShowStatusComposer] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');
  const [postingStatus, setPostingStatus] = useState(false);
  const [instances, setInstances] = useState<Array<{ id: string; name: string; phone: string | null; state: string; profile_name: string | null }>>([]);
  const [currentInstance, setCurrentInstance] = useState<string>('');
  const [switchingInstance, setSwitchingInstance] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinnedContacts, setPinnedContacts] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('evo_pinned_contacts') || '[]')); }
    catch { return new Set(); }
  });
  const [reactionPickerFor, setReactionPickerFor] = useState<EvoMessage | null>(null);
  const [replyTo, setReplyTo] = useState<EvoMessage | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<EvoMessage[]>(() => {
    try { return JSON.parse(localStorage.getItem('evo_favorites') || '[]'); } catch { return []; }
  });
  const [showFavorites, setShowFavorites] = useState(false);
  const [lastReadByPhone, setLastReadByPhone] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('evo_last_read') || '{}'); } catch { return {}; }
  });
  const [localReactions, setLocalReactions] = useState<Record<string, { emoji: string; from: 'in' | 'out' }>>({});
  const [typingByPhone, setTypingByPhone] = useState<Record<string, { presence: string; at: number }>>({});
  const [lastSeenByPhone, setLastSeenByPhone] = useState<Record<string, string>>({});
  const [syncingHistory, setSyncingHistory] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const avatarFetchRef = useRef<Set<string>>(new Set());
  const contactSyncRef = useRef(false);
  const presenceSentAtRef = useRef<number>(0);
  const presencePausedTimerRef = useRef<number | null>(null);
  const presenceTickRef = useRef<number>(0);
  const selectedPhoneRef = useRef<string | null>(selectedPhone);
  useEffect(() => { selectedPhoneRef.current = selectedPhone; }, [selectedPhone]);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    try { localStorage.setItem('evo_sound_enabled', soundEnabled ? '1' : '0'); } catch { /* noop */ }
  }, [soundEnabled]);
  const lastSoundAtRef = useRef<number>(0);
  const playNotificationSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    const now = Date.now();
    if (now - lastSoundAtRef.current < 800) return; // throttle
    lastSoundAtRef.current = now;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.start();
      o.stop(ctx.currentTime + 0.35);
      setTimeout(() => ctx.close().catch(() => undefined), 600);
    } catch { /* noop */ }
  }, []);

  const getAuthHeaders = useCallback(async () => {
    let token = session?.access_token || '';
    if (!token) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token || '';
    }
    if (!token) {
      const { data } = await supabase.auth.refreshSession();
      token = data.session?.access_token || '';
    }
    if (!token) throw new Error('Sessão expirada. Faça login novamente para enviar mensagens.');
    return { Authorization: `Bearer ${token}` };
  }, [session?.access_token]);

  const invokeEvolution = useCallback(async (body: Record<string, unknown>) => {
    return supabase.functions.invoke('evolution-send', {
      body,
      headers: await getAuthHeaders(),
    });
  }, [getAuthHeaders]);

  const loadInstances = useCallback(async () => {
    const { data } = await invokeEvolution({ action: 'list-instances' });
    if (data?.instances) setInstances(data.instances);
    if (data?.current) setCurrentInstance(data.current);
  }, [invokeEvolution]);

  const switchInstance = async (name: string) => {
    if (!name || name === currentInstance) return;
    setSwitchingInstance(true);
    const { data, error } = await invokeEvolution({ action: 'set-active-instance', name });
    setSwitchingInstance(false);
    if (error || data?.error) {
      toast({ title: 'Erro', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    setCurrentInstance(name);
    setSelectedPhone(null);
    setSearch('');
    setFilter('all');
    toast({ title: 'Instância ativa', description: `Agora enviando por: ${name}` });
  };

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

  const messagesRef = useRef<EvoMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const load = useCallback(async () => {
    if (!user) return;
    const hadCache = messagesRef.current.length > 0;
    if (!hadCache) setLoading(true);
    const [msgRes, contRes, presRes] = await Promise.all([
      // Reduzido de 1500 → 800: abre muito mais rápido no celular e a UI mostra "Carregar mais antigas" se precisar.
      supabase.from('evolution_messages').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(800),
      (supabase.from('evolution_contacts') as any).select('phone, name, profile_pic_url, needs_human, ai_category').eq('user_id', user.id),
      supabase.from('evolution_presence').select('phone, presence, last_seen_at, updated_at').eq('user_id', user.id),
    ]);
    setLoading(false);
    if (msgRes.error) {
      if (!hadCache) toast({ title: 'Erro', description: msgRes.error.message, variant: 'destructive' });
      return;
    }
    // Dedup O(N) usando Map por id + external_id — antes era O(N²) com reduce/mergeMessage, travava no mobile
    const byId = new Map<string, EvoMessage>();
    const byExt = new Map<string, EvoMessage>();
    const raw = (((msgRes.data || []) as unknown) as EvoMessage[]);
    for (let i = raw.length - 1; i >= 0; i--) {
      const m = raw[i];
      if (byId.has(m.id)) continue;
      if (m.external_id && byExt.has(m.external_id)) continue;
      byId.set(m.id, m);
      if (m.external_id) byExt.set(m.external_id, m);
    }
    const merged = Array.from(byId.values());
    setMessages(merged);
    const cmap: Record<string, EvoContact> = {};
    for (const c of ((contRes.data || []) as EvoContact[])) cmap[c.phone] = c;
    setContacts(cmap);
    const lmap: Record<string, string> = {};
    for (const p of ((presRes.data || []) as Array<{ phone: string; last_seen_at: string | null; updated_at: string }>)) {
      if (p.last_seen_at) lmap[p.phone] = p.last_seen_at;
    }
    setLastSeenByPhone(lmap);
    try {
      sessionStorage.setItem('evo_cache_messages', JSON.stringify(merged.slice(-800)));
      sessionStorage.setItem('evo_cache_contacts', JSON.stringify(cmap));
    } catch { /* quota cheia, ignora */ }
  }, [user, toast]);


  const selectedInstance = useMemo(() => {
    if (!currentInstance) return null;
    return instances.find((inst) => sameInstanceName(inst.name, currentInstance)) || null;
  }, [instances, currentInstance]);

  const messageBelongsToCurrentInstance = useCallback((m: EvoMessage) => {
    if (!currentInstance) return true;
    if (sameInstanceName(m.instance_name, currentInstance)) return true;
    if (selectedInstance?.id && sameInstanceName(m.instance_name, selectedInstance.id)) return true;
    const rawInst = rawInstanceName(m.raw);
    if (sameInstanceName(rawInst, currentInstance)) return true;
    if (selectedInstance?.id && sameInstanceName(rawInst, selectedInstance.id)) return true;
    const ownerPhone = ownerPhoneFromRaw(m.raw);
    if (ownerPhone && selectedInstance?.phone && ownerPhone === selectedInstance.phone.replace(/\D/g, '')) return true;
    return false;
  }, [currentInstance, selectedInstance]);

  useEffect(() => { load(); loadInstances(); }, [load, loadInstances]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('evolution_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evolution_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        const m = payload.new as EvoMessage;
        setMessages((prev) => {
          return mergeMessage(prev, m);
        });
        // Play notification when an incoming message arrives (skip channels/status, skip our own outgoing)
        try {
          if (
            m?.direction === 'in' &&
            m?.phone &&
            !m.phone.startsWith('status') &&
            !/^\d{15,}$/.test(m.phone) /* not newsletter */
          ) {
            const isOtherChatOrUnfocused = document.hidden || selectedPhoneRef.current !== m.phone;
            if (isOtherChatOrUnfocused) playNotificationSound();
          }
        } catch { /* noop */ }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'evolution_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        const m = payload.new as EvoMessage;
        if (!m?.id) return;
        setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'evolution_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        const oldRow = payload.old as { id?: string } | null;
        if (oldRow?.id) setMessages(prev => prev.filter(m => m.id !== oldRow.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evolution_contacts', filter: `user_id=eq.${user.id}` }, (payload) => {
        const c = payload.new as EvoContact;
        if (c?.phone) setContacts(prev => ({ ...prev, [c.phone]: c }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evolution_presence', filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as { phone?: string; presence?: string; last_seen_at?: string | null } | null;
        if (!row?.phone) return;
        setTypingByPhone(prev => ({ ...prev, [row.phone!]: { presence: row.presence || 'available', at: Date.now() } }));
        if (row.last_seen_at) setLastSeenByPhone(prev => ({ ...prev, [row.phone!]: row.last_seen_at! }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, mergeMessage, playNotificationSound]);

  // Re-render every 2s so "digitando..." auto-expires after 8s of silence
  useEffect(() => {
    const t = window.setInterval(() => { presenceTickRef.current = Date.now(); setTypingByPhone(prev => ({ ...prev })); }, 2000);
    return () => clearInterval(t);
  }, []);

  // Send typing presence to the contact (debounced; "paused" after 4s of silence)
  const sendPresence = useCallback((presence: 'composing' | 'paused') => {
    if (!selectedPhone || selectedPhone.startsWith('status:')) return;
    invokeEvolution({ action: 'send-presence', phone: selectedPhone, presence }).catch(() => undefined);
  }, [selectedPhone, invokeEvolution]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - presenceSentAtRef.current > 3500) {
      presenceSentAtRef.current = now;
      sendPresence('composing');
    }
    if (presencePausedTimerRef.current) window.clearTimeout(presencePausedTimerRef.current);
    presencePausedTimerRef.current = window.setTimeout(() => {
      presenceSentAtRef.current = 0;
      sendPresence('paused');
    }, 4000);
  }, [sendPresence]);

  // When switching conversation: cancel any pending paused timer
  useEffect(() => {
    return () => {
      if (presencePausedTimerRef.current) window.clearTimeout(presencePausedTimerRef.current);
      presenceSentAtRef.current = 0;
    };
  }, [selectedPhone]);

  const contactTypingPresence = useMemo(() => {
    if (!selectedPhone) return null;
    const t = typingByPhone[selectedPhone];
    if (!t) return null;
    if (Date.now() - t.at > 8000) return null;
    if (t.presence !== 'composing' && t.presence !== 'recording') return null;
    return t.presence;
  }, [typingByPhone, selectedPhone]);

  // Fetch profile pic + subscribe to presence when opening a conversation
  useEffect(() => {
    if (!selectedPhone || selectedPhone.startsWith('status:')) return;
    // Newsletters/canais e grupos não têm presence individual nem foto via getProfilePic — evita chamadas que retornam 404/erro
    if (isNewsletterPhone(selectedPhone) || isGroupJidPhone(selectedPhone)) return;
    // Subscribe to presence so we receive "online", "digitando…", "visto por último…"
    invokeEvolution({ action: 'subscribe-presence', phone: selectedPhone }).catch(() => undefined);

    const c = contacts[selectedPhone];
    if (c?.profile_pic_url) return;
    if (avatarFetchRef.current.has(selectedPhone)) return;
    avatarFetchRef.current.add(selectedPhone);
    invokeEvolution({ action: 'fetch-profile-pic', phone: selectedPhone }).then(({ data }) => {
      if (data?.url) setContacts(prev => ({
        ...prev,
        [selectedPhone]: { phone: selectedPhone, name: prev[selectedPhone]?.name || null, profile_pic_url: data.url },
      }));
    }).catch(() => {});
  }, [selectedPhone, contacts, invokeEvolution]);

  // Format "online" / "visto por último ..." for current contact
  const contactOnlineStatus = useMemo(() => {
    if (!selectedPhone || selectedPhone.startsWith('status:')) return null;
    const t = typingByPhone[selectedPhone];
    if (t && (Date.now() - t.at) < 30000 && t.presence === 'available') return 'online';
    const ls = lastSeenByPhone[selectedPhone];
    if (!ls) return null;
    try {
      const d = new Date(ls);
      const diffMin = (Date.now() - d.getTime()) / 60000;
      if (diffMin < 1) return 'visto por último agora';
      if (diffMin < 60) return `visto por último há ${Math.floor(diffMin)} min`;
      if (diffMin < 1440) return `visto por último às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      return `visto por último em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    } catch { return null; }
  }, [selectedPhone, typingByPhone, lastSeenByPhone]);

  const syncHistory = useCallback(async (phoneOnly?: string) => {
    setSyncingHistory(true);
    const { data, error } = await invokeEvolution({
      action: 'sync-history',
      phone: phoneOnly || undefined,
      limit: phoneOnly ? 200 : 500,
    });
    setSyncingHistory(false);
    if (error || data?.error) {
      toast({ title: 'Sincronização limitada', description: error?.message || data?.error || 'Servidor não retornou histórico.', variant: 'destructive' });
      return;
    }
    toast({ title: `${data?.imported || 0} mensagens importadas`, description: 'Recarregando...' });
    load();
  }, [invokeEvolution, toast, load]);

  const clearAllConversations = useCallback(async () => {
    if (!user) return;
    if (!confirm('Apagar TODAS as conversas e mensagens (de todos os contatos)? Esta ação não pode ser desfeita.')) return;
    const { data, error } = await invokeEvolution({ action: 'delete-messages', all: true });
    if (error || data?.error) {
      toast({ title: 'Falha ao limpar tudo', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    setMessages([]);
    setSelectedPhone(null);
    toast({ title: `${data?.deleted || 0} mensagens removidas` });
  }, [user, invokeEvolution, toast]);


  useEffect(() => {
    if (!user || contactSyncRef.current) return;
    contactSyncRef.current = true;
    invokeEvolution({ action: 'sync-contacts' }).catch(() => undefined);
  }, [user, invokeEvolution]);

  // Filter messages by the selected instance. Legacy rows are only kept when raw payload identifies the same instance.
  const instanceMessages = useMemo(() => {
    if (!currentInstance) return messages;
    return messages.filter(messageBelongsToCurrentInstance);
  }, [messages, currentInstance, messageBelongsToCurrentInstance]);

  // Phones that have at least one message on this instance (used to filter the conversations sidebar)
  const instancePhones = useMemo(() => {
    if (!currentInstance) return null;
    const set = new Set<string>();
    for (const m of messages) {
      if (messageBelongsToCurrentInstance(m)) set.add(m.phone);
    }
    return set;
  }, [messages, currentInstance, messageBelongsToCurrentInstance]);

  const conversations = useMemo(() => {
    const map = new Map<string, { phone: string; name: string | null; last: EvoMessage | null; unread: number; lastAt: string; lastOutAt: string }>();
    Object.values(contacts).forEach((c) => {
      if (instancePhones && !instancePhones.has(c.phone) && c.phone !== selectedPhone) return;
      map.set(c.phone, { phone: c.phone, name: c.name, last: null, unread: 0, lastAt: c.phone === selectedPhone ? new Date().toISOString() : '', lastOutAt: '' });
    });
    for (const m of instanceMessages) {
      const cur = map.get(m.phone);
      // For newsletters, try to pull name from raw metadata as we scan
      const newsletterName = isNewsletterPhone(m.phone) ? newsletterNameFromRaw(m.raw) : null;
      if (!cur) {
        map.set(m.phone, { phone: m.phone, name: m.contact_name || newsletterName || null, last: m, unread: 0, lastAt: m.created_at, lastOutAt: m.direction === 'out' ? m.created_at : '' });
      } else {
        if (!cur.last || new Date(m.created_at) > new Date(cur.last.created_at)) cur.last = m;
        if (m.contact_name && !cur.name) cur.name = m.contact_name;
        if (newsletterName && !cur.name) cur.name = newsletterName;
        if (m.direction === 'out' && (!cur.lastOutAt || new Date(m.created_at) > new Date(cur.lastOutAt))) {
          cur.lastOutAt = m.created_at;
        }
        cur.lastAt = cur.last?.created_at || cur.lastAt;
      }
    }
    // Compute unread: incoming messages newer than max(lastReadByPhone, lastOutAt).
    // This auto-clears when you reply from another device or when you open here.
    for (const conv of map.values()) {
      const lastRead = lastReadByPhone[conv.phone] || '';
      const cutoffStr = [lastRead, conv.lastOutAt].filter(Boolean).sort().pop() || '';
      const cutoff = cutoffStr ? new Date(cutoffStr).getTime() : 0;
      let count = 0;
      for (const m of instanceMessages) {
        if (m.phone !== conv.phone) continue;
        if (m.direction !== 'in') continue;
        if (new Date(m.created_at).getTime() > cutoff) count++;
      }
      conv.unread = count;
    }
    const arr = Array.from(map.values()).sort((a, b) => {
      const pa = pinnedContacts.has(a.phone) ? 1 : 0;
      const pb = pinnedContacts.has(b.phone) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime();
    });
    let filtered = arr;
    if (filter === 'support') filtered = arr.filter(c => contacts[c.phone]?.needs_human === true && !isNewsletterPhone(c.phone));
    else if (filter === 'unread') filtered = arr.filter(c => c.unread > 0 && c.last?.direction === 'in' && !isNewsletterPhone(c.phone));
    else if (filter === 'media') filtered = arr.filter(c => c.last && ['image', 'audio', 'document', 'sticker'].includes(c.last.message_type) && !isNewsletterPhone(c.phone));
    else if (filter === 'channels') filtered = arr.filter(c => isNewsletterPhone(c.phone));
    else if (filter === 'groups') filtered = arr.filter(c => c.phone && !c.phone.startsWith('status') && !isNewsletterPhone(c.phone) && isGroupJidPhone(c.phone));
    else if (filter === 'contacts') filtered = arr.filter(c => c.phone && c.phone.length <= 15 && !c.phone.startsWith('status') && !isNewsletterPhone(c.phone));
    else if (filter === 'status') {
      // WhatsApp-Web style: "Meu status" + RECENTE list of contacts that posted
      const meEntry = arr.find(c => c.phone === 'status:me')
        || { phone: 'status:me', name: 'Meu status', last: null, unread: 0, lastAt: '', lastOutAt: '' };
      const others = arr.filter(c => c.phone.startsWith('status:') && c.phone !== 'status:me' && c.phone !== 'status:unknown');
      // Sort recent first
      others.sort((a, b) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime());
      filtered = [meEntry, ...others];
    } else {
      // 'all' — hide synthetic status entries AND channels from the main list
      filtered = arr.filter(c => !c.phone.startsWith('status') && !isNewsletterPhone(c.phone));
    }
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(c =>
      c.phone.includes(q.replace(/\D/g, '')) ||
      (c.name || contacts[c.phone]?.name || '').toLowerCase().includes(q) ||
      (c.last?.content || '').toLowerCase().includes(q)
    );
  }, [instanceMessages, search, contacts, selectedPhone, filter, instancePhones, pinnedContacts, lastReadByPhone]);

  // Mark conversation as read when opened (or new message arrives in opened chat)
  useEffect(() => {
    if (!selectedPhone) return;
    setLastReadByPhone(prev => {
      const next = { ...prev, [selectedPhone]: new Date().toISOString() };
      try { localStorage.setItem('evo_last_read', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, [selectedPhone, instanceMessages.length]);

  const thread = useMemo(
    () => instanceMessages.filter((m) => m.phone === selectedPhone && !hiddenIds.has(m.id)),
    [instanceMessages, selectedPhone, hiddenIds],
  );
  const selectedContact = useMemo(() => contacts[selectedPhone || ''] || null, [contacts, selectedPhone]);
  const selectedName = selectedContact?.name || conversations.find(c => c.phone === selectedPhone)?.name || null;

  useEffect(() => {
    const pending = conversations
      .map((c) => c.phone.startsWith('status:') ? c.phone.slice('status:'.length) : c.phone)
      .filter((phone) => phone && phone !== 'me' && phone !== 'unknown' && !isNewsletterPhone(phone) && !isGroupJidPhone(phone) && !contacts[phone]?.profile_pic_url && !avatarFetchRef.current.has(phone))
      .slice(0, 3);
    pending.forEach((phone) => {
      avatarFetchRef.current.add(phone);
      invokeEvolution({ action: 'fetch-profile-pic', phone })
        .then(({ data }) => {
          if (data?.url) setContacts(prev => ({
            ...prev,
            [phone]: { phone, name: prev[phone]?.name || null, profile_pic_url: data.url },
          }));
        })
        .catch(() => undefined);
    });
  }, [conversations, contacts, invokeEvolution]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread.length, selectedPhone]);

  // Load per-conversation hidden ids ("Apagar para mim")
  useEffect(() => {
    if (!selectedPhone) { setHiddenIds(new Set()); return; }
    try {
      const raw = localStorage.getItem(`evo_hidden_${selectedPhone}`);
      setHiddenIds(new Set(raw ? JSON.parse(raw) : []));
    } catch { setHiddenIds(new Set()); }
  }, [selectedPhone]);

  const handleReply = (m: EvoMessage) => {
    setReplyTo(m);
    setTimeout(() => composerRef.current?.focus(), 50);
  };

  const handleForward = (m: EvoMessage) => {
    const text = m.content || (m.media_url ? m.media_url : '');
    if (!text) { toast({ title: 'Nada para encaminhar' }); return; }
    navigator.clipboard?.writeText(text).then(
      () => toast({ title: 'Mensagem copiada', description: 'Abra outra conversa e cole para encaminhar.' }),
      () => toast({ title: 'Falha ao copiar', variant: 'destructive' }),
    );
  };

  const toggleFavorite = (m: EvoMessage) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.id === m.id);
      const next = exists ? prev.filter(f => f.id !== m.id) : [...prev, m].slice(-200);
      try { localStorage.setItem('evo_favorites', JSON.stringify(next)); } catch { /* noop */ }
      toast({ title: exists ? 'Removido dos favoritos' : '⭐ Favoritado' });
      return next;
    });
  };

  const deleteMessage = async (m: EvoMessage) => {
    // Optimistic remove
    setMessages(prev => prev.filter(x => x.id !== m.id));
    // If it's a temp/local message, nothing to remove from DB
    if (m.id.startsWith('tmp-')) return;
    const { error } = await supabase.from('evolution_messages').delete().eq('id', m.id);
    if (error) {
      toast({ title: 'Não foi possível excluir', description: error.message, variant: 'destructive' });
      setMessages(prev => [...prev, m].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      return;
    }
    toast({ title: 'Mensagem excluída' });
  };

  const clearConversation = async () => {
    if (!selectedPhone || !user) return;
    if (!confirm('Apagar TODAS as mensagens desta conversa? Esta ação não pode ser desfeita.')) return;
    const phone = selectedPhone;
    const removed = messages.filter(m => m.phone === phone);
    setMessages(prev => prev.filter(m => m.phone !== phone));
    const { error } = await supabase.from('evolution_messages').delete().eq('user_id', user.id).eq('phone', phone);
    if (error) {
      toast({ title: 'Falha ao limpar conversa', description: error.message, variant: 'destructive' });
      setMessages(prev => [...prev, ...removed]);
      return;
    }
    toast({ title: 'Conversa apagada', description: `${removed.length} mensagens removidas` });
  };

  const isFavorited = useCallback((id: string) => favorites.some(f => f.id === id), [favorites]);

  // Load pinned message ids for the selected conversation from localStorage
  useEffect(() => {
    if (!selectedPhone) { setPinnedIds(new Set()); return; }
    try {
      const raw = localStorage.getItem(`evo_pinned_${selectedPhone}`);
      setPinnedIds(new Set(raw ? JSON.parse(raw) : []));
    } catch { setPinnedIds(new Set()); }
  }, [selectedPhone]);

  const togglePin = (id: string) => {
    if (!selectedPhone) return;
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(`evo_pinned_${selectedPhone}`, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  };

  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`evo-msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-[#00a884]');
    setTimeout(() => el.classList.remove('ring-2', 'ring-[#00a884]'), 1500);
  };

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast({ title: 'Copiado!' }),
      () => toast({ title: 'Não foi possível copiar', variant: 'destructive' }),
    );
  };

  const pinnedMessages = useMemo(
    () => thread.filter(m => pinnedIds.has(m.id)),
    [thread, pinnedIds],
  );

  const togglePinnedContact = (phone: string) => {
    setPinnedContacts(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      try { localStorage.setItem('evo_pinned_contacts', JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  };

  // Extract reactionMessage from raw payload (Evolution Go + classic)
  const extractReaction = (raw: unknown): { targetId: string; emoji: string } | null => {
    const rm = (getNestedValue(raw, ['data', 'Message', 'reactionMessage']) ||
      getNestedValue(raw, ['Message', 'reactionMessage']) ||
      getNestedValue(raw, ['message', 'reactionMessage']) ||
      getNestedValue(raw, ['reactionMessage'])) as Record<string, unknown> | undefined;
    if (!rm) return null;
    const targetId = String(getNestedValue(rm, ['key', 'id']) || getNestedValue(rm, ['key', 'ID']) || getNestedValue(rm, ['Key', 'ID']) || getNestedValue(rm, ['Key', 'id']) || '');
    const emoji = String(rm?.text || rm?.Text || '');
    if (!targetId) return null;
    return { targetId, emoji };
  };

  const sendReaction = async (m: EvoMessage, emoji: string) => {
    if (!m.external_id) {
      toast({ title: 'Não é possível reagir', description: 'Mensagem sem ID externo.', variant: 'destructive' });
      return;
    }
    const targetId = m.external_id;
    const previousReaction = localReactions[targetId] || null;
    setLocalReactions(prev => {
      const next = { ...prev };
      if (emoji) next[targetId] = { emoji, from: 'out' };
      else delete next[targetId];
      return next;
    });
    const { data, error } = await invokeEvolution({ action: 'send-reaction', phone: m.phone, messageId: targetId, fromMe: m.direction === 'out', emoji });
    if (error || data?.error || data?.ok === false) {
      setLocalReactions(prev => {
        const next = { ...prev };
        if (previousReaction) next[targetId] = previousReaction;
        else delete next[targetId];
        return next;
      });
      toast({
        title: 'Reação não enviada',
        description: data?.error || error?.message || 'A Evolution não confirmou a reação no WhatsApp.',
        variant: 'destructive',
      });
      return;
    }
  };

  const postStatus = async () => {
    const text = statusDraft.trim();
    if (!text) return;
    setPostingStatus(true);
    const { data, error } = await invokeEvolution({ action: 'send-status', text });
    setPostingStatus(false);
    if (error || data?.error) {
      toast({ title: 'Falha ao postar status', description: error?.message || data?.error || 'O painel Evolution rejeitou o envio.', variant: 'destructive' });
      return;
    }
    toast({ title: '📢 Status publicado' });
    setStatusDraft('');
    setShowStatusComposer(false);
  };




  const startConversation = async () => {
    const digits = newPhone.replace(/\D/g, '');
    if (!digits || !user) return;
    const phone = digits.startsWith('55') ? digits : `55${digits}`;
    setContacts(prev => ({ ...prev, [phone]: prev[phone] || { phone, name: null, profile_pic_url: null } }));
    setSelectedPhone(phone);
    setNewPhone('');
    await invokeEvolution({ action: 'save-contact', phone });
  };

  // OPTIMISTIC TEXT SEND — message appears instantly, request goes in background
  const sendTextPayload = (phone: string, text: string, tempId: string, quoted: QuotedPayload | null, quotedRaw?: QuotedRawPayload) => {
    invokeEvolution({ action: 'send', phone, text, quoted }).then(({ data, error }) => {
      if (error || data?.error || data?.ok === false) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m));
        toast({ title: 'Erro ao enviar', description: error?.message || data?.error || 'A Evolution não confirmou o envio.', variant: 'destructive' });
        return;
      }
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: false, status: 'sent', external_id: data?.externalId || m.external_id, raw: quotedRaw ? { ...(data || {}), ...quotedRaw } : data } : m));
    }).catch((error) => {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m));
      toast({
        title: 'Erro ao enviar',
        description: error instanceof Error ? error.message : 'Não foi possível confirmar sua sessão para enviar.',
        variant: 'destructive',
      });
    });
  };

  const resendMessage = (m: EvoMessage) => {
    if (m.message_type && m.message_type !== 'text') {
      toast({ title: 'Reenvio indisponível', description: 'Reenvie a mídia manualmente.', variant: 'destructive' });
      return;
    }
    const text = (m.content || '').trim();
    if (!text || !m.phone) return;
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, _pending: true, _failed: false } : x));
    const q = (m.raw && typeof m.raw === 'object' ? (m.raw as QuotedRawPayload).__quoted : undefined);
    const quoted = q?.id ? { messageId: q.id, fromMe: !!q.fromMe, text: q.text || '' } : null;
    const quotedRaw = q ? { __quoted: q } : undefined;
    sendTextPayload(m.phone, text, m.id, quoted, quotedRaw);
  };

  const send = () => {
    if (!selectedPhone || !draft.trim()) return;
    const text = draft.trim();
    const tempId = `tmp-${Date.now()}`;
    const quoted = replyTo && replyTo.external_id ? {
      messageId: replyTo.external_id,
      fromMe: replyTo.direction === 'out',
      text: replyTo.content || '',
    } : null;
    const quotedRaw = quoted ? { __quoted: { id: quoted.messageId, text: quoted.text, fromMe: quoted.fromMe } } : undefined;
    const optimistic: EvoMessage = {
      id: tempId, phone: selectedPhone, contact_name: null, direction: 'out',
      content: text, message_type: 'text', media_url: null, media_mime: null,
      created_at: new Date().toISOString(), instance_name: currentInstance || null, raw: quotedRaw, _pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setDraft('');
    setReplyTo(null);
    sendTextPayload(selectedPhone, text, tempId, quoted, quotedRaw);
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
      created_at: new Date().toISOString(), instance_name: currentInstance || null, _pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await invokeEvolution({
        action: 'send-media',
        phone: selectedPhone,
        mediaType,
        mimetype: file.type || (mediaType === 'audio' ? 'audio/ogg' : 'application/octet-stream'),
        filename: file.name || `media-${Date.now()}`,
        mediaBase64: base64,
        caption,
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
  // Build reaction map and filter reaction rows out of the visible thread
  const { visibleThread, reactionsByExternalId } = useMemo(() => {
    const reactions: Record<string, { emoji: string; from: 'in' | 'out' }> = {};
    const visible: EvoMessage[] = [];
    for (const m of thread) {
      const r = extractReaction(m.raw);
      const looksLikeReaction = !!r || m.message_type === 'reaction' || (m.content === '[reaction]');
      if (r) {
        if (r.emoji) reactions[r.targetId] = { emoji: r.emoji, from: m.direction };
        else delete reactions[r.targetId];
        continue;
      }
      if (looksLikeReaction) continue;
      visible.push(m);
    }
    // Overlay optimistic local reactions (so they show before the webhook echoes back)
    for (const [id, val] of Object.entries(localReactions)) {
      reactions[id] = val;
    }
    return { visibleThread: visible, reactionsByExternalId: reactions };
  }, [thread, localReactions]);

  const groupedThread = useMemo(() => {
    const groups: Array<{ date: string; items: EvoMessage[] }> = [];
    for (const m of visibleThread) {
      const d = new Date(m.created_at).toLocaleDateString('pt-BR');
      const last = groups[groups.length - 1];
      if (last && last.date === d) last.items.push(m);
      else groups.push({ date: d, items: [m] });
    }
    return groups;
  }, [visibleThread]);

  const renderMessageBody = (m: EvoMessage) => {
    const src = mediaSource(m);
    // Imagem / sticker
    if ((m.message_type === 'image' || m.message_type === 'sticker') && src) {
      const label = m.content.replace(/^📷\s*/, '').replace(/^\[sticker\]$/, '');
      return (
        <div className="space-y-1">
          <button type="button" onClick={() => setPreviewImage({ url: src, caption: label })} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">
            <img src={src} alt={label || 'Imagem'} className={cn('rounded-lg object-cover', m.message_type === 'sticker' ? 'max-w-32 max-h-32' : 'max-w-[260px] max-h-72')} loading="lazy" />
          </button>
          {label && label !== 'Imagem' && <div className="text-sm">{label}</div>}
        </div>
      );
    }
    // Imagem/sticker sem URL (criptografada)
    if (m.message_type === 'image') {
      return (
        <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-black/20 text-xs">
          <ImageIcon className="w-4 h-4 opacity-70" />
          <span>Imagem (pré-visualização indisponível)</span>
        </div>
      );
    }
    if (m.message_type === 'sticker') return <div className="text-sm">🌟 Sticker</div>;

    // Vídeo
    if (m.message_type === 'video' && (m.media_url || src)) {
      const v = m.media_url || src!;
      return (
        <div className="space-y-1">
          <video src={v} controls preload="metadata" className="max-w-[280px] max-h-72 rounded-lg bg-black" />
          {m.content && !m.content.startsWith('[') && <div className="text-sm">{m.content}</div>}
        </div>
      );
    }

    // Áudio (estilo WhatsApp: player completo, largura maior)
    if (m.message_type === 'audio') {
      if (m.media_url) {
        return (
          <div className="flex items-center gap-2 min-w-[220px]">
            <div className="w-8 h-8 rounded-full bg-[#00a884]/20 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4 text-[#00a884]" />
            </div>
            <audio controls src={m.media_url} className="h-9 flex-1" />
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
          <Mic className="w-4 h-4" /> Áudio recebido (mídia criptografada)
        </div>
      );
    }

    // Documento — card estilo WhatsApp (ícone + nome + mime + download)
    if (m.message_type === 'document') {
      const docInfo = (() => {
        const doc = (getNestedValue(m.raw, ['data', 'Message', 'documentMessage'])
          || getNestedValue(m.raw, ['Message', 'documentMessage'])
          || getNestedValue(m.raw, ['message', 'documentMessage'])) as Record<string, unknown> | undefined;
        const fileName = String(doc?.fileName || doc?.FileName || '').trim()
          || m.content.replace(/^📎\s*/, '').trim()
          || 'Documento';
        const lenStr = String(doc?.fileLength || doc?.FileLength || '0');
        const bytes = Number(lenStr) || 0;
        const sizeLabel = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB`
          : bytes > 1024 ? `${Math.round(bytes / 1024)} KB`
          : bytes > 0 ? `${bytes} B` : '';
        const mime = m.media_mime || String(doc?.mimetype || '');
        const ext = (fileName.split('.').pop() || mime.split('/').pop() || 'doc').toUpperCase().slice(0, 5);
        return { fileName, sizeLabel, mime, ext };
      })();
      const card = (
        <div className="flex items-center gap-3 min-w-[240px] max-w-[300px] px-2 py-2 rounded-md bg-black/20">
          <div className="w-10 h-10 rounded-md bg-[#00a884]/15 flex items-center justify-center text-[10px] font-bold text-[#00a884] shrink-0">
            {docInfo.ext}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" title={docInfo.fileName}>{docInfo.fileName}</div>
            <div className="text-[10px] text-[#aebac1] truncate">
              {[docInfo.sizeLabel, docInfo.mime || 'documento'].filter(Boolean).join(' • ')}
            </div>
          </div>
          {m.media_url && <FileText className="w-4 h-4 opacity-70 shrink-0" />}
        </div>
      );
      return m.media_url
        ? <a href={m.media_url} target="_blank" rel="noreferrer" className="block hover:opacity-90">{card}</a>
        : card;
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Mais ações">
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => syncHistory()} disabled={syncingHistory}>
                  <RefreshCw className={cn('w-4 h-4 mr-2', syncingHistory && 'animate-spin')} /> Sincronizar todo o histórico
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowAutoReplySettings(true)}>
                  <Zap className="w-4 h-4 mr-2" /> Robô de auto-atendimento (IA)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearAllConversations} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Limpar TODO o histórico
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>

          <div className="p-2 space-y-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <Select value={currentInstance} onValueChange={switchInstance} disabled={switchingInstance || instances.length === 0}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder={instances.length === 0 ? 'Nenhuma instância' : 'Selecionar instância'} />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((inst) => (
                    <SelectItem key={inst.id || inst.name} value={inst.name}>
                      <span className="flex items-center gap-2">
                        <span className={cn('w-1.5 h-1.5 rounded-full', inst.state === 'open' ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                        <span className="font-medium">{inst.profile_name || inst.name}</span>
                        {inst.phone && <span className="text-muted-foreground text-[10px]">{formatPhone(inst.phone)}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={loadInstances} title="Recarregar instâncias">
                <RefreshCw className={cn('w-3 h-3', switchingInstance && 'animate-spin')} />
              </Button>
            </div>
            <div className="relative flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Pesquisar conversa..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs pl-8" />
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                title={soundEnabled ? 'Som de notificação ativo' : 'Som de notificação desligado'}
                onClick={() => {
                  setSoundEnabled(v => {
                    const next = !v;
                    if (next) {
                      // play once to confirm + unlock audio context on mobile
                      lastSoundAtRef.current = 0;
                      setTimeout(() => playNotificationSound(), 0);
                    }
                    return next;
                  });
                }}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
              </Button>
            </div>
            <div className="flex gap-1">
              <Input placeholder="Novo número (DDD + nº)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startConversation()} className="h-8 text-xs" />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={startConversation}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {([
                { id: 'all', label: 'Todas' },
                { id: 'unread', label: 'Não lidas' },
                { id: 'contacts', label: 'Contatos' },
                { id: 'groups', label: 'Grupos' },
                { id: 'channels', label: '📢 Canais' },
                { id: 'media', label: 'Mídia' },
                { id: 'status', label: 'Status' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setFilter(t.id);
                    if (t.id === 'status') setSelectedPhone('status:me');
                  }}
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
                const isStatusEntry = c.phone.startsWith('status:');
                const isMyStatus = c.phone === 'status:me';
                const statusContactPhone = isStatusEntry && !isMyStatus ? c.phone.slice('status:'.length) : '';
                const statusCC = statusContactPhone ? contacts[statusContactPhone] : null;
                const cc = isStatusEntry ? statusCC : contacts[c.phone];
                const isNewsletter = !isStatusEntry && isNewsletterPhone(c.phone);
                const isGroup = !isStatusEntry && !isNewsletter && isGroupJidPhone(c.phone);
                const channelName = isNewsletter ? newsletterNameFromRaw(c.last?.raw) : null;
                const displayName = isMyStatus
                  ? 'Meu status'
                  : isStatusEntry
                    ? (statusCC?.name || c.name || formatPhone(statusContactPhone))
                    : isNewsletter
                      ? (contacts[c.phone]?.name || channelName || c.name || 'Canal do WhatsApp')
                      : isGroup
                        ? (contacts[c.phone]?.name || c.name || 'Grupo')
                        : (contacts[c.phone]?.name || c.name || formatPhone(c.phone));
                const isPinnedContact = pinnedContacts.has(c.phone);
                return (
                  <ContextMenu key={c.phone}>
                    <ContextMenuTrigger asChild>
                      <button
                        onClick={() => setSelectedPhone(c.phone)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 border-b border-border/40 hover:bg-accent/50 transition-colors flex gap-2.5 items-start',
                          active && 'bg-accent',
                          isPinnedContact && 'bg-gradient-to-r from-emerald-500/5 to-transparent',
                        )}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          {cc?.profile_pic_url && <AvatarImage src={cc.profile_pic_url} alt={displayName} />}
                          <AvatarFallback className={cn(
                            'text-[11px]',
                            isNewsletter ? 'bg-gradient-to-br from-blue-500/30 to-blue-700/20 text-blue-400'
                            : isGroup ? 'bg-gradient-to-br from-purple-500/30 to-purple-700/20 text-purple-400'
                            : 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary'
                          )}>
                            {isNewsletter ? '📢' : isGroup ? '👥' : initials(displayName, c.phone)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium truncate flex items-center gap-1">
                              {isPinnedContact && <Pin className="w-3 h-3 text-emerald-500 shrink-0" />}
                              {isNewsletter && <span className="text-[9px] px-1 rounded bg-blue-500/20 text-blue-400 shrink-0">CANAL</span>}
                              {isGroup && <span className="text-[9px] px-1 rounded bg-purple-500/20 text-purple-400 shrink-0">GRUPO</span>}
                              {displayName}
                            </div>
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
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44">
                      <ContextMenuItem onClick={() => togglePinnedContact(c.phone)}>
                        {isPinnedContact
                          ? <><PinOff className="w-4 h-4 mr-2" /> Desafixar contato</>
                          : <><Pin className="w-4 h-4 mr-2" /> Fixar contato</>}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => copyText(formatPhone(c.phone))}>
                        <Copy className="w-4 h-4 mr-2" /> Copiar número
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
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
              <div className="px-3 py-2 border-b border-[#0b1115] bg-gradient-to-r from-[#202c33] via-[#1f2a30] to-[#202c33] flex items-center gap-3 shadow-sm">
                {isMobile && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-[#aebac1] hover:bg-white/5" onClick={() => setSelectedPhone(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setShowContactInfo(true)}
                  className="flex items-center gap-3 flex-1 min-w-0 rounded-md px-1 -mx-1 py-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
                  aria-label="Ver informações do contato"
                >
                  <Avatar className="h-10 w-10 ring-2 ring-[#00a884]/30 transition-transform hover:scale-105">
                    {selectedContact?.profile_pic_url && <AvatarImage src={selectedContact.profile_pic_url} />}
                    <AvatarFallback className="text-xs bg-[#00a884]/20 text-[#00a884]">
                      {initials(selectedName, selectedPhone)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-semibold truncate text-[#e9edef]">
                      {selectedPhone === 'status:me'
                        ? '📢 Meu status'
                        : selectedPhone?.startsWith('status:')
                          ? (contacts[selectedPhone.slice(7)]?.name || formatPhone(selectedPhone.slice(7)))
                          : (selectedName || formatPhone(selectedPhone))}
                    </div>
                    <div className="text-[11px] text-[#8696a0] flex items-center gap-1">
                      {selectedPhone?.startsWith('status:') ? (
                        <span>{selectedPhone === 'status:me' ? 'Suas publicações de status' : 'Status recente do contato'}</span>
                      ) : contactTypingPresence ? (
                        <span className="text-[#00a884] font-medium animate-pulse">
                          {contactTypingPresence === 'recording' ? 'gravando áudio...' : 'digitando...'}
                        </span>
                      ) : contactOnlineStatus === 'online' ? (
                        <span className="text-[#00a884] font-medium flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00a884] animate-pulse" /> online
                        </span>
                      ) : contactOnlineStatus ? (
                        <span>{contactOnlineStatus}</span>
                      ) : (
                        <>
                          <Phone className="w-2.5 h-2.5" /> {formatPhone(selectedPhone)}
                        </>
                      )}
                    </div>

                  </div>
                </button>
                {selectedPhone === 'status:me' && (
                  <Button size="sm" className="h-7 text-[11px] px-2 bg-[#00a884] hover:bg-[#02906f] text-white"
                    onClick={() => setShowStatusComposer(true)}>
                    <Plus className="w-3 h-3 mr-1" /> Postar status
                  </Button>
                )}
                {isMobile && !selectedPhone?.startsWith('status:') && (
                  <Button size="sm" variant={showRenewalPanel ? 'default' : 'outline'} className="h-7 text-[11px] px-2"
                    onClick={() => setShowRenewalPanel(v => !v)}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Renovar
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-[#aebac1] hover:bg-white/5">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setShowContactInfo(true)}>
                      <Info className="w-4 h-4 mr-2" /> Informações do contato
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => copyText(formatPhone(selectedPhone))}>
                      <Copy className="w-4 h-4 mr-2" /> Copiar número
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(`https://wa.me/${selectedPhone}`, '_blank')}>
                      <ExternalLink className="w-4 h-4 mr-2" /> Abrir no WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={load}>
                      <RefreshCw className="w-4 h-4 mr-2" /> Recarregar mensagens
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => syncHistory(selectedPhone || undefined)} disabled={syncingHistory || !selectedPhone || selectedPhone.startsWith('status:')}>
                      <RefreshCw className={cn('w-4 h-4 mr-2', syncingHistory && 'animate-spin')} /> Sincronizar histórico desta conversa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={clearConversation} className="text-destructive focus:text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" /> Limpar conversa
                    </DropdownMenuItem>

                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Pinned messages bar */}
              {pinnedMessages.length > 0 && (
                <div className="px-3 py-1.5 border-b border-[#0b1115] bg-[#1d282f]/80 backdrop-blur flex items-center gap-2 overflow-x-auto">
                  <Pin className="w-3.5 h-3.5 text-[#00a884] shrink-0" />
                  <div className="flex gap-1.5 overflow-x-auto">
                    {pinnedMessages.slice(-5).map(m => (
                      <button
                        key={m.id}
                        onClick={() => scrollToMessage(m.id)}
                        className="group shrink-0 flex items-center gap-1.5 max-w-[200px] text-[11px] px-2 py-1 rounded-md bg-[#2a3942] text-[#e9edef] hover:bg-[#374248] transition-colors"
                        title="Clique para ir até a mensagem"
                      >
                        <span className="truncate">{m.content || (m.message_type === 'image' ? '📷 Imagem' : m.message_type === 'audio' ? '🎤 Áudio' : '📎 Anexo')}</span>
                        <PinOff
                          className="w-3 h-3 opacity-60 hover:opacity-100 hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); togglePin(m.id); }}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="ml-auto text-[10px] text-[#8696a0] shrink-0">{pinnedMessages.length} fixada{pinnedMessages.length > 1 ? 's' : ''}</span>
                </div>
              )}


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
                    {g.items.map((m) => {
                      const isPinned = pinnedIds.has(m.id);
                      return (
                      <div key={m.id} id={`evo-msg-${m.id}`} className={cn('group flex transition-all rounded-lg', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div className={cn(
                              'max-w-[78%] md:max-w-[65%] rounded-lg px-2 py-1 text-sm shadow-sm relative text-[#e9edef] transition-transform hover:-translate-y-0.5 cursor-context-menu',
                              m.direction === 'out' ? 'bg-[#005c4b] rounded-tr-sm' : 'bg-[#202c33] rounded-tl-sm',
                              m._failed && 'ring-1 ring-destructive',
                              isPinned && 'ring-1 ring-[#00a884]/60',
                            )}>
                              {isPinned && (
                                <Pin className="absolute -top-1.5 -left-1.5 w-3 h-3 text-[#00a884] bg-[#0b141a] rounded-full p-0.5" />
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleReply(m); }}
                                className="absolute top-1 right-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 rounded-full p-0.5"
                                title="Responder"
                                aria-label="Responder"
                              >
                                <Reply className="w-3 h-3 text-white" />
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 rounded-full p-0.5"
                                    aria-label="Opções da mensagem"
                                  >
                                    <ChevronDown className="w-3 h-3 text-white" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <div className="px-1 py-1.5 flex gap-1 justify-around">
                                    {['👍','❤️','😂','😮','😢','🙏'].map(em => (
                                      <button key={em} onClick={() => sendReaction(m, em)}
                                        className="text-lg hover:scale-125 transition-transform" title={`Reagir ${em}`}>
                                        {em}
                                      </button>
                                    ))}
                                  </div>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleReply(m)}>
                                    <Reply className="w-4 h-4 mr-2" /> Responder
                                  </DropdownMenuItem>
                                  {m.content && (
                                    <DropdownMenuItem onClick={() => copyText(m.content)}>
                                      <Copy className="w-4 h-4 mr-2" /> Copiar texto
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleForward(m)}>
                                    <Forward className="w-4 h-4 mr-2" /> Encaminhar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => togglePin(m.id)}>
                                    {isPinned ? <><PinOff className="w-4 h-4 mr-2" /> Desafixar</> : <><Pin className="w-4 h-4 mr-2" /> Fixar mensagem</>}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => toggleFavorite(m)}>
                                    {isFavorited(m.id) ? <><StarOff className="w-4 h-4 mr-2" /> Desfavoritar</> : <><Star className="w-4 h-4 mr-2" /> Favoritar</>}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => deleteMessage(m)} className="text-destructive focus:text-destructive">
                                    <Trash className="w-4 h-4 mr-2" /> Excluir mensagem
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {(() => {
                                const q = extractQuotedFromRaw(m.raw);
                                if (!q) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => q.id && scrollToMessage(thread.find(x => x.external_id === q.id)?.id || '')}
                                    className={cn(
                                      'mx-1 mt-1 mb-0.5 flex w-[calc(100%-0.5rem)] items-stretch gap-2 rounded-md overflow-hidden text-left',
                                      m.direction === 'out' ? 'bg-black/20' : 'bg-black/30',
                                    )}
                                  >
                                    <div className="w-1 bg-[#00a884] shrink-0" />
                                    <div className="py-1 pr-2 min-w-0">
                                      <div className="text-[11px] font-semibold text-[#00a884]">
                                        {q.fromMe ? 'Você' : (selectedName || formatPhone(m.phone))}
                                      </div>
                                      <div className="text-[12px] text-[#aebac1] truncate">{q.text || 'Mensagem'}</div>
                                    </div>
                                  </button>
                                );
                              })()}
                              <div className="px-1.5 pt-0.5">
                                {renderMessageBody(m)}
                              </div>
                              <div className="flex items-center justify-end gap-1 px-1.5 pb-0.5 mt-0.5 text-[10px] text-[#aebac1]">
                                {isPinned && <Pin className="w-2.5 h-2.5 text-[#00a884]" />}
                                <span>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                {m.direction === 'out' && (
                                  m._failed || m.status === 'failed'
                                    ? <button onClick={(e) => { e.stopPropagation(); resendMessage(m); }} title="Reenviar" className="text-destructive hover:scale-125 transition-transform">⚠️</button>
                                    : m._pending
                                      ? <span title="Enviando...">⏳</span>
                                      : m.status === 'read'
                                        ? <span className="text-[#53bdeb] font-bold leading-none tracking-[-2px]" title="Lida">✓✓</span>
                                        : m.status === 'delivered'
                                          ? <span className="text-[#aebac1] font-bold leading-none tracking-[-2px]" title="Entregue">✓✓</span>
                                          : <span className="text-[#aebac1] font-bold leading-none" title="Enviada">✓</span>
                                )}
                              </div>

                              {m.external_id && reactionsByExternalId[m.external_id] && (
                                <div className={cn(
                                  'absolute -bottom-2.5 text-xs px-1.5 py-0.5 rounded-full bg-[#2a3942] border border-[#0b141a] shadow',
                                  m.direction === 'out' ? 'right-2' : 'left-2',
                                )}>
                                  {reactionsByExternalId[m.external_id].emoji}
                                </div>
                              )}
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-56">
                            <div className="px-1 py-1.5 flex gap-1 justify-around">
                              {['👍','❤️','😂','😮','😢','🙏'].map(em => (
                                <button key={em} onClick={() => sendReaction(m, em)}
                                  className="text-lg hover:scale-125 transition-transform" title={`Reagir ${em}`}>
                                  {em}
                                </button>
                              ))}
                            </div>
                            <ContextMenuItem onClick={() => handleReply(m)}>
                              <Reply className="w-4 h-4 mr-2" /> Responder
                            </ContextMenuItem>
                            {m.content && (
                              <ContextMenuItem onClick={() => copyText(m.content)}>
                                <Copy className="w-4 h-4 mr-2" /> Copiar texto
                              </ContextMenuItem>
                            )}
                            <ContextMenuItem onClick={() => handleForward(m)}>
                              <Forward className="w-4 h-4 mr-2" /> Encaminhar
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => togglePin(m.id)}>
                              {isPinned ? <><PinOff className="w-4 h-4 mr-2" /> Desafixar</> : <><Pin className="w-4 h-4 mr-2" /> Fixar mensagem</>}
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => toggleFavorite(m)}>
                              {isFavorited(m.id) ? <><StarOff className="w-4 h-4 mr-2" /> Desfavoritar</> : <><Star className="w-4 h-4 mr-2" /> Favoritar</>}
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => scrollToMessage(m.id)}>
                              <Info className="w-4 h-4 mr-2" /> Centralizar
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => deleteMessage(m)} className="text-destructive focus:text-destructive">
                              <Trash className="w-4 h-4 mr-2" /> Excluir mensagem
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      </div>
                    );})}
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

              {replyTo && (
                <div className="px-2 py-2 border-t border-[#0b1115] bg-[#1d282f] flex items-start gap-2 animate-in slide-in-from-bottom-1">
                  <div className="w-1 self-stretch rounded bg-[#00a884]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-[#00a884]">
                      {replyTo.direction === 'out' ? 'Você' : (selectedName || formatPhone(replyTo.phone))}
                    </div>
                    <div className="text-[12px] text-[#aebac1] truncate">
                      {replyTo.content || (replyTo.message_type === 'image' ? '📷 Imagem' : replyTo.message_type === 'audio' ? '🎤 Áudio' : replyTo.message_type === 'sticker' ? '🌟 Sticker' : '📎 Anexo')}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-[#aebac1] hover:bg-white/5" onClick={() => setReplyTo(null)} title="Cancelar resposta">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}


              {/* Composer */}
              {selectedPhone?.startsWith('status:') ? (
                <div className="px-4 py-3 border-t border-[#0b1115] bg-[#202c33] flex items-center justify-between gap-3">
                  <div className="text-[12px] text-[#8696a0]">
                    {selectedPhone === 'status:me'
                      ? <>Suas publicações de status. Use <span className="text-[#00a884] font-medium">Postar status</span> para publicar.</>
                      : 'Visualizando status do contato.'}
                  </div>
                  {selectedPhone === 'status:me' && (
                    <Button size="sm" className="h-8 bg-[#00a884] hover:bg-[#02906f] text-white"
                      onClick={() => setShowStatusComposer(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Postar
                    </Button>
                  )}
                </div>
              ) : (
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
                      ref={composerRef}
                      placeholder="Digite uma mensagem..."
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); if (e.target.value.trim()) notifyTyping(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
                          e.preventDefault();
                          const t = e.currentTarget;
                          const start = t.selectionStart ?? draft.length;
                          const end = t.selectionEnd ?? draft.length;
                          const next = draft.slice(0, start) + '\n' + draft.slice(end);
                          setDraft(next);
                          requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = start + 1; });
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          send();
                        }
                      }}
                      onPaste={(e) => {
                        // Colar print/imagem do clipboard → abre o dialog de envio com legenda
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        for (let i = 0; i < items.length; i++) {
                          const it = items[i];
                          if (it.kind === 'file' && it.type.startsWith('image/')) {
                            const file = it.getAsFile();
                            if (file) {
                              e.preventDefault();
                              const named = new File([file], file.name || `print-${Date.now()}.png`, { type: file.type });
                              setImageToSend({ file: named, url: URL.createObjectURL(named), caption: '' });
                              return;
                            }
                          }
                        }
                      }}

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
              )}
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

      {/* Contact info side panel */}
      <Dialog open={showContactInfo} onOpenChange={setShowContactInfo}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-[#111b21] border-[#0b1115] text-[#e9edef]">
          {selectedPhone && (
            <div className="flex flex-col">
              <div className="bg-gradient-to-br from-[#00a884]/30 via-[#1f2a30] to-[#202c33] px-6 pt-8 pb-5 flex flex-col items-center text-center">
                <button onClick={() => selectedContact?.profile_pic_url && setAvatarPreview(selectedContact.profile_pic_url)}>
                  <Avatar className="h-28 w-28 ring-4 ring-[#00a884]/40 shadow-xl hover:scale-105 transition-transform">
                    {selectedContact?.profile_pic_url && <AvatarImage src={selectedContact.profile_pic_url} />}
                    <AvatarFallback className="text-3xl bg-[#00a884]/20 text-[#00a884]">
                      {initials(selectedName, selectedPhone)}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <div className="mt-3 text-lg font-semibold">{selectedName || formatPhone(selectedPhone)}</div>
                <div className="text-xs text-[#8696a0] flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {formatPhone(selectedPhone)}
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="ghost" className="flex-col h-auto py-3 hover:bg-white/5 text-[#aebac1]" onClick={() => copyText(formatPhone(selectedPhone))}>
                    <Copy className="w-5 h-5 text-[#00a884]" />
                    <span className="text-[11px] mt-1">Copiar</span>
                  </Button>
                  <Button variant="ghost" className="flex-col h-auto py-3 hover:bg-white/5 text-[#aebac1]" onClick={() => window.open(`https://wa.me/${selectedPhone}`, '_blank')}>
                    <ExternalLink className="w-5 h-5 text-[#00a884]" />
                    <span className="text-[11px] mt-1">WhatsApp</span>
                  </Button>
                  <Button variant="ghost" className="flex-col h-auto py-3 hover:bg-white/5 text-[#aebac1]" onClick={() => { setShowContactInfo(false); setShowRenewalPanel(true); }}>
                    <RefreshCw className="w-5 h-5 text-[#00a884]" />
                    <span className="text-[11px] mt-1">Renovar</span>
                  </Button>
                </div>
                <div className="rounded-lg bg-[#202c33] p-3 space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-[#8696a0]">Mensagens</span><span className="font-medium">{thread.length}</span></div>
                  <div className="flex justify-between"><span className="text-[#8696a0]">Fixadas</span><span className="font-medium">{pinnedMessages.length}</span></div>
                  <div className="flex justify-between"><span className="text-[#8696a0]">Instância</span><span className="font-medium truncate max-w-[180px]">{currentInstance || '—'}</span></div>
                  {thread[0] && (
                    <div className="flex justify-between"><span className="text-[#8696a0]">Primeira msg</span><span className="font-medium">{new Date(thread[0].created_at).toLocaleDateString('pt-BR')}</span></div>
                  )}
                </div>
              </div>
            </div>
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

      {/* Pré-visualização de documento com legenda */}
      <Dialog open={!!docToSend} onOpenChange={(open) => { if (!open) setDocToSend(null); }}>
        <DialogContent className="max-w-md p-4 bg-background border-border">
          {docToSend && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Enviar arquivo</div>
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{docToSend.file.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(docToSend.file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <textarea
                placeholder="Adicionar legenda (opcional)..."
                value={docToSend.caption}
                onChange={(e) => setDocToSend(s => s ? { ...s, caption: e.target.value } : s)}
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDocToSend(null)}>Cancelar</Button>
                <Button size="sm" disabled={sending} onClick={() => {
                  const data = docToSend;
                  setDocToSend(null);
                  sendMedia(data.file, 'document', data.caption.trim());
                }}>
                  <Send className="w-3.5 h-3.5 mr-1" /> Enviar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showStatusComposer} onOpenChange={setShowStatusComposer}>
        <DialogContent className="max-w-md">
          <div className="space-y-3">
            <div className="text-base font-semibold">📢 Postar Status no WhatsApp</div>
            <div className="text-xs text-muted-foreground">
              O texto será publicado como Status (broadcast) visível para seus contatos por 24h.
            </div>
            <textarea
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
              placeholder="Escreva seu status..."
              rows={4}
              maxLength={700}
              className="w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{statusDraft.length}/700</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowStatusComposer(false)}>Cancelar</Button>
                <Button size="sm" disabled={postingStatus || !statusDraft.trim()} onClick={postStatus}>
                  {postingStatus ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                  Publicar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-reply (AI) settings */}
      <Dialog open={showAutoReplySettings} onOpenChange={(open) => {
        setShowAutoReplySettings(open);
        if (open && user) {
          setAutoReplyLoading(true);
          supabase
            .from('evolution_settings')
            .select('autoreply_enabled, autoreply_system_prompt, autoreply_only_outside_hours, autoreply_business_start, autoreply_business_end, autoreply_disabled_phones, autoreply_model')
            .eq('user_id', user.id)
            .maybeSingle()
            .then(({ data }) => {
              if (data) {
                setAutoReply({
                  enabled: !!data.autoreply_enabled,
                  system_prompt: data.autoreply_system_prompt || '',
                  only_outside_hours: !!data.autoreply_only_outside_hours,
                  business_start: data.autoreply_business_start || '08:00',
                  business_end: data.autoreply_business_end || '18:00',
                  disabled_phones: data.autoreply_disabled_phones || [],
                  model: data.autoreply_model || 'google/gemini-3-flash-preview',
                });
              }
              setAutoReplyLoading(false);
            });
        }
      }}>
        <DialogContent className="max-w-lg p-4 bg-background border-border">
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Robô de auto-atendimento (IA)
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                Quando ativado, mensagens novas de clientes são respondidas automaticamente pela IA.
                Se você responder manualmente, o robô para de responder essa conversa.
                Funciona apenas em mensagens de texto de contatos individuais (não em grupos/canais/status).
              </p>
            </div>

            {autoReplyLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <label className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                  <div className="text-sm">Ligar auto-atendimento</div>
                  <input
                    type="checkbox"
                    checked={autoReply.enabled}
                    onChange={(e) => setAutoReply(s => ({ ...s, enabled: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                </label>

                <div>
                  <div className="text-xs font-medium mb-1">Instruções para a IA (prompt)</div>
                  <textarea
                    value={autoReply.system_prompt}
                    onChange={(e) => setAutoReply(s => ({ ...s, system_prompt: e.target.value }))}
                    rows={6}
                    className="w-full rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                    placeholder="Você é um atendente cordial..."
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Dica: oriente a IA a chamar um humano quando o cliente pedir preço, status de pagamento, ativação ou suporte técnico complexo.
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium mb-1">Modelo de IA</div>
                  <select
                    value={autoReply.model}
                    onChange={(e) => setAutoReply(s => ({ ...s, model: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background p-2 text-xs"
                  >
                    <option value="google/gemini-3-flash-preview">Gemini 3 Flash (rápido, recomendado)</option>
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (estável)</option>
                    <option value="google/gemini-2.5-pro">Gemini 2.5 Pro (mais inteligente)</option>
                    <option value="openai/gpt-5-mini">GPT-5 Mini</option>
                    <option value="openai/gpt-5">GPT-5 (mais caro)</option>
                  </select>
                </div>

                <label className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                  <div className="text-sm">Responder só FORA do horário comercial</div>
                  <input
                    type="checkbox"
                    checked={autoReply.only_outside_hours}
                    onChange={(e) => setAutoReply(s => ({ ...s, only_outside_hours: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                </label>

                {autoReply.only_outside_hours && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs mb-1">Início (BRT)</div>
                      <Input type="time" value={autoReply.business_start} onChange={(e) => setAutoReply(s => ({ ...s, business_start: e.target.value }))} className="h-8 text-xs" />
                    </div>
                    <div>
                      <div className="text-xs mb-1">Fim (BRT)</div>
                      <Input type="time" value={autoReply.business_end} onChange={(e) => setAutoReply(s => ({ ...s, business_end: e.target.value }))} className="h-8 text-xs" />
                    </div>
                  </div>
                )}

                {autoReply.disabled_phones.length > 0 && (
                  <div>
                    <div className="text-xs font-medium mb-1">Contatos com auto-atendimento DESATIVADO ({autoReply.disabled_phones.length})</div>
                    <div className="max-h-24 overflow-auto rounded-md border border-border p-2 space-y-1">
                      {autoReply.disabled_phones.map((p) => (
                        <div key={p} className="flex items-center justify-between text-xs">
                          <span>{formatPhone(p)}</span>
                          <button
                            className="text-[10px] text-primary hover:underline"
                            onClick={() => setAutoReply(s => ({ ...s, disabled_phones: s.disabled_phones.filter(x => x !== p) }))}
                          >
                            Reativar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setShowAutoReplySettings(false)}>Cancelar</Button>
                  <Button
                    size="sm"
                    disabled={autoReplySaving}
                    onClick={async () => {
                      if (!user) return;
                      setAutoReplySaving(true);
                      const { error } = await supabase
                        .from('evolution_settings')
                        .update({
                          autoreply_enabled: autoReply.enabled,
                          autoreply_system_prompt: autoReply.system_prompt,
                          autoreply_only_outside_hours: autoReply.only_outside_hours,
                          autoreply_business_start: autoReply.business_start,
                          autoreply_business_end: autoReply.business_end,
                          autoreply_disabled_phones: autoReply.disabled_phones,
                          autoreply_model: autoReply.model,
                        })
                        .eq('user_id', user.id);
                      setAutoReplySaving(false);
                      if (error) {
                        toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
                        return;
                      }
                      toast({ title: autoReply.enabled ? '🤖 Auto-atendimento ATIVO' : 'Auto-atendimento desativado' });
                      setShowAutoReplySettings(false);
                    }}
                  >
                    {autoReplySaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                    Salvar
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
