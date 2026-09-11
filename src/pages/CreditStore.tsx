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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Coins, Copy, ExternalLink, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";

type Server = { id: string; server_name: string };
type Tier = { id?: string; server_id: string; min_qty: number; max_qty: number; unit_price: number; is_active?: boolean };
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
};

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const EXEMPLO = `10 a 19 = 8,00
20 a 49 = 7,00
50 a 299 = 6,00
300 a 1000 = 5,00`;

export default function CreditStore() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(0);
  const [slug, setSlug] = useState<string | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [sales, setSales] = useState<Order[]>([]);
  const [purchases, setPurchases] = useState<Order[]>([]);

  const [serverId, setServerId] = useState("");
  const [text, setText] = useState("");
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

  // Ao trocar de servidor, mostra a tabela já cadastrada dentro do campo.
  useEffect(() => {
    if (!serverId) return;
    const rows = tiers.filter((t) => t.server_id === serverId).sort((a, b) => a.min_qty - b.min_qty);
    setText(
      rows.length
        ? rows.map((t) => `${t.min_qty} a ${t.max_qty} = ${Number(t.unit_price).toFixed(2).replace(".", ",")}`).join("\n")
        : "",
    );
  }, [serverId, tiers]);

  const link = useMemo(
    () => (slug ? `${window.location.origin}/c/${slug}` : null),
    [slug],
  );

  const salvar = async () => {
    if (!serverId) return;
    setSaving(true);
    try {
      const res = await call({ action: "save-table", server_id: serverId, text });
      toast({ title: "Tabela salva", description: `${res.saved} faixas cadastradas.` });
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
      setText("");
      load();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const statusBadge = (s: string) => {
    if (s === "delivered") return <Badge className="bg-emerald-600">Creditado</Badge>;
    if (s === "paid") return <Badge className="bg-amber-600">Pago</Badge>;
    if (s === "failed") return <Badge variant="destructive">Falhou</Badge>;
    return <Badge variant="secondary">Aguardando pagamento</Badge>;
  };

  const listaPedidos = (rows: Order[], mostrarComprador: boolean) => (
    <div className="divide-y">
      {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</p>}
      {rows.map((o) => (
        <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="font-medium">
              {o.quantity} créditos — {o.server_name || "-"}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(o.created_at).toLocaleString("pt-BR")} · {o.provider === "mercadopago" ? "Mercado Pago" : "Efí"} ·{" "}
              {brl(o.total)}
              {mostrarComprador && o.buyer_email ? ` · ${o.buyer_email}` : ""}
              {o.delivery_error ? ` · ${o.delivery_error}` : ""}
            </p>
          </div>
          {statusBadge(o.status)}
        </div>
      ))}
    </div>
  );

  const preview = useMemo(() => {
    const rows: { min: number; max: number; price: number }[] = [];
    for (const line of text.split("\n")) {
      const m = line
        .trim()
        .match(/(\d[\d.]*)\s*(?:a|à|-|até|ate|\/)\s*(\d[\d.]*)\D+?(\d+(?:[.,]\d{1,2})?)\s*$/i);
      if (!m) continue;
      rows.push({
        min: parseInt(m[1].replace(/\D/g, ""), 10),
        max: parseInt(m[2].replace(/\D/g, ""), 10),
        price: Number(m[3].replace(/\./g, "").replace(",", ".")),
      });
    }
    return rows;
  }, [text]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Coins className="h-6 w-6 text-primary" /> Créditos
            </h1>
            <p className="text-sm text-muted-foreground">
              Monte a sua tabela de valores e divulgue o seu link para os clientes comprarem créditos.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border px-4 py-2 text-right">
              <p className="text-xs text-muted-foreground">Meu saldo</p>
              <p className="text-xl font-bold">{credits}</p>
            </div>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meu link de créditos</CardTitle>
            <CardDescription>Mesmo endereço do seu checkout, na área de créditos.</CardDescription>
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
                Configure o seu checkout primeiro (Config. Cobrança) para gerar o endereço do seu link.
              </p>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="tabela">
          <TabsList>
            <TabsTrigger value="tabela">Minha tabela</TabsTrigger>
            <TabsTrigger value="vendas">Vendas recebidas</TabsTrigger>
            <TabsTrigger value="compras">Minhas compras</TabsTrigger>
          </TabsList>

          <TabsContent value="tabela">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Tabela de valores</CardTitle>
                    <CardDescription>
                      Escolha o servidor e cole a tabela inteira em um único campo, uma faixa por linha.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Servidor</Label>
                      <Select value={serverId} onValueChange={setServerId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o servidor" />
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
                      <Label>Faixas e valores</Label>
                      <Textarea
                        rows={8}
                        placeholder={EXEMPLO}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Exemplo: <code>10 a 19 = 8,00</code> · <code>20 a 49 = 7,00</code> · <code>50 a 299 = 6,00</code> ·{" "}
                        <code>300 a 1000 = 5,00</code>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={salvar} disabled={saving || !serverId}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Salvar tabela deste servidor
                      </Button>
                      <Button variant="ghost" onClick={apagar} disabled={!serverId}>
                        <Trash2 className="mr-2 h-4 w-4" /> Apagar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Como vai aparecer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {preview.length === 0 && <p className="text-sm text-muted-foreground">Escreva as faixas ao lado.</p>}
                    {preview.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <span className="font-medium">
                          {r.min} a {r.max}
                        </span>
                        <span className="font-bold text-primary">{brl(r.price)} cada</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="vendas">
            <Card>
              <CardContent className="p-0">{listaPedidos(sales, true)}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compras">
            <Card>
              <CardContent className="p-0">{listaPedidos(purchases, false)}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
