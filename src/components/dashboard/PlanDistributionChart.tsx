import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart as PieIcon } from 'lucide-react';

interface PlanDistributionChartProps {
  data: { name: string; value: number; color: string }[];
}

export default function PlanDistributionChart({ data }: PlanDistributionChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  // Custom label component with better positioning
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.05) return null; // Don't show labels for very small slices
    
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 25;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    
    return (
      <text 
        x={x} 
        y={y} 
        fill="hsl(var(--foreground))" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={12}
        fontWeight={500}
      >
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card className="overflow-hidden border-border/30 bg-gradient-to-br from-card via-card to-success/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-success/20 to-success/5">
              <PieIcon className="w-5 h-5 text-success" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Clientes por Plano
              </CardTitle>
              <p className="text-xs text-muted-foreground">Distribuição atual</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold text-success">{total.toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-72 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {data.map((entry, index) => (
                  <linearGradient key={`gradient-${index}`} id={`planGradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                    <stop offset="100%" stopColor={entry.color} stopOpacity={0.7} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                label={renderCustomLabel}
                labelLine={{ 
                  stroke: 'hsl(var(--muted-foreground))',
                  strokeWidth: 1,
                  strokeOpacity: 0.5
                }}
                animationBegin={0}
                animationDuration={800}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={`url(#planGradient-${index})`}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                    style={{ 
                      filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  boxShadow: '0 10px 40px -10px hsl(var(--foreground) / 0.1)',
                  color: 'hsl(var(--foreground))',
                  padding: '12px 16px',
                }}
                formatter={(value: number, name: string) => [
                  <span className="font-bold">{value.toLocaleString('pt-BR')} clientes</span>,
                  name
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{data.length}</p>
              <p className="text-xs text-muted-foreground">planos</p>
            </div>
          </div>
        </div>
        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {data.slice(0, 5).map((item, index) => (
            <div key={index} className="flex items-center gap-1.5 text-xs">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
          ))}
          {data.length > 5 && (
            <span className="text-xs text-muted-foreground">+{data.length - 5} mais</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
