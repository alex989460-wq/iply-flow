import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calculator, MessageSquare, Megaphone, Bell, Headphones, ShieldCheck, Wifi, QrCode, CircleDollarSign, Search, Eye, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWhatsappPricing, WhatsAppPriceCategory } from '@/hooks/use-whatsapp-pricing';

interface CostRow {
  id: string;
  customer_id: string | null;
  contact_id: string | null;
  conversation_id: string;
  message_id: string;
  channel: string;
  direction: string;
  category: string | null;
  billing_status: string;
  cost_amount: number;
  cost_currency: string;
  message_timestamp: string;
}

interface CustomerSummary {
  key: string;
  customerId: string | null;
  contactId: string | null;
  name: string;
  phone: string;
  total: number;
  inbound: number;
  outbound: number;
  official: number;
  unofficial: number;
  charged: number;
  unknown: number;
  cost: number;
  lastMessage: string;
  lastOfficial: string | null;
  lastUnofficial: string | null;
  messages: CostRow[];
}

type Period = 'today' | '7d' | '30d' | 'month' | 'custom';

const categoryMeta: Record<WhatsAppPriceCategory, { label: string; description: string; icon: typeof MessageSquare; color: string }> = {
  marketing: { label: 'Marketing', description: 'Promoções, ofertas e novidades', icon: Megaphone, color: 'text-orange-500' },
  utility: { label: 'Utilidade', description: 'Cobranças, confirmações e atualizações', icon: Bell, color: 'text-emerald-500' },
  authentication: { label: 'Autenticação', description: 'Códigos e validação de identidade', icon: MessageSquare, color: 'text-blue-500' },
  service: { label: 'Serviço', description: 'Atendimento iniciado pelo cliente', icon: Headphones, color: 'text-purple-500' },
  business_agent: { label: 'Agente comercial', description: 'Categoria informada pela plataforma', icon: MessageSquare, color: 'text-cyan-500' },
  other: { label: 'Outra', description: 'Categoria informada pela integração', icon: MessageSquare, color: 'text-muted-foreground' },
};

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const number = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';

function periodBounds(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  const end = new Date(now);
  end.setMilliseconds(end.getMilliseconds() + 1);
  let start = new Date(now);
  if (period === 'today') start.setHours(0, 0, 0, 0);
  if (period === '7d') start = new Date(now.getTime() - 7 * 86400000);
  if (period === '30d') start = new Date(now.getTime() - 30 * 86400000);
  if (period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'custom') {
    start = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(0);
    if (customTo) {
      const customEnd = new Date(`${customTo}T00:00:00`);
      customEnd.setDate(customEnd.getDate() + 1);
      return { start: start.toISOString(), end: customEnd.toISOString() };
    }
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function CostCalculator() {
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerSummary | null>(null);
  const [qty, setQty] = useState(1000);
  const { data: pricing, isLoading: pricingLoading } = useWhatsappPricing('BR');
  const bounds = useMemo(() => periodBounds(period, customFrom, customTo), [period, customFrom, customTo]);

  const { data: costs = [], isLoading } = useQuery({
    queryKey: ['whatsapp-message-costs', bounds.start, bounds.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_message_costs')
        .select('id, customer_id, contact_id, conversation_id, message_id, channel, direction, category, billing_status, cost_amount, cost_currency, message_timestamp')
        .gte('message_timestamp', bounds.start)
        .lt('message_timestamp', bounds.end)
        .order('message_timestamp', { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as CostRow[];
    },
  });

  const customerIds = useMemo(() => [...new Set(costs.map((row) => row.customer_id).filter(Boolean))] as string[], [costs]);
  const { data: customers = [] } = useQuery({
    queryKey: ['whatsapp-cost-customers', customerIds.join(',')],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name, phone').in('id', customerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const summaries = useMemo(() => {
    const names = new Map(customers.map((customer) => [customer.id, customer]));
    const grouped = new Map<string, CustomerSummary>();
    for (const row of costs) {
      const key = row.customer_id || row.contact_id || row.conversation_id;
      const customer = row.customer_id ? names.get(row.customer_id) : undefined;
      const current = grouped.get(key) ?? {
        key,
        customerId: row.customer_id,
        contactId: row.contact_id,
        name: customer?.name || row.contact_id || 'Contato não identificado',
        phone: customer?.phone || row.contact_id || '—',
        total: 0, inbound: 0, outbound: 0, official: 0, unofficial: 0, charged: 0, unknown: 0, cost: 0,
        lastMessage: row.message_timestamp, lastOfficial: null, lastUnofficial: null, messages: [],
      };
      current.total += 1;
      current.inbound += row.direction === 'inbound' ? 1 : 0;
      current.outbound += row.direction === 'outbound' ? 1 : 0;
      current.official += row.channel === 'official' ? 1 : 0;
      current.unofficial += row.channel === 'unofficial' ? 1 : 0;
      current.charged += row.billing_status === 'charged' ? 1 : 0;
      current.unknown += row.billing_status === 'unknown' ? 1 : 0;
      current.cost += row.billing_status === 'charged' && row.cost_currency === 'BRL' ? Number(row.cost_amount) : 0;
      if (row.channel === 'official' && !current.lastOfficial) current.lastOfficial = row.message_timestamp;
      if (row.channel === 'unofficial' && !current.lastUnofficial) current.lastUnofficial = row.message_timestamp;
      current.messages.push(row);
      grouped.set(key, current);
    }
    return [...grouped.values()].filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(search.toLowerCase()));
  }, [costs, customers, search]);

  const totals = useMemo(() => costs.reduce((acc, row) => {
    acc.total += 1;
    acc.official += row.channel === 'official' ? 1 : 0;
    acc.unofficial += row.channel === 'unofficial' ? 1 : 0;
    acc.charged += row.billing_status === 'charged' ? 1 : 0;
    acc.unknown += row.billing_status === 'unknown' ? 1 : 0;
    acc.cost += row.billing_status === 'charged' && row.cost_currency === 'BRL' ? Number(row.cost_amount) : 0;
    return acc;
  }, { total: 0, official: 0, unofficial: 0, charged: 0, unknown: 0, cost: 0 }), [costs]);

  const simulationCategories = [...(pricing?.values() ?? [])].filter((item) => item.category !== 'other');

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 animate-fade-in">
        <PageHeader eyebrow="WhatsApp Business Platform" title="Custos e mensagens WhatsApp" description="Volume real por canal e custo estimado por mensagem oficial classificada." icon={Calculator} />

        <Tabs defaultValue="real" className="space-y-5">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="real">Dados reais</TabsTrigger>
            <TabsTrigger value="simulator">Simulador</TabsTrigger>
          </TabsList>

          <TabsContent value="real" className="space-y-5">
            <Card>
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
                <div className="w-full lg:w-56">
                  <Label className="mb-2 block">Período</Label>
                  <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Hoje</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem><SelectItem value="month">Mês atual</SelectItem><SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {period === 'custom' && <><div><Label className="mb-2 block">De</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div><div><Label className="mb-2 block">Até</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div></>}
                <div className="relative w-full lg:ml-auto lg:max-w-sm"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar contato ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: 'Mensagens trocadas', value: number(totals.total), icon: MessageSquare, hint: 'Recebidas e enviadas' },
                { label: 'API Oficial', value: number(totals.official), icon: ShieldCheck, hint: 'Entrada e saída oficial' },
                { label: 'API Não Oficial', value: number(totals.unofficial), icon: QrCode, hint: 'Custo Meta R$ 0,00' },
                { label: 'Mensagens com custo', value: number(totals.charged), icon: CircleDollarSign, hint: `${number(totals.unknown)} não determinadas` },
                { label: 'Custo estimado em BRL', value: money(totals.cost), icon: Calculator, hint: 'Somente mensagens cobradas' },
              ].map((item) => <Card key={item.label}><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase text-muted-foreground">{item.label}</span><item.icon className="h-4 w-4 text-primary" /></div><p className="text-2xl font-bold">{isLoading ? '—' : item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.hint}</p></CardContent></Card>)}
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Relatório por contato</CardTitle><CardDescription>Cada mensagem aparece uma única vez após a deduplicação por identificador e chave idempotente.</CardDescription></CardHeader>
              <CardContent>
                <Table><TableHeader><TableRow><TableHead>Contato</TableHead><TableHead>Total</TableHead><TableHead>Recebidas</TableHead><TableHead>Enviadas</TableHead><TableHead>Oficial</TableHead><TableHead>Não oficial</TableHead><TableHead>Com custo</TableHead><TableHead>Custo estimado</TableHead><TableHead>Última mensagem</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>{summaries.map((item) => <TableRow key={item.key}><TableCell><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.phone}</p></TableCell><TableCell>{number(item.total)}</TableCell><TableCell>{number(item.inbound)}</TableCell><TableCell>{number(item.outbound)}</TableCell><TableCell>{number(item.official)}</TableCell><TableCell>{number(item.unofficial)}</TableCell><TableCell>{number(item.charged)}{item.unknown > 0 && <p className="text-[10px] text-amber-600">{item.unknown} não determinadas</p>}</TableCell><TableCell className="font-semibold">{money(item.cost)}</TableCell><TableCell>{dateTime(item.lastMessage)}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => setSelected(item)}><Eye className="mr-2 h-4 w-4" />Detalhes</Button></TableCell></TableRow>)}
                  {!isLoading && summaries.length === 0 && <TableRow><TableCell colSpan={10} className="h-32 text-center text-muted-foreground">Nenhuma mensagem financeira registrada neste período.</TableCell></TableRow>}</TableBody></Table>
              </CardContent>
            </Card>
            <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4 shrink-0 text-amber-600" /><p>A janela de atendimento de 24 horas é independente do custo. Sem categoria ou informação de cobrança da Meta, a mensagem fica como “Não determinado” e soma R$ 0,00.</p></div>
          </TabsContent>

          <TabsContent value="simulator" className="space-y-5">
            <Card><CardHeader><CardTitle className="text-base">Simulação manual</CardTitle><CardDescription>Usa exclusivamente preços ativos e câmbio cadastrados na fonte central. Não representa a fatura final da Meta.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Quantidade de mensagens</Label><Input type="number" min="0" value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} /></div><div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">Os preços possuem vigência, mercado e moeda. Quando a moeda não é BRL, a estimativa só é exibida se houver taxa de conversão configurada.</div></CardContent></Card>
            <div className="grid gap-4 md:grid-cols-2">{simulationCategories.map((price) => { const meta = categoryMeta[price.category]; const Icon = meta.icon; return <Card key={price.id}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Icon className={`h-4 w-4 ${meta.color}`} />{meta.label}<Badge className="ml-auto" variant="outline">{price.currency} {price.unitPrice.toFixed(4)}/msg</Badge></CardTitle><CardDescription>{meta.description}</CardDescription></CardHeader><CardContent><div className="flex items-end justify-between"><div><p className="text-xs text-muted-foreground">Custo estimado em BRL</p><p className="text-2xl font-bold text-primary">{price.unitPriceBrl == null ? 'Não determinado' : money(price.unitPriceBrl * qty)}</p></div><p className="text-xs text-muted-foreground">Vigência: {new Date(price.effectiveFrom).toLocaleDateString('pt-BR')}</p></div></CardContent></Card>; })}</div>
            {!pricingLoading && simulationCategories.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum preço vigente foi cadastrado. A calculadora não inventará valores.</CardContent></Card>}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Custos e mensagens de {selected?.name}</DialogTitle><DialogDescription>{selected?.phone} · Última oficial: {dateTime(selected?.lastOfficial ?? null)} · Última não oficial: {dateTime(selected?.lastUnofficial ?? null)}</DialogDescription></DialogHeader>
        <Table><TableHeader><TableRow><TableHead>Data/Hora</TableHead><TableHead>Direção</TableHead><TableHead>Canal</TableHead><TableHead>Categoria</TableHead><TableHead>Cobrança</TableHead><TableHead>Custo</TableHead></TableRow></TableHeader><TableBody>{selected?.messages.map((row) => <TableRow key={row.id}><TableCell>{dateTime(row.message_timestamp)}</TableCell><TableCell>{row.direction === 'inbound' ? 'Recebida' : 'Enviada'}</TableCell><TableCell><Badge variant="outline">{row.channel === 'official' ? 'API Oficial' : 'API Não Oficial'}</Badge></TableCell><TableCell>{row.category ? categoryMeta[row.category as WhatsAppPriceCategory]?.label || row.category : 'Não determinada'}</TableCell><TableCell>{row.billing_status === 'charged' ? 'Cobrada' : row.billing_status === 'free' ? 'Grátis' : row.billing_status === 'not_applicable' ? 'Não aplicável' : 'Não determinado'}</TableCell><TableCell className="font-mono">{row.billing_status === 'charged' && row.cost_currency === 'BRL' ? money(Number(row.cost_amount)) : money(0)}</TableCell></TableRow>)}</TableBody></Table>
      </DialogContent></Dialog>
    </DashboardLayout>
  );
}
