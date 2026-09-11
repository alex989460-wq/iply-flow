import { cn } from '@/lib/utils';
import waLogo from '@/assets/whatsapp-logo.png';

export function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <img
      src={waLogo}
      alt="WhatsApp"
      className={cn('inline-block object-contain select-none', className)}
      draggable={false}
    />
  );
}
