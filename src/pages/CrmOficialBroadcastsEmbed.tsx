import DashboardLayout from '@/components/layout/DashboardLayout';
import CrmOficialEmbed from '@/components/crm-oficial/CrmOficialEmbed';

export default function CrmOficialBroadcastsEmbed() {
  return (
    <DashboardLayout>
      <CrmOficialEmbed
        path="/broadcasts"
        title="Disparos em Massa"
        subtitle="Broadcasts oficiais com status real de entrega (CRM Oficial)"
      />
    </DashboardLayout>
  );
}
