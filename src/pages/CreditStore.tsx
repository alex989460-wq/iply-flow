import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Coins,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Server as ServerIcon,
  ShoppingBag,
  ShieldCheck,
  CircleDashed,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

type ServerItem = { id: string; server_name: string; panel_type?: string | null; automatic_delivery?: boolean };
type Tier = { id?: string; server_id: string; min_qty: number; max_qty: number; unit_price: number };
type Row = { min: string; max: string; price: string };
type Order = {
  id: string;
  server_name: string | null;
  quantity: number;
  total: number;
  provider: string;
  status: string;
  created_at: string;
  buyer_email: string | null;
  delivery_error: string | null;
  panel_username?: string | null;
  buyer_phone?: string | null;
  delivery_attempts?: number;
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const EXEMPLO = `10 a 19 = 8,00
20 a 49 = 7,00
50 a 299 = 6,00
300 a 1000 = 5,00`;

const parseText = (text: string): Row[] => {
  const out: Row[] = [];
  for (const line of text.split("\n")) {
    const m = line
      .trim()
      .match(/(\d[\d.]*)\s*(?:a|à|-|até|ate|\/)\s*(\d[\d.]*)\D+?(\d+(?:[.,]\d{1,2})?)\s*$/i);
    if (!m) continue;
    out.push({
      min: m[1].replace(/\D/g, ""),
      max: m[2].replace(/\D/g, ""),
      price: m[3].replace(/\./g, "").replace(",", "."),
    });
  }
  return out;
};

export default function CreditStore() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(0);
  const [slug, setSlug] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [sales, setSales] = useState<Order[]>([]);
  const [purchases, setPurchases] = useState<Order[]>([]);

  const [serverId, setServerId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [colar, setColar] = useState("");
  const [saving, setSaving] = useState(false);

  const call = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("credit-store", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error && !data?.ok) throw new Error(data.message || data.error);
    return data;
  };

  const load = async () => {
    try {
      const [cat, ord] = await Promise.all([call({ action: "catalog" }), call({ action: "my-orders" })]);
      setCredits(Number(cat.credits || 0));
      setSlug(cat.slug || null);
      setServers(cat.servers || []);
      setTiers(cat.tiers || []);
      setSales(ord.sales || []);
      setPurchases(ord.purchases || []);
      setServerId((prev) => prev || (cat.servers || [])[0]?.id || "");
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

  // Ao trocar de servidor, carrega a tabela já cadastrada nas linhas.
  useEffect(() => {
    if (!serverId) return;
    const atuais = tiers
      .filter((t) => t.server_id === serverId)
      .sort((a, b) => a.min_qty - b.min_qty)
      .map((t) => ({ min: String(t.min_qty), max: String(t.max_qty), price: String(t.unit_price) }));
    setRows(atuais);
    setColar("");
  }, [serverId, tiers]);

  const link = useMemo(() => (slug ? `${window.location.origin}/c/${slug}` : null), [slug]);
  const serverAtual = servers.find((s) => s.id === serverId);
  const comTabela = useMemo(() => new Set(tiers.map((t) => t.server_id)), [tiers]);

  const validas = rows
    .map((r) => ({ min: parseInt(r.min, 10), max: parseInt(r.max, 10), price: Number(String(r.price).replace(",", ".")) }))
    .filter((r) => r.min > 0 && r.max >= r.min && r.price > 0)
    .sort((a, b) => a.min - b.min);

  const addRow = () =>
    setRows((p) => [...p, { min: p.length ? String((parseInt(p[p.length - 1].max, 10) || 0) + 1) : "10", max: "", price: "" }]);

  const setRow = (i: number, campo: keyof Row, valor: string) =>
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [campo]: valor.replace(/[^\d.,]/g, "") } : r)));

  const importarTexto = () => {
    const lidas = parseText(colar);
    if (!lidas.length) {
      toast({ title: "Não consegui ler", description: "Use, por exemplo: 10 a 19 = 8,00", variant: "destructive" });
      return;
    }
    setRows(lidas);
    setColar("");
    toast({ title: `${lidas.length} faixas importadas`, description: "Confira e clique em salvar." });
  };

  const salvar = async () => {
    if (!serverId) return;
    if (!validas.length) {
      toast({ title: "Tabela vazia", description: "Adicione pelo menos uma faixa.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await call({
        action: "save-table",
        server_id: serverId,
        tiers: validas.map((r) => ({ min_qty: r.min, max_qty: r.max, unit_price: r.price })),
      });
      toast({ title: "Tabela salva", description: `${res.saved ?? validas.length} faixas ativas neste servidor.` });
      load();
    } catch (e) {
      toast({ title: "Não consegui salvar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const apagar = async () => {
    if (!serverId) return;
    try {
      await call({ action: "delete-table", server_id: serverId });
      setRows([]);
      load();
      toast({ title: "Tabela apagada" });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const retryDelivery = async (orderId: string) => {
    try {
      await call({ action: "retry-delivery", order_id: orderId });
      toast({ title: "Recarga concluída", description: "Os créditos foram enviados ao painel." });
      load();
    } catch (e) {
      toast({ title: "A entrega ainda não foi concluída", description: (e as Error).message, variant: "destructive" });
      load();
    }
  };

  const statusBadge = (s: string) => {
    if (s === "delivered") return <Badge className="bg-success/15 text-success hover:bg-success/15">Entregue</Badge>;
    if (s === "delivering") return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Enviando</Badge>;
    if (s === "paid" || s === "manual_required") return <Badge className="bg-warning/15 text-warning hover:bg-warning/15">Entrega manual</Badge>;
    if (s === "delivery_unknown") return <Badge className="bg-warning/15 text-warning hover:bg-warning/15">Conferir no painel</Badge>;
    if (s === "failed" || s === "delivery_failed") return <Badge variant="destructive">Falhou</Badge>;
    return <Badge variant="secondary">Aguardando pagamento</Badge>;
  };

  const listaPedidos = (lista: Order[], mostrarComprador: boolean) => (
    <div className="divide-y divide-border/60">
      {lista.length === 0 && (
        <p className="p-10 text-center text-sm text-muted-foreground">Nenhum pedido por aqui ainda.</p>
      )}
      {lista.map((o) => (
        <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
          <div className="min-w-0">
            <p className="font-semibold">
              {o.quantity} créditos <span className="text-muted-foreground">·</span> {o.server_name || "-"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {new Date(o.created_at).toLocaleString("pt-BR")} · {o.provider === "mercadopago" ? "Mercado Pago" : "Efí Pix"} ·{" "}
              <span className="font-medium text-foreground">{brl(o.total)}</span>
              {mostrarComprador && (o.panel_username || o.buyer_email) ? ` · ${o.panel_username || o.buyer_email}` : ""}
            </p>
            {o.delivery_error && <p className="mt-1 max-w-2xl text-xs text-destructive">{o.delivery_error}</p>}
          </div>
          <div className="flex items-center gap-2">{statusBadge(o.status)}{mostrarComprador && ["paid", "manual_required", "delivery_failed"].includes(o.status) && <Button size="sm" variant="outline" onClick={() => retryDelivery(o.id)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Tentar novamente</Button>}</div>
        </div>
      ))}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div className="glass-card relative overflow-hidden p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <span className="rounded-xl bg-primary/15 p-2 text-primary">
                  <Coins className="h-6 w-6" />
                </span>
                Créditos
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure valores por servidor, acompanhe pagamentos e automatize as recargas disponíveis.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-border/60 bg-card/70 px-5 py-3 text-right backdrop-blur">
                <p className="text-xs text-muted-foreground">Meu saldo</p>
                <p className="text-2xl font-bold text-primary">{credits}</p>
              </div>
              <div className="hidden rounded-xl border border-border/60 bg-card/70 px-5 py-3 text-right backdrop-blur sm:block">
                <p className="text-xs text-muted-foreground">Vendas</p>
                <p className="text-2xl font-bold">{sales.length}</p>
              </div>
              <Button variant="outline" size="icon" onClick={load} title="Atualizar">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Link do revendedor */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Meu link de créditos</CardTitle>
            <CardDescription>Exclusivo seu — os pagamentos caem na sua conta.</CardDescription>
          </CardHeader>
          <CardContent>
            {link ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={link} className="max-w-md font-mono text-sm" />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    toast({ title: "Link copiado" });
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copiar
                </Button>
                <Button variant="ghost" onClick={() => window.open(link, "_blank")}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Abrir
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure primeiro o seu checkout (Config. Cobrança) para gerar o endereço do seu link.
              </p>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="tabela">
          <TabsList>
            <TabsTrigger value="tabela">Minhas tabelas</TabsTrigger>
            <TabsTrigger value="vendas">Vendas recebidas</TabsTrigger>
            <TabsTrigger value="compras">Minhas compras</TabsTrigger>
          </TabsList>

          <TabsContent value="tabela" className="mt-4">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : servers.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-14 text-center text-sm text-muted-foreground">
                  Você ainda não tem servidores cadastrados. Cadastre um servidor para criar a tabela de créditos dele.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Seus servidores */}
                <Card className="glass-card lg:col-span-1">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Seus servidores</CardTitle>
                    <CardDescription>Cada servidor tem a sua própria tabela.</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
                    {servers.map((s) => {
                      const ativo = s.id === serverId;
                      const pronto = comTabela.has(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => setServerId(s.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                            ativo
                              ? "border-primary bg-primary/10 shadow-sm"
                              : "border-border/60 hover:border-primary/40 hover:bg-muted/50",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <ServerIcon className={cn("h-4 w-4 shrink-0", ativo ? "text-primary" : "text-muted-foreground")} />
                            <span className="min-w-0"><span className="block truncate font-medium">{s.server_name}</span><span className="flex items-center gap-1 text-[10px] text-muted-foreground">{s.automatic_delivery ? <><ShieldCheck className="h-3 w-3 text-success" /> Recarga automática</> : <><CircleDashed className="h-3 w-3" /> Entrega manual</>}</span></span>
                          </span>
                          <Badge variant={pronto ? "default" : "secondary"} className="shrink-0 text-[10px]">
                            {pronto ? "com tabela" : "sem tabela"}
                          </Badge>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Editor */}
                <Card className="glass-card lg:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Tabela de {serverAtual?.server_name || "—"}
                    </CardTitle>
                    <CardDescription>
                      Defina a faixa de quantidade e o valor de cada crédito.
                    </CardDescription>
                    <div className="pt-2">{serverAtual?.automatic_delivery ? <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15"><ShieldCheck className="h-3 w-3" /> NATV: entrega automática ativa</Badge> : <Badge variant="secondary" className="gap-1"><CircleDashed className="h-3 w-3" /> Pagamento confirmado com entrega manual</Badge>}</div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-2">
                      <div className="hidden grid-cols-[1fr_1fr_1.2fr_auto] gap-2 px-1 text-xs text-muted-foreground sm:grid">
                        <span>De</span>
                        <span>Até</span>
                        <span>Valor por crédito (R$)</span>
                        <span />
                      </div>
                      {rows.length === 0 && (
                        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Nenhuma faixa ainda. Adicione a primeira ou cole a sua tabela pronta abaixo.
                        </p>
                      )}
                      {rows.map((r, i) => (
                        <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
                          <Input
                            inputMode="numeric"
                            placeholder="10"
                            value={r.min}
                            onChange={(e) => setRow(i, "min", e.target.value)}
                          />
                          <Input
                            inputMode="numeric"
                            placeholder="19"
                            value={r.max}
                            onChange={(e) => setRow(i, "max", e.target.value)}
                          />
                          <Input
                            inputMode="decimal"
                            placeholder="8,00"
                            value={r.price}
                            onChange={(e) => setRow(i, "price", e.target.value)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}
                            title="Remover faixa"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={addRow}>
                        <Plus className="mr-2 h-4 w-4" /> Adicionar faixa
                      </Button>
                    </div>

                    {/* Prévia */}
                    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Como o cliente vai ver
                      </p>
                      {validas.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Preencha as faixas para ver a prévia.</p>
                      ) : (
                        <div className="space-y-2">
                          {validas.map((r, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm"
                            >
                              <span className="font-medium">
                                {r.min} a {r.max} créditos
                              </span>
                              <span className="font-bold text-primary">{brl(r.price)} cada</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Colar tabela pronta */}
                    <details className="rounded-xl border border-border/60 p-3">
                      <summary className="cursor-pointer text-sm font-medium">Colar tabela pronta</summary>
                      <div className="mt-3 space-y-2">
                        <Label className="text-xs text-muted-foreground">Uma faixa por linha</Label>
                        <Textarea
                          rows={5}
                          placeholder={EXEMPLO}
                          value={colar}
                          onChange={(e) => setColar(e.target.value)}
                          className="font-mono text-sm"
                        />
                        <Button variant="secondary" size="sm" onClick={importarTexto} disabled={!colar.trim()}>
                          Importar para as faixas
                        </Button>
                      </div>
                    </details>

                    <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                      <Button onClick={salvar} disabled={saving || !serverId}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Salvar tabela deste servidor
                      </Button>
                      <Button variant="ghost" onClick={apagar} disabled={!serverId || !comTabela.has(serverId)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Apagar tabela
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="vendas" className="mt-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-4 w-4" /> Vendas recebidas
                </CardTitle>
                <CardDescription>Compras feitas pelo seu link de créditos.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">{listaPedidos(sales, true)}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compras" className="mt-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Minhas compras</CardTitle>
                <CardDescription>Créditos que você comprou de outro revendedor.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">{listaPedidos(purchases, false)}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
