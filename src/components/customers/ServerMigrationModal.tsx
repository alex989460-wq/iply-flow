import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { ArrowRightLeft, Loader2, Server, AlertTriangle } from 'lucide-react';

interface ServerMigrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servers: Array<{ id: string; server_name: string }> | undefined;
  customers: Array<{ id: string; name: string; server_id: string | null }> | undefined;
}

export default function ServerMigrationModal({
  open,
  onOpenChange,
  servers,
  customers,
}: ServerMigrationModalProps) {
  const [sourceServerId, setSourceServerId] = useState<string>('');
  const [targetServerId, setTargetServerId] = useState<string>('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(0);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filter customers by source server
  const customersToMigrate = customers?.filter(
    (c) => c.server_id === sourceServerId
  ) || [];

  const handleMigration = async () => {
    if (!sourceServerId || !targetServerId || sourceServerId === targetServerId) {
      toast({
        title: 'Selecione servidores diferentes',
        description: 'O servidor de origem e destino devem ser diferentes.',
        variant: 'destructive',
      });
      return;
    }

    if (customersToMigrate.length === 0) {
      toast({
        title: 'Nenhum cliente para migrar',
        description: 'O servidor de origem não possui clientes.',
        variant: 'destructive',
      });
      return;
    }

    setIsMigrating(true);
    setMigrationProgress(0);

    const batchSize = 50;
    const customerIds = customersToMigrate.map((c) => c.id);
    let migratedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);

      const { error } = await supabase
        .from('customers')
        .update({ server_id: targetServerId })
        .in('id', batch);

      if (error) {
        console.error('Erro ao migrar lote:', error);
        errorCount += batch.length;
      } else {
        migratedCount += batch.length;
      }

      setMigrationProgress(
        Math.round(((i + batch.length) / customerIds.length) * 100)
      );
    }

    // Refresh data
    queryClient.invalidateQueries({ queryKey: ['customers'] });

    setIsMigrating(false);
    setMigrationProgress(0);

    if (errorCount > 0) {
      toast({
        title: 'Migração parcial',
        description: `${migratedCount} clientes migrados. ${errorCount} erros.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Migração concluída!',
        description: `${migratedCount} clientes migrados com sucesso.`,
      });
      onOpenChange(false);
      setSourceServerId('');
      setTargetServerId('');
    }
  };

  const sourceServerName = servers?.find((s) => s.id === sourceServerId)?.server_name;
  const targetServerName = servers?.find((s) => s.id === targetServerId)?.server_name;

  return (
    <Dialog open={open} onOpenChange={(o) => !isMigrating && onOpenChange(o)}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Migração em Massa de Servidor
          </DialogTitle>
          <DialogDescription>
            Mova todos os clientes de um servidor para outro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Source Server */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              Servidor de Origem
            </Label>
            <Select
              value={sourceServerId}
              onValueChange={setSourceServerId}
              disabled={isMigrating}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o servidor de origem" />
              </SelectTrigger>
              <SelectContent>
                {servers?.map((server) => {
                  const count = customers?.filter(
                    (c) => c.server_id === server.id
                  ).length || 0;
                  return (
                    <SelectItem key={server.id} value={server.id}>
                      {server.server_name} ({count} clientes)
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Target Server */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              Servidor de Destino
            </Label>
            <Select
              value={targetServerId}
              onValueChange={setTargetServerId}
              disabled={isMigrating}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o servidor de destino" />
              </SelectTrigger>
              <SelectContent>
                {servers
                  ?.filter((s) => s.id !== sourceServerId)
                  .map((server) => {
                    const count = customers?.filter(
                      (c) => c.server_id === server.id
                    ).length || 0;
                    return (
                      <SelectItem key={server.id} value={server.id}>
                        {server.server_name} ({count} clientes)
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          {sourceServerId && targetServerId && sourceServerId !== targetServerId && (
            <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="font-medium">Confirmação</span>
              </div>
              <p className="text-sm text-muted-foreground">
                <strong>{customersToMigrate.length}</strong> cliente(s) serão
                migrados de <strong>{sourceServerName}</strong> para{' '}
                <strong>{targetServerName}</strong>.
              </p>
            </div>
          )}

          {/* Progress */}
          {isMigrating && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Migrando clientes...</span>
                <span className="font-medium">{migrationProgress}%</span>
              </div>
              <Progress value={migrationProgress} className="h-3" />
              <p className="text-xs text-muted-foreground text-center">
                Aguarde, não feche esta janela...
              </p>
            </div>
          )}

          {/* Actions */}
          {!isMigrating && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleMigration}
                disabled={
                  !sourceServerId ||
                  !targetServerId ||
                  sourceServerId === targetServerId ||
                  customersToMigrate.length === 0
                }
                className="flex-1"
              >
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Migrar {customersToMigrate.length} Cliente(s)
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
