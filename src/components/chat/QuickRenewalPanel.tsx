import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolvePanel } from '@/lib/panel-detect';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  Search, User, Calendar, CreditCard, CheckCircle, Phone, RefreshCw, 
  Server, Copy, Settings, Wifi, Download, Key, Bell, Smile, MessageSquare,
  ChevronDown, ChevronUp, UserPlus, AlertTriangle, Monitor, Play, Loader2, X, GripVertical, ListPlus
} from 'lucide-react';
import SendPlaylistDialog from '@/components/playlist/SendPlaylistDialog';
import CreateClouddyUserDialog from '@/components/activation/CreateClouddyUserDialog';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { describePanelError } from '@/lib/panel-error';
import { addDays, addMonths, format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { normalizeWhatsAppPhone } from '@/lib/phone';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import QuickCustomerForm from './QuickCustomerForm';
import BillingSettingsModal from './BillingSettingsModal';
import { PhoneFlagBadge } from '@/components/ui/phone-flag-badge';

type PaymentMethod = 'pix' | 'dinheiro' | 'transferencia' | 'cartao_credito';

interface Customer {
  id: string;
  name: string;
  phone: string;
  extra_phone?: string | null;
  username: string | null;
  password: string | null;
  status: 'ativa' | 'inativa' | 'suspensa' | 'bloqueado';
  due_date: string;
  custom_price: number | null;
  screens: number;
  extra_months: number;
  notes: string | null;
  start_date: string;
  plan: {
    id: string;
    plan_name: string;
    price: number;
    duration_days: number;
  } | null;
  server: {
    id: string;
    server_name: string;
    host: string;
  } | null;
}

interface QuickMessage {
  id: string;
  title: string;
  category: string;
  content: string;
  icon: string;
  sort_order: number;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Wifi,
  Download,
  Key,
  Bell,
  Smile,
  MessageSquare,
};

interface QuickRenewalPanelProps {
  isMobile?: boolean;
  onClose?: () => void;
  initialPhone?: string | null;
}

function SortableMessageRow({ msg, children }: { msg: QuickMessage; children: (handleProps: { listeners: any; attributes: any; isDragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: msg.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ listeners, attributes, isDragging })}
    </div>
  );
}



export default function QuickRenewalPanel({ isMobile = false, onClose, initialPhone }: QuickRenewalPanelProps) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const lastInitialPhoneRef = useRef<string | null>(null);

  // Quando o usuário abre a aba de um contato no chat, prefilla a busca com o telefone
  // pra trazer todos os usuários daquele cliente automaticamente.
  useEffect(() => {
    if (!initialPhone) return;
    if (lastInitialPhoneRef.current === initialPhone) return;
    lastInitialPhoneRef.current = initialPhone;
    setSearchTerm(initialPhone.replace(/\D/g, ''));
  }, [initialPhone]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSendPlaylistOpen, setIsSendPlaylistOpen] = useState(false);
  const [isClouddyCreateOpen, setIsClouddyCreateOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [isLinksOpen, setIsLinksOpen] = useState(true);
  const [editingMessage, setEditingMessage] = useState<QuickMessage | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isBillingSettingsOpen, setIsBillingSettingsOpen] = useState(false);
  const [newMessage, setNewMessage] = useState({ title: '', category: '', content: '', icon: 'MessageSquare' });
  const [renewalMessage, setRenewalMessage] = useState<string | null>(null);
  const [selectedQuickMessage, setSelectedQuickMessage] = useState<QuickMessage | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [customRenewalPrice, setCustomRenewalPrice] = useState<string>('');
  const [selectedScreens, setSelectedScreens] = useState<number>(1);
  const [editedUsername, setEditedUsername] = useState<string>('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [showExtraMonthsConfirm, setShowExtraMonthsConfirm] = useState(false);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [vplayTestResult, setVplayTestResult] = useState<string | null>(null);
  const [selectedVplayServerId, setSelectedVplayServerId] = useState<string | null>(null);
  const [editedServerId, setEditedServerId] = useState<string | null>(null);
  const [editedStatus, setEditedStatus] = useState<string>('ativa');
  const [editedName, setEditedName] = useState<string>('');
  const [editedPhone, setEditedPhone] = useState<string>('');
  const [editedExtraPhone, setEditedExtraPhone] = useState<string>('');
  const [editedDueDate, setEditedDueDate] = useState<string>('');
  const [activateOnServer, setActivateOnServer] = useState<boolean>(true);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const queryClient = useQueryClient();

  // Fetch vplay servers
  interface VplayServer {
    id: string;
    user_id: string;
    server_name: string;
    integration_url: string;
    key_message: string;
    is_default: boolean;
  }
  
  const { data: vplayServers = [] } = useQuery({
    queryKey: ['vplay-servers', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('vplay_servers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as VplayServer[];
    },
    enabled: !!user?.id,
  });

  // Set default server when servers load
  const defaultServer = vplayServers.find(s => s.is_default) || vplayServers[0];
  if (defaultServer && !selectedVplayServerId && vplayServers.length > 0) {
    setSelectedVplayServerId(defaultServer.id);
  }

  const selectedVplayServer = vplayServers.find(s => s.id === selectedVplayServerId);

  // Fetch zap responder settings for WhatsApp messaging
  const { data: zapSettings } = useQuery({
    queryKey: ['zap-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('zap_responder_settings')
        .select('selected_department_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch user's billing settings
  const { data: billingSettings } = useQuery({
    queryKey: ['billing-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase
        .from('billing_settings' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle() as any);
      if (error) throw error;
      return data as {
        pix_key: string;
        pix_key_type: string;
        monthly_price: number;
        quarterly_price: number;
        semiannual_price: number;
        annual_price: number;
        custom_message: string | null;
        vplay_integration_url: string | null;
        vplay_key_message: string | null;
        notification_phone: string | null;
        renewal_message_template: string | null;
        renewal_image_url: string | null;
      } | null;
    },
    enabled: !!user?.id,
  });

  // Fetch all plans for selection
  const { data: allPlans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('plan_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch all servers for selection
  const { data: allServers = [] } = useQuery({
    queryKey: ['servers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, server_name')
        .order('server_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch user's own quick messages
  const { data: quickMessages = [] } = useQuery({
    queryKey: ['quick-messages', user?.id],
    queryFn: async (): Promise<QuickMessage[]> => {
      if (!user?.id) return [];
      const client = supabase as any;
      const { data, error } = await client
        .from('quick_messages')
        .select('*')
        .eq('created_by', user.id)
        .order('sort_order');
      if (error) throw error;
      return (data || []) as QuickMessage[];
    },
    enabled: !!user?.id,
  });

  // Search customers by phone or username with flexible 9th digit matching
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['customer-search', searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 3) return [];
      
      const normalizedPhone = searchTerm.replace(/\D/g, '');
      const hasLetters = /[a-zA-ZÀ-ÿ]/.test(searchTerm);
      // Only treat as phone search when the term is numeric-only (prevents matching phone digits inside usernames)
      const isPhoneSearch = !hasLetters && normalizedPhone.length >= 4;
      
      // Generate phone variations to handle the 9th digit issue
      // Brazilian mobile numbers may or may not have the 9 after DDD
      const phoneVariations: string[] = isPhoneSearch ? [normalizedPhone] : [];
      
      // Helper to add variation if not already present
      const addVariation = (variation: string) => {
        if (!phoneVariations.includes(variation)) {
          phoneVariations.push(variation);
        }
      };
      
      if (isPhoneSearch) {
        // Handle with country code (55) first
        if (normalizedPhone.startsWith('55') && normalizedPhone.length >= 12) {
          const ddd = normalizedPhone.slice(2, 4);
          const rest = normalizedPhone.slice(4);
          
          // Try adding 9 after DDD (rest has 8 digits, needs 9)
          if (rest.length === 8) {
            addVariation('55' + ddd + '9' + rest);
          }
          // Try removing 9 after DDD (rest has 9 digits starting with 9)
          if (rest.startsWith('9') && rest.length === 9) {
            addVariation('55' + ddd + rest.slice(1));
          }
          // Also try without country code
          addVariation(ddd + rest);
          if (rest.length === 8) {
            addVariation(ddd + '9' + rest);
          }
          if (rest.startsWith('9') && rest.length === 9) {
            addVariation(ddd + rest.slice(1));
          }
        }
        // Handle without country code (DDD + number)
        else if (normalizedPhone.length >= 10) {
          const ddd = normalizedPhone.slice(0, 2);
          const rest = normalizedPhone.slice(2);
          
          // Try adding 9 after DDD
          if (rest.length === 8) {
            addVariation(ddd + '9' + rest);
          }
          // Try removing 9 after DDD
          if (rest.startsWith('9') && rest.length === 9) {
            addVariation(ddd + rest.slice(1));
          }
          // Also try with country code
          addVariation('55' + normalizedPhone);
          if (rest.length === 8) {
            addVariation('55' + ddd + '9' + rest);
          }
          if (rest.startsWith('9') && rest.length === 9) {
            addVariation('55' + ddd + rest.slice(1));
          }
        }
      }
      
      // Build OR filter for phone variations AND username/name search
      const filters: string[] = [];
      
      // Add phone filters (main + extra)
      phoneVariations.forEach(v => {
        filters.push(`phone.ilike.%${v}%`);
        filters.push(`extra_phone.ilike.%${v}%`);
      });
      
      // Username and name search
      const trimmed = searchTerm.trim();

      if (hasLetters) {
        // Exact (case-insensitive) username match to avoid pulling unrelated people
        filters.push(`username.ilike.${trimmed}`);
        // Name search (contains) to handle partial names and special characters
        filters.push(`name.ilike.%${trimmed}%`);
      } else if (trimmed === normalizedPhone) {
        // If the user typed only digits, allow exact username match for numeric usernames
        filters.push(`username.eq.${trimmed}`);
      }
      
      const orFilter = filters.join(',');
      
      const { data, error } = await supabase
        .from('customers')
        .select(`
          id,
          name,
          phone,
          extra_phone,
          username,
          password,
          status,
          due_date,
          custom_price,
          screens,
          extra_months,
          notes,
          start_date,
          plan:plans(id, plan_name, price, duration_days),
          server:servers(id, server_name, host, panel_type, sigma_connection_id)
        `)
        .or(orFilter)
        .limit(10);

      if (error) throw error;
      return data as Customer[];
    },
    enabled: searchTerm.length >= 3,
  });

  // Get selected plan details
  const selectedPlan = allPlans.find(p => p.id === selectedPlanId);
  const renewalPrice = customRenewalPrice ? parseFloat(customRenewalPrice) : (selectedPlan?.price ?? 0);

  // Register payment and renew customer mutation
  const registerPayment = useMutation({
    mutationFn: async (customer: Customer) => {
      const amount = renewalPrice;
      const durationDays = selectedPlan?.duration_days ?? customer.plan?.duration_days ?? 30;
      const planName = selectedPlan?.plan_name ?? customer.plan?.plan_name ?? 'Padrão';

      const parseDateOnly = (ymd: string) => {
        const [y, m, d] = ymd.split('-').map(Number);
        return new Date(y, (m ?? 1) - 1, d ?? 1);
      };

      // Calculate new due date based on plan duration (prefer month-based when duration is multiple of 30)
      // If user manually changed editedDueDate (different from current customer.due_date), use it as override.
      const currentDueDate = startOfDay(parseDateOnly(customer.due_date));
      const today = startOfDay(new Date());
      const baseDate = currentDueDate > today ? currentDueDate : today;

      const months = durationDays % 30 === 0 ? durationDays / 30 : 0;
      const autoDueDate = months > 0 ? addMonths(baseDate, months) : addDays(baseDate, durationDays);
      const manualOverride = editedDueDate && editedDueDate !== customer.due_date;
      const newDueDate = manualOverride ? parseDateOnly(editedDueDate) : autoDueDate;
      const newDueDateStr = format(newDueDate, 'yyyy-MM-dd');

      // Register payment
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          customer_id: customer.id,
          amount,
          method: paymentMethod,
          confirmed: true,
          payment_date: format(new Date(), 'yyyy-MM-dd'),
        });

      if (paymentError) throw paymentError;

      // Update customer due_date, status, plan, screens, extra_months, username and custom_price if changed
      const updateData: any = {
        due_date: newDueDateStr,
        status: 'ativa' as const,
        screens: selectedScreens,
        username: editedUsername.trim() || null,
        extra_phone: editedExtraPhone.trim() || customer.extra_phone || null,
        // Decrement extra_months if customer has any
        extra_months: customer.extra_months > 0 ? customer.extra_months - 1 : 0,
        name: editedName.trim() || customer.name,
      };

      // Update plan if changed
      if (selectedPlanId && selectedPlanId !== customer.plan?.id) {
        updateData.plan_id = selectedPlanId;
      }

      // Update custom_price if different from plan price
      const planPrice = selectedPlan?.price ?? customer.plan?.price ?? 0;
      if (renewalPrice !== planPrice) {
        updateData.custom_price = renewalPrice;
      } else {
        updateData.custom_price = null; // Clear custom price if using plan price
      }

      const { error: updateError } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', customer.id);

      if (updateError) throw updateError;

      const xuiUsername = (editedUsername.trim() || customer.username || '').trim();
      // Skip external server renewal when customer has extra_months or toggle is off
      const skipServerRenewal = customer.extra_months > 0 || !activateOnServer;
      if (xuiUsername && !skipServerRenewal) {
        try {
          const serverHost = customer.server?.host || '';
          const serverName = customer.server?.server_name || '';
          const panel = resolvePanel(customer.server as any);
          const isNatv2 = panel === 'natv2';
          const isTheBest = panel === 'thebest';
          const isNatv = panel === 'natv';
          const isVplay = panel === 'vplay';
          const isRush = panel === 'rush';
          const isUniplay = panel === 'uniplay';
          const isP2Cine = panel === 'p2cine';

          if (isNatv2) {
            const months = Math.max(1, Math.round(durationDays / 30));
            const { data: n2Result, error: n2Error } = await supabase.functions.invoke('natv-renew', {
              body: { username: xuiUsername, months, duration_days: durationDays, customer_id: customer.id, panel: 'natv2' },
            });
            if (n2Error) {
              console.error('[NATV2] Erro:', n2Error);
              toast.warning('Renovado localmente, mas ' + describePanelError('NATV²', n2Error));
            } else if (!n2Result?.success) {
              console.warn('[NATV2] Falha:', n2Result?.error);
              toast.warning('Renovado localmente, mas ' + describePanelError('NATV²', n2Result?.error));
            } else {
              console.log('[NATV2] Sucesso:', n2Result);
            }
          } else if (isTheBest) {
            const months = Math.max(1, Math.round(durationDays / 30));
            const { data: tbResult, error: tbError } = await supabase.functions.invoke('the-best-renew', {
              body: { username: xuiUsername, months, customer_id: customer.id },
            });
            if (tbError) {
              console.error('[TheBest] Erro:', tbError);
              toast.warning('Renovado localmente, mas ' + describePanelError('The Best', tbError));
            } else if (!tbResult?.success) {
              console.warn('[TheBest] Falha:', tbResult?.error);
              toast.warning('Renovado localmente, mas ' + describePanelError('The Best', tbResult?.error));
            } else {
              console.log('[TheBest] Sucesso:', tbResult);
            }
          } else if (isNatv) {
            const months = Math.max(1, Math.round(durationDays / 30));
            const { data: natvResult, error: natvError } = await supabase.functions.invoke('natv-renew', {
              body: { username: xuiUsername, months, duration_days: durationDays, customer_id: customer.id },
            });
            if (natvError) {
              console.error('[NATV] Erro:', natvError);
              toast.warning('Renovado localmente, mas ' + describePanelError('NATV', natvError));
            } else if (!natvResult?.success) {
              console.warn('[NATV] Falha:', natvResult?.error);
              toast.warning('Renovado localmente, mas ' + describePanelError('NATV', natvResult?.error));
            } else {
              console.log('[NATV] Sucesso:', natvResult);
            }
          } else if (isVplay) {
            const { data: vpResult, error: vpError } = await supabase.functions.invoke('vplay-renew', {
              body: { username: xuiUsername, new_due_date: newDueDateStr, customer_id: customer.id },
            });
            if (vpError) {
              console.error('[VPlay] Erro:', vpError);
              toast.warning('Renovado localmente, mas ' + describePanelError('VPlay', vpError));
            } else if (!vpResult?.success) {
              console.warn('[VPlay] Falha:', vpResult?.error);
              toast.warning('Renovado localmente, mas ' + describePanelError('VPlay', vpResult?.error));
            } else {
              console.log('[VPlay] Sucesso:', vpResult);
            }
          } else if (panel === 'sigma') {
            const months = Math.max(1, Math.round(durationDays / 30));
            const { data: sgResult, error: sgError } = await supabase.functions.invoke('sigma-renew', {
              body: { action: 'renew', username: xuiUsername, months, customer_id: customer.id, connection_id: (customer.server as any)?.sigma_connection_id || null },
            });
            if (sgError) {
              console.error('[Sigma] Erro:', sgError);
              const msg = sgError.message || String(sgError);
              if (msg.includes('bloqueou') || msg.includes('403') || msg.includes('firewall')) {
                toast.error('O painel Sigma bloqueou a conexão. Ative a "Ponte Sigma" em Configurações para renovar via navegador.', { duration: 6000 });
              } else {
                toast.warning('Renovado localmente, mas ' + describePanelError('Sigma', sgError));
              }
            } else if ((sgResult as any)?.error) {
              const msg = (sgResult as any).error;
              if (msg.includes('bloqueou') || msg.includes('403') || msg.includes('firewall')) {
                toast.error('O painel Sigma bloqueou a conexão. Ative a "Ponte Sigma" em Configurações para renovar via navegador.', { duration: 6000 });
              } else {
                toast.warning('Renovado localmente, mas ' + describePanelError('Sigma', msg));
              }
            } else {
              console.log('[Sigma] Sucesso:', sgResult);
            }
          } else if (isRush) {

            const months = Math.max(1, Math.round(durationDays / 30));
            const { data: rushResult, error: rushError } = await supabase.functions.invoke('rush-renew', {
              body: { username: xuiUsername, months, customer_id: customer.id },
            });
            if (rushError) {
              console.error('[Rush] Erro:', rushError);
              toast.warning('Renovado localmente, mas ' + describePanelError('Rush', rushError));
            } else if (!rushResult?.success) {
              console.warn('[Rush] Falha:', rushResult?.error);
              toast.warning('Renovado localmente, mas ' + describePanelError('Rush', rushResult?.error));
            } else {
              console.log('[Rush] Sucesso:', rushResult);
            }
          } else if (isP2Cine) {
            const months = Math.max(1, Math.round(durationDays / 30));
            const { data: pcResult, error: pcError } = await supabase.functions.invoke('p2cine-renew', {
              body: { action: 'renew', username: xuiUsername, months, customer_id: customer.id },
            });
            const pcMsg = pcError?.message || (pcResult as any)?.error;
            if (pcError || !(pcResult as any)?.success) {
              console.error('[P2Cine] Falha:', pcMsg);
              toast.warning('Renovado localmente, mas ' + describePanelError('P2Cine', pcMsg));
              await supabase.from('pending_manual_renewals' as any).insert({
                owner_id: (customer as any).created_by || user?.id,
                customer_id: customer.id,
                customer_name: customer.name,
                customer_phone: customer.phone,
                username: xuiUsername,
                server_id: (customer as any).server_id || customer.server?.id || null,
                server_name: serverName,
                server_host: serverHost,
                plan_name: planName,
                amount,
                new_due_date: newDueDateStr,
                reason: 'p2cine_api_failed',
                source: 'frontend_p2cine_quick_renew',
                error_details: { message: pcMsg || 'Falha na API do painel kOffice/P2Cine' },
              });
            } else {
              console.log('[P2Cine] Sucesso:', pcResult);
            }
          } else if (isUniplay) {
            const { error: queueError } = await supabase.from('pending_manual_renewals' as any).insert({
              owner_id: (customer as any).created_by || user?.id,
              customer_id: customer.id,
              customer_name: customer.name,
              customer_phone: customer.phone,
              username: xuiUsername,
              server_id: (customer as any).server_id || customer.server?.id || null,
              server_name: serverName,
              server_host: serverHost,
              plan_name: planName,
              amount,
              new_due_date: newDueDateStr,
              reason: isP2Cine ? 'p2cine_extension_pending' : 'uniplay_extension_pending',
              source: isP2Cine ? 'frontend_p2cine_quick_renew' : 'frontend_uniplay_quick_renew',
              error_details: { message: isP2Cine
                ? 'Aguardando extensão SuperGestor em aba logada no daily3.news / painelacesso1.com'
                : 'Aguardando extensão SuperGestor em aba logada no searchdefense.top' },
            });
            if (queueError) console.error('[Extensão] Erro ao enfileirar:', queueError);
            else toast.info('Renovação enviada para a extensão do navegador.');
          } else {
            const { data: xuiResult, error: xuiError } = await supabase.functions.invoke('xui-renew', {
              body: { username: xuiUsername, new_due_date: newDueDateStr, customer_id: customer.id },
            });
            if (xuiError) {
              console.error('[XUI-Renew] Erro:', xuiError);
              toast.warning('Renovado localmente, mas ' + describePanelError('XUI', xuiError));
            } else if (!xuiResult?.success) {
              console.warn('[XUI-Renew] Falha:', xuiResult?.error);
              toast.warning('Renovado localmente, mas ' + describePanelError('XUI', xuiResult?.error));
            } else {
              console.log('[XUI-Renew] Sucesso:', xuiResult);
            }
          }
        } catch (e) {
          console.error('[Renew] Erro inesperado:', e);
        }
      } else if (xuiUsername && skipServerRenewal) {
        console.log(`[Renew] Mês extra abatido (${customer.extra_months} → ${customer.extra_months - 1}). Renovação no servidor ignorada.`);
        toast.info(`Mês extra abatido (${customer.extra_months} → ${customer.extra_months - 1}). Servidor não foi renovado.`);
      }

      return { newDueDate: newDueDateStr, amount, customer, planName };
    },
    onSuccess: async (data) => {
      const { newDueDate, amount, customer, planName } = data;
      const formattedDate = formatDate(newDueDate);

      // Update local UI immediately
      setSelectedCustomer((prev) => {
        if (!prev || prev.id !== customer.id) return prev;
        return { ...prev, due_date: newDueDate, status: 'ativa', username: editedUsername.trim() || null };
      });

      // Generate renewal message with updated username
      const displayUsername = editedUsername.trim() || customer.username || '-';
      const message = `✅ *Renovação Confirmada!*

Olá ${customer.name}!

Seu pagamento de *R$ ${amount.toFixed(2)}* foi confirmado.

📅 *Novo vencimento:* ${formattedDate}
👤 *Usuário:* ${displayUsername}
📺 *Plano:* ${planName}
🖥️ *Servidor:* ${customer.server?.server_name || '-'}

Obrigado pela preferência! 🙏`;

      setRenewalMessage(message);

      // Send confirmation via backend (official Meta/Zap + Evolution fallback + e-mail + admin)
      // Não bloqueia a UI: a renovação já está concluída no banco/painel.
      void supabase.functions
        .invoke('send-payment-confirmation', {
          body: {
            customer_id: customer.id,
            amount,
            plan_name: planName,
            new_due_date: newDueDate,
            source: 'manual_chat',
          },
        })
        .then(({ data: confData, error: confError }) => {
          if (confError) {
            console.error('Erro ao enviar confirmação:', confError);
            toast.warning('Renovado, mas falha ao enviar a confirmação automática.');
          } else if (confData?.results?.text?.ok || confData?.results?.template?.ok) {
            toast.success('Mensagem de confirmação enviada!');
          } else if (confData?.results?.text && !confData.results.text.ok) {
            toast.warning(`Renovado, mas a confirmação não foi enviada: ${confData.results.text.error || 'erro desconhecido'}`);
          }
        })
        .catch((e) => console.error('Erro ao enviar confirmação:', e));



      toast.success('Cliente renovado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['customer-search'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      toast.error(describePanelError('Renovação', error));
    },
  });

  // Save quick message mutation
  const saveMessage = useMutation({
    mutationFn: async (message: Partial<QuickMessage> & { id?: string }) => {
      if (message.id) {
        const { error } = await supabase
          .from('quick_messages')
          .update({ title: message.title, category: message.category, content: message.content, icon: message.icon })
          .eq('id', message.id);
        if (error) throw error;
      } else {
        if (!user?.id) throw new Error('Usuário não autenticado');
        const client = supabase as any;
        const { error } = await client
          .from('quick_messages')
          .insert({ 
            title: message.title!, 
            category: message.category!, 
            content: message.content!, 
            icon: message.icon,
            created_by: user.id 
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Mensagem salva!');
      queryClient.invalidateQueries({ queryKey: ['quick-messages'] });
      setEditingMessage(null);
      setNewMessage({ title: '', category: '', content: '', icon: 'MessageSquare' });
    },
    onError: (error) => {
      toast.error('Erro ao salvar: ' + error.message);
    },
  });

  // Reorder quick messages mutation
  const reorderMessages = useMutation({
    mutationFn: async (ordered: QuickMessage[]) => {
      const client = supabase as any;
      const updates = ordered.map((m, idx) =>
        client.from('quick_messages').update({ sort_order: idx }).eq('id', m.id)
      );
      const results = await Promise.all(updates);
      const err = results.find((r: any) => r.error);
      if (err?.error) throw err.error;
    },
    onMutate: async (ordered: QuickMessage[]) => {
      await queryClient.cancelQueries({ queryKey: ['quick-messages', user?.id] });
      const previous = queryClient.getQueryData(['quick-messages', user?.id]);
      queryClient.setQueryData(['quick-messages', user?.id], ordered);
      return { previous };
    },
    onError: (error: any, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['quick-messages', user?.id], ctx.previous);
      toast.error('Erro ao reordenar: ' + error.message);
    },
    onSuccess: () => {
      toast.success('Ordem atualizada!');
      queryClient.invalidateQueries({ queryKey: ['quick-messages'] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = quickMessages.findIndex((m) => m.id === active.id);
    const newIndex = quickMessages.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(quickMessages, oldIndex, newIndex);
    reorderMessages.mutate(reordered);
  };

  // Delete quick message mutation
  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quick_messages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Mensagem removida!');
      queryClient.invalidateQueries({ queryKey: ['quick-messages'] });
      setSelectedQuickMessage(null);
    },
    onError: (error) => {
      toast.error('Erro ao remover: ' + error.message);
    },
  });

  const copyText = async (text: string) => {
    // Try modern Clipboard API
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // ignore and fallback
    }

    // Fallback for restricted contexts (e.g., some iframes)
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      el.style.top = '-9999px';
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  };

  const extractScreensFromPlanName = (name?: string | null): number | null => {
    if (!name) return null;
    const m = name.match(/(\d+)\s*telas?/i);
    if (m) return parseInt(m[1], 10);
    return null;
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer.username || customer.phone);
    setRenewalMessage(null);
    setVplayTestResult(null);
    // Reset plan/price/screens/username to customer's current values
    setSelectedPlanId(customer.plan?.id || null);
    const currentPrice = customer.custom_price ?? customer.plan?.price ?? 0;
    setCustomRenewalPrice(currentPrice.toString());
    // Force screens to match plan name (e.g. "Mensal 2 Telas" => 2)
    const planScreens = extractScreensFromPlanName(customer.plan?.plan_name);
    setSelectedScreens(planScreens ?? customer.screens ?? 1);
    setEditedUsername(customer.username || '');
    setEditedServerId(customer.server?.id || null);
    setEditedStatus(customer.status);
    setEditedName(customer.name);
    setEditedPhone(customer.phone);
    setEditedExtraPhone(customer.extra_phone || '');
    setEditedDueDate(customer.due_date);
    setActivateOnServer(true);
  };

  // Delete customer mutation
  const deleteCustomer = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error('Nenhum cliente selecionado');
      const { error } = await supabase.from('customers').delete().eq('id', selectedCustomer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cliente excluído!');
      setSelectedCustomer(null);
      setSearchTerm('');
      queryClient.invalidateQueries({ queryKey: ['customer-search'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir: ' + error.message);
    },
  });

  // Adjust extra_months (+/-)
  const adjustExtraMonths = useMutation({
    mutationFn: async (delta: number) => {
      if (!selectedCustomer) throw new Error('Nenhum cliente selecionado');
      const next = Math.max(0, (selectedCustomer.extra_months || 0) + delta);
      const { error } = await supabase
        .from('customers')
        .update({ extra_months: next })
        .eq('id', selectedCustomer.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(`Meses extras atualizados: ${next}`);
      setSelectedCustomer((prev) => prev ? { ...prev, extra_months: next } : prev);
      queryClient.invalidateQueries({ queryKey: ['customer-search'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar meses extras: ' + error.message);
    },
  });

  // Save customer data without renewal
  const saveCustomerData = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error('Nenhum cliente selecionado');
      const updateData: any = {
        name: editedName.trim(),
        phone: editedPhone.trim(),
        extra_phone: editedExtraPhone.trim() || null,
        username: editedUsername.trim() || null,
        screens: selectedScreens,
        status: editedStatus,
        server_id: editedServerId,
      };
      if (editedDueDate && editedDueDate !== selectedCustomer.due_date) {
        updateData.due_date = editedDueDate;
      }
      if (selectedPlanId) updateData.plan_id = selectedPlanId;
      const planPrice = selectedPlan?.price ?? selectedCustomer.plan?.price ?? 0;
      if (renewalPrice !== planPrice) {
        updateData.custom_price = renewalPrice;
      } else {
        updateData.custom_price = null;
      }
      const { error } = await supabase.from('customers').update(updateData).eq('id', selectedCustomer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Dados do cliente salvos!');
      // Update selectedCustomer to reflect changes immediately
      setSelectedCustomer(prev => {
        if (!prev) return null;
        const matchedServer = allServers.find(s => s.id === editedServerId);
        const serverData = matchedServer ? { 
          id: matchedServer.id, 
          server_name: matchedServer.server_name,
          host: (prev.server as any)?.host || '' // Keep host from prev or empty
        } : prev.server;

        return {
          ...prev,
          name: editedName.trim(),
          phone: editedPhone.trim(),
          extra_phone: editedExtraPhone.trim() || null,
          username: editedUsername.trim() || null,
          screens: selectedScreens,
          status: editedStatus as any,
          server: serverData,
          due_date: editedDueDate || prev.due_date,
          plan: allPlans.find(p => p.id === selectedPlanId) || prev.plan,
          custom_price: renewalPrice
        };
      });
      queryClient.invalidateQueries({ queryKey: ['customer-search'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao salvar: ' + error.message);
    },
  });
  // Generate Vplay test (standalone - not tied to selectedCustomer)
  const [vplayTestName, setVplayTestName] = useState('');
  
  const handleGenerateVplayTest = async () => {
    if (!selectedVplayServer) {
      toast.warning('Configure um servidor Vplay primeiro!', {
        action: {
          label: 'Configurar',
          onClick: () => window.location.href = '/settings',
        },
      });
      return;
    }

    const serverType = (selectedVplayServer as any).server_type || 'vplay';
    const isNatvServer = serverType === 'natv' || serverType === 'natv2';
    const vplayUrl = selectedVplayServer.integration_url;
    const keyMessage = selectedVplayServer.key_message || 'XCLOUD';
    const testName = vplayTestName.trim() || 'Cliente';

    setIsGeneratingTest(true);
    setVplayTestResult(null);

    try {
      if (isNatvServer) {
        const { data, error } = await supabase.functions.invoke('natv-generate-test', {
          body: {
            serverId: selectedVplayServer.id,
            username: vplayTestName.trim(),
            minutes: String((selectedVplayServer as any).test_minutes || 60),
          },
        });
        if (error) throw new Error(error.message || 'Erro na edge function');
        if ((data as any)?.error) throw new Error((data as any).error);
        setVplayTestResult((data as any)?.message || JSON.stringify(data));
        toast.success('Teste gerado com sucesso!');
        return;
      }

      console.log('[Vplay] Calling edge function with URL:', vplayUrl);

      const { data, error } = await supabase.functions.invoke('vplay-generate-test', {
        body: {
          vplayUrl,
          senderName: testName,
          keyMessage,
        },
      });

      if (error) {
        throw new Error(error.message || 'Erro na edge function');
      }

      console.log('[Vplay] Response:', data);

      // Extract login info from response (data.data[0].message contains the login)
      const responseData = data?.data || data;
      const loginInfo = responseData?.[0]?.message || responseData?.message || JSON.stringify(data);
      setVplayTestResult(loginInfo);
      toast.success('Teste gerado com sucesso!');
    } catch (error) {
      console.error('[Vplay] Error generating test:', error);
      toast.error('Erro ao gerar teste: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const handleRenew = () => {
    if (selectedCustomer) {
      // Check if customer has extra months - require confirmation
      if (selectedCustomer.extra_months > 0 && !showExtraMonthsConfirm) {
        setShowExtraMonthsConfirm(true);
        return;
      }
      setShowExtraMonthsConfirm(false);
      setRenewalMessage(null);
      registerPayment.mutate(selectedCustomer);
    }
  };

  const handleConfirmExtraMonthsRenewal = () => {
    if (selectedCustomer) {
      setShowExtraMonthsConfirm(false);
      setRenewalMessage(null);
      registerPayment.mutate(selectedCustomer);
    }
  };

  const handleCancelExtraMonthsRenewal = () => {
    setShowExtraMonthsConfirm(false);
  };

  // Generate payment approved message without renewing
  const generatePaymentMessage = (customer: Customer) => {
    const amount = renewalPrice || (customer.custom_price ?? customer.plan?.price ?? 0);
    const formattedDate = formatDate(customer.due_date);
    const planName = selectedPlan?.plan_name ?? customer.plan?.plan_name ?? 'Padrão';
    
    return `✅ *Pagamento Aprovado!*

Olá ${customer.name}!

Seu pagamento de *R$ ${amount.toFixed(2)}* foi confirmado.

📅 *Vencimento:* ${formattedDate}
👤 *Usuário:* ${editedUsername || customer.username || '-'}
🖥️ *Telas:* ${selectedScreens}
📺 *Plano:* ${planName}
🖥️ *Servidor:* ${customer.server?.server_name || '-'}

Obrigado pela preferência! 🙏`;
  };

  // Check if customer is overdue
  const isCustomerOverdue = (dueDate: string | null | undefined) => {
    if (!dueDate) return false;
    try {
      const parts = dueDate.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parts[2] ? parseInt(parts[2], 10) : 1;
      
      if (isNaN(y) || isNaN(m)) return false;
      
      const due = new Date(y, m - 1, d);
      if (isNaN(due.getTime())) return false;
      
      const today = startOfDay(new Date());
      return due < today;
    } catch (e) {
      return false;
    }
  };

  // Generate overdue billing message
  const generateOverdueMessage = (customer: Customer) => {
    const formattedDate = formatDate(customer.due_date);
    const planName = selectedPlan?.plan_name ?? customer.plan?.plan_name ?? 'Mensal';
    const serverName = customer.server?.server_name || 'NATV';
    
    // Use user's billing settings - NO FALLBACK to admin values
    const pixKey = billingSettings?.pix_key || '';
    const pixKeyType = billingSettings?.pix_key_type || 'celular';
    const monthly = billingSettings?.monthly_price ?? 0;
    const quarterly = billingSettings?.quarterly_price ?? 0;
    const semiannual = billingSettings?.semiannual_price ?? 0;
    const annual = billingSettings?.annual_price ?? 0;
    const customMessage = billingSettings?.custom_message || '';
    
    const pixKeyTypeLabel = pixKeyType.charAt(0).toUpperCase() + pixKeyType.slice(1);
    
    return `⚠️ *Plano Vencido – Ação Necessária*

Olá ${customer.name}!

Identificamos que o seu plano está vencido no momento.

📅 *Vencimento:* ${formattedDate}
👤 *Usuário:* ${editedUsername || customer.username || '-'}
📺 *Plano:* ${planName}
🖥️ *Servidor:* ${serverName}

Para continuar aproveitando o serviço sem interrupções, basta realizar a renovação 👇

🔑 *PAGAMENTO VIA PIX*
📱 Chave (${pixKeyTypeLabel}): ${pixKey || '⚠️ Não configurada'}

💳 *PACOTES DISPONÍVEIS*
💰 Mensal — R$ ${monthly.toFixed(2)}
💰 Trimestral — R$ ${quarterly.toFixed(2)}
💰 Semestral — R$ ${semiannual.toFixed(2)}
💰 Anual — R$ ${annual.toFixed(2)}

✅ Após o pagamento, envie o comprovante para que possamos liberar sua conta rapidamente.

Agradecemos a preferência e ficamos à disposição! 🙏📺${customMessage ? `\n\n${customMessage}` : ''}`;
  };

  // Generate billing message with PIX info (for active customers too)
  const generateBillingWithPixMessage = (customer: Customer) => {
    const formattedDate = formatDate(customer.due_date);
    const planName = selectedPlan?.plan_name ?? customer.plan?.plan_name ?? 'Mensal';
    const serverName = customer.server?.server_name || 'NATV';
    const price = renewalPrice || (customer.custom_price ?? customer.plan?.price ?? 0);
    
    // Use user's billing settings - NO FALLBACK to admin values
    const pixKey = billingSettings?.pix_key || '';
    const pixKeyType = billingSettings?.pix_key_type || 'celular';
    const monthly = billingSettings?.monthly_price ?? 0;
    const quarterly = billingSettings?.quarterly_price ?? 0;
    const semiannual = billingSettings?.semiannual_price ?? 0;
    const annual = billingSettings?.annual_price ?? 0;
    
    const pixKeyTypeLabel = pixKeyType.charAt(0).toUpperCase() + pixKeyType.slice(1);
    
    return `📺 *Dados do Cliente*

👤 *Nome:* ${customer.name}
📱 *Usuário:* ${editedUsername || customer.username || '-'}
📺 *Plano:* ${planName}
🖥️ *Servidor:* ${serverName}
🖥️ *Telas:* ${selectedScreens}
📅 *Vencimento:* ${formattedDate}
💰 *Valor:* R$ ${price.toFixed(2)}

🔑 *PAGAMENTO VIA PIX*
📱 Chave (${pixKeyTypeLabel}): ${pixKey || '⚠️ Não configurada'}

💳 *PACOTES DISPONÍVEIS*
💰 Mensal — R$ ${monthly.toFixed(2)}
💰 Trimestral — R$ ${quarterly.toFixed(2)}
💰 Semestral — R$ ${semiannual.toFixed(2)}
💰 Anual — R$ ${annual.toFixed(2)}

✅ Após o pagamento, envie o comprovante para liberação! 🙏`;
  };

  const handleCopyOverdueMessage = async () => {
    if (!selectedCustomer) return;
    if (!billingSettings?.pix_key) {
      toast.warning('Configure sua chave PIX primeiro!', {
        action: {
          label: 'Configurar',
          onClick: () => setIsBillingSettingsOpen(true),
        },
      });
    }
    const message = generateOverdueMessage(selectedCustomer);
    const ok = await copyText(message);
    if (ok) toast.success('Mensagem de cobrança copiada!');
    else toast.error('Não foi possível copiar automaticamente.');
  };

  const handleCopyBillingWithPix = async () => {
    if (!selectedCustomer) return;
    if (!billingSettings?.pix_key) {
      toast.warning('Configure sua chave PIX primeiro!', {
        action: {
          label: 'Configurar',
          onClick: () => setIsBillingSettingsOpen(true),
        },
      });
    }
    const message = generateBillingWithPixMessage(selectedCustomer);
    const ok = await copyText(message);
    if (ok) toast.success('Dados com PIX copiados!');
    else toast.error('Não foi possível copiar automaticamente.');
  };

  const handleCopyPaymentMessage = async () => {
    if (!selectedCustomer) return;
    const message = generatePaymentMessage(selectedCustomer);
    const ok = await copyText(message);
    if (ok) toast.success('Mensagem de pagamento copiada!');
    else toast.error('Não foi possível copiar automaticamente. Selecione e copie manualmente.');
  };

  const handleCopyRenewalMessage = async () => {
    if (!renewalMessage) return;
    const ok = await copyText(renewalMessage);
    if (ok) toast.success('Mensagem de renovação copiada!');
    else toast.error('Não foi possível copiar automaticamente. Selecione e copie manualmente.');
  };

  const handleCloseRenewal = () => {
    setRenewalMessage(null);
    setSelectedCustomer(null);
    setSearchTerm('');
    if (onClose) onClose();
  };

  const handleCopyMessage = async (content: string) => {
    const ok = await copyText(content);
    if (ok) toast.success('Mensagem copiada!');
    else toast.error('Não foi possível copiar automaticamente. Selecione e copie manualmente.');
  };

  const getStatusBadge = (status: string, dueDate?: string) => {
    // Check if customer is overdue (regardless of status)
    const isOverdue = dueDate ? isCustomerOverdue(dueDate) : false;
    
    // If overdue (and not suspended/blocked), show "Vencido" badge
    if (isOverdue && status !== 'suspensa' && status !== 'bloqueado') {
      return <Badge variant="destructive">Vencido</Badge>;
    }
    
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string; className?: string }> = {
      ativa: { variant: 'default', label: 'Ativa' },
      inativa: { variant: 'secondary', label: 'Inativa' },
      suspensa: { variant: 'destructive', label: 'Suspensa' },
      bloqueado: { variant: 'destructive', label: 'Bloqueado', className: 'bg-red-900/50' },
    };
    const config = variants[status] || variants.inativa;
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.split('-');
      // Standard ISO YYYY-MM-DD
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parts[2] ? parseInt(parts[2], 10) : 1;
      
      if (isNaN(y) || isNaN(m)) return dateStr;
      
      const date = new Date(y, m - 1, d);
      if (isNaN(date.getTime())) return dateStr;
      
      return format(date, 'dd/MM/yyyy', { locale: ptBR });
    } catch (e) {
      console.error('Error formatting date:', dateStr, e);
      return dateStr;
    }
  };

  

  const getIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName] || MessageSquare;
    return <IconComponent className="h-4 w-4" />;
  };

  return (
    <div className={`${isMobile ? 'w-full' : 'w-[360px] lg:w-[420px] shrink-0 border-l border-border/20'} bg-background/40 backdrop-blur-3xl flex flex-col h-full max-h-full min-h-0 overflow-hidden text-[13px] shadow-2xl transition-all duration-500 ease-in-out`}>
      {!isMobile && (
        <div className="p-5 border-b border-border/20 bg-background/30 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
              <RefreshCw className="h-3 w-3 text-primary animate-pulse-slow" />
              Renovação Rápida
            </h2>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl bg-primary/5 hover:bg-primary/10 border border-primary/10 text-primary transition-all duration-300 hover:scale-110"
                onClick={() => setIsBillingSettingsOpen(true)}
                title="Configurar PIX e Preços"
              >
                <CreditCard className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 text-emerald-500 transition-all duration-300 hover:scale-110"
                onClick={() => setIsSendPlaylistOpen(true)}
                title="Enviar lista para o app"
              >
                <ListPlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/10 text-violet-500 transition-all duration-300 hover:scale-110"
                onClick={() => setIsClouddyCreateOpen(true)}
                title="Criar usuário Clouddy"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/10 text-[10px] font-bold uppercase tracking-wider gap-1.5 transition-all duration-300"
                onClick={() => {
                  setShowNewCustomerForm(!showNewCustomerForm);
                  setSelectedCustomer(null);
                }}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Novo
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <Input
              placeholder="Telefone ou usuário..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedCustomer(null);
                setShowNewCustomerForm(false);
              }}
              className="pl-10 h-11 text-sm bg-background/40 border-border/20 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all rounded-2xl shadow-inner"
            />
          </div>
        </div>
      )}
      
      {/* Billing Settings Modal */}
      <BillingSettingsModal 
        open={isBillingSettingsOpen} 
        onOpenChange={setIsBillingSettingsOpen} 
      />

      {/* Envio de lista para apps */}
      <SendPlaylistDialog
        open={isSendPlaylistOpen}
        onOpenChange={setIsSendPlaylistOpen}
        defaultUsername={selectedCustomer?.username || ''}
        defaultPassword={selectedCustomer?.password || ''}
        defaultHost={selectedCustomer?.server?.host || ''}
      />

      {/* Criar usuário no Clouddy */}
      <CreateClouddyUserDialog
        open={isClouddyCreateOpen}
        onOpenChange={setIsClouddyCreateOpen}
      />

      {isMobile && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground/80" />
              <Input
                placeholder="Buscar por telefone ou usuário..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedCustomer(null);
                  setShowNewCustomerForm(false);
                }}
                className="pl-10 h-11 text-base"
                autoFocus
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={() => setIsBillingSettingsOpen(true)}
              title="Configurar PIX"
            >
              <CreditCard className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={() => {
                setShowNewCustomerForm(!showNewCustomerForm);
                setSelectedCustomer(null);
              }}
            >
              <UserPlus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* New Customer Form - Always visible when toggled */}
          {showNewCustomerForm && !selectedCustomer && (
            <QuickCustomerForm
              initialPhone={searchTerm.replace(/\D/g, '')}
              onSuccess={() => {
                setShowNewCustomerForm(false);
                setSearchTerm('');
              }}
              onCancel={() => setShowNewCustomerForm(false)}
            />
          )}

          {/* Search Results */}
          {!selectedCustomer && !showNewCustomerForm && (isSearching || (searchResults && searchResults.length > 0)) && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 mb-2 flex items-center gap-2">
                <Search className="h-3 w-3" />
                {isSearching ? 'Buscando...' : `Resultados (${searchResults?.length || 0})`}
              </p>
              {(searchResults ?? []).map((customer) => (
                <Card
                  key={customer.id}
                  className="cursor-pointer border-border/20 bg-background/40 backdrop-blur-2xl hover:bg-background/60 hover:border-primary/30 hover:shadow-lg transition-all duration-300 rounded-2xl overflow-hidden group/card"
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <CardContent className="p-3 relative z-10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-bold truncate group-hover/card:text-primary transition-colors">{customer.name}</p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                          <PhoneFlagBadge phone={customer.phone} size="xs" />
                          <span>{customer.phone}</span>
                          {customer.username && (
                            <>
                              <span className="text-muted-foreground/40">•</span>
                              <span className="font-mono text-[10px]">{customer.username}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground/60" />
                            <span className={
                              customer.due_date && isCustomerOverdue(customer.due_date)
                                ? 'text-destructive font-bold' 
                                : 'text-muted-foreground/80'
                            }>
                              {formatDate(customer.due_date)}
                            </span>
                          </div>
                          {customer.server && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">{customer.server.server_name}</span>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(customer.status, customer.due_date)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}


          {/* No results message */}
          {!selectedCustomer && !showNewCustomerForm && searchTerm.length >= 3 && !isSearching && searchResults?.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground/80">
                Nenhum cliente encontrado
              </p>
            </div>
          )}

          {/* Selected Customer Details */}
          {selectedCustomer && (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-500">
              <Card className="border-border/30 bg-card/50 backdrop-blur-2xl shadow-xl overflow-hidden rounded-3xl relative group/card">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
                <CardHeader className="p-4 pb-2 relative z-10">
                  <CardTitle className="text-sm flex items-center gap-3">
                    <div className="p-2 rounded-2xl bg-primary/10 text-primary group-hover/card:scale-110 transition-transform duration-500 shadow-inner">
                      <User className="h-4 w-4" />
                    </div>
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="h-8 text-base font-bold bg-transparent border-none focus:ring-0 p-0 shadow-none selection:bg-primary/20"
                      placeholder="Nome do cliente"
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4 relative z-10">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner group/field">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        Principal
                      </label>
                      <div className="flex items-center gap-2">
                        <PhoneFlagBadge phone={editedPhone} size="sm" />
                        <Input
                          value={editedPhone}
                          onChange={(e) => setEditedPhone(e.target.value)}
                          className="h-6 text-sm font-bold bg-transparent border-none focus:ring-0 p-0 shadow-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner group/field">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-emerald-500" />
                        Extra
                      </label>
                      <div className="flex items-center gap-2">
                        <PhoneFlagBadge phone={editedExtraPhone} size="sm" fallbackIconColor="text-emerald-500" />
                        <Input
                          value={editedExtraPhone}
                          onChange={(e) => setEditedExtraPhone(e.target.value)}
                          placeholder="Adicionar..."
                          className="h-6 text-sm font-bold bg-transparent border-none focus:ring-0 p-0 shadow-none placeholder:text-muted-foreground/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/5 border border-primary/10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">Status do Cliente</span>
                    <Select value={editedStatus} onValueChange={setEditedStatus}>
                      <SelectTrigger className="h-7 w-[110px] text-[11px] font-bold rounded-xl bg-background/50 border-none shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border/20 backdrop-blur-xl">
                        <SelectItem value="ativa">Ativa</SelectItem>
                        <SelectItem value="inativa">Inativa</SelectItem>
                        <SelectItem value="suspensa">Suspensa</SelectItem>
                        <SelectItem value="bloqueado">Bloqueado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        Usuário(s)
                      </label>
                      <Input
                        value={editedUsername}
                        onChange={(e) => setEditedUsername(e.target.value)}
                        placeholder="user1, user2"
                        className="h-6 text-xs font-mono bg-transparent border-none focus:ring-0 p-0 shadow-none placeholder:text-muted-foreground/20"
                      />
                    </div>
                    
                    <div className="space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1.5">
                        <Key className="h-3 w-3" />
                        Senha
                      </label>
                      <div className="flex items-center justify-between group/pw">
                        <span className="font-mono text-xs truncate max-w-[80px]">
                          {selectedCustomer.password || '—'}
                        </span>
                        {selectedCustomer.password && (
                          <Copy 
                            className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover/pw:opacity-100 hover:text-primary cursor-pointer transition-all" 
                            onClick={() => handleCopyMessage(selectedCustomer.password!)}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        Vencimento
                      </label>
                      <Input
                        type="date"
                        value={editedDueDate}
                        onChange={(e) => setEditedDueDate(e.target.value)}
                        className={`h-6 text-[11px] bg-transparent border-none focus:ring-0 p-0 shadow-none appearance-none ${selectedCustomer?.due_date && isCustomerOverdue(selectedCustomer.due_date) ? 'text-destructive font-black' : 'font-bold'}`}
                      />
                    </div>

                    <div className="space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Telas</label>
                      <Select 
                        value={selectedScreens.toString()} 
                        onValueChange={(v) => setSelectedScreens(parseInt(v))}
                      >
                        <SelectTrigger className="h-6 text-[11px] font-bold bg-transparent border-none focus:ring-0 p-0 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/20 backdrop-blur-xl">
                          {[1, 2, 3, 4, 5].map((num) => (
                            <SelectItem key={num} value={num.toString()}>
                              {num} {num === 1 ? 'tela' : 'telas'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Plano</label>
                      <Select 
                        value={selectedPlanId || ''} 
                        onValueChange={(v) => {
                          setSelectedPlanId(v);
                          const plan = allPlans.find(p => p.id === v);
                          if (plan) {
                            setCustomRenewalPrice(plan.price.toString());
                            const ps = extractScreensFromPlanName(plan.plan_name);
                            if (ps) setSelectedScreens(ps);
                          }
                        }}
                      >
                        <SelectTrigger className="h-6 text-[11px] font-bold bg-transparent border-none focus:ring-0 p-0 shadow-none overflow-hidden">
                          <SelectValue placeholder="Plano" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/20 backdrop-blur-xl">
                          {allPlans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.plan_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1.5">
                        <Server className="h-3 w-3 text-blue-400" />
                        Servidor
                      </label>
                      <Select value={editedServerId || ''} onValueChange={setEditedServerId}>
                        <SelectTrigger className="h-6 text-[11px] font-bold bg-transparent border-none focus:ring-0 p-0 shadow-none text-blue-400">
                          <SelectValue placeholder="Servidor" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/20 backdrop-blur-xl">
                          {allServers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.server_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex items-end gap-3 pt-2">
                    <div className="flex-1 space-y-1.5 p-3 rounded-2xl bg-background/40 border border-border/10 shadow-inner">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Valor Renovação</label>
                      <div className="relative flex items-center">
                        <span className="text-xs font-black text-primary mr-1">R$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={customRenewalPrice}
                          onChange={(e) => setCustomRenewalPrice(e.target.value)}
                          className="h-6 text-sm font-black text-primary bg-transparent border-none focus:ring-0 p-0 shadow-none"
                        />
                      </div>
                    </div>
                    
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="h-12 flex-1 rounded-2xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/10 shadow-lg transition-all active:scale-90 gap-2"
                      onClick={() => saveCustomerData.mutate()}
                      disabled={saveCustomerData.isPending}
                    >
                      {saveCustomerData.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="h-5 w-5" />
                          <span className="font-bold">SALVAR ALTERAÇÕES</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Delete Customer - compact with keyword confirmation */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="text-[10px] text-destructive/70 hover:text-destructive underline underline-offset-2 inline-flex items-center gap-1 self-start"
                      >
                        <X className="h-2.5 w-2.5" />
                        Excluir cliente
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Excluir cliente
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground/80">
                          Você está prestes a excluir <strong className="text-foreground">{selectedCustomer.name}</strong>. Esta ação é permanente.
                        </p>
                        <p className="text-xs text-muted-foreground/80">
                          Para confirmar, digite <strong className="text-destructive">excluir</strong> abaixo:
                        </p>
                        <Input
                          autoFocus
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="excluir"
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmText('')}
                          >
                            Cancelar
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteConfirmText.trim().toLowerCase() !== 'excluir' || deleteCustomer.isPending}
                            onClick={() => {
                              deleteCustomer.mutate();
                              setDeleteConfirmText('');
                            }}
                          >
                            {deleteCustomer.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <X className="h-3 w-3 mr-1" />
                            )}
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <div className="pt-2 border-t border-border space-y-2">
                    {/* Copy Data with PIX Button */}
                    <Button
                      variant="outline"
                      className="w-full h-10 rounded-xl font-semibold text-xs shadow-lg shadow-primary/10 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 border border-primary/20 text-primary transition-all active:scale-[0.98]"
                      onClick={handleCopyBillingWithPix}
                    >
                      <div className="p-1 rounded-lg bg-primary/20 mr-2">
                        <Copy className="h-3.5 w-3.5" />
                      </div>
                      Copiar Dados + PIX
                    </Button>

                    {/* Overdue Warning */}
                    {isCustomerOverdue(selectedCustomer.due_date) && (
                      <div className="p-2.5 bg-destructive/10 border border-destructive/30 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-destructive">
                          <div className="p-1 rounded-lg bg-destructive/20">
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-bold">Plano Vencido</span>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full h-9 rounded-xl text-xs font-semibold bg-gradient-to-r from-destructive/20 to-destructive/10 hover:from-destructive/30 hover:to-destructive/20 border border-destructive/30 text-destructive transition-all active:scale-[0.98]"
                          onClick={handleCopyOverdueMessage}
                        >
                          <Copy className="h-3 w-3 mr-1.5" />
                          Copiar Cobrança
                        </Button>
                      </div>
                    )}

                    {/* Extra Months Control */}
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                          <div className="p-1 rounded-lg bg-amber-500/20">
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-bold">
                            {selectedCustomer.extra_months} {selectedCustomer.extra_months === 1 ? 'mês extra' : 'meses extras'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0 text-xs rounded-xl border-amber-500/30 hover:bg-amber-500/10"
                            disabled={selectedCustomer.extra_months <= 0 || adjustExtraMonths.isPending}
                            onClick={() => adjustExtraMonths.mutate(-1)}
                            title="Remover 1 mês extra"
                          >
                            −
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-xs rounded-xl border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                            disabled={adjustExtraMonths.isPending}
                            onClick={() => adjustExtraMonths.mutate(1)}
                            title="Adicionar 1 mês extra"
                          >
                            {adjustExtraMonths.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>+ Mês extra</>
                            )}
                          </Button>
                        </div>
                      </div>
                      {selectedCustomer.extra_months > 0 && (
                        <p className="text-[10px] text-muted-foreground/80">
                          Meses extras são abatidos automaticamente na próxima renovação e não disparam renovação no servidor.
                        </p>
                      )}
                  </div>

                  {/* Extra Months Confirmation Dialog */}
                  {showExtraMonthsConfirm && selectedCustomer.extra_months > 0 && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <div className="p-1 rounded-lg bg-amber-500/20">
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-sm font-bold">Confirmar Renovação</span>
                      </div>
                      <p className="text-xs text-foreground">
                        Este cliente ainda possui <strong>{selectedCustomer.extra_months} {selectedCustomer.extra_months === 1 ? 'mês extra' : 'meses extras'}</strong>.
                        Deseja realmente renovar? O contador será reduzido em 1.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 h-9 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
                          onClick={handleConfirmExtraMonthsRenewal}
                          disabled={registerPayment.isPending}
                        >
                          {registerPayment.isPending ? (
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          )}
                          Sim, Renovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-xl"
                          onClick={handleCancelExtraMonthsRenewal}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {!showExtraMonthsConfirm && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/40 border border-border/30">
                        <Checkbox
                          id="activate_on_server_renewal"
                          checked={activateOnServer}
                          onCheckedChange={(checked) => setActivateOnServer(!!checked)}
                          className="border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <Label htmlFor="activate_on_server_renewal" className="text-xs cursor-pointer font-medium">
                          ⚡ Renovar no painel do servidor
                        </Label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 h-11 rounded-xl font-bold text-sm shadow-lg shadow-primary/25 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all active:scale-[0.98]"
                          onClick={handleRenew}
                          disabled={registerPayment.isPending}
                        >
                          {registerPayment.isPending ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Renovar
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 w-11 rounded-xl border-primary/20 hover:bg-primary/10 hover:text-primary transition-all active:scale-[0.98]"
                          onClick={handleCopyPaymentMessage}
                          title="Copiar mensagem de pagamento aprovado"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Renewal success message */}
                  {renewalMessage && (
                    <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-2">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Renovação realizada!
                      </p>
                      <pre className="text-xs text-foreground whitespace-pre-wrap bg-background/50 p-2.5 rounded-xl border border-emerald-500/20 max-h-32 overflow-auto select-text">
                        {renewalMessage}
                      </pre>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs rounded-xl border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-600"
                          onClick={handleCopyRenewalMessage}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copiar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs rounded-xl"
                          onClick={handleCloseRenewal}
                        >
                          Fechar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>
          </div>
        )}

          {/* Empty state */}
          {!selectedCustomer && searchTerm.length < 3 && (
            <div className="text-center py-6 text-muted-foreground/80">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Digite telefone ou usuário para buscar</p>
            </div>
          )}

          {/* Quick Messages Section - Compact Chip Design */}
          <Collapsible open={isLinksOpen} onOpenChange={setIsLinksOpen}>
            <div className="flex items-center justify-between px-2 py-1 bg-secondary/10 rounded-lg">
              <CollapsibleTrigger className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 hover:text-primary transition-colors group">
                <div className="p-1 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-all">
                  {isLinksOpen ? <ChevronUp className="h-3 w-3 text-primary" /> : <ChevronDown className="h-3 w-3 text-primary" />}
                </div>
                <span>Mensagens Rápidas</span>
                <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-primary/20 text-primary border-none">{quickMessages.length}</Badge>
              </CollapsibleTrigger>
              <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-primary/10">
                    <Settings className="h-3 w-3" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Configurar Mensagens Rápidas</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 max-h-[60vh] overflow-auto">
                    {/* Add new message form */}
                    <Card>
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm">Nova Mensagem</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 space-y-2">
                        <Input
                          placeholder="Título"
                          value={newMessage.title}
                          onChange={(e) => setNewMessage({ ...newMessage, title: e.target.value })}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="Categoria (ex: suporte, instalacao)"
                          value={newMessage.category}
                          onChange={(e) => setNewMessage({ ...newMessage, category: e.target.value })}
                          className="h-8 text-sm"
                        />
                        <Textarea
                          placeholder="Conteúdo da mensagem..."
                          value={newMessage.content}
                          onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })}
                          className="text-sm min-h-[80px]"
                        />
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => saveMessage.mutate(newMessage)}
                          disabled={!newMessage.title || !newMessage.content || !newMessage.category}
                        >
                          Adicionar
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Existing messages - drag to reorder */}
                    {quickMessages.length > 0 && (
                      <p className="text-xs text-muted-foreground/80 px-1">
                        Arraste pelo ícone <GripVertical className="inline h-3 w-3" /> para reordenar as mensagens.
                      </p>
                    )}
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={quickMessages.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                        {quickMessages.map((msg) => (
                          <SortableMessageRow key={msg.id} msg={msg}>
                            {({ listeners, attributes, isDragging }) => (
                              <Card className={isDragging ? 'ring-2 ring-primary' : ''}>
                                <CardContent className="p-3 space-y-2">
                                  {editingMessage?.id === msg.id ? (
                                    <>
                                      <Input
                                        value={editingMessage.title}
                                        onChange={(e) => setEditingMessage({ ...editingMessage, title: e.target.value })}
                                        className="h-8 text-sm"
                                      />
                                      <Input
                                        value={editingMessage.category}
                                        onChange={(e) => setEditingMessage({ ...editingMessage, category: e.target.value })}
                                        className="h-8 text-sm"
                                      />
                                      <Textarea
                                        value={editingMessage.content}
                                        onChange={(e) => setEditingMessage({ ...editingMessage, content: e.target.value })}
                                        className="text-sm min-h-[80px]"
                                      />
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => saveMessage.mutate(editingMessage)}>
                                          Salvar
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => setEditingMessage(null)}>
                                          Cancelar
                                        </Button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 rounded hover:bg-muted text-muted-foreground/80 hover:text-foreground"
                                            aria-label="Arrastar para reordenar"
                                            {...listeners}
                                            {...attributes}
                                          >
                                            <GripVertical className="h-4 w-4" />
                                          </button>
                                          {getIcon(msg.icon)}
                                          <span className="font-medium text-sm">{msg.title}</span>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">{msg.category}</Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground/80 line-clamp-2">{msg.content}</p>
                                      <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => setEditingMessage(msg)}>
                                          Editar
                                        </Button>
                                        <Button size="sm" variant="destructive" onClick={() => deleteMessage.mutate(msg.id)}>
                                          Remover
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </CardContent>
                              </Card>
                            )}
                          </SortableMessageRow>
                        ))}
                      </SortableContext>
                    </DndContext>

                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <CollapsibleContent className="mt-2">
              {/* Compact chip grid — denser, more modern */}
              {quickMessages.length > 0 ? (
                <div className="grid grid-cols-3 gap-1">
                  {quickMessages.map((msg) => {
                    const isSelected = selectedQuickMessage?.id === msg.id;
                    const getCategoryDot = (cat: string) => {
                      const lowerCat = cat.toLowerCase();
                      if (lowerCat.includes('pix') || lowerCat.includes('pagamento')) return 'bg-emerald-500';
                      if (lowerCat.includes('suporte') || lowerCat.includes('ajuda')) return 'bg-blue-500';
                      if (lowerCat.includes('saudacao') || lowerCat.includes('boas')) return 'bg-amber-500';
                      if (lowerCat.includes('instalacao') || lowerCat.includes('app')) return 'bg-purple-500';
                      if (lowerCat.includes('manutenc') || lowerCat.includes('sistema')) return 'bg-orange-500';
                      if (lowerCat.includes('strimo') || lowerCat.includes('player')) return 'bg-rose-500';
                      return 'bg-primary';
                    };

                    return (
                      <button
                        key={msg.id}
                        type="button"
                        title={`${msg.title} — ${msg.category}`}
                        className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-all duration-300 overflow-hidden ${
                          isSelected
                            ? 'bg-primary/20 border-primary/50 shadow-md scale-[1.02]'
                            : 'bg-background/40 border-border/30 hover:border-primary/30 hover:bg-background/60 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedQuickMessage(isSelected ? null : msg)}
                      >
                        <span className={`flex-shrink-0 h-1.5 w-1.5 rounded-full ${getCategoryDot(msg.category)}`} />
                        <span className={`text-[10px] font-medium truncate flex-1 ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                          {msg.title}
                        </span>
                        <Copy
                          className="flex-shrink-0 h-2.5 w-2.5 text-muted-foreground/80 opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyMessage(msg.content);
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 bg-muted/20 rounded-md border border-dashed border-border">
                  <MessageSquare className="h-6 w-6 mx-auto text-muted-foreground/80/50 mb-1" />
                  <p className="text-[10px] text-muted-foreground/80">Nenhuma mensagem</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-[10px] mt-0.5 h-auto p-0"
                    onClick={() => setIsConfigOpen(true)}
                  >
                    Adicionar
                  </Button>
                </div>
              )}

              {/* Expanded message preview */}
              {selectedQuickMessage && (
                <div className="mt-2 animate-in slide-in-from-top-1 duration-150">
                  <Card className="bg-gradient-to-br from-card to-card/50 border-primary/30 shadow-sm">
                    <CardContent className="p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="p-1 rounded bg-primary/20">
                            {getIcon(selectedQuickMessage.icon)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate leading-tight">{selectedQuickMessage.title}</p>
                            <p className="text-[9px] text-muted-foreground/80 leading-tight">{selectedQuickMessage.category}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="h-7 text-[10px] gap-1 px-2 bg-primary hover:bg-primary/90"
                          onClick={() => handleCopyMessage(selectedQuickMessage.content)}
                        >
                          <Copy className="h-3 w-3" />
                          Copiar
                        </Button>
                      </div>
                      <pre className="text-[11px] text-foreground whitespace-pre-wrap bg-background/60 p-2 rounded border border-border/50 max-h-28 overflow-auto select-text font-sans leading-snug">
                        {selectedQuickMessage.content}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>


          {/* Vplay Test Section - Modern Glassmorphism Card */}
          <Card className="mt-4 border-violet-500/20 bg-violet-500/5 backdrop-blur-xl shadow-lg rounded-2xl overflow-hidden relative group/card">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent pointer-events-none" />
            <CardHeader className="p-3 pb-2 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-violet-500/20 text-violet-600 dark:text-violet-400 group-hover/card:scale-110 transition-transform duration-500 shadow-inner">
                    <Play className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-violet-600 dark:text-violet-400">Gerar Teste</h3>
                    <p className="text-[10px] text-muted-foreground/80">
                      {vplayServers.length > 0 ? `${vplayServers.length} servidor${vplayServers.length > 1 ? 'es' : ''} configurado${vplayServers.length > 1 ? 's' : ''}` : 'Nenhum servidor'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-violet-500/10"
                  onClick={() => window.location.href = '/settings'}
                  title="Configurar Servidores de Teste"
                >
                  <Settings className="h-3.5 w-3.5 text-violet-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2 relative z-10">
              {/* Server Selector */}
              {vplayServers.length > 0 ? (
                <Select
                  value={selectedVplayServerId || ''}
                  onValueChange={(value) => setSelectedVplayServerId(value)}
                >
                  <SelectTrigger className="h-9 text-sm bg-background/40 border-violet-500/20 rounded-xl focus:ring-violet-500/20">
                    <SelectValue placeholder="Selecione o servidor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vplayServers.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        <div className="flex items-center gap-2">
                          <span>{server.server_name}</span>
                          {server.is_default && (
                            <span className="text-[10px] text-violet-500">(padrão)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              
              <Input
                placeholder="Nome do cliente (opcional)"
                value={vplayTestName}
                onChange={(e) => setVplayTestName(e.target.value)}
                className="h-9 text-sm bg-background/40 border-violet-500/20 rounded-xl focus-visible:ring-violet-500/20"
              />
              <Button 
                className="w-full h-10 rounded-xl font-semibold shadow-lg shadow-violet-500/20 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white transition-all active:scale-[0.98]" 
                onClick={handleGenerateVplayTest}
                disabled={isGeneratingTest || vplayServers.length === 0}
              >
                {isGeneratingTest ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isGeneratingTest ? 'Gerando...' : selectedVplayServer ? `Gerar (${selectedVplayServer.server_name})` : 'Gerar Teste'}
              </Button>
              
              {vplayServers.length === 0 && (
                <p className="text-[10px] text-amber-500 text-center">
                  Configure servidores em Configurações &gt; Gerador de Teste
                </p>
              )}
            </CardContent>
          </Card>

        </div>
      </ScrollArea>
      
      {/* Vplay Test Result - Fixed at bottom with glassmorphism */}
      {vplayTestResult && (
        <div className="flex-shrink-0 p-3 border-t border-border bg-background/80 backdrop-blur-2xl">
          <Card className="border-violet-500/30 bg-violet-500/10 backdrop-blur-xl shadow-lg rounded-2xl overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent pointer-events-none" />
            <CardContent className="p-3 space-y-2 relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-xs font-bold">Teste Gerado!</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full text-muted-foreground/80 hover:text-foreground hover:bg-background/50"
                  onClick={() => setVplayTestResult(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <pre className="text-xs text-foreground whitespace-pre-wrap bg-background/50 p-2.5 rounded-xl border border-violet-500/20 max-h-24 overflow-y-auto select-text font-mono break-words">
                {vplayTestResult}
              </pre>
              {(() => {
                const links = vplayTestResult.match(/https?:\/\/\S+/gi) || [];
                const m3u = links.find((l) => /output=ts|type=m3u/i.test(l)) || links[0] || '';
                const hls = links.find((l) => /output=hls/i.test(l)) || '';
                const user = vplayTestResult.match(/username[=:\s]+([^\s&|,]+)/i)?.[1]
                  || vplayTestResult.match(/usu[áa]rio:\s*([^\s]+)/i)?.[1] || '';
                const pass = vplayTestResult.match(/password[=:\s]+([^\s&|,]+)/i)?.[1]
                  || vplayTestResult.match(/senha:\s*([^\s]+)/i)?.[1] || '';
                const copy = async (txt: string, label: string) => {
                  if (!txt) { toast.error(`Nada para copiar (${label})`); return; }
                  const ok = await copyText(txt);
                  if (ok) toast.success(`${label} copiado!`);
                };
                return (
                  <div className="space-y-1.5">
                    <Button
                      size="sm"
                      className="w-full h-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98]"
                      onClick={() => copy(vplayTestResult, 'Teste completo')}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copiar tudo
                    </Button>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 text-[10px] px-1 rounded-xl border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-600"
                        onClick={() => copy(m3u, 'Lista M3U')}>
                        Lista M3U
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-[10px] px-1 rounded-xl border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-600"
                        onClick={() => copy(hls || m3u, 'Link HLS')}>
                        Link HLS
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-[10px] px-1 rounded-xl border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-600"
                        onClick={() => copy(user && pass ? `Usuário: ${user}\nSenha: ${pass}` : '', 'Usuário e senha')}>
                        Usuário/Senha
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
