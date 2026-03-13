import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Plus, Trash2, Edit, Search, FileText, MessageSquare, ShieldCheck, Megaphone, BarChart3, Eye } from 'lucide-react';

interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  example?: any;
}

interface Template {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  quality_score?: { score: string };
  components: TemplateComponent[];
}

const categoryColors: Record<string, string> = {
  MARKETING: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  UTILITY: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  AUTHENTICATION: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
};

const categoryLabels: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilitário',
  AUTHENTICATION: 'Autenticação',
};

const statusColors: Record<string, string> = {
  APPROVED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  PENDING: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  REJECTED: 'bg-red-500/10 text-red-500 border-red-500/30',
  PAUSED: 'bg-gray-500/10 text-gray-500 border-gray-500/30',
  DISABLED: 'bg-gray-500/10 text-gray-500 border-gray-500/30',
};

const statusLabels: Record<string, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Pendente',
  REJECTED: 'Rejeitado',
  PAUSED: 'Pausado',
  DISABLED: 'Desativado',
};

const categoryIcons: Record<string, any> = {
  MARKETING: Megaphone,
  UTILITY: ShieldCheck,
  AUTHENTICATION: ShieldCheck,
};

export default function MetaTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('UTILITY');
  const [newLanguage, setNewLanguage] = useState('pt_BR');
  const [newHeaderText, setNewHeaderText] = useState('');
  const [newBodyText, setNewBodyText] = useState('');
  const [newFooterText, setNewFooterText] = useState('');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-templates', {
        body: { action: 'list', limit: 250 },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTemplates(data?.data || []);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      toast.error(err.message || 'Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newBodyText.trim()) {
      toast.error('Nome e corpo da mensagem são obrigatórios');
      return;
    }

    setCreating(true);
    try {
      const components: any[] = [];

      if (newHeaderText.trim()) {
        components.push({ type: 'HEADER', format: 'TEXT', text: newHeaderText });
      }

      components.push({ type: 'BODY', text: newBodyText });

      if (newFooterText.trim()) {
        components.push({ type: 'FOOTER', text: newFooterText });
      }

      const { data, error } = await supabase.functions.invoke('meta-templates', {
        body: {
          action: 'create',
          name: newName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
          category: newCategory,
          language: newLanguage,
          components,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Template criado! Aguardando aprovação da Meta.');
      setShowCreateDialog(false);
      resetCreateForm();
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar template');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;

    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-templates', {
        body: { action: 'delete', template_name: selectedTemplate.name },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Template "${selectedTemplate.name}" excluído.`);
      setShowDeleteDialog(false);
      setSelectedTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir template');
    } finally {
      setDeleting(false);
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewCategory('UTILITY');
    setNewLanguage('pt_BR');
    setNewHeaderText('');
    setNewBodyText('');
    setNewFooterText('');
  };

  const getComponentText = (template: Template, type: string) => {
    return template.components?.find(c => c.type === type)?.text || '';
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    total: templates.length,
    marketing: templates.filter(t => t.category === 'MARKETING').length,
    utility: templates.filter(t => t.category === 'UTILITY').length,
    approved: templates.filter(t => t.status === 'APPROVED').length,
    pending: templates.filter(t => t.status === 'PENDING').length,
    rejected: templates.filter(t => t.status === 'REJECTED').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Templates Meta
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie seus modelos de mensagem do WhatsApp Business
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Template
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-foreground' },
            { label: 'Marketing', value: stats.marketing, color: 'text-amber-500' },
            { label: 'Utilitário', value: stats.utility, color: 'text-emerald-500' },
            { label: 'Aprovados', value: stats.approved, color: 'text-emerald-500' },
            { label: 'Pendentes', value: stats.pending, color: 'text-yellow-500' },
            { label: 'Rejeitados', value: stats.rejected, color: 'text-red-500' },
          ].map(s => (
            <Card key={s.label} className="border-border/50">
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${s.color} tabular-nums`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar template..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="MARKETING">Marketing</SelectItem>
              <SelectItem value="UTILITY">Utilitário</SelectItem>
              <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="APPROVED">Aprovado</SelectItem>
              <SelectItem value="PENDING">Pendente</SelectItem>
              <SelectItem value="REJECTED">Rejeitado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Template List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {templates.length === 0
                  ? 'Nenhum template encontrado. Verifique sua conexão com a Meta.'
                  : 'Nenhum template corresponde aos filtros.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredTemplates.map(template => {
              const CatIcon = categoryIcons[template.category] || MessageSquare;
              const bodyText = getComponentText(template, 'BODY');
              return (
                <Card key={template.id} className="border-border/50 hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 flex-shrink-0">
                          <CatIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">{template.name}</span>
                            <Badge variant="outline" className={`text-[10px] ${categoryColors[template.category] || ''}`}>
                              {categoryLabels[template.category] || template.category}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] ${statusColors[template.status] || ''}`}>
                              {statusLabels[template.status] || template.status}
                            </Badge>
                            {template.quality_score?.score && (
                              <Badge variant="outline" className="text-[10px]">
                                {template.quality_score.score === 'GREEN' ? '🟢' : template.quality_score.score === 'YELLOW' ? '🟡' : '🔴'} Qualidade
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-1 max-w-lg">
                            {bodyText || 'Sem conteúdo de corpo'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setSelectedTemplate(template); setShowViewDialog(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => { setSelectedTemplate(template); setShowDeleteDialog(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* View Template Dialog */}
        <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {selectedTemplate?.name}
              </DialogTitle>
              <DialogDescription>Detalhes do template</DialogDescription>
            </DialogHeader>
            {selectedTemplate && (
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className={categoryColors[selectedTemplate.category] || ''}>
                    {categoryLabels[selectedTemplate.category] || selectedTemplate.category}
                  </Badge>
                  <Badge variant="outline" className={statusColors[selectedTemplate.status] || ''}>
                    {statusLabels[selectedTemplate.status] || selectedTemplate.status}
                  </Badge>
                  <Badge variant="outline">{selectedTemplate.language}</Badge>
                </div>

                {/* Preview */}
                <div className="rounded-xl bg-muted/50 p-4 space-y-3 border border-border/50">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pré-visualização</p>
                  {selectedTemplate.components?.map((comp, i) => (
                    <div key={i}>
                      {comp.type === 'HEADER' && comp.text && (
                        <p className="font-bold text-foreground text-sm">{comp.text}</p>
                      )}
                      {comp.type === 'BODY' && comp.text && (
                        <p className="text-foreground text-sm whitespace-pre-wrap">{comp.text}</p>
                      )}
                      {comp.type === 'FOOTER' && comp.text && (
                        <p className="text-xs text-muted-foreground mt-2">{comp.text}</p>
                      )}
                      {comp.type === 'BUTTONS' && comp.buttons && (
                        <div className="mt-3 space-y-1">
                          {comp.buttons.map((btn, j) => (
                            <div key={j} className="text-center py-1.5 border border-primary/30 rounded-lg text-sm text-primary">
                              {btn.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Raw Components */}
                <details className="text-xs">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                    Ver componentes (JSON)
                  </summary>
                  <pre className="mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-48 text-[10px]">
                    {JSON.stringify(selectedTemplate.components, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create Template Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={v => { if (!v) resetCreateForm(); setShowCreateDialog(v); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Criar Novo Template
              </DialogTitle>
              <DialogDescription>
                O template será enviado para aprovação da Meta. Pode levar até 24h.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    placeholder="nome_do_template"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Apenas letras minúsculas, números e _</p>
                </div>
                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Utilitário</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Idioma</Label>
                <Select value={newLanguage} onValueChange={setNewLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Português (BR)</SelectItem>
                    <SelectItem value="en_US">English (US)</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cabeçalho (opcional)</Label>
                <Input
                  placeholder="Texto do cabeçalho"
                  value={newHeaderText}
                  onChange={e => setNewHeaderText(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Corpo da mensagem *</Label>
                <Textarea
                  placeholder="Olá {{1}}, sua assinatura vence em {{2}}."
                  value={newBodyText}
                  onChange={e => setNewBodyText(e.target.value)}
                  rows={4}
                />
                <p className="text-[10px] text-muted-foreground">
                  Use {"{{1}}"}, {"{{2}}"}, etc. para variáveis dinâmicas
                </p>
              </div>

              <div className="space-y-2">
                <Label>Rodapé (opcional)</Label>
                <Input
                  placeholder="Texto do rodapé"
                  value={newFooterText}
                  onChange={e => setNewFooterText(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetCreateForm(); }}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                Criar Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir template</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o template <strong>"{selectedTemplate?.name}"</strong>? 
                Essa ação não pode ser desfeita e todas as versões em todos os idiomas serão removidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
