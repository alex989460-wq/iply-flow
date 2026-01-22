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

const accentColors = {
  default: 'from-primary via-primary/80 to-primary/60',
  primary: 'from-amber-500 via-amber-400 to-yellow-500',
  success: 'from-emerald-500 via-green-400 to-teal-500',
  warning: 'from-orange-500 via-amber-400 to-yellow-500',
  destructive: 'from-rose-500 via-red-400 to-pink-500',
};

const iconBgStyles = {
  default: 'bg-primary/10 text-primary',
  primary: 'bg-amber-500/10 text-amber-500',
  success: 'bg-emerald-500/10 text-emerald-500',
  warning: 'bg-orange-500/10 text-orange-500',
  destructive: 'bg-rose-500/10 text-rose-500',
};

const titleColors = {
  default: 'text-primary',
  primary: 'text-amber-500',
  success: 'text-emerald-500',
  warning: 'text-orange-500',
  destructive: 'text-rose-500',
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
        "group relative rounded-xl overflow-hidden",
        "bg-gradient-to-br from-card via-card to-card/95",
        "border border-border/30",
        "transition-all duration-300 ease-out",
        "hover:scale-[1.02] hover:-translate-y-1",
        "hover:shadow-xl hover:shadow-black/20",
        "dark:hover:shadow-black/40",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      {/* Left accent border with gradient */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b",
        accentColors[variant]
      )} />
      
      {/* Subtle glow effect on hover */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
        "bg-gradient-to-br from-white/[0.03] via-transparent to-transparent"
      )} />
      
      <div className="relative p-4 sm:p-5 lg:p-6 flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <p className={cn(
            "text-[11px] sm:text-xs font-semibold uppercase tracking-wider truncate",
            titleColors[variant]
          )}>
            {title}
          </p>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground truncate tracking-tight">
            {value}
          </p>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground/80 truncate font-medium">
              {description}
            </p>
          )}
          {trend && (
            <div className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
              trend.isPositive 
                ? "text-emerald-500 bg-emerald-500/10" 
                : "text-rose-500 bg-rose-500/10"
            )}>
              <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
              <span className="text-muted-foreground/70 hidden sm:inline">vs mês anterior</span>
            </div>
          )}
        </div>
        
        {/* Icon container with subtle styling */}
        <div className={cn(
          "w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center flex-shrink-0",
          "transition-all duration-300",
          iconBgStyles[variant],
          "group-hover:scale-110"
        )}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7" />
        </div>
      </div>
    </div>
  );
}
