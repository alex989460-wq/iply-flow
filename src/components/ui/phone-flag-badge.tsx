import { parsePhoneGeo } from '@/lib/phone-geo';
import { cn } from '@/lib/utils';
import { Phone } from 'lucide-react';

interface Props {
  phone: string | null | undefined;
  className?: string;
  showDdi?: boolean;
  size?: 'xs' | 'sm' | 'md';
  fallbackIconColor?: string;
}

/**
 * Compact flag chip derived from a phone number's DDI.
 * Falls back to a phone icon when the country can't be detected.
 */
export function PhoneFlagBadge({
  phone,
  className,
  showDdi = false,
  size = 'sm',
  fallbackIconColor = 'text-muted-foreground',
}: Props) {
  const geo = parsePhoneGeo(phone);

  const sizes = {
    xs: { flag: 'text-[11px]', ddi: 'text-[9px]', icon: 'h-3 w-3' },
    sm: { flag: 'text-sm', ddi: 'text-[10px]', icon: 'h-3.5 w-3.5' },
    md: { flag: 'text-base', ddi: 'text-xs', icon: 'h-4 w-4' },
  }[size];

  if (!geo.country) {
    return <Phone className={cn(sizes.icon, fallbackIconColor, 'shrink-0', className)} />;
  }

  return (
    <span
      title={geo.isBR && geo.uf ? `${geo.country.name} • ${geo.uf}` : geo.country.name}
      className={cn('inline-flex items-center gap-1 leading-none shrink-0', className)}
    >
      <span className={sizes.flag}>{geo.country.flag}</span>
      {showDdi && (
        <span className={cn(sizes.ddi, 'font-mono text-muted-foreground tabular-nums')}>
          +{geo.country.ddi}
        </span>
      )}
    </span>
  );
}

export default PhoneFlagBadge;
