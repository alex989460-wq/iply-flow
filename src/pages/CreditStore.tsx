import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Coins, Copy, Loader2, Plus, QrCode, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";

type Server = { id: string; server_name: string; host?: string };
type Tier = {
  id: string;
  server_id: string;
  min_qty: number;
  max_qty: number;
  unit_price: number;
  is_active: boolean;
};
type Order = {
  id: string;
  server_name: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  provider: string;
  status: string;
  created_at: string;
  delivery_error: string | null;
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

export default function CreditStore() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState(0);
  const [servers, setServers] = useState<Server[]>([]);
  const [allServers, setAllServers] = useState<Server[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  const [serverId, setServerId] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [provider, setProvider] = useState<"efi" | "mercadopago">("efi");
  const [creating, setCreating] = useState(false);

  const [pix, setPix] = useState<{ order_id: string; total: number; copia: string; qr: string } | null>(null);
  const [paid, setPaid] = useState(false);

  const [tierForm, setTierForm] = useState<Partial<Tier> | null>(null);
  const [savingTier, setSavingTier] = useState(false);

  const call = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("credit-store", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error && !data?.ok) throw new Error(data.message || data.error);
    return data;
  };

  const load = async () => {
    try {
      const [cat, ord] = await Promise.all([call({ action: "catalog" }), call({ action: "my-orders" })]);
      setIsAdmin(!!cat.is_admin);
      setCredits(Number(cat.credits || 0));
      setServers(cat.servers || []);
      setAllServers(cat.all_servers || cat.servers || []);
      setTiers(cat.tiers || []);
      setOrders(ord.orders || []);
      if (!serverId && (cat.servers || []).length) setServerId(cat.servers[0].id);
    } catch (e) {
      toast({ title: "Erro ao carregar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serverTiers = useMemo(
    () => tiers.filter((t) => t.server_id === serverId).sort((a, b) => a.min_qty - b.min_qty),
    [tiers, serverId],
  );

  const quote = useMemo(() => {
    const active = serverTiers.filter((t) => t.is_active !== false);
    const exact = active.find((t) => quantity >= t.min_qty && quantity <= t.max_qty);
    const top = [...active].sort((a, b) => b.max_qty - a.max_qty)[0];
    const tier = exact || (top && quantity > top.max_qty ? top : null);
    if (!tier) return null;
    return { unit: Number(tier.unit_price), total: Number(tier.unit_price) * quantity };
  }, [serverTiers, quantity]);

  const handleBuy = async () => {
    if (!serverId || quantity < 1) return;
    setCreating(true);
    setPaid(false);
    try {
      const res = await call({ action: "create-order", server_id: serverId, quantity, provider });
      setPix({
        order_id: res.order_id,
        total: Number(res.total),
        copia: res.pix_copia_cola || "",
        qr: res.qrcode_base64 || "",
      });
      load();
    } catch (e) {
      toast({ title: "Não foi possível gerar o Pix", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // Polling do pagamento enquanto o Pix estiver aberto.
  useEffect(() => {
    if (!pix || paid) return;
    const timer = setInterval(async () => {
      try {
        const res = await call({ action: "order-status", order_id: pix.order_id });
        const st = res?.order?.status;
        if (st === "paid" || st === "delivered") {
          setPaid(true);
          load();
          toast({ title: "Pagamento confirmado!", description: "Seus créditos já foram lançados." });
        }
      } catch {
        /* ignora */
      }
    }, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pix, paid]);

  const saveTier = async () => {
    if (!tierForm?.server_id || !tierForm.unit_price) {
      toast({ title: "Preencha servidor e valor", variant: "destructive" });
      return;
    }
    setSavingTier(true);
    try {
      await call({ action: "save-tier", ...tierForm });
      setTierForm(null);
      load();
      toast({ title: "Faixa salva" });
    } catch (e) {
      toast({ title: "Erro ao salvar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingTier(false);
    }
  };

  const deleteTier = async (id: string) => {
    try {
      await call({ action: "delete-tier", id });
      load();
    } catch (e) {
      toast({ title: "Erro ao excluir", description: (e as Error).message, variant: "destructive" });
    }
  };

  const statusBadge = (s: string) => {
    if (s === "delivered") return <Badge className="bg-emerald-600">Creditado</Badge>;
    if (s === "paid") return <Badge className="bg-amber-600">Pago</Badge>;
    if (s === "failed") return <Badge variant="destructive">Falhou</Badge>;
    return <Badge variant="secondary">Aguardando pagamento</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Coins className="h-6 w-6 text-primary" /> Comprar Créditos
            </h1>
            <p className="text-sm text-muted-foreground">
              Escolha o servidor, informe a quantidade e pague via Pix. Os créditos entram automaticamente.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border px-4 py-2 text-right">
              <p className="text-xs text-muted-foreground">Saldo atual</p>
              <p className="text-xl font-bold">{credits}</p>
            </div>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="comprar">
          <TabsList>
            <TabsTrigger value="comprar">Comprar</TabsTrigger>
            <TabsTrigger value="pedidos">Meus pedidos</TabsTrigger>
            {isAdmin && <TabsTrigger value="tabela">Tabela de preços</TabsTrigger>}
          </TabsList>

          <TabsContent value="comprar" className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : servers.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Nenhuma tabela de créditos disponível ainda. Fale com o administrador.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Novo pedido</CardTitle>
                    <CardDescription>O valor é calculado automaticamente pela faixa de quantidade.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
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
                    </div>

                    <div className="space-y-2">
                      <Label>Forma de pagamento</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={provider === "efi" ? "default" : "outline"}
                          onClick={() => setProvider("efi")}
                        >
                          Pix (Efí)
                        </Button>
                        <Button
                          type="button"
                          variant={provider === "mercadopago" ? "default" : "outline"}
                          onClick={() => setProvider("mercadopago")}
                        >
                          Pix (Mercado Pago)
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border p-4">
                      {quote ? (
                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {quantity} créditos × {brl(quote.unit)}
                            </p>
                            <p className="text-3xl font-bold">{brl(quote.total)}</p>
                          </div>
                          <Button onClick={handleBuy} disabled={creating} size="lg">
                            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                            Gerar Pix
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma faixa de preço cobre essa quantidade neste servidor.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Tabela do servidor</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {serverTiers.length === 0 && (
                      <p className="text-sm text-muted-foreground">Sem faixas cadastradas.</p>
                    )}
                    {serverTiers.map((t) => (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                          quantity >= t.min_qty && quantity <= t.max_qty ? "border-primary bg-primary/5" : ""
                        }`}
                      >
                        <span>
                          {t.min_qty} a {t.max_qty} créditos
                        </span>
                        <span className="font-semibold">{brl(t.unit_price)} / un.</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="pedidos">
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {orders.length === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</p>
                  )}
                  {orders.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div>
                        <p className="font-medium">
                          {o.quantity} créditos — {o.server_name || "-"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("pt-BR")} ·{" "}
                          {o.provider === "mercadopago" ? "Mercado Pago" : "Efí"} · {brl(o.total)}
                          {o.delivery_error ? ` · ${o.delivery_error}` : ""}
                        </p>
                      </div>
                      {statusBadge(o.status)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="tabela">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Tabela de valores por servidor</CardTitle>
                    <CardDescription>Ex.: de 10 a 50 créditos = R$ 10,00 cada.</CardDescription>
                  </div>
                  <Button onClick={() => setTierForm({ server_id: serverId || allServers[0]?.id, min_qty: 1, max_qty: 10, unit_price: 10, is_active: true })}>
                    <Plus className="mr-2 h-4 w-4" /> Nova faixa
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tiers.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma faixa cadastrada.</p>}
                  {tiers.map((t) => {
                    const srv = allServers.find((s) => s.id === t.server_id);
                    return (
                      <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                        <div className="text-sm">
                          <span className="font-medium">{srv?.server_name || "Servidor removido"}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {t.min_qty} a {t.max_qty} créditos · {brl(t.unit_price)} / un.
                          </span>
                          {!t.is_active && <Badge variant="secondary" className="ml-2">Inativa</Badge>}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setTierForm(t)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteTier(t.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Pix gerado */}
      <Dialog open={!!pix} onOpenChange={(o) => !o && setPix(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{paid ? "Pagamento confirmado" : "Pague com Pix"}</DialogTitle>
          </DialogHeader>
          {paid ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-sm">Seus créditos já foram lançados na sua conta.</p>
              <Button onClick={() => setPix(null)}>Fechar</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-2xl font-bold">{brl(pix?.total || 0)}</p>
              {pix?.qr && (
                <img
                  src={`data:image/png;base64,${pix.qr}`}
                  alt="QR Code Pix para pagamento dos créditos"
                  className="mx-auto h-56 w-56 rounded-lg bg-white p-2"
                />
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(pix?.copia || "");
                  toast({ title: "Código Pix copiado" });
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar código Pix
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Assim que o pagamento cair, os créditos entram automaticamente.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Faixa (admin) */}
      <Dialog open={!!tierForm} onOpenChange={(o) => !o && setTierForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tierForm?.id ? "Editar faixa" : "Nova faixa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Servidor</Label>
              <Select
                value={tierForm?.server_id || ""}
                onValueChange={(v) => setTierForm((f) => ({ ...(f || {}), server_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {allServers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.server_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>De</Label>
                <Input
                  type="number"
                  value={tierForm?.min_qty ?? 1}
                  onChange={(e) => setTierForm((f) => ({ ...(f || {}), min_qty: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Até</Label>
                <Input
                  type="number"
                  value={tierForm?.max_qty ?? 10}
                  onChange={(e) => setTierForm((f) => ({ ...(f || {}), max_qty: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Valor un.</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={tierForm?.unit_price ?? 0}
                  onChange={(e) => setTierForm((f) => ({ ...(f || {}), unit_price: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Faixa ativa</Label>
              <Switch
                checked={tierForm?.is_active !== false}
                onCheckedChange={(v) => setTierForm((f) => ({ ...(f || {}), is_active: v }))}
              />
            </div>
            <Button className="w-full" onClick={saveTier} disabled={savingTier}>
              {savingTier && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar faixa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
