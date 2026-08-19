// Captura de leads reais a partir de dados públicos do OpenStreetMap
// (Nominatim para localizar a cidade + Overpass para listar os estabelecimentos).
// Não requer chave de API.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UA = { 'User-Agent': 'SuperGestor-LeadCapture/1.0 (contato@supergestor.top)', 'Accept-Language': 'pt-BR' };

// Termo em português -> filtros OSM
const CATEGORY_MAP: { keys: string[]; filters: string[]; label: string }[] = [
  { keys: ['bar', 'bares', 'pub', 'boteco'], filters: ['amenity=bar', 'amenity=pub'], label: 'Bar' },
  { keys: ['restaurante', 'restaurantes', 'comida', 'pizzaria', 'pizzarias'], filters: ['amenity=restaurant', 'amenity=fast_food'], label: 'Restaurante' },
  { keys: ['lanchonete', 'lanchonetes', 'hamburgueria'], filters: ['amenity=fast_food'], label: 'Lanchonete' },
  { keys: ['cafe', 'café', 'cafeteria', 'cafeterias'], filters: ['amenity=cafe'], label: 'Cafeteria' },
  { keys: ['academia', 'academias', 'crossfit'], filters: ['leisure=fitness_centre', 'amenity=gym'], label: 'Academia' },
  { keys: ['odonto', 'dentista', 'dentistas', 'odontolog'], filters: ['amenity=dentist', 'healthcare=dentist'], label: 'Clínica odontológica' },
  { keys: ['clinica', 'clínica', 'clinicas', 'clínicas', 'medic'], filters: ['amenity=clinic', 'healthcare=clinic', 'amenity=doctors'], label: 'Clínica' },
  { keys: ['farmacia', 'farmácia', 'farmacias', 'farmácias'], filters: ['amenity=pharmacy'], label: 'Farmácia' },
  { keys: ['imobiliaria', 'imobiliária', 'imobiliarias', 'imobiliárias'], filters: ['office=estate_agent'], label: 'Imobiliária' },
  { keys: ['salao', 'salão', 'cabelereiro', 'cabeleireiro', 'barbearia', 'barbearias'], filters: ['shop=hairdresser', 'shop=beauty'], label: 'Salão / Barbearia' },
  { keys: ['petshop', 'pet shop', 'pet'], filters: ['shop=pet', 'amenity=veterinary'], label: 'Pet Shop' },
  { keys: ['hotel', 'hoteis', 'hotéis', 'pousada', 'pousadas'], filters: ['tourism=hotel', 'tourism=guest_house'], label: 'Hotel / Pousada' },
  { keys: ['mercado', 'mercados', 'supermercado', 'supermercados'], filters: ['shop=supermarket', 'shop=convenience'], label: 'Mercado' },
  { keys: ['loja', 'lojas', 'comercio', 'comércio'], filters: ['shop'], label: 'Loja' },
  { keys: ['escola', 'escolas', 'colegio', 'colégio', 'curso', 'cursos'], filters: ['amenity=school', 'amenity=college'], label: 'Escola / Curso' },
  { keys: ['oficina', 'oficinas', 'mecanica', 'mecânica', 'autopec'], filters: ['shop=car_repair'], label: 'Oficina mecânica' },
  { keys: ['advocacia', 'advogado', 'advogados', 'escritorio', 'escritório'], filters: ['office=lawyer', 'office'], label: 'Escritório' },
];

function parseQuery(query: string) {
  const q = String(query || '').trim();
  const lower = q.toLowerCase();
  let cityGuess = '';
  let termPart = lower;

  const m = lower.split(/\s+em\s+|\s+na\s+|\s+no\s+/);
  if (m.length > 1) {
    cityGuess = m[m.length - 1].trim();
    termPart = m.slice(0, m.length - 1).join(' ').trim();
  } else {
    // "barbearias curitiba" -> termo + cidade (últimas 1-2 palavras)
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      cityGuess = words.slice(-1).join(' ');
      termPart = words.slice(0, -1).join(' ');
    }
  }

  const match = CATEGORY_MAP.find(c => c.keys.some(k => termPart.includes(k)))
    || CATEGORY_MAP.find(c => c.keys.some(k => lower.includes(k)));

  return {
    city: cityGuess,
    term: termPart.trim(),
    rawQuery: lower,
    filters: match?.filters || ['shop', 'office', 'amenity'],
    label: match?.label || (termPart.trim() ? termPart.trim().replace(/^\w/, ch => ch.toUpperCase()) : 'Empresa'),
  };
}

async function geocodeCity(city: string) {
  if (!city) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(city)}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) return null;
  const arr = await r.json().catch(() => []);
  const first = Array.isArray(arr) ? arr[0] : null;
  if (!first) return null;
  return {
    name: String(first.display_name || city).split(',')[0],
    lat: Number(first.lat),
    lon: Number(first.lon),
    boundingbox: (first.boundingbox || []).map(Number) as number[],
  };
}

function buildOverpass(filters: string[], bbox: number[], term: string) {
  // bbox de Nominatim = [south, north, west, east]
  const [s, n, w, e] = bbox;
  const box = `${s},${w},${n},${e}`;
  const parts: string[] = [];
  for (const f of filters) {
    const [k, v] = f.split('=');
    const tag = v ? `["${k}"="${v}"]` : `["${k}"]`;
    parts.push(`node${tag}["name"](${box});`);
    parts.push(`way${tag}["name"](${box});`);
    parts.push(`relation${tag}["name"](${box});`);
  }
  
  // Aumenta o escopo de busca para capturar mais estabelecimentos
  if (term) {
    const cleanTerm = term.replace(/["\\]/g, '');
    parts.push(`node["name"~"${cleanTerm}",i](${box});`);
    parts.push(`way["name"~"${cleanTerm}",i](${box});`);
    parts.push(`node["shop"~"${cleanTerm}",i](${box});`);
    parts.push(`node["amenity"~"${cleanTerm}",i](${box});`);
  }
  
  return `[out:json][timeout:90];(${parts.join('')});out center tags 5000;`;
}

function digitsOnly(v: string) {
  return String(v || '').replace(/\D/g, '');
}

function normalizeBrPhone(raw: string): string | null {
  let d = digitsOnly(raw);
  if (!d) return null;
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (!d.startsWith('55')) {
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    else return null;
  }
  if (d.length === 12) d = `${d.slice(0, 4)}9${d.slice(4)}`;
  if (d.length !== 13) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

function isMobile(phone: string) {
  return phone.length === 13 && phone[4] === '9';
}

// Classificação: quente = celular (WhatsApp provável) + site + endereço completo
function classify(lead: { phone: string | null; site: string | null; address: string | null; whatsapp_available: boolean }) {
  let points = 0;
  if (lead.phone) points += 2;
  if (lead.whatsapp_available) points += 2;
  if (lead.site) points += 1;
  if (lead.address) points += 1;
  if (points >= 5) return 'quente';
  if (points >= 3) return 'morno';
  return 'frio';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query || '').trim();
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
    if (!query) return json({ error: 'Informe uma pesquisa. Ex.: "bares em Curitiba"' }, 400);

    const parsed = parseQuery(query);
    const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    const candidates = [
      parsed.city,
      words.slice(-2).join(' '),
      words.slice(-1).join(' '),
      query,
    ].filter(Boolean) as string[];

    let place: Awaited<ReturnType<typeof geocodeCity>> = null;
    for (const c of Array.from(new Set(candidates))) {
      place = await geocodeCity(c);
      if (place?.boundingbox?.length) break;
    }
    if (!place || !place.boundingbox?.length) {
      return json({ error: `Não consegui localizar a cidade da pesquisa "${query}". Tente algo como "barbearias em Curitiba".` }, 400);
    }

    const overpassQuery = buildOverpass(parsed.filters, place.boundingbox, parsed.term);
    let elements: any[] = [];
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.osm.ch/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter'
    ];
    let elements: any[] = [];
    for (const endpoint of endpoints) {
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(overpassQuery)}`,
        });
        if (!r.ok) continue;
        const data = await r.json().catch(() => null);
        if (data?.elements?.length) { 
          elements = data.elements; 
          break; 
        }
      } catch { /* tenta o próximo endpoint */ }
    }

    const seen = new Set<string>();
    const leads: any[] = [];
    for (const el of elements) {
      const t = el.tags || {};
      const name = String(t.name || '').trim();
      if (!name) continue;

      const rawPhone = t['contact:phone'] || t.phone || t['contact:mobile'] || t['contact:whatsapp'] || '';
      const phone = normalizeBrPhone(String(rawPhone).split(';')[0]);
      const site = String(t.website || t['contact:website'] || '').trim() || null;
      const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
      const address = street || String(t['addr:full'] || '').trim() || null;
      const city = String(t['addr:city'] || place.name || parsed.city || '').trim() || null;

      const dedupeKey = phone || `${name.toLowerCase()}|${address || ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const whatsapp_available = !!(t['contact:whatsapp'] || (phone && isMobile(phone)));
      const lead = {
        name,
        phone,
        site,
        address,
        city,
        category: parsed.label,
        whatsapp_available,
        source_query: query,
      };
      leads.push({ ...lead, score: classify({ phone, site, address, whatsapp_available }) });
      if (leads.length >= limit) break;
    }

    // Prioriza quem tem telefone
    leads.sort((a, b) => (b.phone ? 1 : 0) - (a.phone ? 1 : 0));

    return json({
      success: true,
      query,
      city: place.name,
      category: parsed.label,
      found: elements.length,
      leads,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
