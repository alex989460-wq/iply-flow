import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, Server, Star, Save, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

interface VplayServer {
  id: string;
  user_id: string;
  server_name: string;
  integration_url: string;
  key_message: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export default function VplayServersManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<VplayServer | null>(null);
  const [deleteServer, setDeleteServer] = useState<VplayServer | null>(null);
  const [formData, setFormData] = useState({
    server_name: '',
    integration_url: '',
    key_message: 'XCLOUD',
    is_default: false,
  });

  // Fetch vplay servers
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['vplay-servers', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('vplay_servers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as VplayServer[];
    },
    enabled: !!user?.id,
  });

  // Create/Update server mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      // If setting as default, remove default from other servers first
      if (data.is_default) {
        await supabase
          .from('vplay_servers')
          .update({ is_default: false })
          .eq('user_id', user.id);
      }

      if (data.id) {
        // Update
        const { error } = await supabase
          .from('vplay_servers')
          .update({
            server_name: data.server_name,
            integration_url: data.integration_url,
            key_message: data.key_message,
            is_default: data.is_default,
          })
          .eq('id', data.id);
        
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('vplay_servers')
          .insert({
            user_id: user.id,
            server_name: data.server_name,
            integration_url: data.integration_url,
            key_message: data.key_message,
            is_default: data.is_default || servers.length === 0, // First server is default
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vplay-servers'] });
      toast.success(editingServer ? 'Servidor atualizado!' : 'Servidor adicionado!');
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao salvar servidor');
    },
  });

  // Delete server mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('vplay_servers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vplay-servers'] });
      toast.success('Servidor removido!');
      setDeleteServer(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao remover servidor');
    },
  });

  // Set as default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (serverId: string) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      // Remove default from all
      await supabase
        .from('vplay_servers')
        .update({ is_default: false })
        .eq('user_id', user.id);
      
      // Set new default
      const { error } = await supabase
        .from('vplay_servers')
        .update({ is_default: true })
        .eq('id', serverId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vplay-servers'] });
      toast.success('Servidor padrão definido!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao definir servidor padrão');
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingServer(null);
    setFormData({
      server_name: '',
      integration_url: '',
      key_message: 'XCLOUD',
      is_default: false,
    });
  };

  const handleEdit = (server: VplayServer) => {
    setEditingServer(server);
    setFormData({
      server_name: server.server_name,
      integration_url: server.integration_url,
      key_message: server.key_message,
      is_default: server.is_default,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.server_name.trim()) {
      toast.error('Nome do servidor é obrigatório');
      return;
    }
    if (!formData.integration_url.trim()) {
      toast.error('URL de integração é obrigatória');
      return;
    }
    if (!formData.integration_url.startsWith('http')) {
      toast.error('URL deve começar com http:// ou https://');
      return;
    }

    saveMutation.mutate({
      ...formData,
      id: editingServer?.id,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="w-5 h-5 text-violet-500" />
          Gerador de Testes Vplay
        </CardTitle>
        <CardDescription>
          Configure seus servidores Vplay para geração automática de testes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Server Button */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) handleCloseDialog();
          else setIsDialogOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button className="w-full" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Servidor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingServer ? 'Editar Servidor' : 'Novo Servidor Vplay'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="server_name">Nome do Servidor *</Label>
                <Input
                  id="server_name"
                  placeholder="Ex: VPLAY, NATV, P2C..."
                  value={formData.server_name}
                  onChange={(e) => setFormData({ ...formData, server_name: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="integration_url">URL de Integração *</Label>
                <Input
                  id="integration_url"
                  placeholder="https://gestorvplay.com/chatbot/1234"
                  value={formData.integration_url}
                  onChange={(e) => setFormData({ ...formData, integration_url: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  URL do webhook de integração do seu painel Vplay
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="key_message">Chave/Palavra de Ativação</Label>
                <Input
                  id="key_message"
                  placeholder="XCLOUD"
                  value={formData.key_message}
                  onChange={(e) => setFormData({ ...formData, key_message: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Palavra que ativa a geração de teste no Vplay (ex: XC, XCLOUD, TESTE)
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleCloseDialog}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Servers List */}
        {servers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum servidor configurado</p>
            <p className="text-sm">Adicione um servidor para gerar testes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((server) => (
              <div
                key={server.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  server.is_default 
                    ? 'border-violet-500/50 bg-violet-500/5' 
                    : 'border-border hover:border-violet-500/30'
                } transition-colors`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                    <Server className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{server.server_name}</span>
                      {server.is_default && (
                        <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-600 border-violet-500/30">
                          Padrão
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Chave: {server.key_message}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!server.is_default && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDefaultMutation.mutate(server.id)}
                      disabled={setDefaultMutation.isPending}
                      title="Definir como padrão"
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(server)}
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteServer(server)}
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteServer} onOpenChange={(open) => !open && setDeleteServer(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover servidor?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover o servidor "{deleteServer?.server_name}"? 
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteServer && deleteMutation.mutate(deleteServer.id)}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Remover'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
