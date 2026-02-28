import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Server, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function AutoRenewServersCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers-auto-renew', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, server_name, auto_renew')
        .order('server_name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, auto_renew }: { id: string; auto_renew: boolean }) => {
      const { error } = await supabase
        .from('servers')
        .update({ auto_renew })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers-auto-renew'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar servidor: ' + error.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Renovação Automática por Servidor
        </CardTitle>
        <CardDescription>
          Selecione quais servidores devem ser renovados automaticamente quando um pagamento pela Cakto for detectado. 
          Servidores desabilitados terão apenas o vencimento atualizado no gestor, sem renovar no painel externo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !servers?.length ? (
          <div className="text-center py-6 text-muted-foreground border border-dashed border-border rounded-lg">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum servidor cadastrado</p>
            <p className="text-xs mt-1">Cadastre servidores na página de Servidores primeiro</p>
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor={`auto-renew-${server.id}`} className="cursor-pointer font-medium">
                    {server.server_name}
                  </Label>
                </div>
                <Switch
                  id={`auto-renew-${server.id}`}
                  checked={server.auto_renew ?? false}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ id: server.id, auto_renew: checked })
                  }
                  disabled={toggleMutation.isPending}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
