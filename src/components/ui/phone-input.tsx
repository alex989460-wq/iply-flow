import { useMemo, useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * PhoneInput — country selector + national number.
 *
 * Storage convention (value/onChange): digits-only with DDI, NO leading '+'.
 *   - Brazil example: "5511999999999"
 *   - Belgium example: "32465296109"
 *
 * Sorted longest-DDI first so parsing is unambiguous.
 */
export interface Country {
  iso: string;
  name: string;
  ddi: string; // digits only
  flag: string;
  maxLocal: number; // typical national length
}

// Curated list — Brazil first, then common South-American/EU/US destinations.
export const COUNTRIES: Country[] = [
  { iso: 'BR', name: 'Brasil', ddi: '55', flag: '🇧🇷', maxLocal: 11 },
  { iso: 'US', name: 'EUA / Canadá', ddi: '1', flag: '🇺🇸', maxLocal: 10 },
  { iso: 'PT', name: 'Portugal', ddi: '351', flag: '🇵🇹', maxLocal: 9 },
  { iso: 'ES', name: 'Espanha', ddi: '34', flag: '🇪🇸', maxLocal: 9 },
  { iso: 'FR', name: 'França', ddi: '33', flag: '🇫🇷', maxLocal: 9 },
  { iso: 'IT', name: 'Itália', ddi: '39', flag: '🇮🇹', maxLocal: 10 },
  { iso: 'DE', name: 'Alemanha', ddi: '49', flag: '🇩🇪', maxLocal: 11 },
  { iso: 'GB', name: 'Reino Unido', ddi: '44', flag: '🇬🇧', maxLocal: 10 },
  { iso: 'NL', name: 'Holanda', ddi: '31', flag: '🇳🇱', maxLocal: 9 },
  { iso: 'CH', name: 'Suíça', ddi: '41', flag: '🇨🇭', maxLocal: 9 },
  { iso: 'BE', name: 'Bélgica', ddi: '32', flag: '🇧🇪', maxLocal: 9 },
  { iso: 'IE', name: 'Irlanda', ddi: '353', flag: '🇮🇪', maxLocal: 9 },
  { iso: 'AR', name: 'Argentina', ddi: '54', flag: '🇦🇷', maxLocal: 10 },
  { iso: 'CL', name: 'Chile', ddi: '56', flag: '🇨🇱', maxLocal: 9 },
  { iso: 'CO', name: 'Colômbia', ddi: '57', flag: '🇨🇴', maxLocal: 10 },
  { iso: 'MX', name: 'México', ddi: '52', flag: '🇲🇽', maxLocal: 10 },
  { iso: 'PY', name: 'Paraguai', ddi: '595', flag: '🇵🇾', maxLocal: 9 },
  { iso: 'UY', name: 'Uruguai', ddi: '598', flag: '🇺🇾', maxLocal: 8 },
  { iso: 'PE', name: 'Peru', ddi: '51', flag: '🇵🇪', maxLocal: 9 },
  { iso: 'BO', name: 'Bolívia', ddi: '591', flag: '🇧🇴', maxLocal: 8 },
  { iso: 'VE', name: 'Venezuela', ddi: '58', flag: '🇻🇪', maxLocal: 10 },
  { iso: 'EC', name: 'Equador', ddi: '593', flag: '🇪🇨', maxLocal: 9 },
  { iso: 'JP', name: 'Japão', ddi: '81', flag: '🇯🇵', maxLocal: 10 },
  { iso: 'CN', name: 'China', ddi: '86', flag: '🇨🇳', maxLocal: 11 },
  { iso: 'AU', name: 'Austrália', ddi: '61', flag: '🇦🇺', maxLocal: 9 },
  { iso: 'AE', name: 'Emirados Árabes', ddi: '971', flag: '🇦🇪', maxLocal: 9 },
];

const BR = COUNTRIES[0];

// DDIs sorted longest first for greedy parsing (e.g. "595" before "5").
const PARSE_ORDER = [...COUNTRIES].sort((a, b) => b.ddi.length - a.ddi.length);

function detectCountry(digits: string): { country: Country; local: string } {
  if (!digits) return { country: BR, local: '' };
  for (const c of PARSE_ORDER) {
    if (digits.startsWith(c.ddi)) {
      const local = digits.slice(c.ddi.length);
      // For BR specifically, require leading DDI to be exactly "55" and rest sane.
      if (c.iso === 'BR') {
        if (local.length <= 11) return { country: c, local };
        continue;
      }
      return { country: c, local };
    }
  }
  // Unknown DDI → leave as BR with raw digits stripped of any "55".
  return { country: BR, local: digits.startsWith('55') ? digits.slice(2) : digits };
}

function formatBrLocal(local: string): string {
  const d = local.replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (!rest) return `(${ddd}`;
  const prefix = rest.length > 4 ? rest.slice(0, -4) : rest;
  const suffix = rest.length > 4 ? rest.slice(-4) : '';
  return `(${ddd}) ${prefix}${suffix ? `-${suffix}` : ''}`;
}

function formatGenericLocal(local: string): string {
  // light grouping every 3 for readability, never beyond 15 total
  const d = local.replace(/\D/g, '').slice(0, 15);
  return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

export interface PhoneInputProps {
  value: string; // digits with DDI, no '+'
  onChange: (digits: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
  name?: string;
  autoFocus?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  required,
  disabled,
  className,
  inputClassName,
  id,
  name,
  autoFocus,
}: PhoneInputProps) {
  const parsed = useMemo(() => detectCountry((value || '').replace(/\D/g, '')), [value]);
  const [country, setCountry] = useState<Country>(parsed.country);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const lastEmittedRef = useRef<string>('');

  // Sync detected country when external value changes to a different DDI.
  useEffect(() => {
    if (parsed.country.iso !== country.iso) {
      setCountry(parsed.country);
    }
  }, [parsed.country.iso]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = parsed.local;
  const displayLocal = country.iso === 'BR' ? formatBrLocal(local) : formatGenericLocal(local);
  const placeholderText =
    placeholder ?? (country.iso === 'BR' ? '(11) 99999-9999' : 'Número (sem DDI)');

  const emit = (newCountry: Country, newLocal: string) => {
    const cleaned = newLocal.replace(/\D/g, '').slice(0, 15);
    const out = cleaned ? `${newCountry.ddi}${cleaned}` : '';
    if (out !== lastEmittedRef.current) {
      lastEmittedRef.current = out;
      onChange(out);
    }
  };

  const onLocalChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, country.iso === 'BR' ? 11 : 15);
    emit(country, digits);
  };

  const selectCountry = (c: Country) => {
    setCountry(c);
    setOpen(false);
    setFilter('');
    emit(c, local);
  };

  const filtered = filter
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(filter.toLowerCase()) ||
          c.ddi.includes(filter.replace(/\D/g, '')) ||
          c.iso.toLowerCase().includes(filter.toLowerCase()),
      )
    : COUNTRIES;

  return (
    <div className={cn('flex items-stretch gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="px-2 gap-1 shrink-0 bg-secondary/50 h-10"
            aria-label="Selecionar país"
          >
            <span className="text-base leading-none">{country.flag}</span>
            <span className="text-xs font-mono text-muted-foreground">+{country.ddi}</span>
            <ChevronDown className="w-3 h-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-72" align="start">
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar país ou DDI..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map((c) => (
              <button
                key={c.iso}
                type="button"
                onClick={() => selectCountry(c)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent text-left',
                  c.iso === country.iso && 'bg-accent/50',
                )}
              >
                <span className="text-base leading-none">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs font-mono text-muted-foreground">+{c.ddi}</span>
                {c.iso === country.iso && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                Nenhum país encontrado
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        autoFocus={autoFocus}
        value={displayLocal}
        onChange={(e) => onLocalChange(e.target.value)}
        placeholder={placeholderText}
        required={required}
        disabled={disabled}
        className={cn('bg-secondary/50 flex-1', inputClassName)}
      />
    </div>
  );
}

export default PhoneInput;
