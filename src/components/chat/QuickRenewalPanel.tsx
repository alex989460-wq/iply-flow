import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolvePanel } from '@/lib/panel-detect';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  Plus, Pencil, Trash2, Loader2, Package, Search, CalendarDays,
  Link2, CreditCard, TrendingUp, Layers, Zap, X, ListPlus, UserPlus, Key, Monitor, RefreshCw, User, Calendar,
  Phone, Server, Copy
} from 'lucide-react';
import SendPlaylistDialog from '@/components/playlist/SendPlaylistDialog';
import CreateClouddyUserDialog from '@/components/activation/CreateClouddyUserDialog';

import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import QuickCustomerForm from './QuickCustomerForm';
import { PhoneFlagBadge } from '@/components/ui/phone-flag-badge';
import { cn } from '@/lib/utils';

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

interface QuickRenewalPanelProps {
  isMobile?: boolean;
  onClose?: () => void;
  initialPhone?: string | null;
}

export default function QuickRenewalPanel({ isMobile = false, onClose, initialPhone }: QuickRenewalPanelProps) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const lastInitialPhoneRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialPhone) return;
    if (lastInitialPhoneRef.current === initialPhone) return;
    lastInitialPhoneRef.current = initialPhone;
    setSearchTerm(initialPhone.replace(/\D/g, ''));
  }, [initialPhone]);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSendPlaylistOpen, setIsSendPlaylistOpen] = useState(false);
  const [isClouddyCreateOpen, setIsClouddyCreateOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedScreens, setSelectedScreens] = useState<number>(1);
  const [editedUsername, setEditedUsername] = useState<string>('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [editedServerId, setEditedServerId] = useState<string | null>(null);
  const [editedStatus, setEditedStatus] = useState<string>('ativa');
  const [editedName, setEditedName] = useState<string>('');
  const [editedPhone, setEditedPhone] = useState<string>('');
  const [editedExtraPhone, setEditedExtraPhone] = useState<string>('');
  const [editedDueDate, setEditedDueDate] = useState<string>('');
  
  const queryClient = useQueryClient();

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['customer-search', searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 3) return [];
      const { data, error } = await supabase.from('customers').select('*, plans(*), servers(*)').or(`phone.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%`).limit(10);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: searchTerm.length >= 3
  });

  const { data: allPlans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*');
      return data || [];
    }
  });

  const { data: allServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('servers').select('*');
      return data || [];
    }
  });

  const handleSelectCustomer = (c: any) => {
    setSelectedCustomer(c);
    setEditedName(c.name || '');
    setEditedPhone(c.phone || '');
    setEditedExtraPhone(c.extra_phone || '');
    setEditedStatus(c.status || 'ativa');
    setEditedDueDate(c.due_date || '');
    setEditedUsername(c.username || '');
    setSelectedScreens(c.screens || 1);
    setEditedServerId(c.server_id || null);
    setSelectedPlanId(c.plan_id || null);
  };

  const isCustomerOverdue = (date: string) => date ? new Date(date) < new Date() : false;
  const formatDate = (date: string) => date ? format(new Date(date), 'dd/MM/yyyy') : '—';
  
  const getStatusBadge = (status: string, dueDate: string) => {
    const isOverdue = isCustomerOverdue(dueDate);
    if (status === 'inativa' || isOverdue) return <Badge variant="destructive">Vencido</Badge>;
    return <Badge variant="default" className="bg-emerald-500 text-white">Ativa</Badge>;
  };

  const handleCopyMessage = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const saveCustomerData = useMutation({
     mutationFn: async () => {
       if (!selectedCustomer) return;
       const { error } = await supabase.from('customers').update({
         name: editedName,
         phone: editedPhone,
         extra_phone: editedExtraPhone,
         status: editedStatus as any,
         due_date: editedDueDate,
         username: editedUsername,
         screens: selectedScreens,
         server_id: editedServerId
       }).eq('id', selectedCustomer.id);
       if (error) throw error;
     },
     onSuccess: () => {
       toast.success('Cliente atualizado!');
       queryClient.invalidateQueries({ queryKey: ['customer-search'] });
     },
     onError: (err: any) => {
       toast.error('Erro ao atualizar: ' + err.message);
     }
  });

  return (
    <div className="flex flex-col h-full bg-background/30 backdrop-blur-xl border-l border-border/50 transition-all duration-300">
      {/* Modern Compact Search & Actions */}
      {!selectedCustomer && (
        <div className="p-4 space-y-4 border-b border-border/50 bg-background/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
              </div>
              <Input
                placeholder="Telefone ou usuário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11 bg-background/50 border-border/50 focus:border-primary/50 transition-all rounded-2xl text-sm shadow-sm"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-2xl bg-primary/5 border-primary/20 hover:bg-primary/10 transition-all active:scale-95"
              onClick={() => setShowNewCustomerForm(true)}
            >
              <UserPlus className="h-5 w-5 text-primary" />
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {showNewCustomerForm && !selectedCustomer && (
            <QuickCustomerForm
              initialPhone={searchTerm.replace(/\D/g, '')}
              onSuccess={() => setShowNewCustomerForm(false)}
              onCancel={() => setShowNewCustomerForm(false)}
            />
          )}

          {!selectedCustomer && !showNewCustomerForm && searchResults && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Resultados da busca</p>
              </div>
              {searchResults.map((c: any) => (
                <Card 
                  key={c.id} 
                  className="cursor-pointer bg-background/40 hover:bg-primary/5 transition-all border-border/40 group overflow-hidden active:scale-[0.98] rounded-2xl shadow-sm hover:shadow-md hover:border-primary/30"
                  onClick={() => handleSelectCustomer(c)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                           <p className="text-sm font-black truncate group-hover:text-primary transition-colors tracking-tight">{c.name}</p>
                           {getStatusBadge(c.status, c.due_date)}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/80 font-bold">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 opacity-60" />
                            <span>{c.phone}</span>
                          </div>
                          {c.username && (
                            <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/10 shadow-sm">
                              <User className="h-2.5 w-2.5" />
                              <span className="font-mono text-[9px] uppercase">{c.username}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-1.5">
                         <div className={cn(
                           "flex items-center justify-end gap-1.5 text-[10px] font-black uppercase tracking-tighter",
                           isCustomerOverdue(c.due_date) ? "text-destructive" : "text-muted-foreground"
                         )}>
                            <Calendar className="h-3 w-3" />
                            {formatDate(c.due_date)}
                         </div>
                         {c.servers?.server_name && (
                           <div className="inline-flex items-center gap-1 bg-background/60 px-2 py-0.5 rounded-lg border border-border/50 text-[9px] font-black uppercase tracking-widest text-primary/80">
                             <Server className="h-2.5 w-2.5" />
                             {c.servers.server_name}
                           </div>
                         )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {searchResults.length === 0 && searchTerm.length >= 3 && !isSearching && (
                <div className="text-center py-8 text-muted-foreground text-sm">Nenhum cliente encontrado</div>
              )}
            </div>
          )}

          {selectedCustomer && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Card className="border-primary/20 bg-primary/5 shadow-2xl backdrop-blur-md rounded-2xl overflow-hidden">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="h-7 text-base font-bold bg-transparent border-none p-0 focus-visible:ring-0"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{editedPhone}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSelectedCustomer(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="p-4 pt-4 space-y-6">
                  {/* Status & Details Section */}
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Status</Label>
                        <Select value={editedStatus} onValueChange={setEditedStatus}>
                          <SelectTrigger className="h-9 bg-background/50 border-border/50 rounded-xl text-xs font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ativa">Ativa</SelectItem>
                            <SelectItem value="inativa">Inativa</SelectItem>
                            <SelectItem value="suspensa">Suspensa</SelectItem>
                            <SelectItem value="bloqueado">Bloqueado</SelectItem>
                          </SelectContent>
                        </Select>
                     </div>
                     <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Servidor</Label>
                        <Select value={editedServerId || ''} onValueChange={setEditedServerId}>
                          <SelectTrigger className="h-9 bg-background/50 border-border/50 rounded-xl text-xs font-bold text-primary">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {allServers.map((s: any) => (
                              <SelectItem key={s.id} value={s.id}>{s.server_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                     </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Usuário</Label>
                          {editedUsername && (
                             <Copy 
                               className="h-3 w-3 text-muted-foreground/40 hover:text-primary cursor-pointer transition-colors" 
                               onClick={() => {
                                 navigator.clipboard.writeText(editedUsername);
                                 toast.success('Usuário copiado!');
                               }}
                             />
                          )}
                        </div>
                        <div className="relative group">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                          <Input
                            value={editedUsername}
                            onChange={(e) => setEditedUsername(e.target.value)}
                            className="pl-9 bg-background/50 border-border/50 focus:border-primary/50 transition-all h-10 text-sm rounded-xl font-mono shadow-sm"
                            placeholder="user1, user2"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">Senha</Label>
                          {selectedCustomer.password && (
                             <Copy 
                               className="h-3 w-3 text-muted-foreground/40 hover:text-primary cursor-pointer transition-colors" 
                               onClick={() => {
                                 navigator.clipboard.writeText(selectedCustomer.password!);
                                 toast.success('Senha copiada!');
                               }}
                             />
                          )}
                        </div>
                        <div className="relative group">
                          <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                          <div className="pl-9 pr-3 bg-background/20 border border-border/50 h-10 text-sm rounded-xl flex items-center justify-between group/pw shadow-sm">
                            <span className="font-mono text-xs truncate font-bold text-foreground/80">
                              {selectedCustomer.password || '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 px-1">Telas</Label>
                        <Select 
                          value={selectedScreens.toString()} 
                          onValueChange={(v) => setSelectedScreens(parseInt(v))}
                        >
                          <SelectTrigger className="bg-background/50 border-border/50 h-10 text-sm rounded-xl shadow-sm hover:border-primary/30 transition-colors">
                            <div className="flex items-center gap-2">
                              <Monitor className="h-4 w-4 text-primary/60" />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-border/50 backdrop-blur-xl">
                            {[1, 2, 3, 4, 5].map((num) => (
                              <SelectItem key={num} value={num.toString()} className="rounded-lg">
                                {num} {num === 1 ? 'tela' : 'telas'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 px-1">Vencimento</Label>
                        <div className="relative group">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60 group-focus-within:text-primary transition-colors" />
                          <Input
                            type="date"
                            value={editedDueDate}
                            onChange={(e) => setEditedDueDate(e.target.value)}
                            className={cn(
                              "pl-9 bg-background/50 border-border/50 focus:border-primary/50 transition-all h-10 text-sm rounded-xl shadow-sm",
                              isCustomerOverdue(editedDueDate) ? 'text-destructive font-black' : 'font-bold'
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <Button 
                      className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-10 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                      onClick={() => saveCustomerData.mutate()}
                      disabled={saveCustomerData.isPending}
                    >
                      {saveCustomerData.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Atualizar Cliente
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions (Playlist, Clouddy, etc) */}
              <div className="grid grid-cols-2 gap-2">
                 <Button variant="outline" className="h-10 border-border/50 rounded-xl gap-2 font-semibold text-xs active:scale-95" onClick={() => setIsSendPlaylistOpen(true)}>
                   <ListPlus className="h-4 w-4" />
                   Enviar Lista
                 </Button>
                 <Button variant="outline" className="h-10 border-border/50 rounded-xl gap-2 font-semibold text-xs active:scale-95" onClick={() => setIsClouddyCreateOpen(true)}>
                   <UserPlus className="h-4 w-4" />
                   Criar Clouddy
                 </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <SendPlaylistDialog 
        open={isSendPlaylistOpen} 
        onOpenChange={setIsSendPlaylistOpen}
        defaultEmail={selectedCustomer?.phone || ''}
        defaultUsername={selectedCustomer?.username || ''}
        defaultPassword={selectedCustomer?.password || ''}
        defaultHost={selectedCustomer?.server?.host || ''}
      />
      <CreateClouddyUserDialog
        open={isClouddyCreateOpen}
        onOpenChange={setIsClouddyCreateOpen}
        defaultEmail={selectedCustomer?.phone || ''}
      />
    </>
  );
}
    </div>
  );
}
