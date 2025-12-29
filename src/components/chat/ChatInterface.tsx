import { useState, useEffect, useRef, forwardRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, RefreshCw, Loader2, Send, Phone, User, 
  MessageCircle, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Conversation {
  _id: string;
  chatId: string;
  mongoId: string; // The actual MongoDB _id for fetching messages
  cliente: {
    nome: string;
    telefone: string;
  };
  status?: string;
  lastMessage?: string;
  updatedAt?: string;
}

interface Message {
  _id: string;
  text?: string;
  content?: { type?: string; text?: string };
  fromMe?: boolean;
  isFromMe?: boolean;
  role?: string;
  createdAt?: string;
  timestamp?: string;
}

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

  // Fetch all conversations directly from Zap Responder API
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
        
        // Map conversations to our format
        const mappedConversations: Conversation[] = convs.map((conv: any) => {
          // Try to find customer by phone
          const chatId = conv.chatId || '';
          const matchedCustomer = customers?.find(c => {
            const customerPhone = c.phone.replace(/\D/g, '');
            return chatId.includes(customerPhone) || customerPhone.includes(chatId.replace(/\D/g, ''));
          });
          
          // Get name from conversation variables or lead
          const convName = conv.variaveis?.find((v: any) => v.label === 'nome')?.value || 
                          conv.pushName || 
                          conv.lead?.nome || 
                          'Contato';
          
          return {
            _id: chatId || conv._id,
            mongoId: conv._id || conv.id || '',
            chatId: chatId,
            cliente: {
              nome: matchedCustomer?.name || convName,
              telefone: chatId,
            },
            status: conv.isFechado ? 'closed' : (conv.status || 'open'),
            lastMessage: conv.lastMessage?.content || conv.lastMessage?.text || '',
            updatedAt: conv.updatedAt,
          };
        });

        setConversations(mappedConversations);
        
        if (mappedConversations.length === 0) {
          toast({ 
            title: 'Nenhuma conversa encontrada', 
            description: 'Não há conversas no Zap Responder.',
          });
        } else {
          toast({ 
            title: 'Conversas carregadas!', 
            description: `${mappedConversations.length} conversas encontradas.`,
          });
        }
      } else if (data?.error) {
        // Fallback: try fetching by customer phones if direct list fails
        console.log('Direct list failed, falling back to customer-based search');
        await fetchConversationsFromCustomers();
      }
    } catch (error: any) {
      console.error('Error fetching conversations:', error);
      // Fallback to customer-based search
      await fetchConversationsFromCustomers();
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Fallback: Fetch conversations by searching each customer's phone
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
          foundConversations.push({
            _id: phoneWithCode,
            mongoId: mongoId,
            chatId: conv.chatId || phoneWithCode,
            cliente: {
              nome: customer.name,
              telefone: customer.phone,
            },
            status: conv.isFechado ? 'closed' : (conv.status || 'open'),
            lastMessage: conv.lastMessage?.content || conv.lastMessage?.text || conv.ultimaMensagem || '',
            updatedAt: conv.updatedAt || conv.atualizadoEm,
          });
        }
      }

      setConversations(foundConversations);
      
      if (foundConversations.length === 0) {
        toast({ 
          title: 'Nenhuma conversa encontrada', 
          description: 'Não há conversas ativas para os clientes cadastrados.',
        });
      } else {
        toast({ 
          title: 'Conversas carregadas!', 
          description: `${foundConversations.length} conversas encontradas.`,
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

  const fetchMessages = async (conversationId: string) => {
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { 
          action: 'buscar-mensagens',
          conversation_id: conversationId,
          limit: 100,
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setMessages(data.data.reverse ? data.data.reverse() : data.data);
      } else if (data?.error) {
        // Try alternative - just show empty
        setMessages([]);
      }
    } catch (error: any) {
      console.error('Error fetching messages:', error);
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
    // Use the mongoId to fetch messages
    if (conv.mongoId) {
      fetchMessages(conv.mongoId);
    } else {
      setMessages([]);
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'dd/MM HH:mm', { locale: ptBR });
    } catch {
      return '';
    }
  };

  const getMessageText = (msg: Message) => {
    return msg.text || msg.content?.text || '';
  };

  const isFromMe = (msg: Message) => {
    return msg.fromMe || msg.isFromMe || msg.role === 'assistant';
  };

  const filteredConversations = conversations.filter(conv => {
    const name = conv.cliente.nome.toLowerCase();
    const phone = conv.cliente.telefone;
    return name.includes(searchTerm.toLowerCase()) || phone.includes(searchTerm);
  });

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const isOpen = status === 'open' || status === 'aberta' || status === 'em_atendimento';
    return (
      <span className={cn(
        'px-2 py-0.5 text-xs rounded-full',
        isOpen ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
      )}>
        {isOpen ? 'Aberta' : 'Fechada'}
      </span>
    );
  };

  return (
    <div ref={ref} className="flex h-[calc(100vh-200px)] min-h-[600px] bg-card rounded-lg border border-border overflow-hidden">
      {/* Conversations List */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Conversas
            </h3>
            <Button 
              size="sm" 
              variant="ghost" 
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
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-secondary/50"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma conversa</p>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={fetchAllConversations}
                className="mt-3"
              >
                Carregar Conversas
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredConversations.map((conv) => (
                <button
                  key={conv._id}
                  onClick={() => handleSelectConversation(conv)}
                  className={cn(
                    'w-full p-3 text-left hover:bg-secondary/50 transition-colors',
                    selectedConversation?._id === conv._id && 'bg-secondary'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground truncate">
                          {conv.cliente.nome}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatTime(conv.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-sm text-muted-foreground truncate">
                          {conv.lastMessage || 'Sem mensagens'}
                        </p>
                        {getStatusBadge(conv.status)}
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
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {selectedConversation.cliente.nome}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {selectedConversation.cliente.telefone}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedConversation.status)}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedConversation(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
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
                          'max-w-[70%] rounded-lg px-4 py-2',
                          isFromMe(msg)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-foreground'
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {getMessageText(msg)}
                        </p>
                        <p className={cn(
                          'text-xs mt-1',
                          isFromMe(msg) ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        )}>
                          {formatTime(msg.createdAt || msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t border-border">
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
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
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
