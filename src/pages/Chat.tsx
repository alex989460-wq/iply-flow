import DashboardLayout from '@/components/layout/DashboardLayout';
import { MessageCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ZAP_RESPONDER_URL = 'https://chat.zapresponder.com.br/';

export default function Chat() {
  const openInNewTab = () => {
    window.open(ZAP_RESPONDER_URL, '_blank');
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in h-[calc(100vh-120px)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <MessageCircle className="w-8 h-8 text-primary" />
              Chat
            </h1>
            <p className="text-muted-foreground mt-1">Converse com seus clientes pelo WhatsApp</p>
          </div>
          
          <Button variant="outline" size="sm" onClick={openInNewTab}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Abrir em Nova Aba
          </Button>
        </div>

        <div className="relative w-full h-full rounded-lg overflow-hidden border border-border bg-card">
          <iframe
            src={ZAP_RESPONDER_URL}
            className="w-full h-full min-h-[600px]"
            title="Zap Responder Chat"
            allow="microphone; camera; clipboard-read; clipboard-write"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
