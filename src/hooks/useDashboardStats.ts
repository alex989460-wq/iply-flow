import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      // Fetch all customers
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*, plans(plan_name, price), servers(server_name)');

      if (customersError) throw customersError;

      // Fetch payments for this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('confirmed', true)
        .gte('payment_date', startOfMonth.toISOString().split('T')[0]);

      if (paymentsError) throw paymentsError;

      // Calculate stats
      const totalCustomers = customers?.length || 0;
      const activeCustomers = customers?.filter(c => c.status === 'ativa').length || 0;
      const inactiveCustomers = customers?.filter(c => c.status === 'inativa').length || 0;
      const suspendedCustomers = customers?.filter(c => c.status === 'suspensa').length || 0;

      const monthlyRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

      const dueTodayCustomers = customers?.filter(c => c.due_date === today && c.status === 'ativa').length || 0;
      const overdueCustomers = customers?.filter(c => c.due_date < today && c.status === 'ativa').length || 0;

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
