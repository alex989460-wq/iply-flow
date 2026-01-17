import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, User, Calendar, CreditCard, CheckCircle, Phone, RefreshCw, 
  Server, Copy, Settings, Wifi, Download, Key, Bell, Smile, MessageSquare,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
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

type PaymentMethod = 'pix' | 'dinheiro' | 'transferencia';

interface Customer {
  id: string;
  name: string;
  phone: string;
  status: 'ativa' | 'inativa' | 'suspensa';
  due_date: string;
  custom_price: number | null;
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

export default function QuickRenewalPanel() {
  const [searchPhone, setSearchPhone] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [isLinksOpen, setIsLinksOpen] = useState(true);
  const [editingMessage, setEditingMessage] = useState<QuickMessage | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [newMessage, setNewMessage] = useState({ title: '', category: '', content: '', icon: 'MessageSquare' });
  const [renewalMessage, setRenewalMessage] = useState<string | null>(null);
  const [selectedQuickMessage, setSelectedQuickMessage] = useState<QuickMessage | null>(null);
  const queryClient = useQueryClient();

  // Fetch quick messages
  const { data: quickMessages = [] } = useQuery({
    queryKey: ['quick-messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quick_messages')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data as QuickMessage[];
    },
  });

  // Search customers by phone
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['customer-search', searchPhone],
    queryFn: async () => {
      if (searchPhone.length < 4) return [];
      
      const normalizedPhone = searchPhone.replace(/\D/g, '');
      
      const { data, error } = await supabase
        .from('customers')
        .select(`
          id,
          name,
          phone,
          status,
          due_date,
          custom_price,
          plan:plans(id, plan_name, price, duration_days),
          server:servers(id, server_name)
        `)
        .ilike('phone', `%${normalizedPhone}%`)
        .limit(5);

      if (error) throw error;
      return data as Customer[];
    },
    enabled: searchPhone.length >= 4,
  });

  // Register payment and renew customer mutation
  const registerPayment = useMutation({
    mutationFn: async (customer: Customer) => {
      const amount = customer.custom_price ?? customer.plan?.price ?? 0;
      const durationDays = customer.plan?.duration_days ?? 30;
      
      // Calculate new due date based on plan duration
      const currentDueDate = new Date(customer.due_date);
      const today = new Date();
      const baseDate = currentDueDate > today ? currentDueDate : today;
      const newDueDate = new Date(baseDate);
      newDueDate.setDate(newDueDate.getDate() + durationDays);
      const newDueDateStr = newDueDate.toISOString().split('T')[0];
      
      // Register payment
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          customer_id: customer.id,
          amount,
          method: paymentMethod,
          confirmed: true,
          payment_date: new Date().toISOString().split('T')[0],
        });

      if (paymentError) throw paymentError;
      
      // Update customer due_date and status
      const { error: updateError } = await supabase
        .from('customers')
        .update({ 
          due_date: newDueDateStr,
          status: 'ativa' as const
        })
        .eq('id', customer.id);

      if (updateError) throw updateError;
      
      return { newDueDate: newDueDateStr, amount, customer };
    },
    onSuccess: (data) => {
      const { newDueDate, amount, customer } = data;
      const formattedDate = format(new Date(newDueDate), "dd/MM/yyyy", { locale: ptBR });

      // Update local UI immediately
      setSelectedCustomer((prev) => {
        if (!prev || prev.id !== customer.id) return prev;
        return { ...prev, due_date: newDueDate, status: 'ativa' };
      });

      // Generate renewal message
      const message = `✅ *Renovação Confirmada!*

Olá ${customer.name}!

Seu pagamento de *R$ ${amount.toFixed(2)}* foi confirmado.

📅 *Novo vencimento:* ${formattedDate}
📺 *Plano:* ${customer.plan?.plan_name || 'Padrão'}
🖥️ *Servidor:* ${customer.server?.server_name || '-'}

Obrigado pela preferência! 🙏`;

      setRenewalMessage(message);
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
        const { error } = await supabase
          .from('quick_messages')
          .insert({ title: message.title!, category: message.category!, content: message.content!, icon: message.icon });
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
    setSearchPhone(customer.phone);
    setRenewalMessage(null);
  };

  const handleRenew = () => {
    if (selectedCustomer) {
      setRenewalMessage(null);
      registerPayment.mutate(selectedCustomer);
    }
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
    setSearchPhone('');
  };

  const handleCopyMessage = async (content: string) => {
    const ok = await copyText(content);
    if (ok) toast.success('Mensagem copiada!');
    else toast.error('Não foi possível copiar automaticamente. Selecione e copie manualmente.');
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      ativa: { variant: 'default', label: 'Ativa' },
      inativa: { variant: 'secondary', label: 'Inativa' },
      suspensa: { variant: 'destructive', label: 'Suspensa' },
    };
    const config = variants[status] || variants.inativa;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  };

  const price = selectedCustomer?.custom_price ?? selectedCustomer?.plan?.price ?? 0;

  const getIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName] || MessageSquare;
    return <IconComponent className="h-4 w-4" />;
  };

  return (
    <div className="w-80 border-l border-border bg-background/50 flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground mb-2">Renovação Rápida</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefone..."
            value={searchPhone}
            onChange={(e) => {
              setSearchPhone(e.target.value);
              setSelectedCustomer(null);
            }}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Search Results */}
          {!selectedCustomer && searchResults && searchResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">Resultados:</p>
              {searchResults.map((customer) => (
                <Card
                  key={customer.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <CardContent className="p-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.phone}</p>
                      </div>
                      {getStatusBadge(customer.status)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* No results */}
          {!selectedCustomer && searchPhone.length >= 4 && !isSearching && searchResults?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum cliente encontrado
            </p>
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
                    {getStatusBadge(selectedCustomer.status)}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Vencimento:</span>
                    </div>
                    <span className="font-medium">{formatDate(selectedCustomer.due_date)}</span>
                  </div>
                  
                  {selectedCustomer.plan && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Plano:</span>
                      <span className="font-medium">{selectedCustomer.plan.plan_name}</span>
                    </div>
                  )}

                  {selectedCustomer.server && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Server className="h-3.5 w-3.5" />
                        <span>Servidor:</span>
                      </div>
                      <span className="font-medium text-primary">{selectedCustomer.server.server_name}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>Valor:</span>
                    </div>
                    <span className="font-bold text-primary">
                      R$ {price.toFixed(2)}
                    </span>
                  </div>
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
                  
                  <Button 
                    className="w-full h-9" 
                    onClick={handleRenew}
                    disabled={registerPayment.isPending}
                  >
                    {registerPayment.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Renovar Cliente
                  </Button>

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
          {!selectedCustomer && searchPhone.length < 4 && (
            <div className="text-center py-6 text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Digite o telefone do cliente para buscar</p>
            </div>
          )}

          {/* Quick Links Section */}
          <Collapsible open={isLinksOpen} onOpenChange={setIsLinksOpen}>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors">
                {isLinksOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Links Rápidos
              </CollapsibleTrigger>
              <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
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
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="space-y-1">
                {quickMessages.map((msg) => {
                  const isSelected = selectedQuickMessage?.id === msg.id;
                  return (
                    <button
                      key={msg.id}
                      type="button"
                      className={`w-full text-left flex items-center justify-between p-2 rounded-md transition-colors group ${
                        isSelected ? 'bg-accent' : 'bg-accent/30 hover:bg-accent/50'
                      }`}
                      onClick={() => setSelectedQuickMessage(msg)}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {getIcon(msg.icon)}
                        <span className="text-sm truncate">{msg.title}</span>
                      </span>
                      <Copy
                        className={`h-3.5 w-3.5 transition-opacity text-muted-foreground ${
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      />
                    </button>
                  );
                })}
                {quickMessages.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Nenhuma mensagem configurada
                  </p>
                )}
              </div>

              {selectedQuickMessage && (
                <Card className="bg-background/40">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{selectedQuickMessage.title}</p>
                        <p className="text-xs text-muted-foreground">{selectedQuickMessage.category}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleCopyMessage(selectedQuickMessage.content)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copiar
                      </Button>
                    </div>
                    <pre className="text-xs text-foreground whitespace-pre-wrap bg-background/50 p-2 rounded max-h-40 overflow-auto select-text">
                      {selectedQuickMessage.content}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  );
}
