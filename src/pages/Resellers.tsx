import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, isPast, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Users, RefreshCw, Search, Calendar, Ban, CheckCircle, Clock, Pencil, Eye, EyeOff, UserPlus, Coins, Plus, Smartphone, Trash2, Network, Users2, BadgeCheck } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Navigate } from "react-router-dom";
import { z } from "zod";
import { cn } from "@/lib/utils";
import TrialDaysCard from "@/components/settings/TrialDaysCard";


interface ResellerAccess {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  access_expires_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  credits: number;
  parent_reseller_id: string | null;
  max_evolution_instances?: number | null;
  max_official_channels?: number | null;
}


const editSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres").max(100),
  email: z.string().email("Email inválido").max(255),
  access_expires_at: z.string().min(1, "Data de vencimento é obrigatória"),
  newPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").optional().or(z.literal("")),
});

const createSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres").max(100),
  email: z.string().email("Email inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  access_days: z.number().min(1, "Mínimo de 1 dia"),
});

export default function Resellers() {
  const { isAdmin, user } = useAuth();
  const currentUserId = user?.id ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReseller, setSelectedReseller] = useState<ResellerAccess | null>(null);
  const [renewDays, setRenewDays] = useState("30");
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    access_expires_at: "",
    newPassword: "",
  });
  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    password: "",
    access_days: "0", // Will be set by useEffect
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [isAddCreditsDialogOpen, setIsAddCreditsDialogOpen] = useState(false);
  const [creditsToAdd, setCreditsToAdd] = useState("10");
  const [resellerToDelete, setResellerToDelete] = useState<ResellerAccess | null>(null);
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'expirando' | 'inativos'>('todos');

  
  const { data: resellers, isLoading } = useQuery({
    queryKey: ['reseller-access'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_access')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ResellerAccess[];
    },
  });

  const { data: myAccess } = useQuery({
    queryKey: ['my-reseller-access'],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from('reseller_access')
        .select('credits')
        .eq('user_id', u.user.id)
        .maybeSingle();
      return data;
    },
    enabled: !isAdmin,
  });

  const { data: customerCounts } = useQuery({
    queryKey: ['reseller-customer-counts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_reseller_customer_counts');
      if (error) throw error;
      return (data || []) as Array<{ owner_id: string; total_customers: number; active_customers: number }>;
    },
  });

  const { data: platformSettings } = useQuery({
    queryKey: ['platform-settings-global'],
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('trial_days')
        .is('user_id', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    setCreateForm(prev => ({
      ...prev,
      access_days: String(platformSettings?.trial_days || 7)
    }));
  }, [platformSettings]);

  const renewMutation = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      if (isAdmin) {
        const newExpiration = addDays(new Date(), days);
        const { error } = await supabase
          .from('reseller_access')
          .update({
            access_expires_at: newExpiration.toISOString(),
            is_active: true,
          })
          .eq('id', id);
        if (error) throw error;
      } else {
        const creditsNeeded = Math.max(1, Math.ceil(days / 30));
        const { data, error } = await supabase.functions.invoke('renew-sub-reseller', {
          body: { sub_reseller_id: id, credits_to_use: creditsNeeded },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Erro ao renovar');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
      queryClient.invalidateQueries({ queryKey: ['my-reseller-access'] });
      toast({
        title: "Acesso renovado",
        description: `Acesso renovado por ${renewDays} dias com sucesso!`,
      });
      setIsRenewDialogOpen(false);
      setSelectedReseller(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao renovar",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  const editMutation = useMutation({
    mutationFn: async (data: { 
      id: string; 
      user_id: string;
      full_name: string; 
      email: string; 
      access_expires_at: string;
      newPassword?: string;
    }) => {
      // Update reseller_access table
      const { error: accessError } = await supabase
        .from('reseller_access')
        .update({ 
          full_name: data.full_name,
          email: data.email,
          access_expires_at: new Date(data.access_expires_at).toISOString(),
        })
        .eq('id', data.id);
      
      if (accessError) throw accessError;

      // Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: data.full_name })
        .eq('user_id', data.user_id);
      
      if (profileError) throw profileError;

      // If password is provided, update it via edge function
      if (data.newPassword && data.newPassword.length >= 6) {
        const { data: result, error: fnError } = await supabase.functions.invoke('update-user-password', {
          body: { 
            targetUserId: data.user_id, 
            newPassword: data.newPassword 
          }
        });
        
        if (fnError) throw fnError;
        if (!result?.success) throw new Error(result?.error || 'Erro ao atualizar senha');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
      toast({
        title: "Revendedor atualizado",
        description: "Dados do revendedor atualizados com sucesso!",
      });
      setIsEditDialogOpen(false);
      setSelectedReseller(null);
      setEditForm({ full_name: "", email: "", access_expires_at: "", newPassword: "" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('reseller_access')
        .update({ is_active: !isActive })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
      toast({
        title: variables.isActive ? "Acesso desativado" : "Acesso ativado",
        description: `Status do revendedor atualizado com sucesso!`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { 
      full_name: string; 
      email: string; 
      password: string;
      access_days: number;
    }) => {
      const fnName = isAdmin ? 'create-reseller' : 'create-sub-reseller';
      const body = isAdmin
        ? { email: data.email, password: data.password, full_name: data.full_name, access_days: data.access_days }
        : { email: data.email, password: data.password, full_name: data.full_name, credits_to_use: Math.max(1, Math.ceil(data.access_days / 30)) };
      const { data: result, error: fnError } = await supabase.functions.invoke(fnName, { body });
      if (fnError) throw fnError;
      if (!result?.success) throw new Error(result?.error || 'Erro ao criar revendedor');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
      queryClient.invalidateQueries({ queryKey: ['my-reseller-access'] });
      toast({
        title: "Revendedor cadastrado",
        description: isAdmin ? "Novo revendedor criado com sucesso!" : "Sub-revendedor criado (créditos debitados).",
      });
      setIsCreateDialogOpen(false);
      setCreateForm({ full_name: "", email: "", password: "", access_days: String(platformSettings?.trial_days || 7) });
      setCreateErrors({});
    },
    onError: (error) => {
      toast({
        title: "Erro ao cadastrar",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  const addCreditsMutation = useMutation({
    mutationFn: async ({ id, credits }: { id: string; credits: number }) => {
      if (isAdmin) {
        const { data: current, error: fetchError } = await supabase
          .from('reseller_access')
          .select('credits')
          .eq('id', id)
          .single();
        if (fetchError) throw fetchError;
        const { error } = await supabase
          .from('reseller_access')
          .update({ credits: (current?.credits || 0) + credits })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.functions.invoke('transfer-credits', {
          body: { sub_reseller_id: id, credits },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Erro ao transferir créditos');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
      queryClient.invalidateQueries({ queryKey: ['my-reseller-access'] });
      toast({
        title: "Créditos enviados",
        description: `${creditsToAdd} créditos adicionados com sucesso!`,
      });
      setIsAddCreditsDialogOpen(false);
      setSelectedReseller(null);
      setCreditsToAdd("10");
    },
    onError: (error) => {
      toast({
        title: "Erro ao adicionar créditos",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  const deleteMutation = useMutation({
    mutationFn: async (user_id: string) => {
      const { data, error } = await supabase.functions.invoke('delete-reseller', { body: { user_id } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao excluir');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
      toast({ title: 'Revendedor excluído', description: 'Conta removida com sucesso.' });
      setResellerToDelete(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    },
  });




  const handleAddCredits = (reseller: ResellerAccess) => {
    setSelectedReseller(reseller);
    setCreditsToAdd("10");
    setIsAddCreditsDialogOpen(true);
  };

  const confirmAddCredits = () => {
    if (selectedReseller) {
      addCreditsMutation.mutate({ id: selectedReseller.id, credits: parseInt(creditsToAdd) });
    }
  };

  const handleRenew = (reseller: ResellerAccess) => {
    setSelectedReseller(reseller);
    setRenewDays("30");
    setIsRenewDialogOpen(true);
  };

  const handleEdit = (reseller: ResellerAccess) => {
    setSelectedReseller(reseller);
    setEditForm({
      full_name: reseller.full_name || "",
      email: reseller.email,
      access_expires_at: format(new Date(reseller.access_expires_at), "yyyy-MM-dd"),
      newPassword: "",
    });
    setEditErrors({});
    setShowPassword(false);
    setIsEditDialogOpen(true);
  };

  const confirmRenew = () => {
    if (selectedReseller) {
      renewMutation.mutate({ id: selectedReseller.id, days: parseInt(renewDays) });
    }
  };

  const validateEditForm = () => {
    try {
      editSchema.parse(editForm);
      setEditErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setEditErrors(newErrors);
      }
      return false;
    }
  };

  const confirmEdit = () => {
    if (!validateEditForm() || !selectedReseller) return;
    
    editMutation.mutate({
      id: selectedReseller.id,
      user_id: selectedReseller.user_id,
      full_name: editForm.full_name,
      email: editForm.email,
      access_expires_at: editForm.access_expires_at,
      newPassword: editForm.newPassword || undefined,
    });
  };

  const validateCreateForm = () => {
    try {
      createSchema.parse({
        full_name: createForm.full_name,
        email: createForm.email,
        password: createForm.password,
        access_days: parseInt(createForm.access_days),
      });
      setCreateErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setCreateErrors(newErrors);
      }
      return false;
    }
  };

  const confirmCreate = () => {
    if (!validateCreateForm()) return;
    
    createMutation.mutate({
      full_name: createForm.full_name,
      email: createForm.email,
      password: createForm.password,
      access_days: parseInt(createForm.access_days),
    });
  };

  const getAccessStatus = (expiresAt: string, isActive: boolean) => {
    if (!isActive) {
      return { label: "Desativado", variant: "destructive" as const, icon: Ban };
    }
    
    const expirationDate = new Date(expiresAt);
    const daysLeft = differenceInDays(expirationDate, new Date());
    
    if (isPast(expirationDate)) {
      return { label: "Expirado", variant: "destructive" as const, icon: Ban };
    }
    
    if (daysLeft <= 7) {
      return { label: `${daysLeft}d restantes`, variant: "secondary" as const, icon: Clock };
    }
    
    return { label: "Ativo", variant: "default" as const, icon: CheckCircle };
  };

  const matchesStatus = (r: ResellerAccess) => {
    const expired = !r.is_active || isPast(new Date(r.access_expires_at));
    const daysLeft = differenceInDays(new Date(r.access_expires_at), new Date());
    switch (statusFilter) {
      case 'ativos': return !expired;
      case 'expirando': return !expired && daysLeft <= 7;
      case 'inativos': return expired;
      default: return true;
    }
  };

  const filteredResellers = resellers?.filter(reseller =>
    (reseller.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reseller.full_name?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    matchesStatus(reseller)
  );

  const resellerByUserId = new Map<string, ResellerAccess>();
  (resellers || []).forEach(r => resellerByUserId.set(r.user_id, r));
  const getParentLabel = (parentId: string | null) => {
    if (!parentId) return isAdmin ? 'Admin' : '-';
    const p = resellerByUserId.get(parentId);
    return p ? (p.full_name || p.email) : '—';
  };

  // ---- Contagem de clientes (próprios + árvore de sub-revendas) ----
  const countsByOwner = new Map<string, { total: number; active: number }>();
  (customerCounts || []).forEach(c =>
    countsByOwner.set(c.owner_id, { total: Number(c.total_customers) || 0, active: Number(c.active_customers) || 0 })
  );

  const childrenByParent = new Map<string, string[]>();
  (resellers || []).forEach(r => {
    if (!r.parent_reseller_id) return;
    const list = childrenByParent.get(r.parent_reseller_id) || [];
    list.push(r.user_id);
    childrenByParent.set(r.parent_reseller_id, list);
  });

  const getTreeStats = (userId: string, seen = new Set<string>()): { total: number; active: number; subs: number } => {
    if (seen.has(userId)) return { total: 0, active: 0, subs: 0 };
    seen.add(userId);
    const own = countsByOwner.get(userId) || { total: 0, active: 0 };
    let total = own.total;
    let active = own.active;
    let subs = 0;
    for (const child of childrenByParent.get(userId) || []) {
      const s = getTreeStats(child, seen);
      total += s.total;
      active += s.active;
      subs += 1 + s.subs;
    }
    return { total, active, subs };
  };

  const totalCustomersAll = (customerCounts || []).reduce((s, c) => s + (Number(c.total_customers) || 0), 0);



  const activeCount = resellers?.filter(r => r.is_active && !isPast(new Date(r.access_expires_at))).length || 0;
  const expiredCount = resellers?.filter(r => !r.is_active || isPast(new Date(r.access_expires_at))).length || 0;
  const expiringSoonCount = resellers?.filter(r => {
    if (!r.is_active || isPast(new Date(r.access_expires_at))) return false;
    return differenceInDays(new Date(r.access_expires_at), new Date()) <= 7;
  }).length || 0;
  const totalCredits = resellers?.reduce((sum, r) => sum + (r.credits || 0), 0) || 0;

  const statCards = [
    { key: 'total', label: 'Revendedores', value: resellers?.length || 0, icon: Users, tone: 'text-primary', ring: 'bg-primary/10', filter: 'todos' as const },
    { key: 'ativos', label: 'Acessos ativos', value: activeCount, icon: CheckCircle, tone: 'text-success', ring: 'bg-success/10', filter: 'ativos' as const },
    { key: 'expirando', label: 'Vencendo em 7 dias', value: expiringSoonCount, icon: Clock, tone: 'text-warning', ring: 'bg-warning/10', filter: 'expirando' as const },
    { key: 'inativos', label: 'Expirados / inativos', value: expiredCount, icon: Ban, tone: 'text-destructive', ring: 'bg-destructive/10', filter: 'inativos' as const },
    { key: 'clientes', label: 'Clientes na rede', value: totalCustomersAll, icon: Users2, tone: 'text-primary', ring: 'bg-primary/10', filter: 'todos' as const },
    { key: 'creditos', label: 'Créditos em circulação', value: totalCredits, icon: Coins, tone: 'text-primary', ring: 'bg-primary/10', filter: 'todos' as const },
  ];


  const filterTabs: Array<{ id: typeof statusFilter; label: string; count: number }> = [
    { id: 'todos', label: 'Todos', count: resellers?.length || 0 },
    { id: 'ativos', label: 'Ativos', count: activeCount },
    { id: 'expirando', label: 'Vencendo', count: expiringSoonCount },
    { id: 'inativos', label: 'Inativos', count: expiredCount },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/15 via-background to-background p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-inner">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                  {isAdmin ? 'Central de Revendas' : 'Minhas Revendas'}
                </h1>
                <p className="text-sm text-muted-foreground max-w-xl">
                  {isAdmin
                    ? 'Ative, renove, credite e controle totalmente o acesso de cada revenda.'
                    : 'Crie sub-revendas e renove o acesso deles usando seus créditos (1 crédito = 30 dias)'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isAdmin && (
                <Badge variant="outline" className="gap-1 text-base py-1.5 px-3 bg-card/60 backdrop-blur">
                  <Coins className="h-4 w-4" />
                  {myAccess?.credits ?? 0} créditos
                </Badge>
              )}
              <Button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['reseller-access'] })}
                variant="outline"
                size="icon"
                title="Atualizar"
                className="bg-card/60 backdrop-blur"
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="shadow-md">
                <UserPlus className="h-4 w-4 mr-2" />
                {isAdmin ? 'Cadastrar Revendedor' : 'Criar Sub-Revenda'}
              </Button>
            </div>
          </div>
        </div>

        {isAdmin && <TrialDaysCard />}

        {/* Stats Cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-6 stagger-children">
          {statCards.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.filter)}
              className={cn(
                "group text-left rounded-xl border border-border/60 bg-card p-4 transition-all duration-200",
                "hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40",
                statusFilter === s.filter && s.key !== 'creditos' && "border-primary/60 ring-1 ring-primary/30"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", s.ring, s.tone)}>
                  <s.icon className="h-4 w-4" />
                </span>
              </div>
              <div className={cn("mt-2 text-2xl font-bold tabular-nums", s.tone)}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Resellers list */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Lista de Revendedores</CardTitle>
                <CardDescription>
                  {filteredResellers?.length || 0} revenda(s) exibida(s)
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-1">
                  {filterTabs.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setStatusFilter(t.id)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        statusFilter === t.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t.label}
                      <span className="ml-1.5 opacity-60 tabular-nums">{t.count}</span>
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por email ou nome..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 sm:w-64"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-40 rounded-xl border border-border/60 bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : filteredResellers?.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "Nenhum revendedor encontrado com esse termo" : "Nenhum revendedor nesse filtro"}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredResellers?.map((reseller) => {
                  const status = getAccessStatus(reseller.access_expires_at, reseller.is_active);
                  const StatusIcon = status.icon;
                  const isMySub = reseller.parent_reseller_id === currentUserId;
                  const canManage = isAdmin || isMySub;
                  const isSelf = reseller.user_id === currentUserId;
                  const expired = !reseller.is_active || isPast(new Date(reseller.access_expires_at));
                  const initials = (reseller.full_name || reseller.email)
                    .split(' ')
                    .map(p => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <div
                      key={reseller.id}
                      className={cn(
                        "group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 transition-all duration-200",
                        "hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40"
                      )}
                    >
                      <span className={cn(
                        "absolute inset-y-3 left-0 w-1 rounded-r-full",
                        expired ? "bg-destructive/70" : "bg-success/70"
                      )} />

                      <div className="flex items-start gap-3 pl-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold leading-tight">{reseller.full_name || 'Sem nome'}</p>
                          <p className="truncate text-xs text-muted-foreground">{reseller.email}</p>
                        </div>
                        <Badge variant={status.variant} className="gap-1 shrink-0">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </div>

                      {(() => {
                        const own = countsByOwner.get(reseller.user_id) || { total: 0, active: 0 };
                        const tree = getTreeStats(reseller.user_id);
                        return (
                          <div className="flex items-center gap-2 pl-2">
                            <div className="flex-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Clientes próprios</p>
                              <p className="text-sm font-bold tabular-nums text-primary">
                                {own.total}
                                <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                                  ({own.active} ativos)
                                </span>
                              </p>
                            </div>
                            <div className="flex-1 rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1.5">
                              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                <Network className="h-3 w-3" /> Árvore
                              </p>
                              <p className="text-sm font-bold tabular-nums">
                                {tree.total}
                                <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                                  ({tree.subs} sub{tree.subs === 1 ? '' : 's'})
                                </span>
                              </p>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-2 gap-2 pl-2 text-xs">

                        <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Créditos</p>
                          <p className="font-semibold tabular-nums">{reseller.credits}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Expira em</p>
                          <p className="font-semibold tabular-nums">
                            {format(new Date(reseller.access_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Revenda de</p>
                          <p className="truncate font-medium">{getParentLabel(reseller.parent_reseller_id)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cadastro</p>
                          <p className="font-medium tabular-nums">
                            {format(new Date(reseller.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pl-2 pt-1 border-t border-border/50">
                        {canManage && !isSelf && (
                          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleAddCredits(reseller)}>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Créditos
                          </Button>
                        )}
                        {canManage && !isSelf && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleRenew(reseller)}
                            title={isAdmin ? 'Renovar acesso' : 'Renovar (1 crédito = 30 dias)'}
                          >
                            <Calendar className="h-3.5 w-3.5 mr-1" />
                            Renovar
                          </Button>
                        )}
                        {isAdmin && (
                          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleEdit(reseller)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Editar
                          </Button>
                        )}
                        {isAdmin && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={async () => {
                                const current = reseller.max_evolution_instances ?? 1;
                                const input = prompt(`Máximo de instâncias WhatsApp para ${reseller.email}:`, String(current));
                                if (input === null) return;
                                const value = parseInt(input, 10);
                                if (isNaN(value) || value < 0) {
                                  toast({ title: 'Valor inválido', description: 'Informe um número >= 0', variant: 'destructive' });
                                  return;
                                }
                                const { error } = await supabase
                                  .from('reseller_access')
                                  .update({ max_evolution_instances: value })
                                  .eq('id', reseller.id);
                                if (error) {
                                  toast({ title: 'Erro', description: error.message, variant: 'destructive' });
                                } else {
                                  toast({ title: 'Atualizado', description: `Limite: ${value} instância(s)` });
                                  queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
                                }
                              }}
                              title={`Limite atual: ${reseller.max_evolution_instances ?? 1} instância(s)`}
                            >
                              <Smartphone className="h-3.5 w-3.5 mr-1" />
                              {reseller.max_evolution_instances ?? 1}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={async () => {
                                const current = reseller.max_official_channels ?? 1;
                                const input = prompt(`Máximo de conexões da API Oficial para ${reseller.email}:`, String(current));
                                if (input === null) return;
                                const value = parseInt(input, 10);
                                if (isNaN(value) || value < 0) {
                                  toast({ title: 'Valor inválido', description: 'Informe um número >= 0', variant: 'destructive' });
                                  return;
                                }
                                const { error } = await supabase
                                  .from('reseller_access')
                                  .update({ max_official_channels: value })
                                  .eq('id', reseller.id);
                                if (error) {
                                  toast({ title: 'Erro', description: error.message, variant: 'destructive' });
                                } else {
                                  toast({ title: 'Atualizado', description: `Limite: ${value} canal(is) oficial(is)` });
                                  queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
                                }
                              }}
                              title={`Limite atual: ${reseller.max_official_channels ?? 1} canal(is) da API Oficial`}
                            >
                              <BadgeCheck className="h-3.5 w-3.5 mr-1" />
                              {reseller.max_official_channels ?? 1}
                            </Button>

                            <Button
                              variant={reseller.is_active ? "outline" : "default"}
                              size="sm"
                              className={cn("h-8 text-xs", reseller.is_active && "text-destructive hover:text-destructive")}
                              onClick={() => toggleActiveMutation.mutate({ id: reseller.id, isActive: reseller.is_active })}
                            >
                              {reseller.is_active ? (
                                <><Ban className="h-3.5 w-3.5 mr-1" />Desativar</>
                              ) : (
                                <><CheckCircle className="h-3.5 w-3.5 mr-1" />Ativar</>
                              )}
                            </Button>
                          </>
                        )}
                        {canManage && !isSelf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => setResellerToDelete(reseller)}
                            title="Excluir revendedor"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>




        {/* Delete confirmation */}
        <AlertDialog open={!!resellerToDelete} onOpenChange={(o) => !o && setResellerToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir revendedor?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é permanente. A conta, o acesso e o perfil de <strong>{resellerToDelete?.email}</strong> serão removidos. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => resellerToDelete && deleteMutation.mutate(resellerToDelete.user_id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Excluir definitivamente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Revendedor</DialogTitle>
              <DialogDescription>
                Atualize os dados do revendedor
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome Completo</Label>
                <Input
                  id="edit-name"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  placeholder="Nome do revendedor"
                />
                {editErrors.full_name && (
                  <p className="text-destructive text-sm">{editErrors.full_name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
                {editErrors.email && (
                  <p className="text-destructive text-sm">{editErrors.email}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-expiration">Data de Vencimento</Label>
                <Input
                  id="edit-expiration"
                  type="date"
                  value={editForm.access_expires_at}
                  onChange={(e) => setEditForm({ ...editForm, access_expires_at: e.target.value })}
                />
                {editErrors.access_expires_at && (
                  <p className="text-destructive text-sm">{editErrors.access_expires_at}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-password">Nova Senha (deixe em branco para não alterar)</Label>
                <div className="relative">
                  <Input
                    id="edit-password"
                    type={showPassword ? "text" : "password"}
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {editErrors.newPassword && (
                  <p className="text-destructive text-sm">{editErrors.newPassword}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Mínimo de 6 caracteres. Deixe em branco para manter a senha atual.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmEdit} disabled={editMutation.isPending}>
                {editMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Renew Dialog */}
        <Dialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renovar Acesso</DialogTitle>
              <DialogDescription>
                Renovar acesso para {selectedReseller?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Período de renovação</Label>
                <Select value={renewDays} onValueChange={setRenewDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="15">15 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="60">60 dias</SelectItem>
                    <SelectItem value="90">90 dias</SelectItem>
                    <SelectItem value="180">180 dias</SelectItem>
                    <SelectItem value="365">365 dias (1 ano)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ou digite um valor customizado (dias)</Label>
                <Input
                  type="number"
                  min="1"
                  value={renewDays}
                  onChange={(e) => setRenewDays(e.target.value)}
                  placeholder="Digite o número de dias"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenewDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmRenew} disabled={renewMutation.isPending}>
                {renewMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Confirmar Renovação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar Revendedor</DialogTitle>
              <DialogDescription>
                Preencha os dados para criar um novo revendedor
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nome Completo</Label>
                <Input
                  id="create-name"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  placeholder="Nome do revendedor"
                />
                {createErrors.full_name && (
                  <p className="text-destructive text-sm">{createErrors.full_name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
                {createErrors.email && (
                  <p className="text-destructive text-sm">{createErrors.email}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="create-password">Senha</Label>
                <div className="relative">
                  <Input
                    id="create-password"
                    type={showCreatePassword ? "text" : "password"}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                  >
                    {showCreatePassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {createErrors.password && (
                  <p className="text-destructive text-sm">{createErrors.password}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Mínimo de 6 caracteres
                </p>
              </div>

              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-sm font-medium">
                  Período de teste: {createForm.access_days || platformSettings?.trial_days || 7} dias
                </p>
                <p className="text-xs text-muted-foreground">
                  Aplicado automaticamente conforme a configuração global "Dias grátis ao criar conta".
                </p>
                {createErrors.access_days && (
                  <p className="text-destructive text-sm mt-1">{createErrors.access_days}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Cadastrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Credits Dialog */}
        <Dialog open={isAddCreditsDialogOpen} onOpenChange={setIsAddCreditsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Créditos</DialogTitle>
              <DialogDescription>
                Adicionar créditos para {selectedReseller?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Quantidade de créditos</Label>
                <Select value={creditsToAdd} onValueChange={setCreditsToAdd}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 crédito</SelectItem>
                    <SelectItem value="5">5 créditos</SelectItem>
                    <SelectItem value="10">10 créditos</SelectItem>
                    <SelectItem value="20">20 créditos</SelectItem>
                    <SelectItem value="50">50 créditos</SelectItem>
                    <SelectItem value="100">100 créditos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ou digite um valor customizado</Label>
                <Input
                  type="number"
                  min="1"
                  value={creditsToAdd}
                  onChange={(e) => setCreditsToAdd(e.target.value)}
                  placeholder="Digite a quantidade de créditos"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Créditos atuais: <strong>{selectedReseller?.credits || 0}</strong><br />
                Após adição: <strong>{(selectedReseller?.credits || 0) + parseInt(creditsToAdd || '0')}</strong>
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddCreditsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmAddCredits} disabled={addCreditsMutation.isPending}>
                {addCreditsMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="h-4 w-4 mr-2" />
                )}
                Adicionar Créditos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
