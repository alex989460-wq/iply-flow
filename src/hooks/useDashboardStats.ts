import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type TableNames = keyof Database['public']['Tables'];

// Helper to fetch all records without the 1000 limit
async function fetchAllCustomers() {
  const pageSize = 1000;
  let allData: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('customers')
      .select('*, plans(plan_name, price), servers(server_name)')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allData;
}

async function fetchAllPayments(startDate: string) {
  const pageSize = 1000;
  let allData: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('confirmed', true)
      .gte('payment_date', startDate)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allData;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Calculate dates
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Fetch all customers (without 1000 limit)
      const customers = await fetchAllCustomers();

      // Fetch payments for this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const payments = await fetchAllPayments(startOfMonth.toISOString().split('T')[0]);

      // Fetch payments for today specifically
      const todayPayments = payments?.filter(p => p.payment_date === today) || [];
      const todayRevenue = todayPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const todayPaymentCount = todayPayments.length;

      // Calculate stats
      const totalCustomers = customers?.length || 0;
      const activeCustomers = customers?.filter(c => c.status === 'ativa').length || 0;
      const inactiveCustomers = customers?.filter(c => c.status === 'inativa').length || 0;
      const suspendedCustomers = customers?.filter(c => c.status === 'suspensa').length || 0;

      const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      // Due today - all statuses
      const dueTodayCustomers = customers?.filter(c => c.due_date === today).length || 0;
      
      // Due tomorrow - all statuses
      const dueTomorrowCustomers = customers?.filter(c => c.due_date === tomorrowStr).length || 0;
      
      // Overdue by 1 day (venceu ontem)
      const overdueOneDayCustomers = customers?.filter(c => c.due_date === yesterdayStr).length || 0;
      
      // All overdue (before today)
      const overdueCustomers = customers?.filter(c => c.due_date < today).length || 0;

      // Calculate monthly projection based on active customers and their plan prices
      const monthlyProjection = customers
        ?.filter(c => c.status === 'ativa')
        .reduce((sum, c) => {
          const price = c.custom_price ?? c.plans?.price ?? 0;
          return sum + Number(price);
        }, 0) || 0;

      // Customers by plan
      const planCounts: Record<string, number> = {};
      customers?.forEach(c => {
        const planName = c.plans?.plan_name || 'Sem plano';
        planCounts[planName] = (planCounts[planName] || 0) + 1;
      });

      const planDistribution = Object.entries(planCounts).map(([name, value], index) => ({
        name,
        value,
        color: ['hsl(199, 89%, 48%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)'][index % 4],
      }));

      // Customers by server
      const serverCounts: Record<string, number> = {};
      customers?.forEach(c => {
        const serverName = c.servers?.server_name || 'Sem servidor';
        serverCounts[serverName] = (serverCounts[serverName] || 0) + 1;
      });

      const serverDistribution = Object.entries(serverCounts).map(([name, customers]) => ({
        name,
        customers,
      }));

      return {
        totalCustomers,
        activeCustomers,
        inactiveCustomers,
        suspendedCustomers,
        monthlyRevenue,
        monthlyProjection,
        todayRevenue,
        todayPaymentCount,
        dueTodayCustomers,
        dueTomorrowCustomers,
        overdueOneDayCustomers,
        overdueCustomers,
        planDistribution,
        serverDistribution,
        // Pass dates for filtering
        today,
        tomorrow: tomorrowStr,
        yesterday: yesterdayStr,
      };
    },
  });
}

export function useRevenueHistory() {
  return useQuery({
    queryKey: ['revenue-history'],
    queryFn: async () => {
      const months = [];
      const currentDate = new Date();

      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const startOfMonth = date.toISOString().split('T')[0];
        date.setMonth(date.getMonth() + 1);
        date.setDate(0);
        const endOfMonth = date.toISOString().split('T')[0];

        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .eq('confirmed', true)
          .gte('payment_date', startOfMonth)
          .lte('payment_date', endOfMonth);

        const revenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

        months.push({
          month: new Date(startOfMonth).toLocaleDateString('pt-BR', { month: 'short' }),
          revenue,
        });
      }

      return months;
    },
  });
}
