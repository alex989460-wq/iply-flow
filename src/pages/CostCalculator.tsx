import { useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, MessageSquare, Megaphone, Bell, Headphones } from 'lucide-react';

// Tabela Meta — Brasil (valores em USD por conversa, convertidos a R$)
// Fonte: developers.facebook.com/docs/whatsapp/pricing (atualizado 2025)
const RATES = {
  marketing: 0.0625,   // USD/conversation
  utility: 0.0080,
  authentication: 0.0070,
  service: 0,          // grátis (janela 24h iniciada pelo cliente)
};

export default function CostCalculator() {
  const [usd, setUsd] = useState(5.40); // BRL por USD
  const [qty, setQty] = useState(1000);

  const calc = (rateUsd: number) => {
    const totalUsd = rateUsd * qty;
    const totalBrl = totalUsd * usd;
    const perMsgBrl = rateUsd * usd;
    return { totalUsd, totalBrl, perMsgBrl };
  };

  const types = [
    { key: 'marketing', label: 'Marketing', icon: Megaphone, color: 'text-orange-500', desc: 'Promoções, ofertas, novidades' },
    { key: 'utility', label: 'Utilidade', icon: Bell, color: 'text-emerald-500', desc: 'Cobranças, confirmações, notificações de pedido' },
    { key: 'authentication', label: 'Autenticação', icon: MessageSquare, color: 'text-blue-500', desc: 'OTP, códigos de verificação' },
    { key: 'service', label: 'Serviço', icon: Headphones, color: 'text-purple-500', desc: 'Atendimento dentro da janela 24h (grátis)' },
  ] as const;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 animate-fade-in">
        <div className="relative isolate overflow-hidden rounded-3xl border border-border/50 bg-card px-5 py-6 shadow-sm flex items-center gap-4 sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/5 bg-gradient-to-l from-primary/10 to-transparent" />
          <div className="pointer-events-none absolute -right-14 -top-24 -z-10 h-52 w-52 rounded-full border-[32px] border-primary/10" />
          <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl border border-border/60 bg-background/80 text-primary shadow-sm">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Simulador</span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Calculadora de Custo</h1>
            <p className="mt-1 text-sm text-muted-foreground">Estimativa de gastos com a WhatsApp Cloud API</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parâmetros</CardTitle>
            <CardDescription>Cotação do dólar e quantidade de mensagens para simular.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cotação USD → BRL</Label>
              <Input type="number" step="0.01" value={usd} onChange={(e) => setUsd(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>Quantidade de mensagens</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          {types.map((t) => {
            const c = calc(RATES[t.key]);
            return (
              <Card key={t.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <t.icon className={`w-4 h-4 ${t.color}`} />
                    {t.label}
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      US$ {RATES[t.key].toFixed(4)}/msg
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">{t.desc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Por mensagem:</span>
                    <span className="font-mono">R$ {c.perMsgBrl.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total ({qty.toLocaleString('pt-BR')} msgs):</span>
                    <span className="font-mono font-bold text-primary">
                      R$ {c.totalBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Em dólar:</span>
                    <span className="font-mono">US$ {c.totalUsd.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Como o Meta cobra</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• Cobrança por <strong>conversa de 24h</strong>, não por mensagem individual.</p>
            <p>• Iniciada por você (template) = paga conforme a categoria do template.</p>
            <p>• Iniciada pelo cliente = categoria <strong>Serviço</strong>, grátis na janela 24h.</p>
            <p>• Primeiras 1.000 conversas de serviço por mês são gratuitas em qualquer WABA.</p>
            <p>• Valores em USD convertidos pela cotação acima — Meta cobra em USD na fatura.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
