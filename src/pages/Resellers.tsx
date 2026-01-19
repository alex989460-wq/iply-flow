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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, isPast, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Users, RefreshCw, Search, Calendar, Ban, CheckCircle, Clock, Pencil, Eye, EyeOff, UserPlus } from "lucide-react";
import { Navigate } from "react-router-dom";
import { z } from "zod";

interface ResellerAccess {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  access_expires_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  const { isAdmin } = useAuth();
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
    access_days: "30",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

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
    enabled: isAdmin,
  });

  const renewMutation = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const newExpiration = addDays(new Date(), days);
      const { error } = await supabase
        .from('reseller_access')
        .update({ 
          access_expires_at: newExpiration.toISOString(),
          is_active: true 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
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
      // Create user via edge function
      const { data: result, error: fnError } = await supabase.functions.invoke('create-reseller', {
        body: { 
          email: data.email, 
          password: data.password,
          full_name: data.full_name,
          access_days: data.access_days,
        }
      });
      
      if (fnError) throw fnError;
      if (!result?.success) throw new Error(result?.error || 'Erro ao criar revendedor');
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reseller-access'] });
      toast({
        title: "Revendedor cadastrado",
        description: "Novo revendedor criado com sucesso!",
      });
      setIsCreateDialogOpen(false);
      setCreateForm({ full_name: "", email: "", password: "", access_days: "30" });
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

  const filteredResellers = resellers?.filter(reseller =>
    reseller.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reseller.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = resellers?.filter(r => r.is_active && !isPast(new Date(r.access_expires_at))).length || 0;
  const expiredCount = resellers?.filter(r => !r.is_active || isPast(new Date(r.access_expires_at))).length || 0;

  // Redirect non-admin users
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Revendedores</h1>
            <p className="text-muted-foreground">Gerencie o acesso dos revendedores ao sistema</p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Revendedor
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 stagger-children">
          <Card className="card-hover-lift">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Revendedores</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resellers?.length || 0}</div>
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

        {/* Resellers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Revendedores</CardTitle>
            <CardDescription>
              Visualize e gerencie todos os revendedores cadastrados no sistema
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
            ) : filteredResellers?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? "Nenhum revendedor encontrado com esse termo" : "Nenhum revendedor cadastrado ainda"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead>Cadastrado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResellers?.map((reseller) => {
                      const status = getAccessStatus(reseller.access_expires_at, reseller.is_active);
                      const StatusIcon = status.icon;
                      
                      return (
                        <TableRow key={reseller.id} className="table-row-hover">
                          <TableCell className="font-medium">{reseller.email}</TableCell>
                          <TableCell>{reseller.full_name || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant} className="gap-1">
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(reseller.access_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {format(new Date(reseller.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(reseller)}
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRenew(reseller)}
                              >
                                <Calendar className="h-4 w-4 mr-1" />
                                Renovar
                              </Button>
                              <Button
                                variant={reseller.is_active ? "destructive" : "default"}
                                size="sm"
                                onClick={() => toggleActiveMutation.mutate({ id: reseller.id, isActive: reseller.is_active })}
                              >
                                {reseller.is_active ? (
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

              <div className="space-y-2">
                <Label>Período de acesso</Label>
                <Select value={createForm.access_days} onValueChange={(v) => setCreateForm({ ...createForm, access_days: v })}>
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
                <div className="mt-2">
                  <Label>Ou digite um valor customizado (dias)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={createForm.access_days}
                    onChange={(e) => setCreateForm({ ...createForm, access_days: e.target.value })}
                    placeholder="Digite o número de dias"
                  />
                </div>
                {createErrors.access_days && (
                  <p className="text-destructive text-sm">{createErrors.access_days}</p>
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
      </div>
    </DashboardLayout>
  );
}
