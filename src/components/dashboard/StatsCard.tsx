import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  onClick?: () => void;
}

const variantStyles = {
  default: 'bg-card border border-border',
  primary: 'bg-primary/10 border border-primary/20',
  success: 'bg-success/10 border border-success/20',
  warning: 'bg-warning/10 border border-warning/20',
  destructive: 'bg-destructive/10 border border-destructive/20',
};

const iconStyles = {
  default: 'text-primary bg-primary/10',
  primary: 'text-primary bg-primary/20',
  success: 'text-success bg-success/20',
  warning: 'text-warning bg-warning/20',
  destructive: 'text-destructive bg-destructive/20',
};

export default function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  variant = 'default',
  onClick,
}: StatsCardProps) {
  return (
    <div 
      className={cn(
        "stat-card rounded-xl",
        variantStyles[variant],
        onClick && "cursor-pointer hover:scale-[1.02] transition-transform"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-sm font-medium",
              trend.isPositive ? "text-success" : "text-destructive"
            )}>
              <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
              <span className="text-muted-foreground">vs mês anterior</span>
            </div>
          )}
        </div>
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          iconStyles[variant]
        )}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
