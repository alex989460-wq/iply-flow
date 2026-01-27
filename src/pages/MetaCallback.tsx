import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const META_OAUTH_STATE_KEY = "meta_oauth_state";

function getRedirectUri(): string {
  return `${window.location.origin}/meta-callback`;
}

export default function MetaCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  useEffect(() => {
    const run = async () => {
      const error = params.get("error");
      const errorDescription = params.get("error_description") || params.get("error_message");
      const code = params.get("code");
      const state = params.get("state");

      if (error) {
        setStatus("error");
        setErrorMessage(errorDescription || error);
        return;
      }

      if (!code) {
        setStatus("error");
        setErrorMessage("Código de autorização não encontrado na URL.");
        return;
      }

      const expectedState = sessionStorage.getItem(META_OAUTH_STATE_KEY);
      if (expectedState && state && state !== expectedState) {
        setStatus("error");
        setErrorMessage("State inválido. Tente conectar novamente.");
        return;
      }

      try {
        const redirectUri = getRedirectUri();
        const { data, error: fnError } = await supabase.functions.invoke("meta-oauth", {
          body: {
            action: "exchange-token",
            code,
            redirect_uri: redirectUri,
          },
        });

        if (fnError) throw fnError;
        if (!data?.success) throw new Error(data?.error || "Erro ao conectar.");

        setStatus("success");

        // Notify opener (settings page) and close popup
        try {
          window.opener?.postMessage({ type: "meta_oauth_success" }, window.location.origin);
        } catch {
          // ignore
        }

        // Some browsers block close; fallback to redirect.
        window.close();
        setTimeout(() => navigate("/settings", { replace: true }), 250);
      } catch (e: any) {
        setStatus("error");
        setErrorMessage(e?.message || "Erro ao trocar o código por token.");
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Conectando WhatsApp Oficial</CardTitle>
          <CardDescription>
            Aguarde enquanto finalizamos a autenticação…
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processando…</span>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Conectado com sucesso. Você pode fechar esta janela.
              </p>
              <Button onClick={() => navigate("/settings", { replace: true })}>
                Voltar para Configurações
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    toast({
                      title: "Redirect URI",
                      description: getRedirectUri(),
                    });
                  }}
                >
                  Ver redirect_uri
                </Button>
                <Button onClick={() => navigate("/settings", { replace: true })}>
                  Voltar para Configurações
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
