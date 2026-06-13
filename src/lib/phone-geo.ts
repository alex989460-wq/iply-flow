import { COUNTRIES, type Country } from '@/components/ui/phone-input';

// Brazilian DDD → UF mapping (official ANATEL distribution).
const DDD_TO_UF: Record<string, string> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA', '99': 'MA',
};

const PARSE_ORDER = [...COUNTRIES].sort((a, b) => b.ddi.length - a.ddi.length);

export interface PhoneGeo {
  country: Country | null;
  uf: string | null; // only for Brazil
  isBR: boolean;
}

export function parsePhoneGeo(phone: string | null | undefined): PhoneGeo {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return { country: null, uf: null, isBR: false };

  for (const c of PARSE_ORDER) {
    if (!digits.startsWith(c.ddi)) continue;
    const local = digits.slice(c.ddi.length);
    if (c.iso === 'BR') {
      if (local.length < 10 || local.length > 11) continue; // not a BR full number
      const ddd = local.slice(0, 2);
      const uf = DDD_TO_UF[ddd] ?? null;
      return { country: c, uf, isBR: true };
    }
    return { country: c, uf: null, isBR: false };
  }

  // Legacy: bare BR number (no DDI) — e.g. "11999999999"
  if (digits.length === 10 || digits.length === 11) {
    const uf = DDD_TO_UF[digits.slice(0, 2)] ?? null;
    return { country: COUNTRIES[0], uf, isBR: true };
  }

  return { country: null, uf: null, isBR: false };
}

export interface GeoStats {
  total: number;
  byUf: Record<string, number>;
  byCountry: Array<{ iso: string; name: string; flag: string; ddi: string; count: number }>;
  unknown: number;
  brTotal: number;
  foreignTotal: number;
  topUf: { uf: string; count: number } | null;
}

export function aggregateGeo(phones: Array<string | null | undefined>): GeoStats {
  const byUf: Record<string, number> = {};
  const byCountryMap = new Map<string, { name: string; flag: string; ddi: string; count: number }>();
  let unknown = 0;
  let brTotal = 0;
  let foreignTotal = 0;

  for (const p of phones) {
    const g = parsePhoneGeo(p);
    if (!g.country) {
      unknown += 1;
      continue;
    }
    const key = g.country.iso;
    const existing = byCountryMap.get(key);
    if (existing) existing.count += 1;
    else byCountryMap.set(key, { name: g.country.name, flag: g.country.flag, ddi: g.country.ddi, count: 1 });

    if (g.isBR) {
      brTotal += 1;
      if (g.uf) byUf[g.uf] = (byUf[g.uf] || 0) + 1;
    } else {
      foreignTotal += 1;
    }
  }

  const byCountry = Array.from(byCountryMap.entries())
    .map(([iso, v]) => ({ iso, ...v }))
    .sort((a, b) => b.count - a.count);

  let topUf: GeoStats['topUf'] = null;
  for (const [uf, count] of Object.entries(byUf)) {
    if (!topUf || count > topUf.count) topUf = { uf, count };
  }

  return {
    total: phones.length,
    byUf,
    byCountry,
    unknown,
    brTotal,
    foreignTotal,
    topUf,
  };
}
