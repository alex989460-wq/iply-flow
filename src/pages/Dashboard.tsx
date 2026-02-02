import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatsCard from '@/components/dashboard/StatsCard';
import RevenueChart from '@/components/dashboard/RevenueChart';
import DailyRevenueChart from '@/components/dashboard/DailyRevenueChart';
import PlanDistributionChart from '@/components/dashboard/PlanDistributionChart';
import ServerDistributionChart from '@/components/dashboard/ServerDistributionChart';
import MetaMessagesStats from '@/components/dashboard/MetaMessagesStats';
import WelcomeHeader from '@/components/dashboard/WelcomeHeader';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import MonthlyGoals from '@/components/dashboard/MonthlyGoals';
import FloatingActions from '@/components/dashboard/FloatingActions';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { useDashboardStats, useRevenueHistory, useDailyRevenueHistory } from '@/hooks/useDashboardStats';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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
  CalendarX,
  Banknote,
  CalendarDays
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: revenueHistory, isLoading: revenueLoading } = useRevenueHistory();
  const { data: dailyRevenue, isLoading: dailyLoading } = useDailyRevenueHistory();
  const [resellerAccess, setResellerAccess] = useState<{
    access_expires_at: string;
    is_active: boolean;
  } | null>(null);

  useEffect(() => {
    if (user && !isAdmin) {
      // Fetch reseller access info
      const fetchResellerAccess = async () => {
        const { data } = await supabase
          .from('reseller_access')
          .select('access_expires_at, is_active')
          .eq('user_id', user.id)
          .maybeSingle();
        setResellerAccess(data);
      };
      fetchResellerAccess();
    }
  }, [user, isAdmin]);

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

  // Calculate days until expiration
  const getDaysUntilExpiration = () => {
    if (!resellerAccess?.access_expires_at) return null;
    const expiresAt = new Date(resellerAccess.access_expires_at);
    const today = new Date();
    return differenceInDays(expiresAt, today);
  };

  const getExpirationVariant = () => {
    const days = getDaysUntilExpiration();
    if (days === null) return 'primary';
    if (days <= 0) return 'destructive';
    if (days <= 7) return 'warning';
    return 'success';
  };

  const formatExpirationDate = () => {
    if (!resellerAccess?.access_expires_at) return '';
    return format(new Date(resellerAccess.access_expires_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Welcome Header */}
        <WelcomeHeader />

        {/* Reseller Access Expiration Card - Only for non-admin users */}
        {!isAdmin && resellerAccess && (
          <div className={`flex items-center gap-3 p-3 rounded-lg border animate-fade-in ${
            getExpirationVariant() === 'destructive' 
              ? 'border-destructive/50 bg-destructive/10' 
              : getExpirationVariant() === 'warning'
              ? 'border-yellow-500/50 bg-yellow-500/10'
              : 'border-primary/30 bg-primary/5'
          }`}>
            <CalendarDays className={`w-5 h-5 ${
              getExpirationVariant() === 'destructive' 
                ? 'text-destructive' 
                : getExpirationVariant() === 'warning'
                ? 'text-yellow-500'
                : 'text-primary'
            }`} />
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-foreground">Sua Assinatura:</span>
              {getDaysUntilExpiration() !== null && getDaysUntilExpiration()! <= 0 ? (
                <span className="text-destructive font-medium">
                  Expirada! Entre em contato com seu master.
                </span>
              ) : getDaysUntilExpiration() !== null && getDaysUntilExpiration()! <= 7 ? (
                <span className="text-yellow-500">
                  Expira em {getDaysUntilExpiration()} dia(s) - {formatExpirationDate()}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Válida até <span className="text-primary">{formatExpirationDate()}</span>
                  {' '}({getDaysUntilExpiration()} dias)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stats Grid with staggered animations */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
          <StatsCard
            title="Total de Clientes"
            value={stats?.totalCustomers || 0}
            icon={Users}
            variant="primary"
            animationDelay={0}
          />
          <StatsCard
            title="Clientes Ativos"
            value={stats?.activeCustomers || 0}
            icon={UserCheck}
            variant="success"
            animationDelay={50}
          />
          <StatsCard
            title="Clientes Inativos"
            value={stats?.inactiveCustomers || 0}
            icon={UserX}
            variant="warning"
            animationDelay={100}
          />
          <StatsCard
            title="Clientes Suspensos"
            value={stats?.suspendedCustomers || 0}
            icon={UserMinus}
            variant="destructive"
            animationDelay={150}
          />
        </div>

        {/* Revenue Row */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          <StatsCard
            title="Recebidos Hoje"
            value={`R$ ${(stats?.todayRevenue || 0).toFixed(2)}`}
            description={`${stats?.todayPaymentCount || 0} pagamentos`}
            icon={Banknote}
            variant="success"
            animationDelay={200}
          />
          <StatsCard
            title="Receita do Mês"
            value={`R$ ${(stats?.monthlyRevenue || 0).toFixed(2)}`}
            icon={DollarSign}
            variant="success"
            animationDelay={250}
          />
          <StatsCard
            title="Projeção Mensal"
            value={`R$ ${(stats?.monthlyProjection || 0).toFixed(2)}`}
            icon={TrendingUp}
            variant="primary"
            animationDelay={300}
          />
        </div>

        {/* Due Dates Row - Clickable */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
          <StatsCard
            title="Vencem Hoje"
            value={stats?.dueTodayCustomers || 0}
            icon={Clock}
            variant="warning"
            onClick={() => navigateToCustomers('due_today')}
            animationDelay={350}
          />
          <StatsCard
            title="Vencem Amanhã"
            value={stats?.dueTomorrowCustomers || 0}
            icon={CalendarClock}
            variant="primary"
            onClick={() => navigateToCustomers('due_tomorrow')}
            animationDelay={400}
          />
          <StatsCard
            title="Vencidas 1 Dia"
            value={stats?.overdueOneDayCustomers || 0}
            icon={CalendarX}
            variant="warning"
            onClick={() => navigateToCustomers('overdue_1day')}
            animationDelay={450}
          />
          <StatsCard
            title="Todas Vencidas"
            value={stats?.overdueCustomers || 0}
            icon={AlertCircle}
            variant="destructive"
            onClick={() => navigateToCustomers('overdue')}
            animationDelay={500}
          />
        </div>

        {/* Activity Feed + Monthly Goals Row */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 animate-fade-in" style={{ animationDelay: '550ms' }}>
            <ActivityFeed />
            <MonthlyGoals />
          </div>
        )}

        {/* Charts Row 1 - Daily and Monthly Revenue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 animate-fade-in" style={{ animationDelay: '600ms' }}>
          {!dailyLoading && dailyRevenue && (
            <DailyRevenueChart data={dailyRevenue} />
          )}
          {!revenueLoading && revenueHistory && (
            <RevenueChart data={revenueHistory} />
          )}
        </div>

        {/* Charts Row 2 - Distribution Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 animate-fade-in" style={{ animationDelay: '650ms' }}>
          {stats?.planDistribution && stats.planDistribution.length > 0 && (
            <PlanDistributionChart data={stats.planDistribution} />
          )}
          <MetaMessagesStats />
        </div>

        {stats?.serverDistribution && stats.serverDistribution.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: '700ms' }}>
            <ServerDistributionChart data={stats.serverDistribution} />
          </div>
        )}
      </div>
      
      <FloatingActions />
      <ScrollToTop />
    </DashboardLayout>
  );
}
