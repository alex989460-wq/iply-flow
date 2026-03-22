import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Database, RefreshCw, RotateCcw, Loader2, Clock, Users, Shield, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Backup {
  id: string;
  created_at: string;
  total_customers: number;
  backup_type: string;
}

export default function BackupManagerCard() {
  const { toast } = useToast();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_backups')
        .select('id, created_at, total_customers, backup_type')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setBackups(data || []);
    } catch (err: any) {
      toast({ title: 'Erro', description: 'Falha ao carregar backups', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const createManualBackup = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-backup');
      if (error) throw error;
      toast({ title: 'Backup criado!', description: `${data?.total_customers || 0} clientes salvos.` });
      fetchBackups();
    } catch (err: any) {
      toast({ title: 'Erro', description: 'Falha ao criar backup', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreClick = (backup: Backup) => {
    setSelectedBackup(backup);
    setConfirmText('');
    setShowRestoreDialog(true);
  };

  const handleRestore = async () => {
    if (!selectedBackup || confirmText !== 'RESTAURAR') return;

    setRestoring(true);
    try {
      // Fetch full backup data
      const { data: backupData, error: fetchError } = await supabase
        .from('customer_backups')
        .select('backup_data')
        .eq('id', selectedBackup.id)
        .single();

      if (fetchError) throw fetchError;

      const customers = backupData.backup_data as any[];
      if (!customers || !Array.isArray(customers) || customers.length === 0) {
        throw new Error('Backup vazio ou inválido');
      }

      // First create a safety backup of current state
      await supabase.functions.invoke('auto-backup');

      // Delete all current customers and re-insert from backup
      // We need to use edge function for this since we need service role
      const { data, error } = await supabase.functions.invoke('auto-backup', {
        body: { action: 'restore', backup_id: selectedBackup.id }
      });

      if (error) throw error;

      toast({
        title: 'Restauração concluída!',
        description: `${customers.length} clientes restaurados do backup.`,
      });

      setShowRestoreDialog(false);
      fetchBackups();
    } catch (err: any) {
      toast({
        title: 'Erro na restauração',
        description: err.message || 'Falha ao restaurar backup',
        variant: 'destructive',
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Backups Automáticos
              </CardTitle>
              <CardDescription>
                Backups gerados automaticamente a cada 10 minutos. Últimas 24h preservadas.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchBackups} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button size="sm" onClick={createManualBackup} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
                Backup Manual
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum backup encontrado</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {backups.map((backup, index) => (
                  <div
                    key={backup.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${index === 0 ? 'bg-primary/20' : 'bg-muted'}`}>
                        <Database className={`w-4 h-4 ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {format(new Date(backup.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                          {index === 0 && (
                            <Badge variant="default" className="text-xs">Mais recente</Badge>
                          )}
                          <Badge variant={backup.backup_type === 'manual' ? 'secondary' : 'outline'} className="text-xs">
                            {backup.backup_type === 'manual' ? 'Manual' : 'Auto'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Users className="w-3 h-3" />
                          <span>{backup.total_customers.toLocaleString('pt-BR')} clientes</span>
                          <Clock className="w-3 h-3 ml-2" />
                          <span>{format(new Date(backup.created_at), "HH:mm:ss")}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestoreClick(backup)}
                      className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Restaurar
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Restauração
            </DialogTitle>
            <DialogDescription>
              Esta ação irá substituir TODOS os clientes atuais pelos dados deste backup. 
              Um backup de segurança será criado automaticamente antes da restauração.
            </DialogDescription>
          </DialogHeader>

          {selectedBackup && (
            <div className="p-3 rounded-lg bg-muted border border-border">
              <p className="text-sm font-medium">Backup selecionado:</p>
              <p className="text-xs text-muted-foreground mt-1">
                📅 {format(new Date(selectedBackup.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
              </p>
              <p className="text-xs text-muted-foreground">
                👥 {selectedBackup.total_customers.toLocaleString('pt-BR')} clientes
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Digite <strong className="text-foreground">RESTAURAR</strong> para confirmar:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTAURAR"
              className="font-mono"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={confirmText !== 'RESTAURAR' || restoring}
            >
              {restoring ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
              Restaurar Backup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
