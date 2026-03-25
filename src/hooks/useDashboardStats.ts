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

const REQUEST_TIMEOUT_MS = 12000;

const withTimeout = async (request: any, label: string): Promise<any> => {
  const promise = typeof request?.then === 'function' ? request : Promise.resolve(request);
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), REQUEST_TIMEOUT_MS)),
  ]);
};

interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  suspendedCustomers: number;
  dueTodayCustomers: number;
  dueTomorrowCustomers: number;
  overdueOneDayCustomers: number;
  overdueCustomers: number;
  newCustomersThisMonth: number;
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
      try {
        const [statsResult, revenueResult, planResult, serverResult] = await Promise.all([
          withTimeout(supabase.rpc('get_dashboard_stats_optimized'), 'get_dashboard_stats_optimized'),
          withTimeout(supabase.rpc('get_monthly_revenue'), 'get_monthly_revenue'),
          withTimeout(supabase.rpc('get_plan_distribution'), 'get_plan_distribution'),
          withTimeout(supabase.rpc('get_server_distribution'), 'get_server_distribution'),
        ]);

        if (statsResult.error) throw statsResult.error;
        if (revenueResult.error) throw revenueResult.error;
        if (planResult.error) throw planResult.error;
        if (serverResult.error) throw serverResult.error;

        const stats = (statsResult.data || {}) as DashboardStats;
        const revenue = (revenueResult.data || {}) as RevenueStats;
        const planDist = (planResult.data || []) as PlanDistItem[];
        const serverDist = (serverResult.data || []) as ServerDistItem[];

        const planDistribution = planDist.map((item, index) => ({
          ...item,
          color: CHART_COLORS[index % CHART_COLORS.length],
        }));

        const spNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const today = `${spNow.getFullYear()}-${String(spNow.getMonth() + 1).padStart(2, '0')}-${String(spNow.getDate()).padStart(2, '0')}`;
        const tomorrow = new Date(spNow);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        const yesterday = new Date(spNow);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

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
          newCustomersThisMonth: Number(stats.newCustomersThisMonth) || 0,
          planDistribution,
          serverDistribution: serverDist,
          today,
          tomorrow: tomorrowStr,
          yesterday: yesterdayStr,
          backendUnavailable: false,
        };
      } catch (error) {
        console.error('[Dashboard] Erro ao carregar stats:', error);
        return {
          totalCustomers: 0,
          activeCustomers: 0,
          inactiveCustomers: 0,
          suspendedCustomers: 0,
          monthlyRevenue: 0,
          monthlyProjection: 0,
          todayRevenue: 0,
          todayPaymentCount: 0,
          dueTodayCustomers: 0,
          dueTomorrowCustomers: 0,
          overdueOneDayCustomers: 0,
          overdueCustomers: 0,
          newCustomersThisMonth: 0,
          planDistribution: [],
          serverDistribution: [],
          today: '',
          tomorrow: '',
          yesterday: '',
          backendUnavailable: true,
        };
      }
    },
    staleTime: 60000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
}

// Helper to fetch all rows bypassing 1000 limit
async function fetchAllPayments(buildQuery: () => any) {
  const allRows: any[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const response = await withTimeout(
      buildQuery().range(from, from + pageSize - 1),
      `payments_page_${from}`,
    );
    const { data, error } = response || {};

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

export function useRevenueHistory() {
  return useQuery({
    queryKey: ['revenue-history'],
    queryFn: async () => {
      try {
        const spNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const months = [];

        const monthRanges = [];
        for (let i = 5; i >= 0; i--) {
          const date = new Date(spNow.getFullYear(), spNow.getMonth() - i, 1);
          const startOfMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
          const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
          const endOfMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
          monthRanges.push({ start: startOfMonth, end: endOfMonth });
        }

        const results = await Promise.all(
          monthRanges.map(({ start, end }) =>
            fetchAllPayments(() =>
              supabase
                .from('payments')
                .select('amount')
                .gte('payment_date', start)
                .lte('payment_date', end),
            ),
          ),
        );

        for (let i = 0; i < results.length; i++) {
          const payments = results[i];
          const revenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

          months.push({
            month: new Date(monthRanges[i].start).toLocaleDateString('pt-BR', { month: 'short' }),
            revenue,
          });
        }

        return months;
      } catch (error) {
        console.error('[Dashboard] Erro ao carregar histórico mensal:', error);
        return [];
      }
    },
    staleTime: 300000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
}

export function useDailyRevenueHistory() {
  return useQuery({
    queryKey: ['daily-revenue-history'],
    queryFn: async () => {
      try {
        const spNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const startOfMonth = new Date(spNow.getFullYear(), spNow.getMonth(), 1);
        const endOfMonth = new Date(spNow.getFullYear(), spNow.getMonth() + 1, 0);

        const startDate = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}-01`;
        const endDate = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

        const payments = await fetchAllPayments(() =>
          supabase
            .from('payments')
            .select('amount, payment_date')
            .gte('payment_date', startDate)
            .lte('payment_date', endDate),
        );

        const daysInMonth = endOfMonth.getDate();
        const dailyData: { day: number; revenue: number; count: number }[] = [];

        for (let day = 1; day <= daysInMonth; day++) {
          dailyData.push({ day, revenue: 0, count: 0 });
        }

        payments.forEach((payment) => {
          const paymentDay = parseInt(payment.payment_date.split('-')[2], 10);
          const dayIndex = paymentDay - 1;
          if (dayIndex >= 0 && dayIndex < dailyData.length) {
            dailyData[dayIndex].revenue += Number(payment.amount);
            dailyData[dayIndex].count += 1;
          }
        });

        return dailyData;
      } catch (error) {
        console.error('[Dashboard] Erro ao carregar histórico diário:', error);
        return [];
      }
    },
    staleTime: 60000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
}
