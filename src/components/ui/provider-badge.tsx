import { cn } from '@/lib/utils';
import { MetaLogo } from './meta-logo';
import { WhatsAppLogo } from './whatsapp-logo';

export type WhatsAppProvider = 'meta' | 'evolution';

interface ProviderBadgeProps {
  provider: WhatsAppProvider;
  className?: string;
  /** Hide the text label, show only the logo */
  iconOnly?: boolean;
  size?: 'sm' | 'md';
}

const LABELS: Record<WhatsAppProvider, string> = {
  meta: 'WhatsApp Business (Meta)',
  evolution: 'WhatsApp',
};

/**
 * Unified badge to indicate which WhatsApp provider a resource uses.
 * - `meta` → Meta infinity logo (official WhatsApp Cloud API)
 * - `evolution` → Green WhatsApp logo (Evolution API / non-official)
 *
 * Use everywhere the app shows WhatsApp-related resources: connection cards,
 * chat headers, message logs, templates, triggers, billing history, etc.
 */
export function ProviderBadge({
  provider,
  className,
  iconOnly = false,
  size = 'sm',
}: ProviderBadgeProps) {
  const logoCls = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  const textCls = size === 'md' ? 'text-sm' : 'text-[11px]';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 font-medium text-muted-foreground backdrop-blur-sm',
        textCls,
        className,
      )}
      title={LABELS[provider]}
    >
      {provider === 'meta' ? (
        <MetaLogo className={logoCls} />
      ) : (
        <WhatsAppLogo className={logoCls} />
      )}
      {!iconOnly && <span className="truncate">{LABELS[provider]}</span>}
    </span>
  );
}
