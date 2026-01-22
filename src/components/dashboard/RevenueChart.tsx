import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface RevenueChartProps {
  data: { month: string; revenue: number }[];
}

export default function RevenueChart({ data }: RevenueChartProps) {
  const maxRevenue = Math.max(...data.map(d => d.revenue));
  
  return (
    <Card className="overflow-hidden border-border/30 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Receita Mensal
              </CardTitle>
              <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
            </div>
          </div>
          {maxRevenue > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Maior receita</p>
              <p className="text-lg font-bold text-primary">R$ {maxRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(38, 92%, 50%)" stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(var(--border))" 
                opacity={0.3}
                vertical={false}
              />
              <XAxis 
                dataKey="month" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`}
                width={50}
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
                formatter={(value: number) => [
                  <span className="font-bold text-primary">
                    R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>, 
                  'Receita'
                ]}
                labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="url(#lineGradient)"
                strokeWidth={3}
                fill="url(#revenueGradient)"
                dot={{ 
                  fill: 'hsl(var(--background))', 
                  stroke: 'hsl(var(--primary))',
                  strokeWidth: 2,
                  r: 4
                }}
                activeDot={{ 
                  r: 7, 
                  fill: 'hsl(var(--primary))',
                  stroke: 'hsl(var(--background))',
                  strokeWidth: 3,
                  filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.5))'
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
