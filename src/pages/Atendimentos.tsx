import DashboardLayout from '@/components/layout/DashboardLayout';
import AttendancesStatsCard from '@/components/settings/AttendancesStatsCard';

export default function Atendimentos() {
  return (
    <DashboardLayout>
      <div className="container max-w-6xl py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">
            Métricas das mensagens enviadas pelo canal oficial Meta (CRM Oficial).
          </p>
        </div>
        <AttendancesStatsCard />
      </div>
    </DashboardLayout>
  );
}
