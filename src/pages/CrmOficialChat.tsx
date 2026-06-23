import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import QuickRenewalPanel from "@/components/chat/QuickRenewalPanel";

const CRM_BASE = "https://crmapioficial.lovable.app";

export default function CrmOficialChat() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const embedUrl = apiKey
    ? `${CRM_BASE}/embed/inbox?token=${encodeURIComponent(apiKey)}`
    : null;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Chat CRM Oficial</h1>
            <p className="text-xs text-muted-foreground">
              Incorporado via iframe do CRM Oficial usando sua API key
            </p>
          </div>
          {embedUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={embedUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Abrir em nova aba
              </a>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !embedUrl ? (
          <Card className="flex-1 flex items-center justify-center p-6">
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
          <Card className="flex-1 overflow-hidden p-0">
            <iframe
              src={embedUrl}
              title="CRM Oficial Inbox"
              className="w-full h-full border-0"
              allow="clipboard-read; clipboard-write; microphone; camera; autoplay"
            />
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
