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
  default: 'bg-card hover:bg-card/80',
  primary: 'bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/15 hover:to-primary/10',
  success: 'bg-gradient-to-br from-success/10 to-success/5 hover:from-success/15 hover:to-success/10',
  warning: 'bg-gradient-to-br from-warning/10 to-warning/5 hover:from-warning/15 hover:to-warning/10',
  destructive: 'bg-gradient-to-br from-destructive/10 to-destructive/5 hover:from-destructive/15 hover:to-destructive/10',
};

const borderStyles = {
  default: 'border-border/50',
  primary: 'border-primary/20',
  success: 'border-success/20',
  warning: 'border-warning/20',
  destructive: 'border-destructive/20',
};

const iconStyles = {
  default: 'text-primary bg-gradient-to-br from-primary/20 to-primary/10',
  primary: 'text-primary bg-gradient-to-br from-primary/25 to-primary/10',
  success: 'text-success bg-gradient-to-br from-success/25 to-success/10',
  warning: 'text-warning bg-gradient-to-br from-warning/25 to-warning/10',
  destructive: 'text-destructive bg-gradient-to-br from-destructive/25 to-destructive/10',
};

const glowStyles = {
  default: '',
  primary: 'group-hover:shadow-[0_0_20px_hsl(var(--primary)/0.2)]',
  success: 'group-hover:shadow-[0_0_20px_hsl(var(--success)/0.2)]',
  warning: 'group-hover:shadow-[0_0_20px_hsl(var(--warning)/0.2)]',
  destructive: 'group-hover:shadow-[0_0_20px_hsl(var(--destructive)/0.2)]',
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
        "group relative rounded-xl p-3 sm:p-4 lg:p-5 border overflow-hidden",
        "transition-all duration-300 ease-out",
        "hover:scale-[1.02] hover:-translate-y-0.5",
        variantStyles[variant],
        borderStyles[variant],
        onClick && "cursor-pointer"
      )}
      style={{ boxShadow: 'var(--shadow-card)' }}
      onClick={onClick}
    >
      {/* Subtle gradient overlay on hover */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
        "bg-gradient-to-br from-white/5 to-transparent"
      )} />
      
      <div className="relative flex items-start justify-between gap-2">
        <div className="space-y-1 sm:space-y-2 min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</p>
          <p className="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground truncate tracking-tight">{value}</p>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{description}</p>
          )}
          {trend && (
            <div className={cn(
              "inline-flex items-center gap-1 text-xs sm:text-sm font-medium px-2 py-0.5 rounded-full",
              trend.isPositive 
                ? "text-success bg-success/10" 
                : "text-destructive bg-destructive/10"
            )}>
              <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
              <span className="text-muted-foreground hidden sm:inline">vs mês anterior</span>
            </div>
          )}
        </div>
        <div className={cn(
          "w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center flex-shrink-0",
          "transition-all duration-300",
          iconStyles[variant],
          glowStyles[variant]
        )}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 transition-transform duration-300 group-hover:scale-110" />
        </div>
      </div>
    </div>
  );
}
