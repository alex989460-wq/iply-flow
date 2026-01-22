import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Server } from 'lucide-react';

interface ServerDistributionChartProps {
  data: { name: string; customers: number }[];
}

// Modern gradient colors for bars
const BAR_COLORS = [
  { start: 'hsl(199, 89%, 48%)', end: 'hsl(199, 89%, 38%)' },
  { start: 'hsl(142, 76%, 36%)', end: 'hsl(142, 76%, 26%)' },
  { start: 'hsl(38, 92%, 50%)', end: 'hsl(38, 92%, 40%)' },
  { start: 'hsl(280, 65%, 60%)', end: 'hsl(280, 65%, 50%)' },
  { start: 'hsl(0, 72%, 51%)', end: 'hsl(0, 72%, 41%)' },
  { start: 'hsl(190, 80%, 45%)', end: 'hsl(190, 80%, 35%)' },
];

export default function ServerDistributionChart({ data }: ServerDistributionChartProps) {
  const total = data.reduce((sum, item) => sum + item.customers, 0);
  const maxCustomers = Math.max(...data.map(d => d.customers));

  return (
    <Card className="overflow-hidden border-border/30 bg-gradient-to-br from-card via-card to-warning/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-warning/20 to-warning/5">
              <Server className="w-5 h-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Clientes por Servidor
              </CardTitle>
              <p className="text-xs text-muted-foreground">{data.length} servidores ativos</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold text-warning">{total.toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              margin={{ top: 20, right: 20, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
              <defs>
                {BAR_COLORS.map((color, index) => (
                  <linearGradient key={`barGradient-${index}`} id={`barGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color.start} stopOpacity={1} />
                    <stop offset="100%" stopColor={color.end} stopOpacity={0.8} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(var(--border))" 
                opacity={0.3}
                vertical={false}
              />
              <XAxis 
                dataKey="name" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={10}
                interval={0}
                angle={data.length > 5 ? -45 : 0}
                textAnchor={data.length > 5 ? 'end' : 'middle'}
                height={data.length > 5 ? 60 : 30}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px -10px hsl(var(--foreground) / 0.1)',
                  color: 'hsl(var(--foreground))',
                  padding: '12px 16px',
                }}
                formatter={(value: number) => [
                  <span className="font-bold">{value.toLocaleString('pt-BR')} clientes</span>,
                  'Servidor'
                ]}
                cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              />
              <Bar 
                dataKey="customers" 
                radius={[8, 8, 0, 0]}
                animationDuration={800}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`}
                    fill={`url(#barGradient-${index % BAR_COLORS.length})`}
                    style={{
                      filter: entry.customers === maxCustomers 
                        ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))' 
                        : 'none',
                      cursor: 'pointer'
                    }}
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
