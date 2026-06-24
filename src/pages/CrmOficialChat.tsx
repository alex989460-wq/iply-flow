import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import QuickRenewalPanel from "@/components/chat/QuickRenewalPanel";

const CRM_BASE = "https://crmapioficial.lovable.app";

export default function CrmOficialChat() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-4rem)] flex p-0 gap-0 overflow-hidden">
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
            <div className="flex-1 overflow-hidden bg-background">
              <iframe
                ref={iframeRef}
                title="Chat"
                className="w-full h-full border-0 block"
                referrerPolicy="no-referrer"
                allow="clipboard-read; clipboard-write; microphone; camera; autoplay; fullscreen"
              />
            </div>
            <div className="hidden xl:block w-[340px] shrink-0 overflow-y-auto border-l bg-background">
              <QuickRenewalPanel initialPhone={null} />
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
