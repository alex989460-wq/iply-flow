import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão das ferramentas — mesmo visual do Dashboard.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border/50 bg-card px-5 py-6 shadow-sm animate-fade-in sm:px-7 sm:py-7',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-gradient-to-l from-primary/10 to-transparent" />
      <div className="pointer-events-none absolute -right-14 -top-24 h-52 w-52 rounded-full border-[32px] border-primary/10" />
      <div className="relative z-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 min-w-0">
          {Icon && (
            <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl border border-border/60 bg-background/80 text-primary shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                {eyebrow}
              </span>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
