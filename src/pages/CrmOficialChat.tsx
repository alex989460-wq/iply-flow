import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Loader2, Zap } from "lucide-react";
import QuickRenewalPanel from "@/components/chat/QuickRenewalPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import PendingManualRenewalsFloat from "@/components/PendingManualRenewalsFloat";

const CRM_BASE = "https://zapcrm.top";
// Cache é sempre atrelado ao usuário logado para nunca reaproveitar
// a chave (e portanto o inbox) de outra revenda na mesma aba.
let cachedCrm: { userId: string; apiKey: string } | null = null;

export default function CrmOficialChat({ embed = false, active = true }: { embed?: boolean; active?: boolean } = {}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeLoadedUrlRef = useRef<string | null>(null);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        cachedCrm = null;
        setUserId(null);
        setApiKey(null);
        setLoading(false);
        return;
      }
      setUserId(user.id);
      if (cachedCrm?.userId === user.id) {
        setApiKey(cachedCrm.apiKey);
        setLoading(false);
        return;
      }
      // Usuário diferente do cache: descarta a chave anterior imediatamente.
      cachedCrm = null;
      setApiKey(null);
      iframeLoadedUrlRef.current = null;
      let { data } = await supabase
        .from("crm_oficial_settings")
        .select("api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data?.api_key) {
        const { data: provisioned } = await supabase.functions.invoke("crm-oficial-sync", {
          body: { action: "ensure-key" },
        });
        if (provisioned?.results?.api_key?.saved) {
          const refreshed = await supabase
            .from("crm_oficial_settings")
            .select("api_key")
            .eq("user_id", user.id)
            .maybeSingle();
          data = refreshed.data;
        }
      }
      if (cancelled) return;
      if (data?.api_key) {
        cachedCrm = { userId: user.id, apiKey: data.api_key };
        setApiKey(data.api_key);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Limpa o cache/iframe quando a sessão muda (logout ou troca de conta).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id ?? null;
      if (nextId !== userId) {
        cachedCrm = null;
        iframeLoadedUrlRef.current = null;
        if (iframeRef.current) iframeRef.current.src = "about:blank";
        setApiKey(null);
        setUserId(nextId);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [userId]);

  // Inject only once per mounted iframe; after ZapCRM opens a chat internally,
  // never force src back to /embed/inbox on normal React re-renders.
  useEffect(() => {
    if (!apiKey || !iframeRef.current) return;
    const url = `${CRM_BASE}/embed/inbox?token=${encodeURIComponent(apiKey)}`;
    if (iframeLoadedUrlRef.current === url) return;
    iframeRef.current.src = url;
    iframeLoadedUrlRef.current = url;
  }, [apiKey]);


  // Lock body scroll and disable overscroll to prevent flicker when scrolling inside iframe.
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, []);

  const __content = (
    <>

      <div
        className={`w-full min-h-0 overflow-hidden bg-background relative flex flex-col ${embed ? "h-full" : "h-screen"}`}
      >
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 relative w-full min-w-0 min-h-0 overflow-hidden">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !apiKey ? (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Preparando o CRM Oficial…
                </div>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                title="Chat"
                className="absolute inset-0 h-full w-full border-0 block"
                referrerPolicy="no-referrer"
                allow="clipboard-read; clipboard-write; microphone; camera; autoplay; fullscreen; geolocation"
              />
            )}
          </div>

          {apiKey && !isMobile && (
            <aside className="w-[420px] xl:w-[460px] h-full border-l border-border bg-background flex flex-col shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border text-sm font-semibold">
                <Zap className="h-4 w-4 text-emerald-500" />
                Renovação rápida
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <QuickRenewalPanel />
              </div>
            </aside>
          )}
        </div>

        {apiKey && isMobile && (
          <div className="border-t border-border bg-card shrink-0">
            <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-none border-b border-border hover:bg-accent/50 transition-colors"
                >
                  <Zap className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <span className="font-semibold text-xs uppercase tracking-wider">Renovação Rápida</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-[500px] p-0 border-l border-border">
                <QuickRenewalPanel 
                  onClose={() => setPanelOpen(false)} 
                />
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
      {!embed && <PendingManualRenewalsFloat />}
    </>

  );
  return embed ? __content : <DashboardLayout noPadding>{__content}</DashboardLayout>;
}

