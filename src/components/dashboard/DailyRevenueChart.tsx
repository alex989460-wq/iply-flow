import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

interface DailyRevenueChartProps {
  data: { day: number; revenue: number; count: number }[];
}

export default function DailyRevenueChart({ data }: DailyRevenueChartProps) {
  const maxRevenue = Math.max(...data.map(d => d.revenue));
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const today = new Date().getDate();
  
  return (
    <Card className="overflow-hidden border-border/30 bg-gradient-to-br from-card via-card to-emerald-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5">
              <Calendar className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Recebidos por Dia
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Mês atual • Total: R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          {maxRevenue > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Maior dia</p>
              <p className="text-lg font-bold text-emerald-500">
                R$ {maxRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dailyBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142, 76%, 45%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="dailyBarGradientToday" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(38, 92%, 55%)" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(38, 92%, 45%)" stopOpacity={0.8} />
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
                dy={5}
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
                cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px -10px hsl(var(--primary) / 0.2)',
                  color: 'hsl(var(--foreground))',
                  padding: '12px 16px',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'revenue') {
                    return [
                      <span key="value" className="font-bold text-emerald-500">
                        R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>,
                      'Recebido'
                    ];
                  }
                  return [value, name];
                }}
                labelFormatter={(label) => `Dia ${label}`}
                labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
              />
              <Bar 
                dataKey="revenue" 
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.day === today ? 'url(#dailyBarGradientToday)' : 'url(#dailyBarGradient)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
