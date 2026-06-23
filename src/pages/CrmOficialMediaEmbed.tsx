import DashboardLayout from '@/components/layout/DashboardLayout';
import CrmOficialEmbed from '@/components/crm-oficial/CrmOficialEmbed';

export default function CrmOficialMediaEmbed() {
  return (
    <DashboardLayout>
      <CrmOficialEmbed
        path="/media"
        title="Galeria de Mídia"
        subtitle="Galeria de mídias do CRM Oficial"
      />
    </DashboardLayout>
  );
}
