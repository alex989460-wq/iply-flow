const KNOWN_COUNTRY_CODES = [
  '971', '598', '595', '593', '591', '353', '351',
  '86', '81', '61', '58', '57', '56', '54', '52', '51', '49', '44', '41', '39', '34', '33', '32', '31',
] as const;

function hasKnownForeignCountryCode(digits: string) {
  return KNOWN_COUNTRY_CODES.some((ddi) => digits.startsWith(ddi) && digits.length > ddi.length);
}

function stripAccidentalBrazilPrefix(digits: string) {
  if (!digits.startsWith('55')) return digits;
  const withoutBrazilCode = digits.slice(2);
  // Corrige números estrangeiros de 11 dígitos que já foram salvos/enviados com 55 por engano.
  if (withoutBrazilCode.length === 11 && withoutBrazilCode[2] !== '9') return withoutBrazilCode;
  if (withoutBrazilCode.length >= 12 && hasKnownForeignCountryCode(withoutBrazilCode)) return withoutBrazilCode;
  return digits;
}

export function normalizeWhatsAppPhone(raw: string | number | null | undefined): string {
  const value = String(raw ?? '').trim();
  const digits = stripAccidentalBrazilPrefix(value.replace(/\D/g, ''));

  if (!digits) return '';
  if (value.startsWith('+')) return digits;
  if (digits.startsWith('55')) return digits;
  if (hasKnownForeignCountryCode(digits)) return digits;
  if (digits.length >= 12) return digits;
  // BR mobile: 11 dígitos com '9' na 3ª posição (DDD + 9 + 8). Caso contrário é estrangeiro (ex.: US 1XXXXXXXXXX).
  if (digits.length === 11) {
    if (digits[2] === '9') return `55${digits}`;
    return digits;
  }
  if (digits.length === 10) return `55${digits}`;

  return digits;
}