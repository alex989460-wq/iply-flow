import { cn } from '@/lib/utils';

/**
 * Official Meta infinity logo (gradient blue).
 * Single-path SVG approximating the official mark — works at any size.
 */
export function MetaLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 168"
      className={cn('inline-block', className)}
      aria-label="Meta"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="metaInfinity" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0064E0" />
          <stop offset="50%" stopColor="#0082FB" />
          <stop offset="100%" stopColor="#19AFFF" />
        </linearGradient>
      </defs>
      <path
        fill="url(#metaInfinity)"
        d="M27.5 84c0-26 14.5-50 38-50 13 0 23.7 6 36 22 12 16 25 39 35 56 7 12 14 17 22 17 9 0 14-7 14-19 0-13-6-32-15-44-7-9-14-13-23-13-7 0-13 3-19 9l-15-19c10-10 22-16 35-16 26 0 47 26 47 67 0 26-11 44-32 44-15 0-26-7-39-26-9-13-19-30-28-46-8-14-15-21-23-21-11 0-20 12-20 33 0 8 2 14 5 19l-22 14c-6-9-9-19-9-37z"
      />
    </svg>
  );
}
