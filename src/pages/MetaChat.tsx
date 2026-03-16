import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  Send, Loader2, Phone, User, MessageCircle, Search, RefreshCw,
  FileText, CheckCircle2, AlertCircle, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ChatMessage {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  type?: 'text' | 'template';
  templateName?: string;
}

interface ChatContact {
  id: string;
  phone: string;
  name: string;
  customerId?: string;
  lastMessage?: string;
  lastTimestamp?: string;
}

export default function MetaChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [phoneInfo, setPhoneInfo] = useState<{
    phone_number_id?: string;
    display_phone?: string;
    waba_id?: string;
  }>({});
  const [loadingInfo, setLoadingInfo] = useState(true);

  // Contacts & messages
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  // Template sending
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [sendingTemplate, setSendingTemplate] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load customers as contacts
  const { data: customers } = useQuery({
    queryKey: ['customers-meta-chat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('status', 'ativa')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (customers) {
      const dedupedByPhone = new Map<string, ChatContact>();

      for (const c of customers) {
        const normalizedPhone = c.phone.replace(/\D/g, '');
        if (!dedupedByPhone.has(normalizedPhone)) {
          dedupedByPhone.set(normalizedPhone, {
            id: c.id,
            phone: c.phone,
            name: c.name,
            customerId: c.id,
          });
        }
      }

      setContacts(Array.from(dedupedByPhone.values()));
    }
  }, [customers]);

  useEffect(() => {
    fetchPhoneInfo();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchPhoneInfo = async () => {
    setLoadingInfo(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-chat', {
        body: { action: 'get-info' },
      });

      if (error) throw error;
      if (data?.success) {
        setPhoneInfo(data);
      }
    } catch (err: any) {
      console.error('Error fetching phone info:', err);
    } finally {
      setLoadingInfo(false);
    }
  };

  const sendTextMessage = async () => {
    if (!selectedContact) {
      toast({
        title: 'Selecione um contato',
        description: 'Escolha um contato na lista antes de enviar.',
        variant: 'destructive',
      });
      return;
    }

    if (!newMessage.trim()) return;

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-chat', {
        body: {
          action: 'send-message',
          to: selectedContact.phone,
          text: newMessage,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const msg: ChatMessage = {
          id: data.message_id || Date.now().toString(),
          text: newMessage,
          fromMe: true,
          timestamp: new Date().toISOString(),
          status: 'sent',
          type: 'text',
        };
        setMessages(prev => [...prev, msg]);
        setNewMessage('');

        // Update last message on contact
        setContacts(prev => prev.map(c =>
          c.phone === selectedContact.phone
            ? { ...c, lastMessage: newMessage, lastTimestamp: new Date().toISOString() }
            : c
        ));

        toast({ title: 'Mensagem enviada!' });
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (err: any) {
      console.error('Send error:', err);
      toast({
        title: 'Erro ao enviar',
        description: err.message || 'Falha ao enviar mensagem',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const sendTemplateMessage = async () => {
    if (!templateName.trim() || !selectedContact) return;

    setSendingTemplate(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-chat', {
        body: {
          action: 'send-template',
          to: selectedContact.phone,
          template_name: templateName,
        },
      });

      if (error) throw error;

      if (data?.success) {
        const msg: ChatMessage = {
          id: data.message_id || Date.now().toString(),
          text: `[Template: ${templateName}]`,
          fromMe: true,
          timestamp: new Date().toISOString(),
          status: 'sent',
          type: 'template',
          templateName,
        };
        setMessages(prev => [...prev, msg]);
        setTemplateName('');
        setShowTemplateModal(false);
        toast({ title: 'Template enviado!' });
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (err: any) {
      console.error('Send template error:', err);
      toast({
        title: 'Erro ao enviar template',
        description: err.message || 'Falha ao enviar template',
        variant: 'destructive',
      });
    } finally {
      setSendingTemplate(false);
    }
  };

  const addNewContact = () => {
    if (!newContactPhone.trim()) return;
    const phone = newContactPhone.replace(/\D/g, '');
    if (phone.length < 10) {
      toast({ title: 'Número inválido', variant: 'destructive' });
      return;
    }

    const existing = contacts.find(c => c.phone.replace(/\D/g, '') === phone);
    if (existing) {
      setSelectedContact(existing);
      setNewContactPhone('');
      return;
    }

    const newContact: ChatContact = {
      id: `manual-${phone}`,
      phone,
      name: `+${phone}`,
    };
    setContacts(prev => [newContact, ...prev]);
    setSelectedContact(newContact);
    setNewContactPhone('');
  };

  const handleSelectContact = (contact: ChatContact) => {
    setSelectedContact(contact);
    // Clear messages for new contact (no message history from Meta Cloud API without webhooks)
    setMessages([]);
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'HH:mm', { locale: ptBR });
    } catch {
      return '';
    }
  };

  const filteredContacts = contacts.filter(c => {
    const search = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(search) || c.phone.includes(search);
  });

  const isConnected = !!phoneInfo.phone_number_id;

  return (
    <DashboardLayout noPadding>
      <div className="flex flex-col md:flex-row h-[calc(100vh-56px)] animate-fade-in">
        {/* Contacts Sidebar */}
        <div className="w-full md:w-80 border-r border-border flex flex-col bg-background">
          {/* Header */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Chat Oficial
              </h3>
              {isConnected ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-[10px]">
                  {phoneInfo.display_phone || 'Conectado'}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                  Desconectado
                </Badge>
              )}
            </div>

            {/* Add new contact */}
            <div className="flex gap-1 mb-2">
              <Input
                placeholder="Novo número (ex: 5541999...)"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                className="h-8 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && addNewContact()}
              />
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={addNewContact}>
                <Phone className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar contato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8 text-xs bg-secondary/50"
              />
            </div>
          </div>

          {/* Contacts List */}
          <ScrollArea className="flex-1">
            {filteredContacts.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum contato</p>
                <p className="text-xs mt-1">Adicione um número ou cadastre clientes</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleSelectContact(contact)}
                    className={cn(
                      'w-full p-3 text-left hover:bg-secondary/50 transition-colors',
                      selectedContact?.id === contact.id && 'bg-secondary border-l-2 border-l-primary'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate text-sm">{contact.name}</p>
                        <p className="text-[10px] text-muted-foreground">{contact.phone}</p>
                        {contact.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{contact.lastMessage}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-background">
          {!isConnected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center max-w-sm">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive/50" />
                <h3 className="font-medium text-foreground mb-1">WhatsApp não conectado</h3>
                <p className="text-sm">
                  Vá em Configurações &gt; WhatsApp Oficial para conectar e selecionar um número.
                </p>
              </div>
            </div>
          ) : selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="p-3 border-b border-border flex items-center justify-between bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{selectedContact.name}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {selectedContact.phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowTemplateModal(true)}
                    className="h-8 text-xs"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1" />
                    Template
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setSelectedContact(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4 bg-secondary/20">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Envie uma mensagem para iniciar</p>
                      <p className="text-xs mt-1 text-muted-foreground/70">
                        Fora da janela de 24h use um Template aprovado
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn('flex', msg.fromMe ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[70%] rounded-lg px-3 py-2 shadow-sm',
                            msg.fromMe
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-card text-foreground border border-border'
                          )}
                        >
                          {msg.type === 'template' && (
                            <div className="flex items-center gap-1 mb-1">
                              <FileText className="w-3 h-3" />
                              <span className="text-[10px] font-medium opacity-70">Template</span>
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words text-sm">{msg.text}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span
                              className={cn(
                                'text-[10px]',
                                msg.fromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
                              )}
                            >
                              {formatTime(msg.timestamp)}
                            </span>
                            {msg.fromMe && msg.status === 'sent' && (
                              <CheckCircle2 className="w-3 h-3 opacity-60" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Message Input */}
              <div className="p-3 border-t border-border bg-card">
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite sua mensagem..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendTextMessage();
                      }
                    }}
                    className="bg-secondary/50"
                  />
                  <Button
                    onClick={sendTextMessage}
                    disabled={sending || !newMessage.trim()}
                    size="icon"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Template Modal */}
              {showTemplateModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-foreground">Enviar Template</h3>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setShowTemplateModal(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Para enviar mensagens fora da janela de 24h, use um template aprovado pela Meta.
                    </p>
                    <div className="space-y-3">
                      <Input
                        placeholder="Nome do template (ex: vence_amanha)"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowTemplateModal(false)}>
                          Cancelar
                        </Button>
                        <Button
                          onClick={sendTemplateMessage}
                          disabled={sendingTemplate || !templateName.trim()}
                        >
                          {sendingTemplate ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4 mr-2" />
                          )}
                          Enviar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground bg-secondary/10">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <h3 className="font-medium text-foreground mb-1">Selecione um contato</h3>
                <p className="text-sm">Escolha um contato ou adicione um número para conversar</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Enviando via: {phoneInfo.display_phone || 'N/A'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
