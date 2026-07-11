import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import {
  Loader2, Send, Zap, Plus, RefreshCw, Search, MessageSquare,
  Phone, X, Smile, Mic, Paperclip, Trash2, Image as ImageIcon, FileText, Sticker, QrCode,
  Pin, PinOff, Info, Copy, ExternalLink, MoreVertical, ArrowLeft, ChevronDown,
  Reply, Forward, Star, StarOff, Trash, Volume2, VolumeX, BookOpen, CheckCircle2, MailOpen, Maximize2, UserPlus, Pencil, Check,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import KnowledgeBaseDialog from '@/components/chat/KnowledgeBaseDialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Link } from 'react-router-dom';
import { tryAutocorrectOnInput } from '@/lib/pt-autocorrect';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import QuickRenewalPanel from '@/components/chat/QuickRenewalPanel';
import PdfPreview from '@/components/chat/PdfPreview';

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

interface ConversationStateRow {
  phone: string;
  last_read_at: string | null;
  manual_unread: boolean;
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
    ['data', 'Message', 'videoMessage', 'base64'], ['data', 'Message', 'audioMessage', 'base64'], ['data', 'Message', 'documentMessage', 'base64'],
    ['Message', 'videoMessage', 'base64'], ['Message', 'audioMessage', 'base64'], ['Message', 'documentMessage', 'base64'],
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
  const mime = m.media_mime || (m.message_type === 'video' ? 'video/mp4' : m.message_type === 'audio' ? 'audio/ogg' : m.message_type === 'sticker' ? 'image/webp' : 'image/jpeg');
  return base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`;
}

// Formata texto estilo WhatsApp: *negrito*, _itálico_, ~tachado~, ```mono```
function formatWaText(text: string): React.ReactNode {
  if (!text) return text;
  // Quebra por linhas para preservar quebras
  const lines = text.split('\n');
  const tokenRegex = /(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g;
  return lines.map((line, li) => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    tokenRegex.lastIndex = 0;
    while ((m = tokenRegex.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith('```') && tok.endsWith('```')) {
        parts.push(<code key={`${li}-${m.index}`} className="px-1 py-0.5 rounded bg-black/30 font-mono text-[12px]">{tok.slice(3, -3)}</code>);
      } else if (tok.startsWith('*') && tok.endsWith('*')) {
        parts.push(<strong key={`${li}-${m.index}`} className="font-semibold">{tok.slice(1, -1)}</strong>);
      } else if (tok.startsWith('_') && tok.endsWith('_')) {
        parts.push(<em key={`${li}-${m.index}`}>{tok.slice(1, -1)}</em>);
      } else if (tok.startsWith('~') && tok.endsWith('~')) {
        parts.push(<span key={`${li}-${m.index}`} className="line-through">{tok.slice(1, -1)}</span>);
      } else if (/^https?:\/\//.test(tok)) {
        parts.push(<a key={`${li}-${m.index}`} href={tok} target="_blank" rel="noreferrer" className="underline text-[#53bdeb] break-all">{tok}</a>);
      } else {
        parts.push(tok);
      }
      last = m.index + tok.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return (
      <React.Fragment key={li}>
        {parts}
        {li < lines.length - 1 && '\n'}
      </React.Fragment>
    );
  });
}


function isProtocolPlaceholder(m: EvoMessage) {
  if (m.content !== '[text]' && m.content !== 'text') return false;
  const msg = getNestedValue(m.raw, ['data', 'Message']) || getNestedValue(m.raw, ['Message']) || getNestedValue(m.raw, ['message']);
  return !!getNestedValue(msg, ['protocolMessage']) || !!getNestedValue(msg, ['messageContextInfo']);
}

async function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function EvolutionChat({ embed = false }: { embed?: boolean } = {}) {
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
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhaustedPhones, setExhaustedPhones] = useState<Set<string>>(new Set());
  const [newPhone, setNewPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [showRenewalPanel, setShowRenewalPanel] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  // Slash command (/) — dispatch bot flow from composer
  const [botFlows, setBotFlows] = useState<Array<{ id: string; name: string; start_step_id: string | null; steps: any[] }>>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [dispatchingFlow, setDispatchingFlow] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [previewImage, setPreviewImage] = useState<{ url: string; caption: string } | null>(null);
  const [vcardPreview, setVcardPreview] = useState<{ name: string; phones: string[]; emails: string[]; org?: string; raw: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [imageToSend, setImageToSend] = useState<{ file: File; url: string; caption: string } | null>(null);
  const [docToSend, setDocToSend] = useState<{ file: File; caption: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'media' | 'groups' | 'channels' | 'contacts' | 'support'>('all');
  const [showKbDialog, setShowKbDialog] = useState(false);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('evo_sound_enabled') !== '0'; } catch { return true; }
  });
  const [showAutoReplySettings, setShowAutoReplySettings] = useState(false);
  const [autoReply, setAutoReply] = useState<{
    enabled: boolean;
    only_outside_hours: boolean;
    business_start: string;
    business_end: string;
    disabled_phones: string[];
    absence_enabled: boolean;
    absence_message: string;
    absence_cooldown_hours: number;
  }>({
    enabled: false,
    only_outside_hours: false,
    business_start: '08:00',
    business_end: '18:00',
    disabled_phones: [],
    absence_enabled: false,
    absence_message: 'Olá! No momento estamos fora do horário de atendimento. Assim que possível responderemos sua mensagem. 🙏',
    absence_cooldown_hours: 6,
  });

  const [autoReplyLoading, setAutoReplyLoading] = useState(false);
  const [autoReplySaving, setAutoReplySaving] = useState(false);
  const [instances, setInstances] = useState<Array<{ id: string; name: string; phone: string | null; state: string; profile_name: string | null }>>([]);
  const [currentInstance, setCurrentInstance] = useState<string>('');
  const [switchingInstance, setSwitchingInstance] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [editingContactName, setEditingContactName] = useState(false);
  const [contactNameDraft, setContactNameDraft] = useState('');
  const [savingContactName, setSavingContactName] = useState(false);
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
  const [manualUnreadPhones, setManualUnreadPhones] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('evo_manual_unread') || '[]')); } catch { return new Set(); }
  });
  const [localReactions, setLocalReactions] = useState<Record<string, { emoji: string; from: 'in' | 'out' }>>({});
  const [typingByPhone, setTypingByPhone] = useState<Record<string, { presence: string; at: number }>>({});
  const [lastSeenByPhone, setLastSeenByPhone] = useState<Record<string, string>>({});
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [stickerLibrary, setStickerLibrary] = useState<Array<{ id: string; url: string; mime: string; path: string }>>([]);
  const [stickerLibLoading, setStickerLibLoading] = useState(false);
  const [stickerPopoverOpen, setStickerPopoverOpen] = useState(false);
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playNotificationSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    const now = Date.now();
    if (now - lastSoundAtRef.current < 800) return; // throttle
    lastSoundAtRef.current = now;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtxRef.current || new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const makeTone = (delay: number, freq: number, peak: number, duration: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        const t = ctx.currentTime + delay;
        o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(freq * 0.92, t + duration);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        o.start(t);
        o.stop(t + duration + 0.02);
      };
      makeTone(0, 1046, 0.09, 0.12);
      makeTone(0.075, 1320, 0.075, 0.14);
    } catch { /* noop */ }
  }, []);

  // Desbloqueia áudio na primeira interação do usuário (autoplay policy do Chrome/iOS)
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = audioCtxRef.current || new Ctx();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') void ctx.resume();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      } catch { /* noop */ }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
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
    const sameIndex = prev.findIndex((m) => m.id === incoming.id || (incoming.external_id && m.external_id === incoming.external_id));
    if (sameIndex >= 0) {
      const current = prev[sameIndex];
      const hasNewMedia = !!incoming.media_url && incoming.media_url !== current.media_url;
      const hasNewRaw = !current.raw && !!incoming.raw;
      if (!hasNewMedia && !hasNewRaw) return prev;
      const copy = [...prev];
      copy[sameIndex] = { ...current, ...incoming, raw: incoming.raw || current.raw, media_url: incoming.media_url || current.media_url };
      return copy;
    }

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

  const loadOlderForPhone = useCallback(async (phone: string) => {
    if (!user || !phone) return;
    if (exhaustedPhones.has(phone)) return;
    setLoadingOlder(true);
    try {
      const existingForPhone = messagesRef.current.filter(m => m.phone === phone);
      const oldest = existingForPhone.reduce<string | null>((acc, m) => {
        if (!acc) return m.created_at;
        return new Date(m.created_at).getTime() < new Date(acc).getTime() ? m.created_at : acc;
      }, null);
      let query = supabase
        .from('evolution_messages')
        .select('*')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(500);
      if (oldest) query = query.lt('created_at', oldest);
      const { data, error } = await query;
      if (error) {
        toast({ title: 'Erro ao carregar antigas', description: error.message, variant: 'destructive' });
        return;
      }
      const rows = ((data || []) as unknown) as EvoMessage[];
      if (rows.length === 0) {
        setExhaustedPhones(prev => { const n = new Set(prev); n.add(phone); return n; });
        toast({ title: 'Sem mensagens mais antigas', description: 'Esta conversa já está totalmente carregada.' });
        return;
      }
      setMessages(prev => {
        const byId = new Map<string, EvoMessage>();
        for (const m of prev) byId.set(m.id, m);
        for (const m of rows) if (!byId.has(m.id)) byId.set(m.id, m);
        return Array.from(byId.values());
      });
      if (rows.length < 500) {
        setExhaustedPhones(prev => { const n = new Set(prev); n.add(phone); return n; });
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [user, exhaustedPhones]);
  const load = useCallback(async () => {
    if (!user) return;
    const hadCache = messagesRef.current.length > 0;
    if (!hadCache) setLoading(true);
    const [msgRes, contRes, presRes, stateRes] = await Promise.all([
      // Reduzido de 1500 → 800: abre muito mais rápido no celular e a UI mostra "Carregar mais antigas" se precisar.
      supabase.from('evolution_messages').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(800),
      supabase.from('evolution_contacts').select('phone, name, profile_pic_url, needs_human, ai_category').eq('user_id', user.id),
      supabase.from('evolution_presence').select('phone, presence, last_seen_at, updated_at').eq('user_id', user.id),
      (supabase.from('evolution_conversation_state' as any) as any).select('phone,last_read_at,manual_unread').eq('user_id', user.id),
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
    const readMap: Record<string, string> = {};
    const unreadSet = new Set<string>();
    for (const row of (((stateRes as any).data || []) as ConversationStateRow[])) {
      if (row.last_read_at) readMap[row.phone] = row.last_read_at;
      if (row.manual_unread) unreadSet.add(row.phone);
    }
    // Always replace from DB (source of truth), even when empty — so clearing read state in one browser propagates to others.
    setLastReadByPhone(readMap);
    try { localStorage.setItem('evo_last_read', JSON.stringify(readMap)); } catch { /* noop */ }
    setManualUnreadPhones(unreadSet);
    try { localStorage.setItem('evo_manual_unread', JSON.stringify([...unreadSet])); } catch { /* noop */ }
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

  // Carrega status do robô (somente o "enabled") para mostrar o badge no header.
  useEffect(() => {
    if (!user) return;
    supabase
      .from('evolution_settings')
      .select('autoreply_enabled')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAutoReply((s) => ({ ...s, enabled: !!data.autoreply_enabled }));
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('evolution_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evolution_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        const m = payload.new as EvoMessage;
        setMessages((prev) => {
          return mergeMessage(prev, m);
        });
        // Play notification when an incoming message arrives (skip channels/status, skip our own outgoing).
        // Toca SEMPRE em mensagens recebidas (igual WhatsApp Web), exceto se o som estiver mutado.
        try {
          if (
            m?.direction === 'in' &&
            m?.phone &&
            !m.phone.startsWith('status') &&
            !/^\d{15,}$/.test(m.phone) /* not newsletter */
          ) {
            playNotificationSound();
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evolution_conversation_state', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { phone?: string } | null;
          if (!old?.phone) return;
          setManualUnreadPhones(prev => {
            const next = new Set(prev); next.delete(old.phone!);
            try { localStorage.setItem('evo_manual_unread', JSON.stringify([...next])); } catch { /* noop */ }
            return next;
          });
          return;
        }
        const row = payload.new as ConversationStateRow | null;
        if (!row?.phone) return;
        setManualUnreadPhones(prev => {
          const next = new Set(prev);
          if (row.manual_unread) next.add(row.phone); else next.delete(row.phone);
          try { localStorage.setItem('evo_manual_unread', JSON.stringify([...next])); } catch { /* noop */ }
          return next;
        });
        setLastReadByPhone(prev => {
          const next = { ...prev };
          if (row.last_read_at) next[row.phone] = row.last_read_at;
          else delete next[row.phone];
          try { localStorage.setItem('evo_last_read', JSON.stringify(next)); } catch { /* noop */ }
          return next;
        });
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
    const msgByPhone = new Map<string, EvoMessage[]>();
    for (const m of instanceMessages) {
      if (!msgByPhone.has(m.phone)) msgByPhone.set(m.phone, []);
      msgByPhone.get(m.phone)!.push(m);
    }
    for (const conv of map.values()) {
      const lastRead = lastReadByPhone[conv.phone] || "";
      const cutoffStr = [lastRead, conv.lastOutAt].filter(Boolean).sort().pop() || "";
      const cutoff = cutoffStr ? new Date(cutoffStr).getTime() : 0;
      let count = 0;
      const convMsgs = msgByPhone.get(conv.phone) || [];
      for (const m of convMsgs) {
        if (m.direction !== "in") continue;
        if (m.status === "read" || m.status === "played") continue;
        if (new Date(m.created_at).getTime() > cutoff) count++;
      }
      if (manualUnreadPhones.has(conv.phone) && count === 0) count = 1;
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
    else if (filter === 'unread') filtered = arr.filter(c => c.unread > 0 && !isNewsletterPhone(c.phone));
    else if (filter === 'media') filtered = arr.filter(c => c.last && ['image', 'audio', 'document', 'sticker'].includes(c.last.message_type) && !isNewsletterPhone(c.phone));
    else if (filter === 'channels') filtered = arr.filter(c => isNewsletterPhone(c.phone));
    else if (filter === 'groups') filtered = arr.filter(c => c.phone && !c.phone.startsWith('status') && !isNewsletterPhone(c.phone) && isGroupJidPhone(c.phone));
    else if (filter === 'contacts') filtered = arr.filter(c => c.phone && c.phone.length <= 15 && !c.phone.startsWith('status') && !isNewsletterPhone(c.phone));
    else {
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
  }, [instanceMessages, search, contacts, selectedPhone, filter, instancePhones, pinnedContacts, lastReadByPhone, manualUnreadPhones]);

  // Counts shown as badges on the filter pills (independent of current filter/search)
  const filterCounts = useMemo(() => {
    const phones = new Set<string>();
    const lastByPhone = new Map<string, EvoMessage>();
    const lastOutByPhone = new Map<string, string>();
    const msgsByPhone = new Map<string, EvoMessage[]>();
    Object.values(contacts).forEach((c) => {
      if (!instancePhones || instancePhones.has(c.phone) || c.phone === selectedPhone) phones.add(c.phone);
    });
    for (const m of instanceMessages) {
      phones.add(m.phone);
      if (!msgsByPhone.has(m.phone)) msgsByPhone.set(m.phone, []);
      msgsByPhone.get(m.phone)!.push(m);
      const cur = lastByPhone.get(m.phone);
      if (!cur || new Date(m.created_at) > new Date(cur.created_at)) lastByPhone.set(m.phone, m);
      if (m.direction === 'out') {
        const lo = lastOutByPhone.get(m.phone);
        if (!lo || new Date(m.created_at) > new Date(lo)) lastOutByPhone.set(m.phone, m.created_at);
      }
    }
    let all = 0, unread = 0, support = 0, contactsC = 0, groups = 0, channels = 0, media = 0;
    for (const p of phones) {
      if (p.startsWith('status:')) continue;
      const isNews = isNewsletterPhone(p);
      const isGrp = !isNews && isGroupJidPhone(p);
      const last = lastByPhone.get(p);
      const lastRead = lastReadByPhone[p] || '';
      const lastOutAt = lastOutByPhone.get(p) || '';
      const cutoffStr = [lastRead, lastOutAt].filter(Boolean).sort().pop() || '';
      const cutoff = cutoffStr ? new Date(cutoffStr).getTime() : 0;
      let u = 0;
      for (const m of msgsByPhone.get(p) || []) {
        if (m.direction !== 'in') continue;
        if (m.status === 'read' || m.status === 'played') continue;
        if (new Date(m.created_at).getTime() > cutoff) u++;
      }
      if (manualUnreadPhones.has(p) && u === 0) u = 1;
      if (!isNews) all++;
      if (!isNews && u > 0) unread++;
      if (contacts[p]?.needs_human && !isNews) support++;
      if (!isNews && !isGrp && p.length <= 15) contactsC++;
      if (isGrp) groups++;
      if (isNews) channels++;
      if (last && ['image', 'audio', 'document', 'sticker'].includes(last.message_type) && !isNews) media++;
    }
    return { all, unread, support, contacts: contactsC, groups, channels, media };
  }, [instanceMessages, contacts, lastReadByPhone, manualUnreadPhones, instancePhones, selectedPhone]);

  // Mark conversation as read when opened (or new message arrives in opened chat)
  useEffect(() => {
    if (!selectedPhone) return;
    if (selectedPhone.startsWith('status:')) return; // status broadcasts have no read marker
    if (manualUnreadPhones.has(selectedPhone)) return;
    const openedAt = new Date().toISOString();
    setLastReadByPhone(prev => {
      const next = { ...prev, [selectedPhone]: openedAt };
      try { localStorage.setItem('evo_last_read', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    invokeEvolution({ action: 'mark-read', phone: selectedPhone, readAt: openedAt }).catch(() => undefined);
  }, [selectedPhone, instanceMessages.length, manualUnreadPhones]);


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
    const { data, error } = await invokeEvolution({ action: 'delete-messages', id: m.id });
    if (error || data?.error) {
      toast({ title: 'Não foi possível excluir', description: error?.message || data?.error, variant: 'destructive' });
      setMessages(prev => [...prev, m].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      return;
    }
    toast({ title: 'Mensagem excluída' });
  };

  const clearConversation = async (phoneOverride?: string) => {
    const targetPhone = phoneOverride || selectedPhone;
    if (!targetPhone || !user) return;
    if (!confirm('Apagar TODAS as mensagens desta conversa? Esta ação não pode ser desfeita.')) return;
    const phone = targetPhone;
    const removed = messages.filter(m => m.phone === phone);
    setMessages(prev => prev.filter(m => m.phone !== phone));
    const { data, error } = await invokeEvolution({ action: 'delete-messages', phone });
    if (error || data?.error) {
      toast({ title: 'Falha ao limpar conversa', description: error?.message || data?.error, variant: 'destructive' });
      setMessages(prev => [...prev, ...removed]);
      return;
    }
    if (user) {
      await supabase.from('evolution_contacts').delete().eq('user_id', user.id).eq('phone', phone);
      await (supabase.from('evolution_conversation_state' as any) as any).delete().eq('user_id', user.id).eq('phone', phone);
    }
    setContacts(prev => {
      const next = { ...prev };
      delete next[phone];
      return next;
    });
    setSelectedPhone(null);
    toast({ title: 'Conversa apagada', description: `${data?.deleted ?? removed.length} mensagens removidas` });
  };

  const markConversationUnread = (phone: string) => {
    setManualUnreadPhones(prev => {
      const next = new Set(prev);
      next.add(phone);
      try { localStorage.setItem('evo_manual_unread', JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
    invokeEvolution({ action: 'mark-unread', phone }).catch(() => undefined);
    toast({ title: 'Marcada como não lida' });
  };

  const markConversationRead = async (phone: string) => {
    if (!phone) return;
    setManualUnreadPhones(prev => {
      const next = new Set(prev);
      next.delete(phone);
      try { localStorage.setItem("evo_manual_unread", JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
    setLastReadByPhone(prev => {
      const next = { ...prev, [phone]: new Date().toISOString() };
      try { localStorage.setItem("evo_last_read", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    await invokeEvolution({ action: "mark-read", phone }).catch(() => undefined);
    toast({ title: "Marcada como lida" });
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
        description: data?.error || error?.message || 'O WhatsApp não confirmou a reação no WhatsApp.',
        variant: 'destructive',
      });
      return;
    }
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
        toast({ title: 'Erro ao enviar', description: error?.message || data?.error || 'O WhatsApp não confirmou o envio.', variant: 'destructive' });
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

  // Load user's bot flows for the slash (/) command
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('bot_flows' as any)
        .select('id,name,enabled,start_step_id,steps')
        .eq('owner_id', user.id)
        .eq('enabled', true)
        .order('updated_at', { ascending: false });
      const rows = (data as any[] | null) ?? [];
      setBotFlows(rows.map(r => ({
        id: r.id, name: r.name,
        start_step_id: r.start_step_id ?? null,
        steps: Array.isArray(r.steps) ? r.steps : [],
      })));
    })();
  }, [user]);

  const filteredFlows = useMemo(() => {
    const q = slashQuery.trim().toLowerCase();
    if (!q) return botFlows.slice(0, 8);
    return botFlows.filter(f => (f.name || '').toLowerCase().includes(q)).slice(0, 8);
  }, [botFlows, slashQuery]);

  const sendFlowText = async (phone: string, text: string, raw: Record<string, unknown> = {}) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic: EvoMessage = {
      id: tempId, phone, contact_name: null, direction: 'out',
      content: text, message_type: 'text', media_url: null, media_mime: null,
      created_at: new Date().toISOString(), instance_name: currentInstance || null, raw, _pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    const { data, error } = await invokeEvolution({ action: 'send', phone, text, bot_flow: true });
    if (error || data?.error || data?.ok === false) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m));
      throw new Error(error?.message || data?.error || 'O WhatsApp não confirmou o envio.');
    }
    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, status: 'sent', external_id: data?.externalId || m.external_id, raw: { ...(data || {}), ...raw } } : m));
  };

  const sendFlowMenu = async (phone: string, step: any) => {
    const text = String(step.text || step.title || '').trim();
    const buttons = Array.isArray(step.buttons) ? step.buttons.filter((b: any) => String(b?.label || '').trim()) : [];
    const mode = String(step.menu_style || 'buttons');
    const fallback = text ? `${text}\n\n${buttons.map((b: any, i: number) => `${i + 1}️⃣ ${b.label}`).join('\n')}` : buttons.map((b: any, i: number) => `${i + 1}️⃣ ${b.label}`).join('\n');
    if (!buttons.length || mode === 'numbered') return sendFlowText(phone, fallback || text, { __bot_flow_menu: true, step_id: step.id });
    const { data, error } = await invokeEvolution({ action: 'send-menu', phone, text, buttons: buttons.map((b: any) => ({ id: b.id, label: b.label })), mode });
    if (error || data?.error || data?.ok === false) throw new Error(error?.message || data?.error || 'O WhatsApp não confirmou o envio do menu real.');
    setMessages(prev => [...prev, {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, phone, contact_name: null, direction: 'out',
      content: fallback, message_type: 'text', media_url: null, media_mime: null,
      created_at: new Date().toISOString(), instance_name: currentInstance || null, status: 'sent', raw: { ...(data || {}), __bot_flow_menu: true },
    }]);
  };

  const nextStepId = (step: any) => Array.isArray(step.buttons) && step.buttons[0]?.next_step_id ? step.buttons[0].next_step_id : null;

  const runInlineFlowStep = async (phone: string, flowId: string, step: any, visited: Set<string>) => {
    if (!step?.id || visited.has(step.id)) return;
    visited.add(step.id);
    for (const child of Array.isArray(step.children) ? step.children : []) {
      try {
        await runInlineFlowStep(phone, flowId, child, visited);
      } catch (e) {
        console.error('[dispatchFlow] child failed', e);
        toast({ title: 'Sub-bloco falhou', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      }
    }
    const type = String(step.type || 'text');
    if (type === 'text' || type === 'question' || type === 'rating' || type === 'ig_comment' || type === 'wa_template' || type === 'wa_flow') {
      const text = String(step.text || step.title || '').trim();
      if (text) await sendFlowText(phone, text, { __manual_bot_flow: flowId, step_id: step.id, __inline_step: true });
    } else if (type === 'menu') {
      await sendFlowMenu(phone, step);
    } else if ((type === 'image' || type === 'video' || type === 'audio' || type === 'file') && step.media_url) {
      if (String(step.text || '').trim()) await sendFlowText(phone, String(step.text).trim(), { __manual_bot_flow: flowId, step_id: step.id, __inline_step: true });
      try {
        const res = await fetch(step.media_url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar mídia`);
        const blob = await res.blob();
        const mediaType: 'image' | 'audio' | 'video' | 'document' = type === 'image' ? 'image' : type === 'audio' ? 'audio' : type === 'video' ? 'video' : 'document';
        const ext = (blob.type.split('/')[1] || 'bin').split(';')[0];
        await sendMedia(new File([blob], `flow-${type}-${Date.now()}.${ext}`, { type: blob.type || 'application/octet-stream' }), mediaType, step.caption || '');
      } catch (e) {
        console.error('[dispatchFlow] media fetch failed', step.media_url, e);
        toast({ title: 'URL de mídia inválida', description: `Não foi possível baixar: ${String(step.media_url).slice(0, 80)}`, variant: 'destructive' });
      }
    } else if (type === 'delay') {
      await new Promise(r => setTimeout(r, Math.max(0, Math.min(15000, Number(step.delay_ms) || 800))));
    } else if (type === 'api_call' || type === 'gpt' || type === 'tags' || type === 'save_contact' || type === 'save_card' || type === 'condition' || type === 'ab_test') {
      const { data, error } = await invokeEvolution({ action: 'run-flow-step', phone, step, incoming: '' });
      if (error || data?.error || data?.ok === false) throw new Error(error?.message || data?.error || `Falha no bloco interno ${type}`);
      if (data?.replyText) await sendFlowText(phone, String(data.replyText), { __manual_bot_flow: flowId, step_id: step.id, __inline_step: true });
    }
  };

  // Walks a flow linearly until a branching/menu step waits for the customer's choice.
  const dispatchFlow = async (flow: { id: string; name: string; start_step_id: string | null; steps: any[] }) => {
    if (!selectedPhone) {
      toast({ title: 'Selecione uma conversa', variant: 'destructive' });
      return;
    }
    const stepsById = new Map<string, any>();
    (flow.steps || []).forEach((s: any) => { if (s?.id) stepsById.set(s.id, s); });
    const startId = flow.start_step_id || flow.steps?.[0]?.id;
    if (!startId) {
      toast({ title: 'Fluxo vazio', description: 'Nenhum passo configurado.', variant: 'destructive' });
      return;
    }
    setDispatchingFlow(true);
    const visited = new Set<string>();
    let curId: string | null = startId;
    try {
      while (curId && !visited.has(curId)) {
        visited.add(curId);
        const step = stepsById.get(curId);
        if (!step) break;
        const type = step.type as string;
        const phone = selectedPhone;
        for (const child of Array.isArray(step.children) ? step.children : []) {
          try {
            await runInlineFlowStep(phone, flow.id, child, new Set<string>());
            await new Promise(r => setTimeout(r, 250));
          } catch (e) {
            console.error('[dispatchFlow] inline child error', e);
          }
        }
        if (type === 'text' || type === 'question' || type === 'rating' || type === 'transfer' || type === 'ig_comment' || type === 'wa_template' || type === 'wa_flow') {
          const text = (step.text || step.title || '').toString();
          if (text.trim()) await sendFlowText(phone, text, { __manual_bot_flow: flow.id, step_id: step.id });
        } else if (type === 'menu') {
          await sendFlowMenu(phone, step);
          const hasBranches = Array.isArray(step.buttons) && step.buttons.some((b: any) => b.next_step_id);
          if (hasBranches) break;
        } else if ((type === 'image' || type === 'video' || type === 'audio' || type === 'file') && step.media_url) {
          try {
            if (String(step.text || '').trim()) await sendFlowText(phone, String(step.text).trim(), { __manual_bot_flow: flow.id, step_id: step.id });
            const res = await fetch(step.media_url);
            if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar mídia`);
            const blob = await res.blob();
            const mediaType: 'image' | 'audio' | 'video' | 'document' = type === 'image' ? 'image' : type === 'audio' ? 'audio' : type === 'video' ? 'video' : 'document';
            const ext = (blob.type.split('/')[1] || 'bin').split(';')[0];
            const file = new File([blob], `flow-${type}-${Date.now()}.${ext}`, { type: blob.type || 'application/octet-stream' });
            await sendMedia(file, mediaType, step.caption || '');
          } catch (e) {
            toast({ title: 'Falha em mídia do fluxo', description: e instanceof Error ? e.message : 'Erro ao baixar mídia. Verifique se a URL aponta direto para o arquivo (.jpg, .png, .mp4...).', variant: 'destructive' });
          }
        } else if (type === 'delay') {
          const ms = Math.max(0, Math.min(15000, Number(step.delay_ms) || 800));
          await new Promise(r => setTimeout(r, ms));
        } else if (type === 'api_call' || type === 'gpt' || type === 'tags' || type === 'save_contact' || type === 'save_card' || type === 'condition' || type === 'ab_test') {
          const { data, error } = await invokeEvolution({ action: 'run-flow-step', phone, step, incoming: '' });
          if (error || data?.error || data?.ok === false) throw new Error(error?.message || data?.error || `Falha no bloco ${type}`);
          if (data?.replyText) await sendFlowText(phone, String(data.replyText), { __manual_bot_flow: flow.id, step_id: step.id });
          if (data?.nextStepId) { curId = data.nextStepId; continue; }
        } else if (type === 'end') {
          break;
        }
        // Pequena pausa entre mensagens para preservar ordem
        await new Promise(r => setTimeout(r, 400));
        const nextId = nextStepId(step);
        curId = nextId;
      }
      toast({ title: `Fluxo "${flow.name}" disparado` });
    } catch (e) {
      console.error('[dispatchFlow] failed', e);
      toast({ title: 'Erro ao disparar fluxo', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setDispatchingFlow(false);
    }
  };




  const sendMedia = async (file: File, mediaType: 'image' | 'audio' | 'video' | 'document' | 'sticker', caption = '') => {
    if (!selectedPhone || !user) return;
    setSending(true);
    const tempId = `tmp-${Date.now()}`;
    const previewUrl = URL.createObjectURL(file);
    const labelFallback = mediaType === 'audio' ? '🎤 Áudio' : mediaType === 'image' ? '📷 Imagem' : mediaType === 'video' ? '🎬 Vídeo' : mediaType === 'sticker' ? '🌟 Sticker' : `📎 ${file.name}`;
    const optimistic: EvoMessage = {
      id: tempId, phone: selectedPhone, contact_name: null, direction: 'out',
      content: caption || labelFallback,
      message_type: mediaType, media_url: previewUrl, media_mime: file.type,
      created_at: new Date().toISOString(), instance_name: currentInstance || null, _pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const rawName = file.name || `media-${Date.now()}`;
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || `media-${Date.now()}`;
      const mimetype = file.type || (mediaType === 'audio' ? 'audio/ogg' : 'application/octet-stream');
      let mediaBase64Cache: string | null = null;
      const getMediaBase64 = async () => {
        if (!mediaBase64Cache) mediaBase64Cache = await fileToBase64(file);
        return mediaBase64Cache;
      };

      // 1) Tenta upload direto do browser → bucket (mais rápido, sem limite de tamanho).
      let mediaUrl: string | null = null;
      let directUploadError: string | null = null;
      for (let attempt = 1; attempt <= 3 && !mediaUrl; attempt++) {
        try {
          const path = `${user.id}/${Date.now()}-${attempt}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from('evolution-media')
            .upload(path, file, { contentType: mimetype, upsert: true });
          if (!upErr) {
            const { data: signed } = await supabase.storage
              .from('evolution-media')
              .createSignedUrl(path, 60 * 60 * 24 * 365);
            mediaUrl = signed?.signedUrl || null;
          } else {
            directUploadError = upErr.message || String(upErr);
            console.warn(`[sendMedia] direct upload attempt ${attempt} failed:`, upErr);
            await new Promise(r => setTimeout(r, 400 * attempt));
          }
        } catch (e: any) {
          directUploadError = e?.message || String(e);
          console.warn(`[sendMedia] direct upload attempt ${attempt} threw:`, e);
          await new Promise(r => setTimeout(r, 400 * attempt));
        }
      }

      // 2) Se falhou (rede/firewall/extensão bloqueando storage), tenta enviar via edge function
      //    com service-role (bypass de RLS e de bloqueios do browser ao domínio do storage).
      if (!mediaUrl && file.size <= 8 * 1024 * 1024) {
        try {
          const b64 = await getMediaBase64();
          const { data: upData, error: upErr } = await invokeEvolution({
            action: 'upload-media',
            mediaBase64: b64,
            mimetype,
            filename: safeName,
          });
          if (!upErr && upData?.mediaUrl) {
            mediaUrl = upData.mediaUrl;
          } else if (upData?.error) {
            directUploadError = `${directUploadError || ''} | server: ${upData.error}`.trim();
          }
        } catch (e: any) {
          directUploadError = `${directUploadError || ''} | server: ${e?.message || e}`.trim();
        }
      }

      const payload: Record<string, unknown> = {
        action: 'send-media',
        phone: selectedPhone,
        mediaType,
        mimetype,
        filename: safeName,
        caption,
      };
      if (mediaUrl) {
        payload.mediaUrl = mediaUrl;
        if (file.size <= 8 * 1024 * 1024) payload.mediaBase64 = await getMediaBase64();
      } else {
        // Último recurso: enviar base64 direto pra Evolution (limite de ~8MB no body).
        if (file.size > 8 * 1024 * 1024) {
          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m));
          toast({
            title: 'Falha no upload da mídia',
            description: `Arquivo grande e o upload foi bloqueado. ${directUploadError || 'Verifique antivírus/extensões do navegador.'}`.slice(0, 240),
            variant: 'destructive',
          });
          return;
        }
        payload.mediaBase64 = await getMediaBase64();
      }

      const { data, error } = await invokeEvolution(payload);
      if (error || data?.error) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m));
        toast({
          title: 'Erro ao enviar mídia',
          description: (error?.message || data?.error || directUploadError || 'Tente novamente.').toString().slice(0, 240),
          variant: 'destructive',
        });
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
        addStickerToLibrary(f, true);
      } else {
        setDocToSend({ file: f, caption: '' });
      }
    }
    e.target.value = '';
  };

  // ============ STICKER LIBRARY ============
  const loadStickerLibrary = async () => {
    if (!user) return;
    setStickerLibLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('evolution_stickers')
        .select('id, storage_path, mime_type')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as Array<{ id: string; storage_path: string; mime_type: string }>;
      const signed = await Promise.all(rows.map(async (r) => {
        const { data: s } = await supabase.storage.from('evolution-stickers').createSignedUrl(r.storage_path, 60 * 60 * 24);
        return { id: r.id, url: s?.signedUrl || '', mime: r.mime_type, path: r.storage_path };
      }));
      setStickerLibrary(signed.filter(s => s.url));
    } catch (e) {
      console.error('loadStickerLibrary', e);
    } finally {
      setStickerLibLoading(false);
    }
  };

  const addStickerToLibrary = async (file: File, sendNow: boolean) => {
    if (!user) return;
    try {
      const ext = file.name.toLowerCase().endsWith('.png') ? 'png' : 'webp';
      const mime = file.type || (ext === 'png' ? 'image/png' : 'image/webp');
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('evolution-stickers').upload(path, file, { contentType: mime, upsert: false });
      if (upErr) throw upErr;
      const { data: row, error: insErr } = await (supabase as any)
        .from('evolution_stickers')
        .insert({ user_id: user.id, storage_path: path, mime_type: mime })
        .select('id')
        .single();
      if (insErr) throw insErr;
      const { data: s } = await supabase.storage.from('evolution-stickers').createSignedUrl(path, 60 * 60 * 24);
      const newItem = { id: row.id, url: s?.signedUrl || '', mime, path };
      setStickerLibrary(prev => [newItem, ...prev]);
      if (sendNow && selectedPhone) await sendMedia(file, 'sticker');
      toast({ title: 'Figurinha salva', description: 'Disponível na sua biblioteca.' });
    } catch (e: any) {
      console.error('addStickerToLibrary', e);
      toast({ title: 'Erro ao salvar figurinha', description: e?.message, variant: 'destructive' });
    }
  };

  const sendStickerFromLibrary = async (item: { id: string; url: string; mime: string; path: string }) => {
    if (!selectedPhone) return;
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const file = new File([blob], `sticker.${item.mime.includes('png') ? 'png' : 'webp'}`, { type: item.mime });
      setStickerPopoverOpen(false);
      await sendMedia(file, 'sticker');
    } catch (e: any) {
      toast({ title: 'Erro ao enviar figurinha', description: e?.message, variant: 'destructive' });
    }
  };

  const deleteSticker = async (item: { id: string; path: string }) => {
    try {
      await supabase.storage.from('evolution-stickers').remove([item.path]);
      await (supabase as any).from('evolution_stickers').delete().eq('id', item.id);
      setStickerLibrary(prev => prev.filter(s => s.id !== item.id));
    } catch (e: any) {
      toast({ title: 'Erro ao remover', description: e?.message, variant: 'destructive' });
    }
  };

  useEffect(() => { if (user) loadStickerLibrary(); /* eslint-disable-next-line */ }, [user?.id]);


  // Group thread by day
  // Build reaction map and filter reaction rows out of the visible thread
  const { visibleThread, reactionsByExternalId } = useMemo(() => {
    const reactions: Record<string, { emoji: string; from: 'in' | 'out' }> = {};
    const visible: EvoMessage[] = [];
    for (const m of thread) {
      if (isProtocolPlaceholder(m)) continue;
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
      const isSticker = m.message_type === 'sticker';
      return (
        <div className="space-y-1">
          <button type="button" onClick={() => setPreviewImage({ url: src, caption: label })} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">
            <img
              src={src}
              alt={label || 'Imagem'}
              loading="lazy"
              className={cn(
                'rounded-lg block h-auto w-auto object-contain',
                isSticker ? 'max-w-32 max-h-32' : 'max-w-[320px] max-h-[420px]'
              )}
            />
          </button>
          {label && label !== 'Imagem' && <div className="text-sm whitespace-pre-wrap break-words">{formatWaText(label)}</div>}
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
      const caption = m.content && !/^\[video\]$/i.test(m.content) ? m.content : '';
      return (
        <div className="space-y-1">
          <div className="relative group">
            <video src={v} controls preload="metadata" className="max-w-[320px] max-h-80 rounded-lg bg-black" />
            <button
              type="button"
              onClick={() => setExpandedVideo(v)}
              title="Expandir vídeo"
              className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-md p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          {caption && <div className="text-sm whitespace-pre-wrap break-words">{formatWaText(caption)}</div>}
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
      const isPdf = (docInfo.mime.toLowerCase().includes('pdf')) || docInfo.fileName.toLowerCase().endsWith('.pdf');
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
      // PDF — preview inline (igual WhatsApp), miniatura + clique abre fullscreen.
      if (isPdf && m.media_url) {
        return (
          <div className="max-w-[300px]">
            <PdfPreview url={m.media_url} fileName={docInfo.fileName} sizeLabel={docInfo.sizeLabel} />
          </div>
        );
      }
      return m.media_url
        ? <a href={m.media_url} target="_blank" rel="noreferrer" className="block hover:opacity-90">{card}</a>
        : card;
    }

    // Contato compartilhado (vCard) — card estilo WhatsApp
    if (m.message_type === 'contact') {
      // Tenta extrair vCard(s) crus do raw para parse rico
      const rawMsg = (getNestedValue(m.raw, ['data', 'Message'])
        || getNestedValue(m.raw, ['Message'])
        || getNestedValue(m.raw, ['message'])
        || {}) as Record<string, unknown>;
      const contactMsg = rawMsg?.contactMessage as { vcard?: string; displayName?: string } | undefined;
      const contactsArr = (rawMsg?.contactsArrayMessage as { contacts?: Array<{ vcard?: string; displayName?: string }> } | undefined)?.contacts;
      const rawVcards: Array<{ vcard?: string; displayName?: string }> = [];
      if (contactMsg) rawVcards.push(contactMsg);
      if (Array.isArray(contactsArr)) rawVcards.push(...contactsArr);

      const parseVcard = (vcard: string, fallbackName?: string) => {
        const text = String(vcard || '');
        const fn = text.match(/(?:^|\n)FN[^:]*:(.+)/i)?.[1]?.trim() || fallbackName || 'Contato';
        const org = text.match(/(?:^|\n)ORG[^:]*:(.+)/i)?.[1]?.trim();
        const phones: string[] = [];
        const telRegex = /(?:^|\n)(?:item\d+\.)?TEL([^:]*):([^\r\n]+)/gi;
        let tm: RegExpExecArray | null;
        while ((tm = telRegex.exec(text)) !== null) {
          const params = tm[1] || '';
          const value = tm[2].trim();
          // waid=12345 quando o número vier só como parâmetro
          const waid = params.match(/waid=([\d]+)/i)?.[1];
          const digits = (waid || value).replace(/[^\d+]/g, '');
          if (digits && !phones.includes(digits)) phones.push(digits);
        }
        const emails: string[] = [];
        const emRegex = /(?:^|\n)(?:item\d+\.)?EMAIL[^:]*:([^\r\n]+)/gi;
        let em: RegExpExecArray | null;
        while ((em = emRegex.exec(text)) !== null) {
          const v = em[1].trim();
          if (v && !emails.includes(v)) emails.push(v);
        }
        return { name: fn, org, phones, emails, raw: text };
      };

      // Se temos vCards crus, usa eles. Senão, faz fallback no content já formatado.
      const parsed = rawVcards.length
        ? rawVcards.map(v => parseVcard(v.vcard || '', v.displayName))
        : (m.content || '').split(/\n\n+/).map(blk => {
            const lines = blk.split('\n').map(l => l.trim());
            const name = (lines.find(l => l.startsWith('👤')) || '👤 Contato').replace(/^👤\s*/, '');
            const phoneLine = (lines.find(l => l.startsWith('📞')) || '').replace(/^📞\s*/, '');
            const phones = phoneLine.split(',').map(p => p.trim()).filter(Boolean);
            return { name, phones, emails: [], raw: blk } as { name: string; phones: string[]; emails: string[]; org?: string; raw: string };
          });

      return (
        <div className="space-y-2 min-w-[220px] max-w-[300px]">
          {parsed.map((c, i) => {
            const first = c.phones[0] || '';
            const digits = first.replace(/\D/g, '');
            return (
              <div key={i} className="rounded-lg bg-black/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setVcardPreview(c)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-[#00a884]/20 flex items-center justify-center text-[#00a884] font-bold shrink-0">
                    {(c.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-[#aebac1] truncate">
                      {c.phones.length ? c.phones.join(', ') : (c.org || 'Toque para ver dados')}
                    </div>
                  </div>
                </button>
                <div className="flex border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setVcardPreview(c)}
                    className="flex-1 text-center text-xs py-1.5 text-[#aebac1] hover:bg-white/5"
                  >
                    Ver dados
                  </button>
                  {digits && (
                    <a
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 text-center text-xs py-1.5 text-[#00a884] hover:bg-white/5 border-l border-white/10"
                    >
                      Conversar
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Localização — card com link p/ Google Maps
    if (m.message_type === 'location') {
      const lines = (m.content || '').split('\n').map(l => l.trim());
      const header = (lines.find(l => l.startsWith('📍')) || '📍 Localização').replace(/^📍\s*/, '');
      const coordLine = lines.find(l => /-?\d+\.\d+\s*,\s*-?\d+\.\d+/.test(l)) || '';
      const coordMatch = coordLine.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      const mapUrl = coordMatch
        ? `https://www.google.com/maps?q=${coordMatch[1]},${coordMatch[2]}`
        : `https://www.google.com/maps/search/${encodeURIComponent(header)}`;
      return (
        <a href={mapUrl} target="_blank" rel="noreferrer" className="block min-w-[220px] max-w-[280px] rounded-lg overflow-hidden bg-black/20 hover:opacity-90">
          <div className="h-24 bg-gradient-to-br from-emerald-700/40 to-cyan-700/40 flex items-center justify-center text-3xl">📍</div>
          <div className="px-3 py-2">
            <div className="text-sm font-medium truncate">{header}</div>
            {coordLine && <div className="text-[11px] text-[#aebac1] truncate">{coordLine}</div>}
            <div className="text-[11px] text-[#00a884] mt-1">Abrir no Google Maps</div>
          </div>
        </a>
      );
    }

    return <div className="whitespace-pre-wrap break-words leading-snug">{m.content === '[text]' ? 'Mensagem do WhatsApp sem conteúdo visível' : formatWaText(m.content)}</div>;
  };


  const __content = (
    <>

      <div className={`flex flex-col md:flex-row ${embed ? 'h-full' : 'h-[calc(100dvh-4rem)] lg:h-[100dvh]'} animate-fade-in bg-background`}>
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
              <h2 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                Chat WhatsApp
                <button
                  type="button"
                  onClick={() => setShowAutoReplySettings(true)}
                  className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded transition',
                    autoReply.enabled
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  )}
                  title={autoReply.enabled ? 'Robô ATIVO — clique para configurar' : 'Robô desativado — clique para ativar'}
                >
                  🤖 {autoReply.enabled ? 'ON' : 'OFF'}
                </button>
              </h2>
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
                  <Zap className={cn('w-4 h-4 mr-2', autoReply.enabled ? 'text-emerald-500' : 'text-muted-foreground')} />
                  Robô de auto-atendimento
                  <span className={cn(
                    'ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded',
                    autoReply.enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'
                  )}>
                    {autoReply.enabled ? 'ON' : 'OFF'}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowKbDialog(true)}>
                  <BookOpen className="w-4 h-4 mr-2" /> Base de conhecimento
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      toast({ title: 'Limpando cache…', description: 'A página será recarregada.' });
                      try {
                        const keep: Record<string, string> = {};
                        for (let i = 0; i < localStorage.length; i++) {
                          const k = localStorage.key(i);
                          if (k && (k.startsWith('sb-') || k.includes('supabase.auth'))) {
                            keep[k] = localStorage.getItem(k) || '';
                          }
                        }
                        localStorage.clear();
                        Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
                      } catch {}
                      try { sessionStorage.clear(); } catch {}
                      try {
                        if ('caches' in window) {
                          const names = await caches.keys();
                          await Promise.all(names.map(n => caches.delete(n)));
                        }
                      } catch {}
                      try {
                        if ('serviceWorker' in navigator) {
                          const regs = await navigator.serviceWorker.getRegistrations();
                          await Promise.all(regs.map(r => r.unregister()));
                        }
                      } catch {}
                      setTimeout(() => {
                        const url = new URL(window.location.href);
                        url.searchParams.set('_t', Date.now().toString());
                        window.location.replace(url.toString());
                      }, 600);
                    } catch (e: any) {
                      toast({ title: 'Erro ao limpar cache', description: e?.message || 'Tente novamente', variant: 'destructive' });
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Limpar cache da página
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Pesquisar conversa..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs pl-9 rounded-full bg-background/60 border-border/60" />
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 rounded-full"
                title={soundEnabled ? 'Som de notificação ativo' : 'Som de notificação desligado'}
                onClick={() => {
                  setSoundEnabled(v => {
                    const next = !v;
                    if (next) {
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
            <div className="flex gap-1.5">
              <Input placeholder="Novo número (DDD + nº)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startConversation()} className="h-8 text-xs rounded-full bg-background/60 border-border/60 px-3" />
              <Button size="icon" className="h-8 w-8 shrink-0 rounded-full bg-[#00a884] hover:bg-[#06cf9c] text-white" onClick={startConversation}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {([
                { id: 'all', label: 'Todas' },
                { id: 'unread', label: 'Não lidas' },
                { id: 'support', label: '🛠 Suporte' },
                { id: 'contacts', label: 'Contatos' },
                { id: 'groups', label: 'Grupos' },
                { id: 'channels', label: '📢 Canais' },
                { id: 'media', label: 'Mídia' },
              ] as const).map((t) => {
                const badgeCount =
                  t.id === 'support' ? filterCounts.support
                  : t.id === 'unread' ? filterCounts.unread
                  : t.id === 'all' ? filterCounts.all
                  : t.id === 'contacts' ? filterCounts.contacts
                  : t.id === 'groups' ? filterCounts.groups
                  : t.id === 'channels' ? filterCounts.channels
                  : t.id === 'media' ? filterCounts.media
                  : 0;
                const isActive = filter === t.id;
                const badgeTone = t.id === 'support'
                  ? 'bg-amber-500 text-black'
                  : t.id === 'unread'
                    ? 'bg-[#00a884] text-black'
                    : isActive
                      ? 'bg-[#00a884]/25 text-[#00a884]'
                      : 'bg-muted text-muted-foreground';
                return (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={cn(
                    'text-[11px] px-3 py-1 rounded-full border transition-all relative whitespace-nowrap inline-flex items-center gap-1',
                    isActive
                      ? 'bg-[#00a884]/15 text-[#00a884] border-[#00a884]/40'
                      : 'bg-transparent hover:bg-accent border-border text-muted-foreground'
                  )}
                >
                  <span>{t.label}</span>
                  {badgeCount > 0 && (
                    <span className={cn('inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold', badgeTone)}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </button>
                );
              })}
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
                          'w-full text-left px-3 py-2.5 hover:bg-accent/40 transition-colors flex gap-3 items-start border-b border-border/20',
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
                            {!active && c.unread > 0 && (
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
                      {c.unread > 0 ? (
                        <ContextMenuItem onClick={() => markConversationRead(c.phone)}>
                          <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como lida
                        </ContextMenuItem>
                      ) : (
                        <ContextMenuItem onClick={() => markConversationUnread(c.phone)}>
                          <MailOpen className="w-4 h-4 mr-2" /> Marcar como não lida
                        </ContextMenuItem>
                      )}
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearConversation(c.phone)} className="text-destructive focus:text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir conversa
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
              <div className="sticky top-0 z-10 px-3 py-2 border-b border-[#0b1115] bg-[#202c33] flex items-center gap-3">
                {isMobile && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-[#aebac1] hover:bg-white/5" onClick={() => setSelectedPhone(null)}>
                    <ArrowLeft className="w-4 h-4" />
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
                      {selectedName || formatPhone(selectedPhone)}
                    </div>
                    <div className="text-[11px] text-[#8696a0] flex items-center gap-1">
                      {contactTypingPresence ? (
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
                {selectedPhone && !selectedPhone.startsWith('status:') && selectedContact?.needs_human && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                    onClick={async () => {
                      if (!user || !selectedPhone) return;
                      const { error } = await supabase
                        .from('evolution_contacts')
                        .update({ needs_human: false })
                        .eq('user_id', user.id).eq('phone', selectedPhone);
                      if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
                      else toast({ title: '✅ Atendimento marcado como resolvido' });
                    }}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Resolver
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
                    {selectedPhone && !selectedPhone.startsWith('status:') && (manualUnreadPhones.has(selectedPhone) ? (
                      <DropdownMenuItem onClick={() => markConversationRead(selectedPhone)}>
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como lida
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => markConversationUnread(selectedPhone)}>
                        <MailOpen className="w-4 h-4 mr-2" /> Marcar como não lida
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onClick={() => clearConversation()} className="text-destructive focus:text-destructive">
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
                {selectedPhone && !selectedPhone.startsWith('status:') && thread.length > 0 && (
                  <div className="flex justify-center pt-1 pb-2">
                    {exhaustedPhones.has(selectedPhone) ? (
                      <span className="text-[11px] px-3 py-1 rounded-full bg-[#1d282f] text-[#8696a0] shadow-sm">Início da conversa</span>
                    ) : (
                      <button
                        type="button"
                        disabled={loadingOlder}
                        onClick={() => loadOlderForPhone(selectedPhone)}
                        className="text-[11px] px-4 py-1.5 rounded-full bg-[#2a3942] text-[#e9edef] hover:bg-[#374248] transition-colors disabled:opacity-60 shadow-sm"
                      >
                        {loadingOlder ? 'Carregando…' : 'Carregar mensagens antigas'}
                      </button>
                    )}
                  </div>
                )}
                {groupedThread.length === 0 && (
                  <div className="text-xs text-[#8696a0] text-center py-10">Sem mensagens. Envie a primeira abaixo.</div>
                )}
                {groupedThread.map((g) => (
                  <div key={g.date} className="space-y-1.5">
                    <div className="flex justify-center my-3">
                      <span className="text-[11px] px-3 py-1 rounded-full bg-[#1d282f] text-[#aebac1] shadow-sm uppercase tracking-wide font-medium">{g.date}</span>
                    </div>
                    {g.items.map((m) => {
                      const isPinned = pinnedIds.has(m.id);
                      return (
                      <div key={m.id} id={`evo-msg-${m.id}`} className={cn('group flex transition-all', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div className={cn(
                              'max-w-[78%] md:max-w-[65%] rounded-[10px] px-2.5 py-1.5 text-sm relative text-[#e9edef] cursor-context-menu shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
                              m.direction === 'out' ? 'bg-[#005c4b] rounded-tr-[2px]' : 'bg-[#202c33] rounded-tl-[2px]',
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
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </div>
              )}


              {/* Slash command — disparar fluxo do robô */}
              {slashOpen && (
                <div className="px-2 pt-2 border-t border-[#0b1115] bg-[#1d282f]">
                  <div className="rounded-lg border border-[#0b1115] bg-[#202c33] overflow-hidden">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-[#8696a0] flex items-center justify-between">
                      <span>Disparar fluxo do robô</span>
                      <span className="text-[#5e6b72]">↑↓ navegar • Enter selecionar • Esc fechar</span>
                    </div>
                    {filteredFlows.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-[#8696a0]">
                        Nenhum fluxo encontrado. Crie em <Link to="/robo-flows" className="text-[#00a884] hover:underline">Robô</Link>.
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto">
                        {filteredFlows.map((f, i) => (
                          <button
                            key={f.id}
                            type="button"
                            onMouseEnter={() => setSlashIndex(i)}
                            onClick={() => { setDraft(''); setSlashOpen(false); dispatchFlow(f); composerRef.current?.focus(); }}
                            className={cn(
                              'w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors',
                              i === slashIndex ? 'bg-[#2a3942] text-[#e9edef]' : 'text-[#d1d7db] hover:bg-[#2a3942]/60'
                            )}
                          >
                            <Zap className="w-4 h-4 text-[#00a884] shrink-0" />
                            <span className="flex-1 truncate">{f.name}</span>
                            <span className="text-[10px] text-[#8696a0]">{(f.steps?.length ?? 0)} passos</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                    <Popover open={stickerPopoverOpen} onOpenChange={setStickerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-[#aebac1] hover:bg-white/5 hover:text-[#e9edef]" title="Figurinhas" disabled={sending}>
                          <Sticker className="w-5 h-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="p-2 w-[320px] bg-[#233138] border-[#0b1115]">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <span className="text-xs font-medium text-[#e9edef]">Minhas figurinhas</span>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] text-[#00a884] hover:bg-white/5"
                            onClick={() => stickerInputRef.current?.click()}>
                            + Adicionar
                          </Button>
                        </div>
                        {stickerLibLoading ? (
                          <div className="text-center text-xs text-[#8696a0] py-6">Carregando...</div>
                        ) : stickerLibrary.length === 0 ? (
                          <div className="text-center text-xs text-[#8696a0] py-6 px-2">
                            Nenhuma figurinha salva.<br/>Clique em "+ Adicionar" para enviar um .webp ou .png e ele ficará salvo aqui.
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5 max-h-[260px] overflow-y-auto">
                            {stickerLibrary.map(item => (
                              <div key={item.id} className="relative group">
                                <button
                                  onClick={() => sendStickerFromLibrary(item)}
                                  className="w-full aspect-square bg-[#0b1115] rounded hover:bg-[#1f2a30] flex items-center justify-center p-1"
                                  title="Enviar figurinha"
                                >
                                  <img src={item.url} alt="sticker" className="max-w-full max-h-full object-contain" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteSticker(item); }}
                                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[10px] opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                                  title="Remover"
                                >×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
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
                      onChange={(e) => {
                        const el = e.target as HTMLTextAreaElement;
                        // Detecta o último caractere digitado para tentar autocorreção
                        const prev = draft;
                        const next = el.value;
                        const inserted = next.length === prev.length + 1 ? next[(el.selectionStart ?? next.length) - 1] : '';
                        setDraft(next);
                        if (next.trim()) notifyTyping();
                        // Slash command: abre menu de fluxos quando começar com "/"
                        if (next.startsWith('/')) {
                          setSlashOpen(true);
                          setSlashQuery(next.slice(1));
                          setSlashIndex(0);
                        } else if (slashOpen) {
                          setSlashOpen(false);
                        }
                        if (inserted) {
                          // adia para o próximo tick para garantir o caret atualizado
                          requestAnimationFrame(() => {
                            const changed = tryAutocorrectOnInput(el, inserted);
                            if (changed) setDraft(el.value);
                          });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (slashOpen && filteredFlows.length > 0) {
                          if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => Math.min(filteredFlows.length - 1, i + 1)); return; }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => Math.max(0, i - 1)); return; }
                          if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return; }
                          if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                            e.preventDefault();
                            const f = filteredFlows[slashIndex];
                            if (f) { setDraft(''); setSlashOpen(false); dispatchFlow(f); }
                            return;
                          }
                        }
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

                      rows={2}
                      spellCheck
                      lang="pt-BR"
                      autoCorrect="on"
                      autoCapitalize="sentences"
                      className="flex-1 resize-none rounded-[10px] border-0 bg-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0] px-4 py-3 text-[15px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#00a884]/40 max-h-48 shadow-inner"
                      style={{ minHeight: 48 }}
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
              {isMobile && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="fixed left-3 bottom-20 z-40 h-10 w-10 rounded-full shadow-lg bg-[#202c33] text-[#e9edef] hover:bg-[#2a3942]"
                  onClick={() => setSelectedPhone(null)}
                  title="Voltar para conversas"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* Quick Renewal Panel — mesmo design da API Oficial */}
        {!isMobile && (
          <div className="w-[420px] xl:w-[460px] h-full border-l bg-background flex flex-col shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b text-sm font-semibold">
              <Zap className="h-4 w-4 text-emerald-500" />
              Renovação rápida
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <QuickRenewalPanel initialPhone={selectedPhone && !selectedPhone.startsWith('status') ? selectedPhone : null} />
            </div>
          </div>
        )}
        {isMobile && showRenewalPanel && (
          <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <h2 className="text-sm font-semibold">Renovação Rápida</h2>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowRenewalPanel(false)}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto">
                <QuickRenewalPanel isMobile onClose={() => setShowRenewalPanel(false)} initialPhone={selectedPhone && !selectedPhone.startsWith('status') ? selectedPhone : null} />
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

      {/* Lightbox de vídeos */}
      <Dialog open={!!expandedVideo} onOpenChange={(open) => !open && setExpandedVideo(null)}>
        <DialogContent className="max-w-6xl p-2 bg-background/95 border-border">
          {expandedVideo && (
            <video src={expandedVideo} controls autoPlay className="max-h-[85vh] w-full object-contain rounded-md bg-black" />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de dados do vCard recebido */}
      <Dialog open={!!vcardPreview} onOpenChange={(open) => !open && setVcardPreview(null)}>
        <DialogContent className="max-w-md bg-[#111b21] border-[#0b1115] text-[#e9edef]">
          {vcardPreview && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-[#00a884]/20 flex items-center justify-center text-[#00a884] text-xl font-bold shrink-0">
                  {(vcardPreview.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold truncate">{vcardPreview.name}</div>
                  {vcardPreview.org && <div className="text-xs text-[#aebac1] truncate">{vcardPreview.org}</div>}
                </div>
              </div>

              {vcardPreview.phones.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase text-[#aebac1] tracking-wide">Telefone</div>
                  {vcardPreview.phones.map((p, i) => {
                    const digits = p.replace(/\D/g, '');
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-black/30">
                        <span className="text-sm truncate">{p}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(p); toast({ title: 'Copiado', description: p }); }}
                            className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                          >Copiar</button>
                          {digits && (
                            <a
                              href={`https://wa.me/${digits}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] px-2 py-1 rounded bg-[#00a884]/20 text-[#00a884] hover:bg-[#00a884]/30"
                            >WhatsApp</a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {vcardPreview.emails.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase text-[#aebac1] tracking-wide">E-mail</div>
                  {vcardPreview.emails.map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-black/30">
                      <span className="text-sm truncate">{e}</span>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(e); toast({ title: 'Copiado', description: e }); }}
                        className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                      >Copiar</button>
                    </div>
                  ))}
                </div>
              )}

              {vcardPreview.raw && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[#aebac1] hover:text-white">Ver vCard bruto</summary>
                  <pre className="mt-2 max-h-60 overflow-auto bg-black/40 p-2 rounded whitespace-pre-wrap break-all">{vcardPreview.raw}</pre>
                </details>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Contact info side panel */}
      <Dialog open={showContactInfo} onOpenChange={(open) => { setShowContactInfo(open); if (!open) setEditingContactName(false); }}>
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
                {editingContactName ? (
                  <div className="mt-3 w-full flex items-center gap-2 max-w-xs">
                    <Input
                      autoFocus
                      value={contactNameDraft}
                      onChange={(e) => setContactNameDraft(e.target.value)}
                      placeholder="Nome do contato"
                      className="h-9 bg-[#202c33] border-[#2a3942] text-white placeholder:text-[#8696a0]"
                      onKeyDown={(e) => { if (e.key === 'Enter') (document.getElementById('save-contact-name-btn') as HTMLButtonElement)?.click(); }}
                    />
                    <Button
                      id="save-contact-name-btn"
                      size="icon"
                      className="h-9 w-9 bg-[#00a884] hover:bg-[#02906f]"
                      disabled={savingContactName}
                      onClick={async () => {
                        if (!user || !selectedPhone) return;
                        const newName = contactNameDraft.trim() || null;
                        setSavingContactName(true);
                        const { error } = await supabase
                          .from('evolution_contacts')
                          .upsert(
                            { user_id: user.id, phone: selectedPhone, name: newName },
                            { onConflict: 'user_id,phone' }
                          );
                        setSavingContactName(false);
                        if (error) {
                          toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
                          return;
                        }
                        setContacts(prev => ({
                          ...prev,
                          [selectedPhone]: { ...(prev[selectedPhone] || { phone: selectedPhone, profile_pic_url: null }), phone: selectedPhone, name: newName },
                        }));
                        setEditingContactName(false);
                        toast({ title: '✅ Contato salvo' });
                      }}
                    >
                      {savingContactName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="text-lg font-semibold">{selectedName || formatPhone(selectedPhone)}</div>
                    <button
                      title={selectedContact?.name ? 'Editar nome' : 'Adicionar aos contatos'}
                      className="p-1 rounded hover:bg-white/10 text-[#8696a0] hover:text-white transition-colors"
                      onClick={() => { setContactNameDraft(selectedContact?.name || ''); setEditingContactName(true); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="text-xs text-[#8696a0] flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {formatPhone(selectedPhone)}
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <Button variant="ghost" className="flex-col h-auto py-3 hover:bg-white/5 text-[#aebac1]" onClick={() => copyText(formatPhone(selectedPhone))}>
                    <Copy className="w-5 h-5 text-[#00a884]" />
                    <span className="text-[11px] mt-1">Copiar</span>
                  </Button>
                  <Button variant="ghost" className="flex-col h-auto py-3 hover:bg-white/5 text-[#aebac1]" onClick={() => window.open(`https://wa.me/${selectedPhone}`, '_blank')}>
                    <ExternalLink className="w-5 h-5 text-[#00a884]" />
                    <span className="text-[11px] mt-1">WhatsApp</span>
                  </Button>
                  <Button variant="ghost" className="flex-col h-auto py-3 hover:bg-white/5 text-[#aebac1]" onClick={() => { setContactNameDraft(selectedContact?.name || ''); setEditingContactName(true); }}>
                    <UserPlus className="w-5 h-5 text-[#00a884]" />
                    <span className="text-[11px] mt-1">{selectedContact?.name ? 'Editar' : 'Salvar'}</span>
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


      {/* Auto-reply (AI) settings */}
      <Dialog open={showAutoReplySettings} onOpenChange={(open) => {
        setShowAutoReplySettings(open);
        if (open && user) {
          setAutoReplyLoading(true);
          supabase
            .from('evolution_settings')
            .select('autoreply_enabled, autoreply_only_outside_hours, autoreply_business_start, autoreply_business_end, autoreply_disabled_phones, autoreply_absence_enabled, autoreply_absence_message, autoreply_absence_cooldown_hours')
            .eq('user_id', user.id)
            .maybeSingle()
            .then(({ data }) => {
              if (data) {
                setAutoReply({
                  enabled: !!data.autoreply_enabled,
                  only_outside_hours: !!data.autoreply_only_outside_hours,
                  business_start: data.autoreply_business_start || '08:00',
                  business_end: data.autoreply_business_end || '18:00',
                  disabled_phones: data.autoreply_disabled_phones || [],
                  absence_enabled: !!(data as any).autoreply_absence_enabled,
                  absence_message: (data as any).autoreply_absence_message || '',
                  absence_cooldown_hours: Number((data as any).autoreply_absence_cooldown_hours) || 6,
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
                <Zap className="w-4 h-4 text-primary" /> Robô de auto-atendimento
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                Quando ativado, mensagens novas de clientes são respondidas automaticamente usando somente a Base de Conhecimento.
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

                <div className="rounded-md border border-border bg-card p-2 text-[11px] text-muted-foreground">
                  O robô procura as palavras-chave cadastradas na Base de Conhecimento e envia exatamente a resposta salva lá.
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



                <div className="rounded-md border border-border p-2 space-y-2">
                  <label className="flex items-center justify-between gap-2">
                    <div className="text-sm">Enviar mensagem de ausência fora do horário</div>
                    <input
                      type="checkbox"
                      checked={autoReply.absence_enabled}
                      onChange={(e) => setAutoReply(s => ({ ...s, absence_enabled: e.target.checked }))}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                  {autoReply.absence_enabled && (
                    <>
                      <div className="text-[11px] text-muted-foreground">
                        Quando o cliente escrever fora do horário comercial e nenhuma palavra-chave da Base de Conhecimento bater, o robô envia esta mensagem (uma vez por contato dentro do intervalo abaixo). Usa o mesmo horário definido acima.
                      </div>
                      <textarea
                        value={autoReply.absence_message}
                        onChange={(e) => setAutoReply(s => ({ ...s, absence_message: e.target.value }))}
                        rows={3}
                        placeholder="Mensagem enviada automaticamente quando estou ausente..."
                        className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <div className="flex items-center gap-2">
                        <div className="text-xs">Reenviar para o mesmo contato a cada</div>
                        <Input
                          type="number"
                          min={1}
                          max={72}
                          value={autoReply.absence_cooldown_hours}
                          onChange={(e) => setAutoReply(s => ({ ...s, absence_cooldown_hours: Math.max(1, Math.min(72, Number(e.target.value) || 6)) }))}
                          className="h-7 w-16 text-xs"
                        />
                        <div className="text-xs">horas</div>
                      </div>
                    </>
                  )}
                </div>


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
                          autoreply_only_outside_hours: autoReply.only_outside_hours,
                          autoreply_business_start: autoReply.business_start,
                          autoreply_business_end: autoReply.business_end,
                          autoreply_disabled_phones: autoReply.disabled_phones,
                          autoreply_absence_enabled: autoReply.absence_enabled,
                          autoreply_absence_message: autoReply.absence_message,
                          autoreply_absence_cooldown_hours: autoReply.absence_cooldown_hours,
                        } as any)
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

      <KnowledgeBaseDialog open={showKbDialog} onOpenChange={setShowKbDialog} />
    </>
  );
  return embed ? __content : <DashboardLayout noPadding>{__content}</DashboardLayout>;
}

