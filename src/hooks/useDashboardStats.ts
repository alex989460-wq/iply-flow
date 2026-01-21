import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Optimized colors for charts
const CHART_COLORS = [
  'hsl(199, 89%, 48%)',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(280, 65%, 60%)',
  'hsl(190, 80%, 45%)',
];

interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  suspendedCustomers: number;
  dueTodayCustomers: number;
  dueTomorrowCustomers: number;
  overdueOneDayCustomers: number;
  overdueCustomers: number;
  monthlyProjection: number;
}

interface RevenueStats {
  monthlyRevenue: number;
  todayRevenue: number;
  todayPaymentCount: number;
}

interface PlanDistItem {
  name: string;
  value: number;
}

interface ServerDistItem {
  name: string;
  customers: number;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Use optimized SQL functions for aggregations
      const [statsResult, revenueResult, planResult, serverResult] = await Promise.all([
        supabase.rpc('get_dashboard_stats_optimized'),
        supabase.rpc('get_monthly_revenue'),
        supabase.rpc('get_plan_distribution'),
        supabase.rpc('get_server_distribution'),
      ]);

      if (statsResult.error) throw statsResult.error;
      if (revenueResult.error) throw revenueResult.error;
      if (planResult.error) throw planResult.error;
      if (serverResult.error) throw serverResult.error;

      const stats = (statsResult.data || {}) as unknown as DashboardStats;
      const revenue = (revenueResult.data || {}) as unknown as RevenueStats;
      const planDist = (planResult.data || []) as unknown as PlanDistItem[];
      const serverDist = (serverResult.data || []) as unknown as ServerDistItem[];

      // Add colors to plan distribution
      const planDistribution = planDist.map((item, index) => ({
        ...item,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));

      // Calculate dates for filtering
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      return {
        totalCustomers: Number(stats.totalCustomers) || 0,
        activeCustomers: Number(stats.activeCustomers) || 0,
        inactiveCustomers: Number(stats.inactiveCustomers) || 0,
        suspendedCustomers: Number(stats.suspendedCustomers) || 0,
        monthlyRevenue: Number(revenue.monthlyRevenue) || 0,
        monthlyProjection: Number(stats.monthlyProjection) || 0,
        todayRevenue: Number(revenue.todayRevenue) || 0,
        todayPaymentCount: Number(revenue.todayPaymentCount) || 0,
        dueTodayCustomers: Number(stats.dueTodayCustomers) || 0,
        dueTomorrowCustomers: Number(stats.dueTomorrowCustomers) || 0,
        overdueOneDayCustomers: Number(stats.overdueOneDayCustomers) || 0,
        overdueCustomers: Number(stats.overdueCustomers) || 0,
        planDistribution,
        serverDistribution: serverDist,
        today,
        tomorrow: tomorrowStr,
        yesterday: yesterdayStr,
      };
    },
    staleTime: 60000, // Cache for 60 seconds
    refetchOnWindowFocus: false,
  });
}

export function useRevenueHistory() {
  return useQuery({
    queryKey: ['revenue-history'],
    queryFn: async () => {
      const months = [];
      const currentDate = new Date();

      // Build date ranges for all 6 months
      const monthRanges = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const startOfMonth = date.toISOString().split('T')[0];
        const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const endOfMonth = endDate.toISOString().split('T')[0];
        monthRanges.push({ start: startOfMonth, end: endOfMonth });
      }

      // Fetch all months in parallel
      const results = await Promise.all(
        monthRanges.map(({ start, end }) =>
          supabase
            .from('payments')
            .select('amount')
            .gte('payment_date', start)
            .lte('payment_date', end)
        )
      );

      for (let i = 0; i < results.length; i++) {
        const { data: payments } = results[i];
        const revenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
        
        months.push({
          month: new Date(monthRanges[i].start).toLocaleDateString('pt-BR', { month: 'short' }),
          revenue,
        });
      }

      return months;
    },
    staleTime: 300000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });
}
