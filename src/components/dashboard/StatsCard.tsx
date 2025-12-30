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
        "stat-card rounded-xl p-3 sm:p-4 lg:p-6",
        variantStyles[variant],
        onClick && "cursor-pointer hover:scale-[1.02] transition-transform"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 sm:space-y-2 min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</p>
          <p className="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground truncate">{value}</p>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{description}</p>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs sm:text-sm font-medium",
              trend.isPositive ? "text-success" : "text-destructive"
            )}>
              <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
              <span className="text-muted-foreground hidden sm:inline">vs mês anterior</span>
            </div>
          )}
        </div>
        <div className={cn(
          "w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0",
          iconStyles[variant]
        )}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
        </div>
      </div>
    </div>
  );
}
