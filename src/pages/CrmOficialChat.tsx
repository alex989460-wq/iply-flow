import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Loader2, Zap, ChevronLeft } from "lucide-react";
import QuickRenewalPanel from "@/components/chat/QuickRenewalPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
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
            <aside 
              className={cn(
                "h-full border-l border-border bg-card/40 backdrop-blur-3xl flex flex-col shrink-0 transition-all duration-500 ease-in-out relative group shadow-2xl",
                panelCollapsed ? "w-14" : "w-[420px] xl:w-[460px]"
              )}
            >
              {/* Modern Glass Toggle Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPanelCollapsed(!panelCollapsed)}
                className="absolute -left-5 top-24 z-20 w-10 h-10 rounded-2xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-95"
              >
                <ChevronLeft className={cn("h-5 w-5 text-primary transition-transform duration-500", panelCollapsed && "rotate-180")} />
              </Button>

              <div className={cn(
                "flex items-center gap-3 px-5 py-4 border-b border-border/50 bg-background/20 transition-opacity duration-300",
                panelCollapsed ? "opacity-0 invisible" : "opacity-100"
              )}>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center shadow-inner">
                  <Zap className="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
                </div>
                <span className="tracking-[0.2em] uppercase text-[10px] font-black text-foreground/70">Renovação rápida</span>
              </div>
              
              <div className={cn(
                "flex-1 min-h-0 overflow-hidden transition-all duration-500",
                panelCollapsed ? "opacity-0 invisible scale-95" : "opacity-100 scale-100"
              )}>
                <QuickRenewalPanel initialPhone={null} />
              </div>

              {panelCollapsed && (
                <div className="absolute inset-0 flex flex-col items-center pt-6 pointer-events-none space-y-4">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-emerald-500/40" />
                  </div>
                  <div className="w-px h-full bg-gradient-to-b from-emerald-500/20 to-transparent" />
                </div>
              )}
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

