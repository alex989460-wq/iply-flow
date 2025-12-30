import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatsCard from '@/components/dashboard/StatsCard';
import RevenueChart from '@/components/dashboard/RevenueChart';
import PlanDistributionChart from '@/components/dashboard/PlanDistributionChart';
import ServerDistributionChart from '@/components/dashboard/ServerDistributionChart';
import { useDashboardStats, useRevenueHistory } from '@/hooks/useDashboardStats';
import { 
  Users, 
  UserCheck, 
  UserX, 
  UserMinus, 
  DollarSign, 
  AlertCircle, 
  Clock,
  Loader2,
  TrendingUp,
  CalendarClock,
  CalendarX
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: revenueHistory, isLoading: revenueLoading } = useRevenueHistory();

  if (statsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const navigateToCustomers = (filter: string) => {
    navigate(`/customers?filter=${filter}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral do seu sistema IPTV
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total de Clientes"
            value={stats?.totalCustomers || 0}
            icon={Users}
            variant="primary"
          />
          <StatsCard
            title="Clientes Ativos"
            value={stats?.activeCustomers || 0}
            icon={UserCheck}
            variant="success"
          />
          <StatsCard
            title="Clientes Inativos"
            value={stats?.inactiveCustomers || 0}
            icon={UserX}
            variant="warning"
          />
          <StatsCard
            title="Clientes Suspensos"
            value={stats?.suspendedCustomers || 0}
            icon={UserMinus}
            variant="destructive"
          />
        </div>

        {/* Revenue Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard
            title="Receita do Mês"
            value={`R$ ${(stats?.monthlyRevenue || 0).toFixed(2)}`}
            icon={DollarSign}
            variant="success"
          />
          <StatsCard
            title="Projeção Mensal"
            value={`R$ ${(stats?.monthlyProjection || 0).toFixed(2)}`}
            icon={TrendingUp}
            variant="primary"
          />
        </div>

        {/* Due Dates Row - Clickable */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Vencem Hoje"
            value={stats?.dueTodayCustomers || 0}
            icon={Clock}
            variant="warning"
            onClick={() => navigateToCustomers('due_today')}
          />
          <StatsCard
            title="Vencem Amanhã"
            value={stats?.dueTomorrowCustomers || 0}
            icon={CalendarClock}
            variant="primary"
            onClick={() => navigateToCustomers('due_tomorrow')}
          />
          <StatsCard
            title="Vencidas 1 Dia"
            value={stats?.overdueOneDayCustomers || 0}
            icon={CalendarX}
            variant="warning"
            onClick={() => navigateToCustomers('overdue_1day')}
          />
          <StatsCard
            title="Todas Vencidas"
            value={stats?.overdueCustomers || 0}
            icon={AlertCircle}
            variant="destructive"
            onClick={() => navigateToCustomers('overdue')}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {!revenueLoading && revenueHistory && (
            <RevenueChart data={revenueHistory} />
          )}
          {stats?.planDistribution && stats.planDistribution.length > 0 && (
            <PlanDistributionChart data={stats.planDistribution} />
          )}
        </div>

        {stats?.serverDistribution && stats.serverDistribution.length > 0 && (
          <ServerDistributionChart data={stats.serverDistribution} />
        )}
      </div>
    </DashboardLayout>
  );
}
