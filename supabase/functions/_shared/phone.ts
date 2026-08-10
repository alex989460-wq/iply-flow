// Normalização de telefones WhatsApp (E.164 sem '+') compartilhada entre as
// funções de cobrança. Objetivo: nunca prefixar "55" em número estrangeiro e
// nunca perder o DDI de números de fora do Brasil.

// Todos os códigos de país E.164 (sem o 55 do Brasil), ordenados do mais longo
// para o mais curto para casar o prefixo correto.
export const COUNTRY_CODES: string[] = [
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90',
  '91', '92', '93', '94', '95', '98',
  '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230',
  '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246',
  '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264',
  '265', '266', '267', '268', '269', '290', '291', '297', '298', '299',
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375',
  '376', '377', '378', '380', '381', '382', '383', '385', '386', '387', '389',
  '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592',
  '593', '594', '595', '596', '597', '598', '599',
  '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687',
  '688', '689', '690', '691', '692',
  '850', '852', '853', '855', '856', '870', '880', '886',
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976',
  '977', '992', '993', '994', '995', '996', '998',
].sort((a, b) => b.length - a.length);

const BR_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function hasForeignCountryCode(digits: string): boolean {
  if (digits.startsWith('55')) return false;
  return COUNTRY_CODES.some((cc) => digits.startsWith(cc) && digits.length > cc.length + 4);
}

function looksLikeBrazilNational(digits: string): boolean {
  if (digits.length !== 10 && digits.length !== 11) return false;
  if (!BR_DDDS.has(Number(digits.slice(0, 2)))) return false;
  // Celular BR de 11 dígitos sempre começa com 9 após o DDD.
  if (digits.length === 11 && digits[2] !== '9') return false;
  return true;
}

/** Remove um "55" adicionado por engano na frente de um número estrangeiro. */
function stripAccidentalBrazilPrefix(digits: string): string {
  if (!digits.startsWith('55')) return digits;
  // Número BR válido: 55 + 10/11 dígitos nacionais.
  const national = digits.slice(2);
  if (looksLikeBrazilNational(national)) return digits;
  if (national.length >= 8 && hasForeignCountryCode(national)) return national;
  return digits;
}

/**
 * Retorna o número em formato internacional (somente dígitos, com DDI).
 * Nunca adiciona 55 a números estrangeiros.
 */
export function normalizeWhatsAppPhone(raw: unknown): string {
  const value = String(raw ?? '').trim();
  const hadPlus = value.startsWith('+');
  const digits = stripAccidentalBrazilPrefix(value.replace(/\D/g, ''));
  if (!digits) return '';
  if (hadPlus) return digits;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (looksLikeBrazilNational(digits)) return `55${digits}`;
  if (hasForeignCountryCode(digits)) return digits;
  return digits;
}

/** true quando o número não é do Brasil (precisa de envio internacional). */
export function isForeignPhone(raw: unknown): boolean {
  const n = normalizeWhatsAppPhone(raw);
  return !!n && !n.startsWith('55');
}

/** Formato com '+' — exigido por APIs que assumem Brasil quando não há DDI explícito. */
export function toInternationalPhone(raw: unknown): string {
  const n = normalizeWhatsAppPhone(raw);
  if (!n) return '';
  return n.startsWith('55') ? n : `+${n}`;
}
