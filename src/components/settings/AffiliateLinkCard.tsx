import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Copy, Link2, KeyRound, Loader2 } from "lucide-react";

export default function AffiliateLinkCard() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-affiliate-code"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: row } = await supabase
        .from("reseller_access")
        .select("affiliate_code")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return (row as { affiliate_code: string | null } | null)?.affiliate_code ?? null;
    },
  });

  const code = data || "";
  const link = code ? `${window.location.origin}/auth?ref=${code}` : "";

  const copy = async (value: string, kind: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
      toast({ title: "Copiado!", description: kind === "link" ? "Link de afiliação copiado." : "Código copiado." });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="w-4 h-4 text-primary" />
          Link e código de afiliação
        </CardTitle>
        <CardDescription>
          Compartilhe com seus revendedores para que eles se cadastrem sozinhos já vinculados a você.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : !code ? (
          <p className="text-sm text-muted-foreground">Código indisponível para esta conta.</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Link de cadastro</Label>
              <div className="flex gap-2">
                <Input readOnly value={link} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copy(link, "link")}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Código de cadastro</Label>
              <div className="flex gap-2">
                <Input readOnly value={code} className="font-mono text-base tracking-[0.3em] uppercase" />
                <Button type="button" variant="outline" size="icon" onClick={() => copy(code, "code")}>
                  <KeyRound className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Quem tiver esse código pode se cadastrar direto na tela de login {copied ? "· copiado" : ""}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
