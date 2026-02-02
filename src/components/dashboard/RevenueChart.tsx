import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DayRevenue {
  day: string;
  revenue: number;
  count: number;
  isToday: boolean;
}

export default function RevenueChart() {
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [data, setData] = useState<DayRevenue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);

  // Generate last 12 months for selector
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: format(date, 'yyyy-MM'),
      label: format(date, "MMMM 'de' yyyy", { locale: ptBR }),
    };
  });

  useEffect(() => {
    const fetchMonthRevenue = async () => {
      setIsLoading(true);
      
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));
      
      const { data: payments, error } = await supabase
        .from('payments')
        .select('amount, payment_date')
        .gte('payment_date', format(startDate, 'yyyy-MM-dd'))
        .lte('payment_date', format(endDate, 'yyyy-MM-dd'));

      if (error) {
        console.error('Error fetching payments:', error);
        setIsLoading(false);
        return;
      }

      // Initialize all days of the selected month
      const allDays = eachDayOfInterval({ start: startDate, end: endDate });
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const dailyData: DayRevenue[] = allDays.map(date => ({
        day: format(date, 'dd'),
        revenue: 0,
        count: 0,
        isToday: format(date, 'yyyy-MM-dd') === today,
      }));

      // Aggregate payments by day
      let total = 0;
      let count = 0;
      payments?.forEach((payment) => {
        const paymentDay = parseInt(payment.payment_date.split('-')[2], 10);
        const dayIndex = paymentDay - 1;
        if (dayIndex >= 0 && dayIndex < dailyData.length) {
          dailyData[dayIndex].revenue += Number(payment.amount);
          dailyData[dayIndex].count += 1;
          total += Number(payment.amount);
          count += 1;
        }
      });

      setData(dailyData);
      setTotalRevenue(total);
      setTotalPayments(count);
      setIsLoading(false);
    };

    fetchMonthRevenue();
  }, [selectedMonth]);

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  
  return (
    <Card className="overflow-hidden border-border/30 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Receita por Dia
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {totalPayments} pagamentos • R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="Selecionar mês" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-72">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="barGradientToday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(38, 92%, 50%)" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="hsl(var(--border))" 
                  opacity={0.3}
                  vertical={false}
                />
                <XAxis 
                  dataKey="day" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString()}
                  width={35}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px -10px hsl(var(--primary) / 0.2)',
                    color: 'hsl(var(--foreground))',
                    padding: '12px 16px',
                  }}
                  formatter={(value: number, name: string, props: any) => [
                    <div key="tooltip" className="space-y-1">
                      <span className="font-bold text-primary block">
                        R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {props.payload.count} renovação(ões)
                      </span>
                    </div>,
                    ''
                  ]}
                  labelFormatter={(label) => `Dia ${label}`}
                />
                <Bar 
                  dataKey="revenue" 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                >
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.isToday ? 'url(#barGradientToday)' : 'url(#barGradient)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
