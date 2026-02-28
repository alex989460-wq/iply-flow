import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, User, Calendar, CreditCard, CheckCircle, Phone, RefreshCw, 
  Server, Copy, Settings, Wifi, Download, Key, Bell, Smile, MessageSquare,
  ChevronDown, ChevronUp, UserPlus, AlertTriangle, Monitor, Play, Loader2, X
} from 'lucide-react';
import { toast } from 'sonner';
import { addDays, addMonths, format, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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

type PaymentMethod = 'pix' | 'dinheiro' | 'transferencia';

interface Customer {
  id: string;
  name: string;
  phone: string;
  username: string | null;
  status: 'ativa' | 'inativa' | 'suspensa';
  due_date: string;
  custom_price: number | null;
  screens: number;
  extra_months: number;
  plan: {
    id: string;
    plan_name: string;
    price: number;
    duration_days: number;
  } | null;
  server: {
    id: string;
    server_name: string;
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
}

export default function QuickRenewalPanel({ isMobile = false, onClose }: QuickRenewalPanelProps) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
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
      
      // Add phone filters
      phoneVariations.forEach(v => {
        filters.push(`phone.ilike.%${v}%`);
      });
      
      // Username and name search
      const trimmed = searchTerm.trim();

      if (hasLetters) {
        // Exact (case-insensitive) username match to avoid pulling unrelated people
        filters.push(`username.ilike.${trimmed}`);
        // More precise name search (starts with)
        filters.push(`name.ilike.${trimmed}%`);
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
          username,
          status,
          due_date,
          custom_price,
          screens,
          extra_months,
          plan:plans(id, plan_name, price, duration_days),
          server:servers(id, server_name)
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
      const currentDueDate = startOfDay(parseDateOnly(customer.due_date));
      const today = startOfDay(new Date());
      const baseDate = currentDueDate > today ? currentDueDate : today;

      const months = durationDays % 30 === 0 ? durationDays / 30 : 0;
      const newDueDate = months > 0 ? addMonths(baseDate, months) : addDays(baseDate, durationDays);
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
      const updateData: Record<string, unknown> = {
        due_date: newDueDateStr,
        status: 'ativa' as const,
        screens: selectedScreens,
        username: editedUsername.trim() || null,
        // Decrement extra_months if customer has any
        extra_months: customer.extra_months > 0 ? customer.extra_months - 1 : 0,
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
      if (xuiUsername) {
        try {
          const serverHost = (customer as any).server?.host || '';
          const serverName = (customer as any).server?.server_name || '';
          const isTheBest = serverName.toLowerCase().includes('the best') || serverHost.toLowerCase().includes('the-best') || serverHost.toLowerCase().includes('painel.best');
          const isNatv = serverName.toLowerCase().includes('natv') || serverHost.toLowerCase().includes('pixbot') || serverHost.toLowerCase().includes('natv');
          const isVplay = serverName.toLowerCase().includes('vplay') || serverHost.toLowerCase().includes('vplay');

          if (isTheBest) {
            const months = Math.max(1, Math.round(durationDays / 30));
            const { data: tbResult, error: tbError } = await supabase.functions.invoke('the-best-renew', {
              body: { username: xuiUsername, months, customer_id: customer.id },
            });
            if (tbError) {
              console.error('[TheBest] Erro:', tbError);
              toast.warning(`Renovado localmente, mas falha no servidor The Best: ${tbError.message}`);
            } else if (!tbResult?.success) {
              console.warn('[TheBest] Falha:', tbResult?.error);
              toast.warning(`Renovado localmente, mas: ${tbResult?.error || 'Falha no servidor The Best'}`);
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
              toast.warning(`Renovado localmente, mas falha no servidor NATV: ${natvError.message}`);
            } else if (!natvResult?.success) {
              console.warn('[NATV] Falha:', natvResult?.error);
              toast.warning(`Renovado localmente, mas: ${natvResult?.error || 'Falha no servidor NATV'}`);
            } else {
              console.log('[NATV] Sucesso:', natvResult);
            }
          } else if (isVplay) {
            const { data: vpResult, error: vpError } = await supabase.functions.invoke('vplay-renew', {
              body: { username: xuiUsername, new_due_date: newDueDateStr, customer_id: customer.id },
            });
            if (vpError) {
              console.error('[VPlay] Erro:', vpError);
              toast.warning(`Renovado localmente, mas falha no servidor VPlay: ${vpError.message}`);
            } else if (!vpResult?.success) {
              console.warn('[VPlay] Falha:', vpResult?.error);
              toast.warning(`Renovado localmente, mas: ${vpResult?.error || 'Falha no servidor VPlay'}`);
            } else {
              console.log('[VPlay] Sucesso:', vpResult);
            }
          } else {
            const { data: xuiResult, error: xuiError } = await supabase.functions.invoke('xui-renew', {
              body: { username: xuiUsername, new_due_date: newDueDateStr, customer_id: customer.id },
            });
            if (xuiError) {
              console.error('[XUI-Renew] Erro:', xuiError);
              toast.warning(`Renovado localmente, mas falha no servidor XUI: ${xuiError.message}`);
            } else if (!xuiResult?.success) {
              console.warn('[XUI-Renew] Falha:', xuiResult?.error);
              toast.warning(`Renovado localmente, mas: ${xuiResult?.error || 'Falha no servidor XUI'}`);
            } else {
              console.log('[XUI-Renew] Sucesso:', xuiResult);
            }
          }
        } catch (e) {
          console.error('[Renew] Erro inesperado:', e);
        }
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

      // Send WhatsApp confirmation message
      if (zapSettings?.selected_department_id) {
        try {
          const phone = customer.phone.replace(/\D/g, '');
          const phoneWithCode = phone.startsWith('55') ? phone : `55${phone}`;
          const formattedTime = format(new Date(), 'HH:mm', { locale: ptBR });
          const formattedDueDate = format(new Date(newDueDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR });
          const serverName = customer.server?.server_name || '-';

          const whatsappMessage = `✅ Olá, *${customer.name}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:\n\n==========================\n📅 Próx. Vencimento: *${formattedDueDate} - ${formattedTime} hrs*\n💰 Valor: *${amount.toFixed(2)}*\n👤 Usuário: *${displayUsername}*\n📦 Plano: *${planName}*\n🔌 Status: *Ativo*\n💎 Obs: -\n⚡: *${serverName}*\n==========================`;

          const { data: msgData, error: msgError } = await supabase.functions.invoke('zap-responder', {
            body: {
              action: 'enviar-mensagem',
              department_id: zapSettings.selected_department_id,
              number: phoneWithCode,
              text: whatsappMessage,
            },
          });

          if (msgError) {
            console.error('Erro ao enviar mensagem WhatsApp:', msgError);
          } else if (!msgData?.success) {
            console.error('Falha ao enviar mensagem WhatsApp:', msgData);
          } else {
            console.log('Mensagem de confirmação enviada:', msgData);
            toast.success('Mensagem de confirmação enviada!');
          }

          // Send admin notification
          try {
            const adminPhone = '5541991758392';
            const adminMsg = `🔔 *Renovação Manual (Chat)*\n\n👤 Cliente: *${customer.name}*\n📞 Tel: ${phoneWithCode}\n👤 Usuário: *${displayUsername}*\n💰 Valor: *R$ ${amount.toFixed(2)}*\n📦 Plano: *${planName}*\n🖥️ Servidor: *${customer.server?.server_name || '-'}*\n📅 Novo vencimento: *${formattedDueDate}*\n✅ Status: Renovado`;
            await supabase.functions.invoke('zap-responder', {
              body: {
                action: 'enviar-mensagem',
                department_id: zapSettings.selected_department_id,
                number: adminPhone,
                text: adminMsg,
              },
            });
          } catch (adminErr) {
            console.error('Erro ao notificar admin:', adminErr);
          }
        } catch (e) {
          console.error('Erro ao enviar mensagem WhatsApp:', e);
        }
      }

      toast.success('Cliente renovado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['customer-search'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      toast.error('Erro ao renovar: ' + error.message);
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

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer.username || customer.phone);
    setRenewalMessage(null);
    setVplayTestResult(null);
    // Reset plan/price/screens/username to customer's current values
    setSelectedPlanId(customer.plan?.id || null);
    const currentPrice = customer.custom_price ?? customer.plan?.price ?? 0;
    setCustomRenewalPrice(currentPrice.toString());
    setSelectedScreens(customer.screens || 1);
    setEditedUsername(customer.username || '');
  };

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

    const vplayUrl = selectedVplayServer.integration_url;
    const keyMessage = selectedVplayServer.key_message || 'XCLOUD';
    const testName = vplayTestName.trim() || 'Cliente';

    setIsGeneratingTest(true);
    setVplayTestResult(null);

    try {
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
  const isCustomerOverdue = (dueDate: string) => {
    const [y, m, d] = dueDate.split('-').map(Number);
    const due = new Date(y, (m ?? 1) - 1, d ?? 1);
    const today = startOfDay(new Date());
    return due < today;
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
    
    // If overdue (and not suspended), show "Vencido" badge
    if (isOverdue && status !== 'suspensa') {
      return <Badge variant="destructive">Vencido</Badge>;
    }
    
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      ativa: { variant: 'default', label: 'Ativa' },
      inativa: { variant: 'secondary', label: 'Inativa' },
      suspensa: { variant: 'destructive', label: 'Suspensa' },
    };
    const config = variants[status] || variants.inativa;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  };

  

  const getIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName] || MessageSquare;
    return <IconComponent className="h-4 w-4" />;
  };

  return (
    <div className={`${isMobile ? 'w-full' : 'w-80 border-l border-border'} bg-background/50 flex flex-col h-full`}>
      {!isMobile && (
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Renovação Rápida</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full hover:bg-primary/10"
                onClick={() => setIsBillingSettingsOpen(true)}
                title="Configurar PIX e Preços"
              >
                <CreditCard className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
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
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por telefone ou usuário..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedCustomer(null);
                setShowNewCustomerForm(false);
              }}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>
      )}
      
      {/* Billing Settings Modal */}
      <BillingSettingsModal 
        open={isBillingSettingsOpen} 
        onOpenChange={setIsBillingSettingsOpen} 
      />
      {isMobile && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
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
          {!selectedCustomer && !showNewCustomerForm && searchResults && searchResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">Resultados:</p>
              {searchResults.map((customer) => (
                <Card
                  key={customer.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <CardContent className="p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{customer.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{customer.phone}</span>
                          {customer.username && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{customer.username}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs mt-0.5">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className={
                            new Date(customer.due_date + 'T12:00:00') < new Date() 
                              ? 'text-destructive font-medium' 
                              : 'text-muted-foreground'
                          }>
                            {formatDate(customer.due_date)}
                          </span>
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
              <p className="text-sm text-muted-foreground">
                Nenhum cliente encontrado
              </p>
            </div>
          )}

          {/* Selected Customer Details */}
          {selectedCustomer && (
            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {selectedCustomer.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{selectedCustomer.phone}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    {getStatusBadge(selectedCustomer.status, selectedCustomer.due_date)}
                  </div>
                  
                  {/* Username - Editable for multiple users */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Usuário(s):
                    </label>
                    <Input
                      value={editedUsername}
                      onChange={(e) => setEditedUsername(e.target.value)}
                      placeholder="Ex: user1, user2"
                      className="h-8 text-sm font-mono"
                    />
                    {selectedScreens > 1 && (
                      <p className="text-[10px] text-muted-foreground">
                        Separe múltiplos usuários por vírgula
                      </p>
                    )}
                  </div>

                  {/* Screens Selector */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Telas:</label>
                    <Select 
                      value={selectedScreens.toString()} 
                      onValueChange={(v) => setSelectedScreens(parseInt(v))}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Quantidade de telas" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((num) => (
                          <SelectItem key={num} value={num.toString()}>
                            {num} {num === 1 ? 'tela' : 'telas'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Vencimento:</span>
                    </div>
                    <span className={`font-medium ${isCustomerOverdue(selectedCustomer.due_date) ? 'text-destructive' : ''}`}>
                      {formatDate(selectedCustomer.due_date)}
                    </span>
                  </div>
                  
                  {/* Plan Selector */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Plano:</label>
                    <Select 
                      value={selectedPlanId || ''} 
                      onValueChange={(v) => {
                        setSelectedPlanId(v);
                        const plan = allPlans.find(p => p.id === v);
                        if (plan) setCustomRenewalPrice(plan.price.toString());
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Selecione o plano" />
                      </SelectTrigger>
                      <SelectContent>
                        {allPlans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.plan_name} - R$ {plan.price.toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCustomer.server && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Server className="h-3.5 w-3.5" />
                        <span>Servidor:</span>
                      </div>
                      <span className="font-medium text-primary">{selectedCustomer.server.server_name}</span>
                    </div>
                  )}
                  
                  {/* Editable Price */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Valor:</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={customRenewalPrice}
                        onChange={(e) => setCustomRenewalPrice(e.target.value)}
                        className="h-8 text-sm pl-8 font-bold text-primary"
                      />
                    </div>
                  </div>

                  {/* Copy Data with PIX Button (always visible) */}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full h-8 text-xs border-primary/50 text-primary hover:bg-primary/10"
                    onClick={handleCopyBillingWithPix}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar Dados + PIX
                  </Button>

                  {/* Overdue Warning and Billing Message Button */}
                  {isCustomerOverdue(selectedCustomer.due_date) && (
                    <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded-lg">
                      <div className="flex items-center gap-2 text-destructive mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-semibold">Plano Vencido</span>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                        onClick={handleCopyOverdueMessage}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copiar Cobrança
                      </Button>
                    </div>
                  )}
                  {/* Extra Months Warning */}
                  {selectedCustomer.extra_months > 0 && (
                    <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-semibold">
                          {selectedCustomer.extra_months} {selectedCustomer.extra_months === 1 ? 'mês extra' : 'meses extras'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Este cliente possui meses adicionais devido a renovação incorreta anterior.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border space-y-2">
                  <label className="text-xs text-muted-foreground">Método de Pagamento</label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Extra Months Confirmation Dialog */}
                  {showExtraMonthsConfirm && selectedCustomer.extra_months > 0 && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-semibold">Confirmar Renovação</span>
                      </div>
                      <p className="text-xs text-foreground">
                        Este cliente ainda possui <strong>{selectedCustomer.extra_months} {selectedCustomer.extra_months === 1 ? 'mês extra' : 'meses extras'}</strong>.
                        Deseja realmente renovar? O contador será reduzido em 1.
                      </p>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className="flex-1 h-8 bg-amber-600 hover:bg-amber-700 text-white"
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
                          className="h-8"
                          onClick={handleCancelExtraMonthsRenewal}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {!showExtraMonthsConfirm && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button 
                          className="flex-1 h-9" 
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
                          className="h-9"
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
                    <div className="mt-3 p-3 bg-accent/30 border border-border rounded-lg space-y-2">
                      <p className="text-xs text-primary font-semibold">✅ Renovação realizada!</p>
                      <pre className="text-xs text-foreground whitespace-pre-wrap bg-background/50 p-2 rounded max-h-32 overflow-auto select-text">
                        {renewalMessage}
                      </pre>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 h-7 text-xs"
                          onClick={handleCopyRenewalMessage}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copiar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 text-xs"
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
          )}

          {/* Empty state */}
          {!selectedCustomer && searchTerm.length < 3 && (
            <div className="text-center py-6 text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Digite telefone ou usuário para buscar</p>
            </div>
          )}

          {/* Quick Messages Section - Modern Design */}
          <Collapsible open={isLinksOpen} onOpenChange={setIsLinksOpen}>
            <div className="flex items-center justify-between px-1">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors group">
                <div className={`p-1 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors`}>
                  {isLinksOpen ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />}
                </div>
                <span>Mensagens Rápidas</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{quickMessages.length}</Badge>
              </CollapsibleTrigger>
              <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-primary/10">
                    <Settings className="h-3.5 w-3.5" />
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

                    {/* Existing messages */}
                    {quickMessages.map((msg) => (
                      <Card key={msg.id}>
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
                                  {getIcon(msg.icon)}
                                  <span className="font-medium text-sm">{msg.title}</span>
                                </div>
                                <Badge variant="secondary" className="text-xs">{msg.category}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">{msg.content}</p>
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
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <CollapsibleContent className="mt-3">
              {/* Message Grid */}
              <div className="grid grid-cols-2 gap-1.5">
                {quickMessages.map((msg) => {
                  const isSelected = selectedQuickMessage?.id === msg.id;
                  // Category-based colors
                  const getCategoryColor = (cat: string) => {
                    const lowerCat = cat.toLowerCase();
                    if (lowerCat.includes('pix') || lowerCat.includes('pagamento')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                    if (lowerCat.includes('suporte') || lowerCat.includes('ajuda')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                    if (lowerCat.includes('saudacao') || lowerCat.includes('boas')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                    if (lowerCat.includes('instalacao') || lowerCat.includes('app')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
                    return 'bg-primary/20 text-primary border-primary/30';
                  };
                  
                  return (
                    <button
                      key={msg.id}
                      type="button"
                      className={`relative p-2.5 rounded-lg border text-left transition-all duration-200 group ${
                        isSelected 
                          ? 'bg-primary/15 border-primary/50 shadow-sm shadow-primary/20' 
                          : 'bg-card/50 border-border/50 hover:border-primary/30 hover:bg-card'
                      }`}
                      onClick={() => setSelectedQuickMessage(isSelected ? null : msg)}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 rounded-md ${getCategoryColor(msg.category)} transition-colors`}>
                          {getIcon(msg.icon)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                            {msg.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {msg.category}
                          </p>
                        </div>
                      </div>
                      {/* Quick copy button on hover */}
                      <div 
                        className={`absolute top-1 right-1 p-1 rounded-md bg-background/80 backdrop-blur-sm border border-border/50 transition-opacity ${
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyMessage(msg.content);
                        }}
                      >
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-primary transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {quickMessages.length === 0 && (
                <div className="text-center py-6 bg-muted/20 rounded-lg border border-dashed border-border">
                  <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma mensagem configurada</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-xs mt-1 h-auto p-0"
                    onClick={() => setIsConfigOpen(true)}
                  >
                    Adicionar primeira mensagem
                  </Button>
                </div>
              )}

              {/* Expanded message preview */}
              {selectedQuickMessage && (
                <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
                  <Card className="bg-gradient-to-br from-card to-card/50 border-primary/20 shadow-lg shadow-primary/5">
                    <CardContent className="p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-1.5 rounded-md bg-primary/20">
                            {getIcon(selectedQuickMessage.icon)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{selectedQuickMessage.title}</p>
                            <p className="text-[10px] text-muted-foreground">{selectedQuickMessage.category}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90"
                          onClick={() => handleCopyMessage(selectedQuickMessage.content)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar
                        </Button>
                      </div>
                      <div className="relative">
                        <pre className="text-xs text-foreground whitespace-pre-wrap bg-background/60 backdrop-blur-sm p-3 rounded-lg border border-border/50 max-h-32 overflow-auto select-text font-sans leading-relaxed">
                          {selectedQuickMessage.content}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Vplay Test Section - Below Quick Messages */}
          <div className="mt-4 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-violet-500/20">
                <Play className="h-4 w-4 text-violet-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400">Gerar Teste Vplay</h3>
                <p className="text-[10px] text-muted-foreground">
                  {vplayServers.length > 0 ? `${vplayServers.length} servidor${vplayServers.length > 1 ? 'es' : ''} configurado${vplayServers.length > 1 ? 's' : ''}` : 'Nenhum servidor'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full hover:bg-violet-500/10"
                onClick={() => window.location.href = '/settings'}
                title="Configurar Servidores Vplay"
              >
                <Settings className="h-3.5 w-3.5 text-violet-500" />
              </Button>
            </div>
            
            <div className="space-y-2">
              {/* Server Selector */}
              {vplayServers.length > 0 ? (
                <Select
                  value={selectedVplayServerId || ''}
                  onValueChange={(value) => setSelectedVplayServerId(value)}
                >
                  <SelectTrigger className="h-8 text-sm">
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
                className="h-8 text-sm"
              />
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full h-9 border-violet-500/50 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
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
                  Configure servidores em Configurações &gt; Gerador Vplay
                </p>
              )}
            </div>

          </div>
        </div>
      </ScrollArea>
      
      {/* Vplay Test Result - Fixed at bottom */}
      {vplayTestResult && (
        <div className="flex-shrink-0 p-3 border-t border-border bg-background">
          <div className="p-2.5 bg-violet-500/10 border border-violet-500/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs font-semibold">Teste Gerado!</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => setVplayTestResult(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <pre className="text-xs text-foreground whitespace-pre-wrap bg-background/50 p-2 rounded max-h-24 overflow-y-auto select-text font-mono break-words">
              {vplayTestResult}
            </pre>
            <Button 
              size="sm" 
              className="w-full h-8 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={async () => {
                const ok = await copyText(vplayTestResult);
                if (ok) toast.success('Dados do teste copiados!');
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copiar Teste
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
