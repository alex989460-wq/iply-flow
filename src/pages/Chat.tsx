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
          <div className="flex items-center justify-between px-2 md:px-3 py-1.5 border-b border-border bg-background/50">
            <h1 className="text-sm md:text-base font-semibold text-foreground">Chat</h1>
            <div className="flex items-center gap-1">
              {isMobile && (
                <Button 
                  variant={showRenewalPanel ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => setShowRenewalPanel(!showRenewalPanel)}
                  className="h-7 text-[11px] px-2"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Renovar
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={openInNewTab} className="h-7 text-[11px] px-2">
                <ExternalLink className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1" />
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
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <h2 className="text-sm font-semibold">Renovação Rápida</h2>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowRenewalPanel(false)}>
                    <X className="w-4 h-4" />
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
