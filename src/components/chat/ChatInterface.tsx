import { useState, useEffect, useRef, forwardRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, RefreshCw, Loader2, Send, Phone, User, 
  MessageCircle, X, Filter, Users, Bot, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface Conversation {
  _id: string;
  chatId: string;
  mongoId: string;
  cliente: {
    nome: string;
    telefone: string;
  };
  status?: string;
  lastMessage?: string;
  updatedAt?: string;
  isBot?: boolean;
  isGroup?: boolean;
  departmentName?: string;
}

interface Message {
  _id: string;
  text?: string;
  content?: string | { type?: string; text?: string };
  fromMe?: boolean;
  isFromMe?: boolean;
  role?: string;
  autor?: string;
  createdAt?: string;
  timestamp?: string;
  sendedAt?: string;
}

type ConversationFilter = 'all' | 'pending' | 'attending' | 'bot' | 'groups';

interface ChatInterfaceProps {
  departmentId?: string;
}

const ChatInterface = forwardRef<HTMLDivElement, ChatInterfaceProps>(({ departmentId }, ref) => {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: customers } = useQuery({
    queryKey: ['customers-for-chat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-load conversations on mount
  useEffect(() => {
    fetchAllConversations();
  }, []);

  const fetchAllConversations = async () => {
    setIsLoadingConversations(true);

    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { 
          action: 'listar-conversas',
          limit: 100,
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const convs = data.data;
        
        const mappedConversations: Conversation[] = convs.map((conv: any) => {
          const chatId = conv.chatId || '';
          const matchedCustomer = customers?.find(c => {
            const customerPhone = c.phone.replace(/\D/g, '');
            return chatId.includes(customerPhone) || customerPhone.includes(chatId.replace(/\D/g, ''));
          });
          
          const convName = conv.variaveis?.find((v: any) => v.label === 'nome')?.value || 
                          conv.pushName || 
                          conv.lead?.nome || 
                          'Contato';
          
          const lastMsgDate = conv.lastMessage?.createdAt || conv.lastMessage?.updatedAt;
          const convUpdatedAt = conv.updatedAt || lastMsgDate || conv.createdAt;
          
          // Detect if it's a group or bot conversation
          const isGroup = chatId.includes('@g.us') || conv.isGroup === true;
          const isBot = conv.status === 'bot' || conv.isBot === true || conv.atendente === 'bot';
          
          // Get status - normalize to pending/attending/closed/bot
          let status = 'pending';
          if (conv.isFechado || conv.status === 'closed' || conv.status === 'fechada') {
            status = 'closed';
          } else if (isBot) {
            status = 'bot';
          } else if (conv.atendente || conv.attendantId || conv.status === 'em_atendimento' || conv.status === 'attending') {
            status = 'attending';
          }
          
          return {
            _id: `${chatId}_${conv._id}`,
            mongoId: conv._id || conv.id || '',
            chatId: chatId,
            cliente: {
              nome: matchedCustomer?.name || convName,
              telefone: chatId,
            },
            status,
            lastMessage: conv.lastMessage?.content || conv.lastMessage?.text || '',
            updatedAt: convUpdatedAt,
            isBot,
            isGroup,
            departmentName: conv.departamento?.nome || conv.departmentName || '',
          };
        });

        mappedConversations.sort((a, b) => {
          const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return dateB - dateA;
        });

        setConversations(mappedConversations);
        
        if (mappedConversations.length === 0) {
          toast({ 
            title: 'Nenhuma conversa encontrada', 
            description: 'Não há conversas no Zap Responder.',
          });
        }
      } else if (data?.error) {
        console.log('Direct list failed, falling back to customer-based search');
        await fetchConversationsFromCustomers();
      }
    } catch (error: any) {
      console.error('Error fetching conversations:', error);
      await fetchConversationsFromCustomers();
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const fetchConversationsFromCustomers = async () => {
    if (!customers || customers.length === 0) {
      toast({ 
        title: 'Nenhum cliente cadastrado', 
        description: 'Cadastre clientes para visualizar conversas.',
        variant: 'destructive' 
      });
      return;
    }

    const foundConversations: Conversation[] = [];

    try {
      for (const customer of customers.slice(0, 30)) {
        const formattedPhone = customer.phone.replace(/\D/g, '');
        const phoneWithCode = formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`;
        
        const { data, error } = await supabase.functions.invoke('zap-responder', {
          body: { 
            action: 'buscar-conversa-telefone',
            phone: phoneWithCode,
            include_closed: true,
          },
        });

        if (!error && data?.success && data?.data) {
          const conv = data.data.conversation || data.data;
          const mongoId = conv._id || conv.id || '';
          const lastMsgDate = conv.lastMessage?.createdAt || conv.lastMessage?.updatedAt;
          const convUpdatedAt = conv.updatedAt || lastMsgDate || conv.createdAt || conv.atualizadoEm;
          
          let status = 'pending';
          if (conv.isFechado) status = 'closed';
          else if (conv.atendente) status = 'attending';
          
          foundConversations.push({
            _id: `${phoneWithCode}_${mongoId}`,
            mongoId: mongoId,
            chatId: conv.chatId || phoneWithCode,
            cliente: {
              nome: customer.name,
              telefone: customer.phone,
            },
            status,
            lastMessage: conv.lastMessage?.content || conv.lastMessage?.text || conv.ultimaMensagem || '',
            updatedAt: convUpdatedAt,
          });
        }
      }
      
      foundConversations.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });

      setConversations(foundConversations);
      
      if (foundConversations.length === 0) {
        toast({ 
          title: 'Nenhuma conversa encontrada', 
          description: 'Não há conversas ativas para os clientes cadastrados.',
        });
      }
    } catch (error: any) {
      console.error('Error fetching conversations from customers:', error);
      toast({
        title: 'Erro ao buscar conversas',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchMessages = async (conv: Pick<Conversation, 'mongoId' | 'chatId'>) => {
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: {
          action: 'buscar-mensagens',
          conversation_id: conv.mongoId,
          chat_id: conv.chatId,
          limit: 100,
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setMessages(data.data.reverse ? data.data.reverse() : data.data);
        return;
      }

      if (data?.error) {
        toast({
          title: 'Erro ao carregar mensagens',
          description: data.error,
          variant: 'destructive',
        });
      }

      setMessages([]);
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast({
        title: 'Erro ao carregar mensagens',
        description: error?.message || 'Falha ao buscar mensagens.',
        variant: 'destructive',
      });
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !departmentId) return;

    setIsSending(true);
    try {
      const phone = selectedConversation.chatId || selectedConversation.cliente?.telefone;

      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { 
          action: 'enviar-mensagem',
          department_id: departmentId,
          number: phone,
          text: newMessage,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setMessages(prev => [...prev, {
          _id: Date.now().toString(),
          text: newMessage,
          fromMe: true,
          createdAt: new Date().toISOString(),
        }]);
        setNewMessage('');
        toast({ title: 'Mensagem enviada!' });
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    if (conv.mongoId || conv.chatId) {
      fetchMessages({ mongoId: conv.mongoId, chatId: conv.chatId });
    } else {
      setMessages([]);
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'dd-MM HH:mm', { locale: ptBR });
    } catch {
      return '';
    }
  };

  const getMessageText = (msg: Message) => {
    if (typeof msg.content === 'string') return msg.content;
    return msg.text || msg.content?.text || '';
  };

  const isFromMe = (msg: Message) => {
    if (msg.autor) return msg.autor === 'atendente' || msg.autor === 'agent' || msg.autor === 'admin';
    return msg.fromMe || msg.isFromMe || msg.role === 'assistant';
  };

  // Filter conversations based on selected filter
  const filteredConversations = conversations.filter(conv => {
    // First apply search filter
    const name = conv.cliente.nome.toLowerCase();
    const phone = conv.cliente.telefone;
    const matchesSearch = name.includes(searchTerm.toLowerCase()) || phone.includes(searchTerm);
    
    if (!matchesSearch) return false;
    
    // Then apply status filter
    switch (filter) {
      case 'pending':
        return conv.status === 'pending';
      case 'attending':
        return conv.status === 'attending';
      case 'bot':
        return conv.isBot === true || conv.status === 'bot';
      case 'groups':
        return conv.isGroup === true;
      case 'all':
      default:
        return true;
    }
  });

  // Count conversations by filter
  const counts = {
    all: conversations.length,
    pending: conversations.filter(c => c.status === 'pending').length,
    attending: conversations.filter(c => c.status === 'attending').length,
    bot: conversations.filter(c => c.isBot === true || c.status === 'bot').length,
    groups: conversations.filter(c => c.isGroup === true).length,
  };

  const getStatusBadge = (conv: Conversation) => {
    if (conv.status === 'attending') {
      return (
        <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px] px-1.5 py-0">
          Atendimento
        </Badge>
      );
    }
    if (conv.status === 'bot') {
      return (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] px-1.5 py-0">
          Robô
        </Badge>
      );
    }
    if (conv.status === 'pending') {
      return (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px] px-1.5 py-0">
          Pendente
        </Badge>
      );
    }
    return null;
  };

  const filterButtons: { key: ConversationFilter; label: string; icon?: React.ReactNode }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'attending', label: 'Atendimento' },
    { key: 'groups', label: 'Grupos' },
    { key: 'bot', label: 'Robô' },
  ];

  return (
    <div ref={ref} className="flex h-[calc(100vh-200px)] min-h-[600px] bg-card rounded-lg border border-border overflow-hidden">
      {/* Conversations Sidebar */}
      <div className="w-80 border-r border-border flex flex-col bg-background">
        {/* Header */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              Conversas
            </h3>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-8 w-8"
              onClick={fetchAllConversations}
              disabled={isLoadingConversations}
            >
              {isLoadingConversations ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
          
          {/* Filter Tabs */}
          <div className="flex flex-col gap-1 text-sm">
            {filterButtons.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'flex items-center justify-between px-2 py-1.5 rounded transition-colors text-left',
                  filter === key 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'text-muted-foreground hover:bg-secondary/50'
                )}
              >
                <span>{label}</span>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  filter === key ? 'bg-primary/20' : 'bg-secondary'
                )}>
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-secondary/50 h-9"
            />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredConversations.map((conv) => (
                <button
                  key={conv._id}
                  onClick={() => handleSelectConversation(conv)}
                  className={cn(
                    'w-full p-3 text-left hover:bg-secondary/50 transition-colors',
                    selectedConversation?._id === conv._id && 'bg-secondary border-l-2 border-l-primary'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      {conv.isGroup ? (
                        <Users className="w-5 h-5 text-muted-foreground" />
                      ) : conv.isBot ? (
                        <Bot className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <User className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground truncate text-sm">
                          {conv.cliente.nome}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {formatTime(conv.updatedAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage || 'Sem mensagens'}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {conv.cliente.telefone.replace(/(\d{2})(\d{2})(\d{5}).*/, '+$1 $2 $3...')}
                        </span>
                        {getStatusBadge(conv)}
                      </div>
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
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-3 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  {selectedConversation.isGroup ? (
                    <Users className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <User className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">
                    {selectedConversation.cliente.nome}
                  </h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {selectedConversation.cliente.telefone}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedConversation)}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setSelectedConversation(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4 bg-secondary/20">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Nenhuma mensagem carregada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, idx) => (
                    <div
                      key={msg._id || idx}
                      className={cn(
                        'flex',
                        isFromMe(msg) ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[70%] rounded-lg px-3 py-2 shadow-sm',
                          isFromMe(msg)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card text-foreground border border-border'
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {getMessageText(msg)}
                        </p>
                        <p className={cn(
                          'text-[10px] mt-1 text-right',
                          isFromMe(msg) ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        )}>
                          {formatTime(msg.createdAt || msg.timestamp || msg.sendedAt)}
                        </p>
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
                      sendMessage();
                    }
                  }}
                  className="bg-secondary/50"
                  disabled={!departmentId}
                />
                <Button 
                  onClick={sendMessage} 
                  disabled={isSending || !newMessage.trim() || !departmentId}
                  size="icon"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {!departmentId && (
                <p className="text-xs text-destructive mt-2">
                  Nenhum departamento configurado.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground bg-secondary/10">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <h3 className="font-medium text-foreground mb-1">Selecione uma conversa</h3>
              <p className="text-sm">Escolha uma conversa à esquerda para ver as mensagens</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

ChatInterface.displayName = 'ChatInterface';

export default ChatInterface;
