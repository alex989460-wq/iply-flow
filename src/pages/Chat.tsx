import DashboardLayout from '@/components/layout/DashboardLayout';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ZAP_RESPONDER_URL = 'https://chat.zapresponder.com.br/';

export default function Chat() {
  const openInNewTab = () => {
    window.open(ZAP_RESPONDER_URL, '_blank');
  };

  return (
    <DashboardLayout noPadding>
      <div className="flex flex-col h-[calc(100vh-56px)] animate-fade-in">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/50">
          <h1 className="text-lg font-semibold text-foreground">Chat</h1>
          <Button variant="ghost" size="sm" onClick={openInNewTab}>
            <ExternalLink className="w-4 h-4 mr-1" />
            Nova Aba
          </Button>
        </div>

        <div className="flex-1 w-full overflow-hidden">
          <iframe
            src={ZAP_RESPONDER_URL}
            className="w-full h-full border-0"
            title="Zap Responder Chat"
            allow="microphone; camera; clipboard-read; clipboard-write"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
