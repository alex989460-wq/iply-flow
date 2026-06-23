import DashboardLayout from '@/components/layout/DashboardLayout';
import CrmOficialEmbed from '@/components/crm-oficial/CrmOficialEmbed';

export default function CrmOficialTemplatesEmbed() {
  return (
    <DashboardLayout>
      <CrmOficialEmbed
        path="/templates"
        title="Templates Meta"
        subtitle="Gerencie templates aprovados pela Meta direto no CRM Oficial"
      />
    </DashboardLayout>
  );
}
