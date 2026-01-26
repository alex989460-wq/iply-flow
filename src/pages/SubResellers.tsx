import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Users, RefreshCw, Search, Calendar, Ban, CheckCircle, Clock, Eye, EyeOff, UserPlus, Coins, AlertTriangle } from "lucide-react";
import { z } from "zod";

interface SubResellerAccess {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  access_expires_at: string;
  is_active: boolean;
  created_at: string;
  credits: number;
  parent_reseller_id: string | null;
}

const createSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres").max(100),
  email: z.string().email("Email inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  credits_to_use: z.number().min(1, "Mínimo de 1 crédito"),
});

export default function SubResellers() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubReseller, setSelectedSubReseller] = useState<SubResellerAccess | null>(null);
  const [renewCredits, setRenewCredits] = useState("1");
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    password: "",
    credits_to_use: "1",
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Fetch current user's reseller access (for credits)
  const { data: myAccess } = useQuery({
    queryKey: ['my-reseller-access'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_access')
        .select('*')
        .eq('user_id', user?.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user && !isAdmin,
  });

  // Fetch sub-resellers (those where parent_reseller_id = current user)
  const { data: subResellers, isLoading } = useQuery({
    queryKey: ['sub-resellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_access')
        .select('*')
        .eq('parent_reseller_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as SubResellerAccess[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { 
      full_name: string; 
      email: string; 
      password: string;
      credits_to_use: number;
    }) => {
      const { data: result, error: fnError } = await supabase.functions.invoke('create-sub-reseller', {
        body: data
      });
      
      if (fnError) throw fnError;
      if (!result?.success) throw new Error(result?.error || 'Erro ao criar sub-revendedor');
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-resellers'] });
      queryClient.invalidateQueries({ queryKey: ['my-reseller-access'] });
      toast({
        title: "Sub-revendedor cadastrado",
        description: "Novo sub-revendedor criado com sucesso!",
      });
      setIsCreateDialogOpen(false);
      setCreateForm({ full_name: "", email: "", password: "", credits_to_use: "1" });
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

  const renewMutation = useMutation({
    mutationFn: async ({ sub_reseller_id, credits_to_use }: { sub_reseller_id: string; credits_to_use: number }) => {
      const { data: result, error: fnError } = await supabase.functions.invoke('renew-sub-reseller', {
        body: { sub_reseller_id, credits_to_use }
      });
      
      if (fnError) throw fnError;
      if (!result?.success) throw new Error(result?.error || 'Erro ao renovar');
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-resellers'] });
      queryClient.invalidateQueries({ queryKey: ['my-reseller-access'] });
      toast({
        title: "Acesso renovado",
        description: `Acesso renovado com ${renewCredits} crédito(s) com sucesso!`,
      });
      setIsRenewDialogOpen(false);
      setSelectedSubReseller(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao renovar",
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
      queryClient.invalidateQueries({ queryKey: ['sub-resellers'] });
      toast({
        title: variables.isActive ? "Acesso desativado" : "Acesso ativado",
        description: "Status do sub-revendedor atualizado com sucesso!",
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

  const handleRenew = (subReseller: SubResellerAccess) => {
    setSelectedSubReseller(subReseller);
    setRenewCredits("1");
    setIsRenewDialogOpen(true);
  };

  const confirmRenew = () => {
    if (selectedSubReseller) {
      renewMutation.mutate({ 
        sub_reseller_id: selectedSubReseller.id, 
        credits_to_use: parseInt(renewCredits) 
      });
    }
  };

  const validateCreateForm = () => {
    try {
      createSchema.parse({
        full_name: createForm.full_name,
        email: createForm.email,
        password: createForm.password,
        credits_to_use: parseInt(createForm.credits_to_use),
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
      credits_to_use: parseInt(createForm.credits_to_use),
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

  const filteredSubResellers = subResellers?.filter(reseller =>
    reseller.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reseller.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = subResellers?.filter(r => r.is_active && !isPast(new Date(r.access_expires_at))).length || 0;
  const expiredCount = subResellers?.filter(r => !r.is_active || isPast(new Date(r.access_expires_at))).length || 0;
  const myCredits = isAdmin ? Infinity : (myAccess?.credits || 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sub-Revendedores</h1>
            <p className="text-muted-foreground">Gerencie seus sub-revendedores</p>
          </div>
          <Button 
            onClick={() => setIsCreateDialogOpen(true)}
            disabled={!isAdmin && myCredits < 1}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Sub-Revendedor
          </Button>
        </div>

        {/* Credits Card (for non-admin) */}
        {!isAdmin && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Coins className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Seus Créditos</p>
                  <p className="text-3xl font-bold">{myCredits}</p>
                  <p className="text-xs text-muted-foreground">1 crédito = 1 mês de acesso</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 stagger-children">
          <Card className="card-hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Sub-Revendedores</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{subResellers?.length || 0}</div>
            </CardContent>
          </Card>
          
          <Card className="card-hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Acessos Ativos</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{activeCount}</div>
            </CardContent>
          </Card>
          
          <Card className="card-hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Acessos Expirados/Inativos</CardTitle>
              <Ban className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{expiredCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Sub-Resellers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Sub-Revendedores</CardTitle>
            <CardDescription>
              Visualize e gerencie seus sub-revendedores
            </CardDescription>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por email ou nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredSubResellers?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? "Nenhum sub-revendedor encontrado com esse termo" : "Nenhum sub-revendedor cadastrado ainda"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Créditos</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead>Cadastrado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubResellers?.map((subReseller) => {
                      const status = getAccessStatus(subReseller.access_expires_at, subReseller.is_active);
                      const StatusIcon = status.icon;
                      
                      return (
                        <TableRow key={subReseller.id} className="table-row-hover">
                          <TableCell className="font-medium">{subReseller.email}</TableCell>
                          <TableCell>{subReseller.full_name || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant} className="gap-1">
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              <Coins className="h-3 w-3" />
                              {subReseller.credits}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(subReseller.access_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {format(new Date(subReseller.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRenew(subReseller)}
                                disabled={!isAdmin && myCredits < 1}
                              >
                                <Calendar className="h-4 w-4 mr-1" />
                                Renovar
                              </Button>
                              <Button
                                variant={subReseller.is_active ? "destructive" : "default"}
                                size="sm"
                                onClick={() => toggleActiveMutation.mutate({ id: subReseller.id, isActive: subReseller.is_active })}
                              >
                                {subReseller.is_active ? (
                                  <>
                                    <Ban className="h-4 w-4 mr-1" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Ativar
                                  </>
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar Sub-Revendedor</DialogTitle>
              <DialogDescription>
                Preencha os dados para criar um novo sub-revendedor
              </DialogDescription>
            </DialogHeader>
            
            {!isAdmin && myCredits < 1 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Você não possui créditos suficientes para criar um sub-revendedor.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nome Completo</Label>
                <Input
                  id="create-name"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  placeholder="Nome do sub-revendedor"
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

              <div className="space-y-2">
                <Label>Créditos a usar (1 crédito = 30 dias)</Label>
                <Select 
                  value={createForm.credits_to_use} 
                  onValueChange={(v) => setCreateForm({ ...createForm, credits_to_use: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 6, 12].map((c) => (
                      <SelectItem 
                        key={c} 
                        value={c.toString()}
                        disabled={!isAdmin && myCredits < c}
                      >
                        {c} crédito{c > 1 ? 's' : ''} ({c * 30} dias)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Você tem {myCredits} crédito{myCredits !== 1 ? 's' : ''} disponível{myCredits !== 1 ? 'is' : ''}
                  </p>
                )}
                {createErrors.credits_to_use && (
                  <p className="text-destructive text-sm">{createErrors.credits_to_use}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={confirmCreate} 
                disabled={createMutation.isPending || (!isAdmin && myCredits < 1)}
              >
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

        {/* Renew Dialog */}
        <Dialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renovar Acesso</DialogTitle>
              <DialogDescription>
                Renovar acesso para {selectedSubReseller?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Créditos a usar (1 crédito = 30 dias)</Label>
                <Select value={renewCredits} onValueChange={setRenewCredits}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 6, 12].map((c) => (
                      <SelectItem 
                        key={c} 
                        value={c.toString()}
                        disabled={!isAdmin && myCredits < c}
                      >
                        {c} crédito{c > 1 ? 's' : ''} ({c * 30} dias)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Você tem {myCredits} crédito{myCredits !== 1 ? 's' : ''} disponível{myCredits !== 1 ? 'is' : ''}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenewDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={confirmRenew} 
                disabled={renewMutation.isPending || (!isAdmin && myCredits < parseInt(renewCredits))}
              >
                {renewMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Confirmar Renovação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
