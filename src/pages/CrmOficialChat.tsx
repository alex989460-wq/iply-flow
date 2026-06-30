import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Loader2, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import QuickRenewalPanel from "@/components/chat/QuickRenewalPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import PendingManualRenewalsFloat from "@/components/PendingManualRenewalsFloat";

const CRM_BASE = "https://crmapioficial.lovable.app";

export default function CrmOficialChat({ embed = false }: { embed?: boolean } = {}) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);


  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("crm_oficial_settings")
        .select("api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.api_key) setApiKey(data.api_key);
      setLoading(false);
    })();
  }, []);

  // Inject the URL via ref so the API key never appears in JSX/HTML source.
  useEffect(() => {
    if (!apiKey || !iframeRef.current) return;
    const url = `${CRM_BASE}/embed/inbox?token=${encodeURIComponent(apiKey)}`;
    iframeRef.current.src = url;
  }, [apiKey]);

  // Lock body scroll while chat is mounted (improves mobile iframe UX).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const __content = (
    <>

      <div className="w-full flex overflow-hidden bg-background h-[calc(100dvh-4rem)] lg:h-[100dvh] relative">

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !apiKey ? (
          <Card className="flex-1 flex items-center justify-center p-6 m-3">
            <div className="text-center max-w-md space-y-3">
              <p className="text-sm text-muted-foreground">
                Configure sua API key do CRM Oficial em Configurações para carregar o chat.
              </p>
              <Button asChild>
                <Link to="/settings">Ir para Configurações</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              title="Chat"
              className="flex-1 h-full border-0 block min-w-0"
              referrerPolicy="no-referrer"
              allow="clipboard-read; clipboard-write; microphone; camera; autoplay; fullscreen; geolocation"
            />

            {/* Desktop: side panel always open */}
            {!isMobile && (
              <div className="w-[420px] xl:w-[460px] h-full border-l bg-background flex flex-col shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 border-b text-sm font-semibold">
                  <Zap className="h-4 w-4 text-emerald-500" />
                  Renovação rápida
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <QuickRenewalPanel />
                </div>
              </div>
            )}


            {/* Mobile: bottom sheet trigger */}
            {isMobile && (
              <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
                <SheetTrigger asChild>
                  <Button
                    className="fixed bottom-4 right-4 z-30 shadow-xl gap-2 bg-emerald-600 hover:bg-emerald-700 rounded-full h-12 px-4"
                    size="sm"
                  >
                    <Zap className="h-4 w-4" />
                    Renovar
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[92dvh] p-0 flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Zap className="h-4 w-4 text-emerald-500" />
                      Renovação rápida
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <QuickRenewalPanel isMobile onClose={() => setPanelOpen(false)} />
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </>
        )}
      </div>
      <PendingManualRenewalsFloat />
    </DashboardLayout>
  );
}
