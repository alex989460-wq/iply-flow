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
import { Users, RefreshCw, Search, Calendar, Ban, CheckCircle, Clock } from "lucide-react";
import { Navigate } from "react-router-dom";

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

export default function Resellers() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReseller, setSelectedReseller] = useState<ResellerAccess | null>(null);
  const [renewDays, setRenewDays] = useState("30");
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false);

  // Redirect non-admin users
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

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

  const handleRenew = (reseller: ResellerAccess) => {
    setSelectedReseller(reseller);
    setRenewDays("30");
    setIsRenewDialogOpen(true);
  };

  const confirmRenew = () => {
    if (selectedReseller) {
      renewMutation.mutate({ id: selectedReseller.id, days: parseInt(renewDays) });
    }
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Revendedores</h1>
            <p className="text-muted-foreground">Gerencie o acesso dos revendedores ao sistema</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Revendedores</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resellers?.length || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Acessos Ativos</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Acessos Expirados/Inativos</CardTitle>
              <Ban className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{expiredCount}</div>
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
                      <TableRow key={reseller.id}>
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
                        <TableCell className="text-right space-x-2">
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
      </div>
    </DashboardLayout>
  );
}
