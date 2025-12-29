import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, RefreshCw, Loader2, Send, Phone, User, 
  MessageCircle, Clock, Filter, X, Users, Inbox
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Conversation {
  _id: string;
  id?: string;
  chatId: string;
  cliente?: {
    nome?: string;
    telefone?: string;
    name?: string;
    phone?: string;
  };
  customer?: {
    name?: string;
    phone?: string;
  };
  status?: string;
  lastMessage?: {
    text?: string;
    content?: string;
    createdAt?: string;
  };
  updatedAt?: string;
  createdAt?: string;
  unreadCount?: number;
}

interface Message {
  _id: string;
  id?: string;
  content?: {
    type?: string;
    text?: string;
  };
  text?: string;
  role?: string;
  sender?: string;
  fromMe?: boolean;
  isFromMe?: boolean;
  createdAt?: string;
  timestamp?: string;
}

interface ChatInterfaceProps {
  departmentId?: string;
}

export default function ChatInterface({ departmentId }: ChatInterfaceProps) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const { data, error } = await supabase.functions.invoke('zap-responder', {
        body: { 
          action: 'listar-conversas',
          status: statusFilter !== 'all' ? statusFilter : undefined,
          limit: 100,
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setConversations(data.data);
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error fetching conversations:', error);
      toast({
        title: 'Erro ao carregar conversas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingConversations(false);
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
        setMessages(data.data.reverse());
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast({
        title: 'Erro ao carregar mensagens',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || !departmentId) return;

    setIsSending(true);
    try {
      const phone = selectedConversation.chatId || 
                    selectedConversation.cliente?.telefone || 
                    selectedConversation.cliente?.phone ||
                    selectedConversation.customer?.phone;

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
        setNewMessage('');
        // Add message locally for immediate feedback
        setMessages(prev => [...prev, {
          _id: Date.now().toString(),
          text: newMessage,
          fromMe: true,
          isFromMe: true,
          createdAt: new Date().toISOString(),
        }]);
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
    const convId = conv._id || conv.id;
    if (convId) {
      fetchMessages(convId);
    }
  };

  const getContactName = (conv: Conversation) => {
    return conv.cliente?.nome || conv.cliente?.name || conv.customer?.name || 'Desconhecido';
  };

  const getContactPhone = (conv: Conversation) => {
    return conv.chatId || conv.cliente?.telefone || conv.cliente?.phone || conv.customer?.phone || '';
  };

  const getLastMessageText = (conv: Conversation) => {
    return conv.lastMessage?.text || conv.lastMessage?.content || '';
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
    return msg.fromMe || msg.isFromMe || msg.role === 'assistant' || msg.sender === 'me';
  };

  const filteredConversations = conversations.filter(conv => {
    const name = getContactName(conv).toLowerCase();
    const phone = getContactPhone(conv);
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
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] bg-card rounded-lg border border-border overflow-hidden">
      {/* Conversations List */}
      <div className="w-80 border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Conversas
            </h3>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={fetchConversations}
              disabled={isLoadingConversations}
            >
              {isLoadingConversations ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-secondary/50"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-1">
            <Button 
              size="sm" 
              variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
              onClick={() => setStatusFilter('all')}
              className="flex-1 text-xs"
            >
              <Inbox className="w-3 h-3 mr-1" />
              Todas
            </Button>
            <Button 
              size="sm" 
              variant={statusFilter === 'open' ? 'secondary' : 'ghost'}
              onClick={() => setStatusFilter('open')}
              className="flex-1 text-xs"
            >
              <Users className="w-3 h-3 mr-1" />
              Abertas
            </Button>
          </div>
        </div>

        {/* Conversations */}
        <ScrollArea className="flex-1">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={fetchConversations}
                className="mt-3"
              >
                Carregar Conversas
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredConversations.map((conv) => (
                <button
                  key={conv._id || conv.id}
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
                          {getContactName(conv)}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatTime(conv.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-sm text-muted-foreground truncate">
                          {getLastMessageText(conv) || 'Sem mensagens'}
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
            {/* Chat Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {getContactName(selectedConversation)}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {getContactPhone(selectedConversation)}
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

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Nenhuma mensagem</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, idx) => (
                    <div
                      key={msg._id || msg.id || idx}
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

            {/* Message Input */}
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
                  Nenhum departamento configurado. Configure nas integrações do Zap Responder.
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
}
