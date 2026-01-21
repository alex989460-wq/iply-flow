import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ExternalLink, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import QuickRenewalPanel from '@/components/chat/QuickRenewalPanel';
import { useIsMobile } from '@/hooks/use-mobile';

const ZAP_RESPONDER_URL = 'https://chat.zapresponder.com.br/';

export default function Chat() {
  const isMobile = useIsMobile();
  const [showRenewalPanel, setShowRenewalPanel] = useState(false);

  const openInNewTab = () => {
    window.open(ZAP_RESPONDER_URL, '_blank');
  };

  return (
    <DashboardLayout noPadding>
      <div className="flex flex-col md:flex-row h-[calc(100vh-56px)] animate-fade-in">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-border bg-background/50">
            <h1 className="text-base md:text-lg font-semibold text-foreground">Chat</h1>
            <div className="flex items-center gap-1 md:gap-2">
              {isMobile && (
                <Button 
                  variant={showRenewalPanel ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => setShowRenewalPanel(!showRenewalPanel)}
                  className="h-8 text-xs md:text-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Renovar
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={openInNewTab} className="h-8 text-xs md:text-sm">
                <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                <span className="hidden sm:inline">Nova Aba</span>
              </Button>
            </div>
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

        {/* Quick Renewal Panel - Desktop: always visible, Mobile: overlay */}
        {isMobile ? (
          showRenewalPanel && (
            <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h2 className="text-base font-semibold">Renovação Rápida</h2>
                  <Button variant="ghost" size="icon" onClick={() => setShowRenewalPanel(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-auto">
                  <QuickRenewalPanel isMobile onClose={() => setShowRenewalPanel(false)} />
                </div>
              </div>
            </div>
          )
        ) : (
          <QuickRenewalPanel />
        )}
      </div>
    </DashboardLayout>
  );
}
