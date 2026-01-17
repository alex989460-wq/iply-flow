import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ExternalLink, Plus, Trash2, MonitorPlay, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import QuickRenewalPanel from '@/components/chat/QuickRenewalPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PanelLink {
  id: string;
  name: string;
  url: string;
  icon: string;
  sort_order: number;
}

const ZAP_RESPONDER_URL = 'https://chat.zapresponder.com.br/';

export default function Chat() {
  const [activePanel, setActivePanel] = useState<PanelLink | null>(null);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const queryClient = useQueryClient();

  const refreshIframe = () => {
    setIframeKey((prev) => prev + 1);
    setIframeBlocked(false);
  };

  // Reset blocked state when changing panels
  useEffect(() => {
    setIframeBlocked(false);
  }, [activePanel]);

  const handleIframeError = useCallback(() => {
    setIframeBlocked(true);
  }, []);

  const { data: panelLinks = [] } = useQuery({
    queryKey: ['panel-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('panel_links')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as PanelLink[];
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      const { error } = await supabase
        .from('panel_links')
        .insert({ name, url, sort_order: panelLinks.length });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Link adicionado!');
      queryClient.invalidateQueries({ queryKey: ['panel-links'] });
      setNewLinkName('');
      setNewLinkUrl('');
      setIsAddingLink(false);
    },
    onError: (error) => {
      toast.error('Erro ao adicionar: ' + error.message);
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('panel_links')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Link removido!');
      queryClient.invalidateQueries({ queryKey: ['panel-links'] });
      if (activePanel) {
        setActivePanel(null);
      }
    },
    onError: (error) => {
      toast.error('Erro ao remover: ' + error.message);
    },
  });

  const handleAddLink = () => {
    if (!newLinkName.trim() || !newLinkUrl.trim()) {
      toast.error('Preencha nome e URL');
      return;
    }
    addLinkMutation.mutate({ name: newLinkName, url: newLinkUrl });
  };

  const openInNewTab = (url: string) => {
    window.open(url, '_blank');
  };

  const currentUrl = activePanel?.url || ZAP_RESPONDER_URL;
  const currentTitle = activePanel?.name || 'Chat';

  return (
    <DashboardLayout noPadding>
      <div className="flex h-[calc(100vh-56px)] animate-fade-in">
        {/* Left Panel - Panel Links */}
        <div className="w-48 border-r border-border bg-background/50 flex flex-col">
          <div className="p-2 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Painéis</h2>
            <Dialog open={isAddingLink} onOpenChange={setIsAddingLink}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Adicionar Painel</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome do Painel</Label>
                    <Input
                      placeholder="Ex: VPLAY"
                      value={newLinkName}
                      onChange={(e) => setNewLinkName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                    />
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleAddLink}
                    disabled={addLinkMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {/* Default Chat option */}
              <Button
                variant={!activePanel ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start h-8 text-xs"
                onClick={() => setActivePanel(null)}
              >
                <MonitorPlay className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
                <span className="truncate">Chat</span>
              </Button>

              {/* Custom Panel Links */}
              {panelLinks.map((link) => (
                <div key={link.id} className="group relative">
                  <Button
                    variant={activePanel?.id === link.id ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start h-8 text-xs pr-8"
                    onClick={() => setActivePanel(link)}
                  >
                    <MonitorPlay className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
                    <span className="truncate">{link.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteLinkMutation.mutate(link.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/50">
            <h1 className="text-lg font-semibold text-foreground">{currentTitle}</h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={refreshIframe} title="Atualizar">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openInNewTab(currentUrl)}>
                <ExternalLink className="w-4 h-4 mr-1" />
                Nova Aba
              </Button>
            </div>
          </div>

          <div className="flex-1 w-full overflow-hidden relative">
            {iframeBlocked && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/95 z-10 p-6">
                <Alert className="max-w-md">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertTitle>Conteúdo bloqueado</AlertTitle>
                  <AlertDescription className="mt-2 space-y-3">
                    <p>Este site bloqueia visualização incorporada por questões de segurança (cookies/login).</p>
                    <Button className="w-full" onClick={() => openInNewTab(currentUrl)}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir em Nova Aba
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            )}
            <iframe
              key={iframeKey}
              src={currentUrl}
              className="w-full h-full border-0"
              title={currentTitle}
              allow="microphone; camera; clipboard-read; clipboard-write"
              onError={handleIframeError}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        </div>

        {/* Quick Renewal Panel */}
        <QuickRenewalPanel />
      </div>
    </DashboardLayout>
  );
}
