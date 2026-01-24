import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function MetaCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processando autenticação...");

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      if (error) {
        setStatus("error");
        setMessage(`Erro: ${error}`);
        window.opener?.postMessage({ type: "META_OAUTH_ERROR", error }, "*");
        setTimeout(() => window.close(), 2000);
        return;
      }

      if (!code || !state) {
        setStatus("error");
        setMessage("Parâmetros ausentes");
        setTimeout(() => window.close(), 2000);
        return;
      }

      try {
        // Get current session token
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        // Call edge function to exchange the code
        const appUrl = window.location.origin;
        const { data, error: fnError } = await supabase.functions.invoke("meta-oauth", {
          body: { 
            action: "exchange_code", 
            code, 
            state,
            app_url: appUrl
          },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (fnError || data?.error) {
          throw new Error(fnError?.message || data?.error || "Erro na troca do código");
        }

        setStatus("success");
        setMessage("Conectado com sucesso!");
        window.opener?.postMessage({ type: "META_OAUTH_SUCCESS", data }, "*");
        setTimeout(() => window.close(), 1500);
      } catch (err) {
        console.error("Meta callback error:", err);
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Erro desconhecido");
        window.opener?.postMessage({ type: "META_OAUTH_ERROR", error: String(err) }, "*");
        setTimeout(() => window.close(), 3000);
      }
    };

    processCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === "loading" && (
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        )}
        {status === "success" && (
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
        )}
        {status === "error" && (
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
        )}
        <p className="text-lg font-medium text-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          Esta janela fechará automaticamente...
        </p>
      </div>
    </div>
  );
}
