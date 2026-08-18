import DashboardLayout from '@/components/layout/DashboardLayout';
import BillingSettingsCard from '@/components/settings/BillingSettingsCard';
import EfiSettingsCard from '@/components/settings/EfiSettingsCard';
import MercadoPagoSettingsCard from '@/components/settings/MercadoPagoSettingsCard';
import ResellerCheckoutCard from '@/components/settings/ResellerCheckoutCard';
import DiscountCouponsCard from '@/components/settings/DiscountCouponsCard';
import EmailTrackingCard from '@/components/settings/EmailTrackingCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Receipt, MessageSquare, Wallet, ShoppingCart, Ticket, Mail, Smartphone, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'messages', label: 'Mensagens', icon: MessageSquare, hint: 'Canais e notificações' },
  { value: 'gateways', label: 'Pagamentos', icon: Wallet, hint: 'Efí e Mercado Pago' },
  { value: 'checkout', label: 'Link Único', icon: ShoppingCart, hint: 'Página do revendedor' },
  { value: 'coupons', label: 'Cupons', icon: Ticket, hint: 'Promoções e descontos' },
  { value: 'email', label: 'E-mail', icon: Mail, hint: 'Faturas por e-mail' },
];

export default function BillingSettings() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Advanced Modern Header */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-border/50 bg-card/40 backdrop-blur-2xl p-8 shadow-2xl">
          <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-[100px] animate-pulse" />
          <div className="pointer-events-none absolute -bottom-32 -left-32 w-64 h-64 rounded-full bg-sky-500/5 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-tr from-primary to-sky-500 rounded-[2rem] blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
              <div className="relative w-20 h-20 rounded-[1.8rem] bg-background/80 border border-border/50 flex items-center justify-center shadow-2xl backdrop-blur-xl">
                <Receipt className="w-10 h-10 text-primary" />
              </div>
            </div>
            
            <div className="flex-1 space-y-2">
              <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight">
                Configurações <span className="text-primary italic">Financeiras</span>
              </h1>
              <p className="text-muted-foreground text-base font-medium max-w-2xl leading-relaxed">
                Centralize o controle de suas mensagens, portais de pagamento e cupons em um único ecossistema automatizado.
              </p>
            </div>

            <div className="hidden lg:flex items-center gap-3 bg-background/40 backdrop-blur-md px-6 py-4 rounded-3xl border border-border/50">
               <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status Geral</p>
                  <p className="text-sm font-bold text-emerald-500 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> Sistemas OK
                  </p>
               </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="messages" className="space-y-8">
          <div className="overflow-x-auto -mx-1 px-1 no-scrollbar">
            <TabsList className="h-auto p-1.5 bg-card/40 backdrop-blur-xl border border-border/50 rounded-[2rem] flex flex-wrap gap-2 w-full shadow-lg">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="flex-1 min-w-[140px] rounded-[1.5rem] px-4 py-3.5 text-xs font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2xl data-[state=active]:shadow-primary/30 transition-all duration-300 gap-2.5"
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </TabsTrigger>
              ))}
              <TabsTrigger
                value="cakto"
                className="flex-1 min-w-[140px] rounded-[1.5rem] px-4 py-3.5 text-xs font-black uppercase tracking-widest data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-2xl data-[state=active]:shadow-orange-500/30 transition-all duration-300 gap-2.5"
              >
                <Zap className="w-4 h-4" />
                Cakto
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="space-y-6">
            {TABS.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-0 space-y-6 animate-in slide-in-from-bottom-6 duration-500 outline-none">
                {/* Section Header Hint */}
                <div className="flex items-center gap-4 px-2">
                   <div className="w-10 h-px bg-border/50" />
                   <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                      <t.icon className="w-3.5 h-3.5" />
                      {t.hint}
                   </div>
                   <div className="flex-1 h-px bg-border/50" />
                </div>

                <div className="grid gap-6">
                  {t.value === 'messages' && (
                    <div className="animate-in fade-in duration-700">
                      <BillingSettingsCard />
                    </div>
                  )}
                  
                  {t.value === 'gateways' && (
                    <div className="grid gap-6 animate-in fade-in duration-700">
                      <EfiSettingsCard />
                      <MercadoPagoSettingsCard />
                    </div>
                  )}
                  
                  {t.value === 'checkout' && (
                    <div className="animate-in fade-in duration-700">
                      <ResellerCheckoutCard />
                    </div>
                  )}
                  
                  {t.value === 'coupons' && (
                    <div className="animate-in fade-in duration-700">
                      <DiscountCouponsCard />
                    </div>
                  )}
                  
                  {t.value === 'email' && (
                    <div className="animate-in fade-in duration-700">
                      <EmailTrackingCard />
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
