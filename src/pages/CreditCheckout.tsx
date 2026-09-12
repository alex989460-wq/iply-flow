import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, CheckCircle2, ChevronRight, Coins, Copy, Loader2, QrCode, Server, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ServerItem = { id: string; server_name: string; automatic_delivery?: boolean };
type Tier = { server_id: string; min_qty: number; max_qty: number; unit_price: number };
type Identity = { found: boolean; name?: string; message?: string };
type Pix = { order_id: string; total: number; copia: string; qr: string };
type Seller = { display_name?: string; logo_url?: string; headline?: string; subheadline?: string };

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

export default function CreditCheckout() {
  const { slug } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [providers, setProviders] = useState({ efi: true, mercadopago: false });
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [serverId, setServerId] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [email, setEmail] = useState("");
  const [panelUsername, setPanelUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [checking, setChecking] = useState(false);
  const [provider, setProvider] = useState<"efi" | "mercadopago">("efi");
  const [creating, setCreating] = useState(false);
  const [pix, setPix] = useState<Pix | null>(null);
  const [orderStatus, setOrderStatus] = useState("");

  const call = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("credit-store", { body: { slug, ...payload } });
    if (error) throw new Error(error.message);
    if (data?.error && !data?.ok) throw new Error(data.message || data.error);
    return data;
  };

  useEffect(() => {
    call({ action: "public-catalog" })
      .then((result) => {
        setSeller(result.seller);
        setProviders(result.providers);
        setServers(result.servers || []);
        setTiers(result.tiers || []);
        setProvider(result.providers?.efi === false && result.providers?.mercadopago ? "mercadopago" : "efi");
        setServerId((result.servers || [])[0]?.id || "");
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const selectedServer = servers.find((server) => server.id === serverId);
  const serverTiers = useMemo(() => tiers.filter((tier) => tier.server_id === serverId).sort((a, b) => a.min_qty - b.min_qty), [tiers, serverId]);
  const quote = useMemo(() => {
    const exact = serverTiers.find((tier) => quantity >= tier.min_qty && quantity <= tier.max_qty);
    const top = [...serverTiers].sort((a, b) => b.max_qty - a.max_qty)[0];
    const tier = exact || (top && quantity > top.max_qty ? top : null);
    return tier ? { unit: Number(tier.unit_price), total: Number((Number(tier.unit_price) * quantity).toFixed(2)) } : null;
  }, [serverTiers, quantity]);

  const identify = async () => {
    if (!panelUsername.trim() || (!phone.trim() && !email.trim())) return;
    setChecking(true);
    try {
      const result = await call({ action: "public-identify", panel_username: panelUsername.trim(), phone: phone.trim(), email: email.trim() });
      setIdentity({ found: !!result.found, name: result.name, message: result.message });
    } catch {
      setIdentity(null);
    } finally {
      setChecking(false);
    }
  };

  const buy = async () => {
    if (!panelUsername.trim() || (!phone.trim() && !email.trim())) {
      toast({ title: "Complete sua identificação", description: "Informe o usuário do painel e um telefone ou e-mail.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const result = await call({ action: "public-create-order", email: email.trim(), panel_username: panelUsername.trim(), phone: phone.trim(), server_id: serverId, quantity, provider });
      setPix({ order_id: result.order_id, total: Number(result.total), copia: result.pix_copia_cola || "", qr: result.qrcode_base64 || "" });
      setOrderStatus("pending");
    } catch (error) {
      toast({ title: "Não foi possível gerar o Pix", description: (error as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!pix || ["delivered", "manual_required", "delivery_failed"].includes(orderStatus)) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await call({ action: "public-order-status", order_id: pix.order_id });
        setOrderStatus(result?.order?.status || "pending");
      } catch { /* mantém a consulta ativa */ }
    }, 6000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pix, orderStatus]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-primary" /></main>;
  if (invalid) return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="glass-card max-w-sm p-8 text-center"><Coins className="mx-auto mb-4 h-10 w-10 text-muted-foreground" /><h1 className="text-xl font-bold">Link indisponível</h1><p className="mt-2 text-sm text-muted-foreground">Solicite um novo link ao seu revendedor.</p></div></main>;

  const finished = ["delivered", "manual_required", "delivery_failed", "delivery_unknown"].includes(orderStatus);

  return (
    <main className="min-h-screen bg-background px-3 py-5 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="glass-card relative overflow-hidden p-5 sm:p-7">
          <div className="relative flex items-center gap-4">
            {seller?.logo_url ? <img src={seller.logo_url} alt={seller?.display_name || "Logo"} className="h-14 w-14 rounded-xl object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 text-primary"><Coins className="h-7 w-7" /></div>}
            <div className="min-w-0 flex-1">
              <Badge variant="secondary" className="mb-2 gap-1"><Sparkles className="h-3 w-3" /> Recarga de créditos</Badge>
              <h1 className="truncate text-2xl font-bold sm:text-3xl">{seller?.headline || "Comprar créditos"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{seller?.subheadline || `Pagamento rápido e seguro com ${seller?.display_name || "seu revendedor"}.`}</p>
            </div>
          </div>
        </header>

        {servers.length === 0 ? (
          <section className="glass-card p-10 text-center text-sm text-muted-foreground">A tabela de créditos ainda não foi publicada.</section>
        ) : finished ? (
          <section className="glass-card flex flex-col items-center gap-3 p-10 text-center animate-scale-in">
            <div className={cn("flex h-16 w-16 items-center justify-center rounded-full", orderStatus === "delivered" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}><CheckCircle2 className="h-9 w-9" /></div>
            <h2 className="text-2xl font-bold">{orderStatus === "delivered" ? "Recarga concluída" : "Pagamento confirmado"}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{orderStatus === "delivered" ? "Os créditos já foram enviados ao seu usuário no painel." : "Seu pagamento foi confirmado e o vendedor concluirá a entrega no painel."}</p>
          </section>
        ) : pix ? (
          <section className="glass-card mx-auto max-w-xl p-5 sm:p-7">
            <div className="mb-5 text-center"><Badge className="mb-2">Pix gerado</Badge><h2 className="text-2xl font-bold">Pague {brl(pix.total)}</h2><p className="text-sm text-muted-foreground">A confirmação e a entrega aparecem automaticamente.</p></div>
            <div className="flex flex-col items-center gap-4">
              {pix.qr && <img src={`data:image/png;base64,${pix.qr}`} alt="QR Code Pix" className="h-56 w-56 rounded-xl border border-border/60 bg-card p-2" />}
              <Button className="w-full" onClick={() => { navigator.clipboard.writeText(pix.copia); toast({ title: "Código Pix copiado" }); }}><Copy className="mr-2 h-4 w-4" /> Copiar código Pix</Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando confirmação do pagamento</div>
              <Button variant="ghost" onClick={() => setPix(null)}>Voltar ao pedido</Button>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
            <section className="glass-card overflow-hidden">
              <div className="border-b border-border/50 p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><UserRound className="h-5 w-5 text-primary" /> Monte sua recarga</h2><p className="mt-1 text-sm text-muted-foreground">Identifique sua conta e escolha a quantidade.</p></div>
              <div className="space-y-5 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Servidor</Label><Select value={serverId} onValueChange={setServerId}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{servers.map((server) => <SelectItem key={server.id} value={server.id}>{server.server_name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Quantidade de créditos</Label><Input className="h-11" type="number" min={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></div>
                </div>
                <div className="space-y-2"><Label>Usuário da sua revenda no painel</Label><Input className="h-11" placeholder="Ex.: minha_revenda" value={panelUsername} onChange={(event) => { setPanelUsername(event.target.value); setIdentity(null); }} onBlur={identify} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label>WhatsApp</Label><Input className="h-11" inputMode="tel" placeholder="(11) 99999-9999" value={phone} onChange={(event) => { setPhone(event.target.value); setIdentity(null); }} onBlur={identify} /></div>
                  <div className="space-y-2"><Label>E-mail opcional</Label><Input className="h-11" type="email" placeholder="voce@exemplo.com" value={email} onChange={(event) => { setEmail(event.target.value); setIdentity(null); }} onBlur={identify} /></div>
                </div>
                {checking && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Localizando sua conta...</p>}
                {identity?.found && <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle2 className="h-4 w-4 shrink-0" /> Conta localizada: <strong>{identity.name}</strong></div>}
                {identity && !identity.found && <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{identity.message}</p>}
                {providers.efi && providers.mercadopago && <div className="space-y-2"><Label>Pagamento</Label><div className="grid grid-cols-2 gap-2"><Button variant={provider === "efi" ? "default" : "outline"} onClick={() => setProvider("efi")}>Pix Efí</Button><Button variant={provider === "mercadopago" ? "default" : "outline"} onClick={() => setProvider("mercadopago")}>Mercado Pago</Button></div></div>}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="glass-card p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Tabela de valores</h2>{selectedServer?.automatic_delivery ? <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15"><ShieldCheck className="h-3 w-3" /> Automática</Badge> : <Badge variant="secondary">Entrega assistida</Badge>}</div><div className="space-y-2">{serverTiers.map((tier) => { const active = quantity >= tier.min_qty && quantity <= tier.max_qty; return <div key={`${tier.min_qty}-${tier.max_qty}`} className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm", active ? "border-primary bg-primary/10" : "border-border/50 bg-card/60")}><span className="flex items-center gap-2 font-medium">{active && <Check className="h-4 w-4 text-primary" />}{tier.min_qty}–{tier.max_qty}</span><strong className="text-primary">{brl(tier.unit_price)} <span className="text-xs font-normal text-muted-foreground">/ cr.</span></strong></div>; })}</div></section>
              <section className="glass-card sticky top-4 p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Server className="h-4 w-4" /> {selectedServer?.server_name}</div>{quote ? <><div className="my-4 border-y border-border/50 py-4"><p className="text-xs text-muted-foreground">{quantity} créditos × {brl(quote.unit)}</p><p className="mt-1 text-3xl font-bold">{brl(quote.total)}</p></div><Button size="lg" className="w-full" onClick={buy} disabled={creating}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />} Gerar Pix <ChevronRight className="ml-auto h-4 w-4" /></Button></> : <p className="mt-4 text-sm text-muted-foreground">Escolha uma quantidade coberta pela tabela.</p>}</section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}