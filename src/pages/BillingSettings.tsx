import DashboardLayout from '@/components/layout/DashboardLayout';
import BillingSettingsCard from '@/components/settings/BillingSettingsCard';
import EfiSettingsCard from '@/components/settings/EfiSettingsCard';
import MercadoPagoSettingsCard from '@/components/settings/MercadoPagoSettingsCard';
import ResellerCheckoutCard from '@/components/settings/ResellerCheckoutCard';
import DiscountCouponsCard from '@/components/settings/DiscountCouponsCard';
import EmailTrackingCard from '@/components/settings/EmailTrackingCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Receipt, MessageSquare, Wallet, ShoppingCart, Ticket, Mail } from 'lucide-react';

const TABS = [
  { value: 'messages', label: 'Mensagens', icon: MessageSquare, hint: 'Templates e canais de cobrança' },
  { value: 'gateways', label: 'Recebimento', icon: Wallet, hint: 'Efí Pix e Mercado Pago' },
  { value: 'checkout', label: 'Checkout', icon: ShoppingCart, hint: 'Página do revendedor' },
  { value: 'coupons', label: 'Cupons', icon: Ticket, hint: 'Descontos promocionais' },
  { value: 'email', label: 'E-mail', icon: Mail, hint: 'Rastreamento de envios' },
];

export default function BillingSettings() {
  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Configurações de Cobrança</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Canais de mensagem, formas de recebimento, checkout e cupons — tudo organizado por etapa.
            </p>
          </div>
        </div>

        <Tabs defaultValue="messages" className="space-y-5">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="h-auto p-1 bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl flex gap-1">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="rounded-xl px-3 py-2 text-sm data-[state=active]:bg-primary/15 data-[state=active]:text-primary whitespace-nowrap"
                >
                  <t.icon className="w-4 h-4 mr-1.5" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="space-y-5 mt-0">
              <p className="text-xs text-muted-foreground">{t.hint}</p>
              {t.value === 'messages' && <BillingSettingsCard />}
              {t.value === 'gateways' && (
                <>
                  <EfiSettingsCard />
                  <MercadoPagoSettingsCard />
                </>
              )}
              {t.value === 'checkout' && <ResellerCheckoutCard />}
              {t.value === 'coupons' && <DiscountCouponsCard />}
              {t.value === 'email' && <EmailTrackingCard />}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
