export function normalizeWhatsAppPhone(raw: string | number | null | undefined): string {
  const value = String(raw ?? '').trim();
  const digits = value.replace(/\D/g, '');

  if (!digits) return '';
  if (value.startsWith('+')) return digits;
  if (digits.startsWith('55')) return digits;
  if (digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;

  return digits;
}