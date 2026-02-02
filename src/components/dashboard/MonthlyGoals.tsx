import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, Users, DollarSign, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import confetti from 'canvas-confetti';

interface Goal {
  id: string;
  label: string;
  current: number;
  target: number;
  icon: typeof Target;
  color: string;
  format?: (value: number) => string;
}

export default function MonthlyGoals() {
  const { data: stats } = useDashboardStats();
  const [animatedValues, setAnimatedValues] = useState<Record<string, number>>({});
  const [celebratedGoals, setCelebratedGoals] = useState<Set<string>>(new Set());

  const goals: Goal[] = [
    {
      id: 'customers',
      label: 'Meta de Clientes',
      current: stats?.activeCustomers || 0,
      target: 200,
      icon: Users,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'revenue',
      label: 'Meta de Receita',
      current: stats?.monthlyRevenue || 0,
      target: 10000,
      icon: DollarSign,
      color: 'from-emerald-500 to-green-500',
      format: (v) => `R$ ${v.toFixed(0)}`,
    },
    {
      id: 'projection',
      label: 'Projeção vs Meta',
      current: stats?.monthlyProjection || 0,
      target: 15000,
      icon: TrendingUp,
      color: 'from-amber-500 to-orange-500',
      format: (v) => `R$ ${v.toFixed(0)}`,
    },
  ];

  // Animate progress values
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    
    goals.forEach((goal) => {
      const duration = 1500;
      const steps = 60;
      const increment = goal.current / steps;
      let current = 0;
      let step = 0;

      const timer = setInterval(() => {
        step++;
        current = Math.min(increment * step, goal.current);
        setAnimatedValues((prev) => ({ ...prev, [goal.id]: current }));
        
        if (step >= steps) {
          clearInterval(timer);
          
          // Celebrate if goal is achieved
          const percentage = (goal.current / goal.target) * 100;
          if (percentage >= 100 && !celebratedGoals.has(goal.id)) {
            triggerCelebration();
            setCelebratedGoals((prev) => new Set([...prev, goal.id]));
          }
        }
      }, duration / steps);

      timers.push(timer);
    });

    return () => timers.forEach(clearInterval);
  }, [stats]);

  const triggerCelebration = () => {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Target className="w-4 h-4 text-primary" />
          </div>
          Metas do Mês
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {goals.map((goal, index) => {
          const Icon = goal.icon;
          const currentValue = animatedValues[goal.id] || 0;
          const percentage = Math.min((currentValue / goal.target) * 100, 100);
          const isCompleted = percentage >= 100;

          return (
            <div
              key={goal.id}
              className={cn(
                "space-y-2 animate-fade-in",
                isCompleted && "relative"
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {isCompleted && (
                <div className="absolute -top-1 -right-1 text-lg animate-bounce">
                  🎉
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1.5 rounded-lg bg-gradient-to-br",
                    goal.color,
                    "bg-opacity-10"
                  )}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {goal.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {goal.format ? goal.format(currentValue) : Math.round(currentValue)} / {goal.format ? goal.format(goal.target) : goal.target}
                </span>
              </div>
              
              <div className="relative">
                <Progress 
                  value={percentage} 
                  className="h-2 bg-muted/50"
                />
                <div 
                  className={cn(
                    "absolute inset-0 h-2 rounded-full bg-gradient-to-r opacity-80 transition-all duration-300",
                    goal.color
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              
              <div className="flex justify-between text-xs">
                <span className={cn(
                  "font-semibold",
                  isCompleted ? "text-emerald-500" : "text-primary"
                )}>
                  {percentage.toFixed(0)}%
                </span>
                {isCompleted && (
                  <span className="text-emerald-500 font-medium">
                    ✓ Meta atingida!
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
