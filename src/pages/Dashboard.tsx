import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatsCard from '@/components/dashboard/StatsCard';
import RevenueChart from '@/components/dashboard/RevenueChart';
import PlanDistributionChart from '@/components/dashboard/PlanDistributionChart';
import ServerDistributionChart from '@/components/dashboard/ServerDistributionChart';
import { useDashboardStats, useRevenueHistory } from '@/hooks/useDashboardStats';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
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
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">
            Visão geral do seu sistema IPTV
          </p>
        </div>

        {/* Reseller Access Expiration Card - Only for non-admin users */}
        {!isAdmin && resellerAccess && (
          <Card className={`border-2 ${
            getExpirationVariant() === 'destructive' 
              ? 'border-destructive bg-destructive/10' 
              : getExpirationVariant() === 'warning'
              ? 'border-yellow-500 bg-yellow-500/10'
              : 'border-primary/50 bg-primary/5'
          }`}>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${
                  getExpirationVariant() === 'destructive' 
                    ? 'bg-destructive/20' 
                    : getExpirationVariant() === 'warning'
                    ? 'bg-yellow-500/20'
                    : 'bg-primary/20'
                }`}>
                  <CalendarDays className={`w-6 h-6 ${
                    getExpirationVariant() === 'destructive' 
                      ? 'text-destructive' 
                      : getExpirationVariant() === 'warning'
                      ? 'text-yellow-500'
                      : 'text-primary'
                  }`} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Sua Assinatura
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {getDaysUntilExpiration() !== null && getDaysUntilExpiration()! <= 0 ? (
                      <span className="text-destructive font-medium">
                        Sua assinatura expirou! Entre em contato com seu master.
                      </span>
                    ) : getDaysUntilExpiration() !== null && getDaysUntilExpiration()! <= 7 ? (
                      <span className="text-yellow-500 font-medium">
                        Expira em {getDaysUntilExpiration()} dia(s) - {formatExpirationDate()}
                      </span>
                    ) : (
                      <span>
                        Válida até <span className="font-medium text-primary">{formatExpirationDate()}</span>
                        {' '}({getDaysUntilExpiration()} dias restantes)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          <StatsCard
            title="Recebidos Hoje"
            value={`R$ ${(stats?.todayRevenue || 0).toFixed(2)}`}
            description={`${stats?.todayPaymentCount || 0} pagamentos`}
            icon={Banknote}
            variant="success"
          />
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
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
