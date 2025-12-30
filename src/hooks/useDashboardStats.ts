import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Helper to fetch all records without the 1000 limit
async function fetchAllRecords<T>(
  tableName: string,
  selectQuery: string,
  filters?: { column: string; value: any; operator?: string }[]
): Promise<T[]> {
  const pageSize = 1000;
  let allData: T[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(tableName)
      .select(selectQuery)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (filters) {
      for (const filter of filters) {
        if (filter.operator === 'gte') {
          query = query.gte(filter.column, filter.value);
        } else if (filter.operator === 'lte') {
          query = query.lte(filter.column, filter.value);
        } else {
          query = query.eq(filter.column, filter.value);
        }
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...(data as T[])];
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
      const today = new Date().toISOString().split('T')[0];

      // Fetch all customers (without 1000 limit)
      const customers = await fetchAllRecords<any>(
        'customers',
        '*, plans(plan_name, price), servers(server_name)'
      );

      // Fetch payments for this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const payments = await fetchAllRecords<any>(
        'payments',
        '*',
        [
          { column: 'confirmed', value: true },
          { column: 'payment_date', value: startOfMonth.toISOString().split('T')[0], operator: 'gte' },
        ]
      );

      // Calculate stats
      const totalCustomers = customers?.length || 0;
      const activeCustomers = customers?.filter(c => c.status === 'ativa').length || 0;
      const inactiveCustomers = customers?.filter(c => c.status === 'inativa').length || 0;
      const suspendedCustomers = customers?.filter(c => c.status === 'suspensa').length || 0;

      const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      const dueTodayCustomers = customers?.filter(c => c.due_date === today && c.status === 'ativa').length || 0;
      const overdueCustomers = customers?.filter(c => c.due_date < today && c.status === 'ativa').length || 0;

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
        dueTodayCustomers,
        overdueCustomers,
        planDistribution,
        serverDistribution,
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
