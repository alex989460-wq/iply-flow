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
  default: 'bg-primary',
  primary: 'bg-primary',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-rose-500',
};

const iconBgStyles = {
  default: 'bg-primary/10 text-primary group-hover:bg-primary/20',
  primary: 'bg-primary/10 text-primary group-hover:bg-primary/15',
  success: 'bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20',
  warning: 'bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20',
  destructive: 'bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/20',
};

const titleColors = {
  default: 'text-primary',
  primary: 'text-primary',
  success: 'text-emerald-500',
  warning: 'text-orange-500',
  destructive: 'text-rose-500',
};

const glowColors = {
  default: 'group-hover:shadow-primary/20',
  primary: 'group-hover:shadow-primary/10',
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
    ? Math.round(animatedValue).toLocaleString('pt-BR')
    : isMonetary 
      ? `R$ ${animatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : Math.round(animatedValue).toLocaleString('pt-BR');

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
        "group relative overflow-hidden rounded-2xl",
        "bg-card",
        "border border-border/50",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-0.5",
        "hover:border-primary/20 hover:shadow-lg",
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
      {/* Status accent */}
      <div className={cn(
        "absolute inset-x-0 top-0 h-0.5 transition-all duration-300 group-hover:h-1",
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
      
      <div className="relative flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="space-y-1.5 min-w-0 flex-1">
          <p className={cn(
            "line-clamp-1 text-[10px] font-bold uppercase leading-tight tracking-[0.14em] transition-colors duration-300 opacity-80 sm:text-[11px]",
            titleColors[variant]
          )}>
            {title}
          </p>
          <p className="break-words text-xl font-bold leading-none tracking-tight text-foreground tabular-nums sm:text-2xl">
            {displayValue}
          </p>
          {description && (
            <p className="text-[10px] sm:text-xs text-muted-foreground/80 line-clamp-2 font-medium leading-snug">
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
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
          "transition-all duration-500 ease-out",
          iconBgStyles[variant],
          "group-hover:scale-105"
        )}>
          <Icon className="h-5 w-5 transition-transform duration-300" />
        </div>
      </div>
    </div>
  );
}
