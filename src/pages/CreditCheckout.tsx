import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Coins, Copy, Loader2, QrCode } from "lucide-react";

type Server = { id: string; server_name: string };
type Tier = { server_id: string; min_qty: number; max_qty: number; unit_price: number };

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

export default function CreditCheckout() {
  const { slug } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [seller, setSeller] = useState<any>(null);
  const [providers, setProviders] = useState({ efi: true, mercadopago: false });
  const [servers, setServers] = useState<Server[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);

  const [serverId, setServerId] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<"efi" | "mercadopago">("efi");
  const [creating, setCreating] = useState(false);
  const [pix, setPix] = useState<{ order_id: string; total: number; copia: string; qr: string } | null>(null);
  const [paid, setPaid] = useState(false);

  const call = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("credit-store", { body: { slug, ...payload } });
    if (error) throw new Error(error.message);
    if (data?.error && !data?.ok) throw new Error(data.message || data.error);
    return data;
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await call({ action: "public-catalog" });
        setSeller(res.seller);
        setProviders(res.providers);
        setServers(res.servers || []);
        setTiers(res.tiers || []);
        setProvider(res.providers?.efi === false && res.providers?.mercadopago ? "mercadopago" : "efi");
        if ((res.servers || []).length) setServerId(res.servers[0].id);
      } catch {
        setInvalid(true);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const serverTiers = useMemo(
    () => tiers.filter((t) => t.server_id === serverId).sort((a, b) => a.min_qty - b.min_qty),
    [tiers, serverId],
  );

  const quote = useMemo(() => {
    const exact = serverTiers.find((t) => quantity >= t.min_qty && quantity <= t.max_qty);
    const top = [...serverTiers].sort((a, b) => b.max_qty - a.max_qty)[0];
    const tier = exact || (top && quantity > top.max_qty ? top : null);
    return tier ? { unit: Number(tier.unit_price), total: Number(tier.unit_price) * quantity } : null;
  }, [serverTiers, quantity]);

  const comprar = async () => {
    if (!email.trim()) {
      toast({ title: "Informe o seu e-mail de acesso", variant: "destructive" });
      return;
    }
    setCreating(true);
    setPaid(false);
    try {
      const res = await call({
        action: "public-create-order",
        email: email.trim(),
        server_id: serverId,
        quantity,
        provider,
      });
      setPix({
        order_id: res.order_id,
        total: Number(res.total),
        copia: res.pix_copia_cola || "",
        qr: res.qrcode_base64 || "",
      });
    } catch (e) {
      toast({ title: "Não foi possível gerar o Pix", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!pix || paid) return;
    const t = setInterval(async () => {
      try {
        const res = await call({ action: "public-order-status", order_id: pix.order_id });
        if (res?.order?.status === "paid" || res?.order?.status === "delivered") setPaid(true);
      } catch {
        /* ignora */
      }
    }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pix, paid]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (invalid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-muted-foreground">Link de créditos não encontrado.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="text-center">
          {seller?.logo_url && (
            <img src={seller.logo_url} alt={seller?.display_name || "Logo"} className="mx-auto mb-3 h-16 object-contain" />
          )}
          <h1 className="text-3xl font-bold">{seller?.headline || "Comprar créditos"}</h1>
          <p className="text-muted-foreground">
            {seller?.subheadline || `Compre seus créditos com ${seller?.display_name || "o seu revendedor"} via Pix.`}
          </p>
        </header>

        {servers.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              A tabela de créditos ainda não foi publicada. Fale com o seu revendedor.
            </CardContent>
          </Card>
        ) : paid ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />
              <h2 className="text-xl font-semibold">Pagamento confirmado!</h2>
              <p className="text-sm text-muted-foreground">Os créditos já foram lançados na sua conta.</p>
            </CardContent>
          </Card>
        ) : pix ? (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Pague {brl(pix.total)} com Pix</CardTitle>
              <CardDescription>Assim que o pagamento cair, os créditos entram automaticamente.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              {pix.qr && (
                <img
                  src={`data:image/png;base64,${pix.qr}`}
                  alt="QR Code Pix da compra de créditos"
                  className="h-60 w-60 rounded-lg bg-white p-2"
                />
              )}
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(pix.copia);
                  toast({ title: "Código Pix copiado" });
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar código Pix
              </Button>
              <Button variant="ghost" onClick={() => setPix(null)}>
                Voltar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-5">
            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-primary" /> Seu pedido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Servidor</Label>
                  <Select value={serverId} onValueChange={setServerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {servers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.server_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade de créditos</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail de acesso ao painel</Label>
                  <Input
                    type="email"
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Os créditos são lançados nessa conta assim que o Pix for confirmado.
                  </p>
                </div>
                {providers.mercadopago && providers.efi && (
                  <div className="space-y-2">
                    <Label>Forma de pagamento</Label>
                    <div className="flex gap-2">
                      <Button variant={provider === "efi" ? "default" : "outline"} onClick={() => setProvider("efi")}>
                        Pix
                      </Button>
                      <Button
                        variant={provider === "mercadopago" ? "default" : "outline"}
                        onClick={() => setProvider("mercadopago")}
                      >
                        Pix Mercado Pago
                      </Button>
                    </div>
                  </div>
                )}
                <div className="rounded-xl border p-4">
                  {quote ? (
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {quantity} × {brl(quote.unit)}
                        </p>
                        <p className="text-3xl font-bold">{brl(quote.total)}</p>
                      </div>
                      <Button size="lg" onClick={comprar} disabled={creating}>
                        {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                        Gerar Pix
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma faixa de preço cobre essa quantidade.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Tabela de valores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {serverTiers.map((t, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      quantity >= t.min_qty && quantity <= t.max_qty ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <span className="font-medium">
                      {t.min_qty} a {t.max_qty}
                    </span>
                    <span className="font-bold text-primary">{brl(t.unit_price)} cada</span>
                  </div>
                ))}
                {serverTiers.length === 0 && <p className="text-sm text-muted-foreground">Sem faixas para este servidor.</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
