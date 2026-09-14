import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, RefreshCw, Share2 } from "lucide-react";

const CRM_BASE = "https://zapcrm.top";

let cachedCrm: { userId: string; apiKey: string } | null = null;

export default function CrmOficialSocial({ embed = false }: { embed?: boolean } = {}) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        cachedCrm = null;
        setApiKey(null);
        setLoading(false);
        return;
      }
      if (cachedCrm?.userId === user.id) {
        setApiKey(cachedCrm.apiKey);
        setLoading(false);
        return;
      }
      cachedCrm = null;
      setApiKey(null);
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

  // Trava o scroll da página para o iframe ocupar a tela sem "pulos".
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  const url = apiKey ? `${CRM_BASE}/embed/social?token=${encodeURIComponent(apiKey)}` : "";

  const content = (
    <div className={`w-full min-h-0 overflow-hidden bg-background relative flex flex-col ${embed ? "h-full" : "h-screen"}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-background/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Share2 className="w-4 h-4 text-emerald-500" />
          </div>
          <h1 className="text-sm md:text-base font-semibold truncate">Social Mídia</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={!url}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={!url}
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">Nova aba</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 relative w-full min-w-0 min-h-0 overflow-hidden">
        {loading || !apiKey ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {loading ? "Carregando…" : "Preparando a Social Mídia…"}
            </div>
          </div>
        ) : (
          <iframe
            key={reloadKey}
            ref={iframeRef}
            src={url}
            title="Social Mídia"
            className="absolute inset-0 h-full w-full border-0 block"
            referrerPolicy="no-referrer"
            allow="clipboard-read; clipboard-write; camera; microphone; autoplay; fullscreen"
          />
        )}
      </div>
    </div>
  );

  return embed ? content : <DashboardLayout noPadding>{content}</DashboardLayout>;
}
