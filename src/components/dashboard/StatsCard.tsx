import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  animationDelay?: number;
}

const accentColors = {
  default: 'from-primary via-primary/80 to-primary/60',
  primary: 'from-amber-500 via-amber-400 to-yellow-500',
  success: 'from-emerald-500 via-green-400 to-teal-500',
  warning: 'from-orange-500 via-amber-400 to-yellow-500',
  destructive: 'from-rose-500 via-red-400 to-pink-500',
};

const iconBgStyles = {
  default: 'bg-primary/10 text-primary group-hover:bg-primary/20',
  primary: 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20',
  success: 'bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20',
  warning: 'bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20',
  destructive: 'bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/20',
};

const titleColors = {
  default: 'text-primary',
  primary: 'text-amber-500',
  success: 'text-emerald-500',
  warning: 'text-orange-500',
  destructive: 'text-rose-500',
};

const glowColors = {
  default: 'group-hover:shadow-primary/20',
  primary: 'group-hover:shadow-amber-500/20',
  success: 'group-hover:shadow-emerald-500/20',
  warning: 'group-hover:shadow-orange-500/20',
  destructive: 'group-hover:shadow-rose-500/20',
};

// Animated counter hook
function useAnimatedCounter(end: number, duration: number = 1000) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const frameRef = useRef<number>();

  useEffect(() => {
    const startTime = performance.now();
    const startValue = countRef.current;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = startValue + (end - startValue) * easeOutQuart;
      
      setCount(currentValue);
      countRef.current = currentValue;
      
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    
    frameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [end, duration]);

  return count;
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  variant = 'default',
  onClick,
  animationDelay = 0,
}: StatsCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Parse numeric value for animation
  const numericValue = typeof value === 'number' 
    ? value 
    : parseFloat(value.toString().replace(/[^0-9.-]/g, '')) || 0;
  const isMonetary = typeof value === 'string' && value.includes('R$');
  const animatedValue = useAnimatedCounter(numericValue, 1200);
  
  // Format the animated value
  const displayValue = typeof value === 'number' 
    ? Math.round(animatedValue)
    : isMonetary 
      ? `R$ ${animatedValue.toFixed(2)}`
      : Math.round(animatedValue);

  // Mouse follow effect
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mouse-x', `${x}%`);
      card.style.setProperty('--mouse-y', `${y}%`);
    };

    card.addEventListener('mousemove', handleMouseMove);
    return () => card.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
      ref={cardRef}
      className={cn(
        "group relative rounded-xl overflow-hidden",
        "bg-gradient-to-br from-card via-card to-card/95",
        "border border-border/30",
        "transition-all duration-500 ease-out",
        "hover:scale-[1.03] hover:-translate-y-1.5",
        "hover:shadow-2xl",
        glowColors[variant],
        "dark:hover:shadow-black/40",
        onClick && "cursor-pointer",
        "animate-fade-in opacity-0"
      )}
      style={{ 
        animationDelay: `${animationDelay}ms`,
        animationFillMode: 'forwards'
      }}
      onClick={onClick}
    >
      {/* Left accent border with gradient */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b transition-all duration-300",
        "group-hover:w-1.5",
        accentColors[variant]
      )} />
      
      {/* Radial gradient glow on hover */}
      <div 
        className={cn(
          "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        )}
        style={{
          background: `radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), hsl(var(--primary) / 0.08) 0%, transparent 50%)`
        }}
      />
      
      {/* Shine effect on hover */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700",
        "bg-gradient-to-tr from-white/[0.04] via-transparent to-transparent"
      )} />
      
      <div className="relative p-4 sm:p-5 lg:p-6 flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <p className={cn(
            "text-[11px] sm:text-xs font-semibold uppercase tracking-wider truncate transition-colors duration-300",
            titleColors[variant]
          )}>
            {title}
          </p>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground truncate tracking-tight tabular-nums">
            {displayValue}
          </p>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground/80 truncate font-medium">
              {description}
            </p>
          )}
          {trend && (
            <div className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full transition-transform duration-300 group-hover:scale-105",
              trend.isPositive 
                ? "text-emerald-500 bg-emerald-500/10" 
                : "text-rose-500 bg-rose-500/10"
            )}>
              <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
              <span className="text-muted-foreground/70 hidden sm:inline">vs mês anterior</span>
            </div>
          )}
        </div>
        
        {/* Icon container with enhanced hover effects */}
        <div className={cn(
          "w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center flex-shrink-0",
          "transition-all duration-500 ease-out",
          iconBgStyles[variant],
          "group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-lg"
        )}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 transition-transform duration-300 group-hover:scale-110" />
        </div>
      </div>
    </div>
  );
}
