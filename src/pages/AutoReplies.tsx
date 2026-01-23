import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Plus, Pencil, Trash2, MessageSquare, Bot, Search, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AutoReply {
  id: string;
  trigger_keyword: string;
  reply_message: string;
  match_type: string;
  is_enabled: boolean;
  priority: number;
  created_at: string;
}

export default function AutoReplies() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [replies, setReplies] = useState<AutoReply[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<AutoReply | null>(null);
  const [formData, setFormData] = useState({
    trigger_keyword: '',
    reply_message: '',
    match_type: 'contains',
    is_enabled: true,
    priority: 0,
  });

  useEffect(() => {
    if (user) {
      fetchReplies();
    }
  }, [user]);

  const fetchReplies = async () => {
    try {
      const { data, error } = await supabase
        .from('auto_replies')
        .select('*')
        .eq('user_id', user?.id)
        .order('priority', { ascending: false });

      if (error) throw error;
      setReplies(data || []);
    } catch (error) {
      console.error('Error fetching auto replies:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar respostas automáticas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (reply?: AutoReply) => {
    if (reply) {
      setEditingReply(reply);
      setFormData({
        trigger_keyword: reply.trigger_keyword,
        reply_message: reply.reply_message,
        match_type: reply.match_type,
        is_enabled: reply.is_enabled,
        priority: reply.priority,
      });
    } else {
      setEditingReply(null);
      setFormData({
        trigger_keyword: '',
        reply_message: '',
        match_type: 'contains',
        is_enabled: true,
        priority: 0,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;

    if (!formData.trigger_keyword.trim() || !formData.reply_message.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha a palavra-chave e a mensagem de resposta',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (editingReply) {
        const { error } = await supabase
          .from('auto_replies')
          .update({
            trigger_keyword: formData.trigger_keyword.toLowerCase(),
            reply_message: formData.reply_message,
            match_type: formData.match_type,
            is_enabled: formData.is_enabled,
            priority: formData.priority,
          })
          .eq('id', editingReply.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('auto_replies')
          .insert({
            user_id: user.id,
            trigger_keyword: formData.trigger_keyword.toLowerCase(),
            reply_message: formData.reply_message,
            match_type: formData.match_type,
            is_enabled: formData.is_enabled,
            priority: formData.priority,
          });

        if (error) throw error;
      }

      toast({
        title: 'Sucesso',
        description: editingReply ? 'Resposta atualizada!' : 'Resposta criada!',
      });

      setDialogOpen(false);
      fetchReplies();
    } catch (error: any) {
      console.error('Error saving auto reply:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar resposta',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (reply: AutoReply) => {
    try {
      const { error } = await supabase
        .from('auto_replies')
        .update({ is_enabled: !reply.is_enabled })
        .eq('id', reply.id);

      if (error) throw error;

      setReplies(replies.map(r => 
        r.id === reply.id ? { ...r, is_enabled: !r.is_enabled } : r
      ));

      toast({
        title: reply.is_enabled ? 'Desativado' : 'Ativado',
        description: `Resposta "${reply.trigger_keyword}" ${reply.is_enabled ? 'desativada' : 'ativada'}`,
      });
    } catch (error) {
      console.error('Error toggling auto reply:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar status',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (reply: AutoReply) => {
    if (!confirm(`Deseja excluir a resposta para "${reply.trigger_keyword}"?`)) return;

    try {
      const { error } = await supabase
        .from('auto_replies')
        .delete()
        .eq('id', reply.id);

      if (error) throw error;

      setReplies(replies.filter(r => r.id !== reply.id));
      toast({
        title: 'Excluído',
        description: 'Resposta automática removida',
      });
    } catch (error) {
      console.error('Error deleting auto reply:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao excluir resposta',
        variant: 'destructive',
      });
    }
  };

  const getMatchTypeLabel = (type: string) => {
    switch (type) {
      case 'exact': return 'Exato';
      case 'contains': return 'Contém';
      case 'starts_with': return 'Começa com';
      default: return type;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bot className="w-6 h-6" />
              Respostas Automáticas
            </h1>
            <p className="text-muted-foreground">
              Configure respostas automáticas baseadas em palavras-chave
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Resposta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingReply ? 'Editar Resposta' : 'Nova Resposta Automática'}
                </DialogTitle>
                <DialogDescription>
                  Configure uma resposta automática para quando o cliente enviar uma mensagem com a palavra-chave
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="keyword">Palavra-chave *</Label>
                  <Input
                    id="keyword"
                    value={formData.trigger_keyword}
                    onChange={(e) => setFormData({ ...formData, trigger_keyword: e.target.value })}
                    placeholder="Ex: preço, valor, planos"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="match_type">Tipo de Correspondência</Label>
                  <Select 
                    value={formData.match_type} 
                    onValueChange={(v) => setFormData({ ...formData, match_type: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4" />
                          <span>Contém - mensagem contém a palavra</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="exact">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          <span>Exato - mensagem é exatamente a palavra</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="starts_with">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" />
                          <span>Começa com - mensagem começa com a palavra</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reply">Mensagem de Resposta *</Label>
                  <Textarea
                    id="reply"
                    value={formData.reply_message}
                    onChange={(e) => setFormData({ ...formData, reply_message: e.target.value })}
                    placeholder="Digite a mensagem que será enviada automaticamente..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Você pode usar variáveis: {'{nome}'}, {'{telefone}'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Prioridade</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Respostas com maior prioridade são verificadas primeiro
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
                  />
                  <Label>Ativo</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingReply ? 'Atualizar' : 'Criar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Alert>
          <Bot className="h-4 w-4" />
          <AlertDescription>
            As respostas automáticas são acionadas quando um cliente envia uma mensagem contendo a palavra-chave configurada.
            Configure o webhook na sua Evolution API para ativar esta funcionalidade.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Suas Respostas</CardTitle>
            <CardDescription>
              {replies.length} resposta{replies.length !== 1 ? 's' : ''} configurada{replies.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {replies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhuma resposta automática configurada</p>
                <p className="text-sm">Clique em "Nova Resposta" para começar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Palavra-chave</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="max-w-[200px]">Resposta</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {replies.map((reply) => (
                    <TableRow key={reply.id}>
                      <TableCell>
                        <Switch
                          checked={reply.is_enabled}
                          onCheckedChange={() => handleToggle(reply)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Badge variant="secondary">{reply.trigger_keyword}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getMatchTypeLabel(reply.match_type)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {reply.reply_message}
                      </TableCell>
                      <TableCell>{reply.priority}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(reply)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(reply)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
