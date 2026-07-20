import DashboardLayout from '@/components/layout/DashboardLayout';
import BillingSettingsCard from '@/components/settings/BillingSettingsCard';
import EfiSettingsCard from '@/components/settings/EfiSettingsCard';
import ResellerCheckoutCard from '@/components/settings/ResellerCheckoutCard';
import { Receipt } from 'lucide-react';

export default function BillingSettings() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Configurações de Cobrança</h1>
            <p className="text-sm text-muted-foreground">
              Configure os canais e mensagens de cobrança (API Oficial, Evolution, Efí Pix e Checkout).
            </p>
          </div>
        </div>

        <BillingSettingsCard />
        <EfiSettingsCard />
        <ResellerCheckoutCard />
      </div>
    </DashboardLayout>
  );
}
