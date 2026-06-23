import DashboardLayout from '@/components/layout/DashboardLayout';
import CrmOficialEmbed from '@/components/crm-oficial/CrmOficialEmbed';

export default function CrmOficialChatbotsEmbed() {
  return (
    <DashboardLayout>
      <CrmOficialEmbed
        path="/chatbots"
        title="Chatbots"
        subtitle="Builder visual de bots do CRM Oficial"
      />
    </DashboardLayout>
  );
}
