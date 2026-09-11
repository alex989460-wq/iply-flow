import { cn } from '@/lib/utils';
import metaLogo from '@/assets/meta-logo.webp';

/**
 * Official Meta infinity logo (image from Meta press kit).
 * Use this everywhere the app references the official WhatsApp Cloud / Meta API.
 */
export function MetaLogo({ className }: { className?: string }) {
  return (
    <img
      src={metaLogo}
      alt="Meta"
      className={cn('inline-block object-contain select-none', className)}
      draggable={false}
    />
  );
}
