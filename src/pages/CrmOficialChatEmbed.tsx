import DashboardLayout from '@/components/layout/DashboardLayout';
import CrmOficialEmbed from '@/components/crm-oficial/CrmOficialEmbed';

export default function CrmOficialChatEmbed() {
  return (
    <DashboardLayout>
      <CrmOficialEmbed
        path="/chat"
        title="Chat CRM Oficial"
        subtitle="WhatsApp Cloud + Webchat (carregado direto do CRM Oficial)"
      />
    </DashboardLayout>
  );
}
