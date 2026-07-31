// Otimizador de templates: recebe uma mensagem crua e devolve um template
// reescrito para ser aprovado como UTILITY (e não MARKETING) pela Meta.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `Você é o melhor especialista do Brasil em templates aprovados na WhatsApp Cloud API (Meta).
Sua tarefa: transformar a mensagem crua do usuário em um template PROFISSIONAL, bonito e bem estruturado, com ALTÍSSIMA chance de aprovação na categoria UTILITY.

## REGRA NÚMERO 1 — FIDELIDADE ABSOLUTA AO TEXTO ORIGINAL
- O template deve dizer A MESMA COISA que a mensagem original, com as MESMAS frases sempre que possível.
- É PROIBIDO trocar o assunto, inventar um novo motivo de contato ou criar um "bloco de dados" (Usuário, Plano, Servidor, Valor, Vencimento) que NÃO exista na mensagem original.
- Só crie uma variável quando o dado correspondente aparece (ou é claramente citado) na mensagem original.
- Se a mensagem original fala de teste gratuito de 12 horas, o template fala disso (de forma transacional). Se fala de retorno do cliente, fala disso. Jamais substitua por "status da assinatura" ou outro tema genérico.
- Você pode: reescrever termos promocionais em linguagem neutra/transacional, melhorar a formatação, adicionar saudação e rodapé. Você NÃO pode: adicionar informações novas.

## Qualidade da formatação
- Mantenha o texto do usuário, apenas bem diagramado: saudação com *{{nome}}*, o conteúdo original em parágrafos, e uma linha final neutra ("Qualquer dúvida, estamos à disposição. 🙏").
- Use emojis com moderação e sentido informativo (📅 👤 💰 📦 ✅ 🔒 🧾 🖥️ 🙏 👋). Nada de emojis de venda (🔥🎉🤑💥).
- Use a formatação do WhatsApp: *negrito*, _itálico_. Nunca use markdown (**, ##, -).
- Quebre linhas de verdade (\\n). Deixe uma linha em branco entre os blocos.


## Variáveis
- Crie variáveis APENAS para dados citados na mensagem original (ex.: se cita duração do teste, use {{duracao}}). Não invente campos.
- Além dessas, só {{nome}} na saudação é sempre permitido.
- Preserve as variáveis que o usuário já escreveu ({{...}}), sem renomear.
- Formato snake_case minúsculo sem acentos. Nomes preferidos: nome, vencimento, valor, plano, usuario, senha, servidor, link, data, telas, pedido.
- Sempre inclua {{nome}} na saudação.
- Nunca comece nem termine o corpo com variável, e nunca coloque duas variáveis coladas (regra da Meta).
- Para cada variável forneça um "example" realista (ex.: nome="João Silva", vencimento="15/08/2026", valor="49,90").

## Regras UTILITY
- Conteúdo transacional: pedido, conta, assinatura, pagamento, vencimento, renovação, agendamento ou serviço JÁ contratado.
- PROIBIDO: oferta, desconto, promoção, "aproveite", "assine agora", cupom, urgência comercial, convites.
- Corpo até 1024 caracteres. Footer curto (máx 60 caracteres, neutro, ex.: "Mensagem automática do sistema").
- Botões só se transacionais (URL de pagamento/2ª via ou QUICK_REPLY de confirmação).
- Nome do template: snake_case, minúsculo, sem acentos, até 60 caracteres, descritivo (ex.: aviso_vencimento_assinatura).

## Fidelidade ao texto original (REGRA MAIS IMPORTANTE)
- NUNCA invente outro assunto. O template deve tratar EXATAMENTE do mesmo assunto da mensagem original.
- Se a mensagem fala de assinatura inativa/retorno, o template fala disso. Se fala de vencimento, fala de vencimento. Jamais troque o tema.
- Reaproveite as frases do usuário sempre que possível, apenas neutralizando termos promocionais.

## Cabeçalho
- Sugira um header. Use "TEXT" com um título curto (máx 60 caracteres, pode ter 1 emoji), ou "IMAGE" quando a mensagem ficar melhor com uma arte (confirmações de pagamento, comprovantes, avisos visuais).
- Sempre devolva também "imagePrompt": uma descrição curta em português da arte ideal para o cabeçalho (será usada para gerar a imagem automaticamente).

Responda SOMENTE com JSON válido, sem markdown, no formato:
{
  "name": "string",
  "category": "UTILITY",
  "language": "pt_BR",
  "header": {"type":"NONE|TEXT|IMAGE","text":"string quando TEXT"},
  "imagePrompt": "descrição da arte do cabeçalho",
  "body": "string com {{variaveis}}, emojis e quebras de linha",
  "footer": "string ou vazio",
  "buttons": [{"type":"URL|QUICK_REPLY|PHONE_NUMBER","text":"string","url":"opcional","phone":"opcional"}],
  "variables": [{"name":"nome","example":"João Silva"}],
  "risk": "LOW|MEDIUM|HIGH",
  "reasoning": "explicação curta em português do que foi alterado e por quê",
  "warnings": ["itens da mensagem original que seriam classificados como MARKETING"]
}`;

// Reforço aplicado quando o usuário pede explicitamente RISCO BAIXO
const LOW_RISK_RULES = `

## MODO RISCO BAIXO (OBRIGATÓRIO NESTA GERAÇÃO)
O usuário exige um template com risco de rejeição LOW. Portanto:
- Remova QUALQUER palavra promocional, convite, urgência ou apelo comercial ("volte", "aproveite", "grátis", "oferta", "desconto", "novidade", "não perca", "exclusivo", "promoção", "assine", "corra").
- Reescreva a intenção original em linguagem 100% transacional/informativa: informe um status, um dado da conta, um vencimento, um pedido ou uma instrução de serviço.
- Nada de exclamações excessivas, no máximo 3 emojis discretos no corpo inteiro.
- Não use botões de marketing; no máximo 1 botão URL de pagamento/2ª via ou QUICK_REPLY neutro.
- Rodapé sempre neutro ("Mensagem automática do sistema").
- O campo "risk" DEVE ser "LOW" e "warnings" deve listar o que foi removido do texto original.`;




const MARKETING_TERMS = [
  'promoção', 'promocao', 'oferta', 'desconto', 'aproveite', 'novidade', 'assine agora',
  'imperdível', 'imperdivel', 'cupom', 'grátis', 'gratis', 'teste gratuito', 'volte',
  'últimas vagas', 'ultimas vagas', 'corra', 'não perca', 'nao perca', 'exclusivo',
];

function slug(s: string) {
  return String(s || 'template_utility')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'template_utility';
}

const EXAMPLES: Record<string, string> = {
  nome: 'João Silva',
  name: 'João Silva',
  cliente: 'João Silva',

  vencimento: '15/08/2026',
  data: '15/08/2026',
  valor: '49,90',
  plano: 'Mensal',
  usuario: 'joao123',
  senha: 'a1b2c3',
  servidor: 'Servidor 1',
  telas: '2',
  link: 'https://exemplo.com/pagar',
  pedido: '10245',
};

const FIELD_HINTS: Array<{ key: string; emoji: string; label: string; terms: string[] }> = [
  { key: 'vencimento', emoji: '📅', label: 'Vencimento', terms: ['vencimento', 'vence', 'validade', 'expira'] },
  { key: 'usuario', emoji: '👤', label: 'Usuário', terms: ['usuario', 'usuário', 'login', 'user'] },
  { key: 'senha', emoji: '🔒', label: 'Senha', terms: ['senha', 'password'] },
  { key: 'valor', emoji: '💰', label: 'Valor', terms: ['valor', 'preço', 'preco', 'r$', 'pagamento'] },
  { key: 'plano', emoji: '📦', label: 'Plano', terms: ['plano', 'assinatura', 'pacote'] },
  { key: 'servidor', emoji: '🖥️', label: 'Servidor', terms: ['servidor', 'server', 'painel'] },
  { key: 'telas', emoji: '📺', label: 'Telas', terms: ['tela', 'telas', 'conexão', 'conexao'] },
  { key: 'pedido', emoji: '🧾', label: 'Pedido', terms: ['pedido', 'protocolo', 'order'] },
];

const INTENTS: Array<{ key: string; name: string; header: string; terms: string[] }> = [
  { key: 'pagamento', name: 'confirmacao_pagamento', header: '✅ Pagamento confirmado', terms: ['pagamento', 'comprovante', 'pago', 'aprovad'] },
  { key: 'vencimento', name: 'aviso_vencimento_assinatura', header: '📅 Aviso de vencimento', terms: ['vencimento', 'vence', 'expira', 'validade'] },
  { key: 'renovacao', name: 'renovacao_assinatura', header: '🔄 Renovação da assinatura', terms: ['renov'] },
  { key: 'reativacao', name: 'status_assinatura_inativa', header: '📄 Status da sua assinatura', terms: ['inativa', 'inativo', 'voltar', 'retorno', 'reativ', 'cancelad'] },
  { key: 'acesso', name: 'dados_de_acesso', header: '🔐 Dados de acesso', terms: ['login', 'usuario', 'usuário', 'senha', 'acesso'] },
  { key: 'ativacao', name: 'ativacao_do_aplicativo', header: '📱 Ativação do aplicativo', terms: ['ativa', 'aplicativo', 'app', 'mac'] },
];

// Fallback determinístico (sem IA): reescreve termos de marketing e organiza a
// mensagem como comunicação transacional, sem inventar informações.
function localOptimize(message: string, lowRisk = false) {
  let original = message.trim();
  const sourceLower = original.toLowerCase();
  const detectedTerms = MARKETING_TERMS.filter(t => sourceLower.includes(t));
  const warnings = detectedTerms
    .map(t => `Termo promocional detectado: "${t}" — pode fazer a Meta classificar como MARKETING.`);

  const neutralReplacements: Array<[RegExp, string]> = [
    [/\bvolte\b/gi, 'a reativação está disponível'],
    [/\baproveite\b/gi, 'consulte'],
    [/\bgrátis\b|\bgratis\b/gi, 'sem custo'],
    [/\bteste gratuito\b/gi, 'período de teste sem custo'],
    [/\boferta\b/gi, 'condição informada'],
    [/\bpromoç(?:ão|ao)\b/gi, 'condição vigente'],
    [/\bdesconto\b/gi, 'ajuste de valor'],
    [/\bnão perca\b|\bnao perca\b/gi, 'consulte as informações'],
    [/\bcorra\b/gi, 'verifique'],
    [/\bassine agora\b/gi, 'solicite a contratação'],
    [/\bexclusiv[oa]\b/gi, 'disponível para sua conta'],
    [/!{2,}/g, '.'],
  ];
  for (const [pattern, replacement] of neutralReplacements) original = original.replace(pattern, replacement);
  original = original.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const lower = original.toLowerCase();

  // normaliza formatação para o padrão WhatsApp e limpa markdown
  let body = original
    .replace(/\*\*/g, '*')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // variáveis já usadas pelo usuário (preservadas como estão)
  const existing = Array.from(new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(m => m[1])));

  // garante saudação personalizada quando não houver nenhuma variável de nome
  const hasName = existing.some(v => /^(nome|name|cliente)$/i.test(v));
  if (!hasName) {
    body = `Olá, *{{nome}}*! 👋\n\n${body}`;
    existing.unshift('nome');
  }

  // Torna a mudança evidente mesmo sem IA, mantendo o conteúdo original.
  const contentStart = body.indexOf('\n\n');
  if (contentStart >= 0) {
    const greeting = body.slice(0, contentStart);
    let content = body.slice(contentStart + 2).trim();
    if (!/^(informamos|registramos|confirmamos|identificamos|comunicamos)\b/i.test(content)) {
      content = `Informamos que ${content.charAt(0).toLowerCase()}${content.slice(1)}`;
    }
    body = `${greeting}\n\n${content}`;
  }

  // regra da Meta: corpo não pode começar nem terminar com variável
  if (/^\s*\{\{/.test(body)) body = `Olá! ${body}`;
  if (/\}\}\s*$/.test(body)) body = `${body}\n\nQualquer dúvida, estamos à disposição. 🙏`;

  body = body.slice(0, 1024);

  const intent = INTENTS.find(i => i.terms.some(t => lower.includes(t)));

  return {
    name: slug(intent?.name || 'mensagem_transacional'),
    category: 'UTILITY',
    language: 'pt_BR',
    header: { type: 'TEXT', text: intent?.header || '📄 Aviso importante' },
    body,
    footer: 'Mensagem automática do sistema',
    buttons: [],
    variables: Array.from(new Set(existing)).map(v => ({ name: v, example: EXAMPLES[v] || EXAMPLES[v.toLowerCase()] || 'Exemplo' })),
    risk: lowRisk ? 'LOW' : (warnings.length ? 'MEDIUM' : 'LOW'),
    reasoning: 'Versão transacional: reescrevi expressões promocionais, organizei a mensagem e mantive somente as informações presentes no texto original.',
    warnings,
    imagePrompt: `Banner relacionado a ${intent?.header || original.slice(0, 90)}`,
  };
}

// Gera uma imagem de cabeçalho e devolve a URL pública (bucket reseller-assets)
// ---------- PNG encoder mínimo (sem dependências) ----------
function crc32(buf: Uint8Array) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function adler32(buf: Uint8Array) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function encodePNG(width: number, height: number, rgb: Uint8Array) {
  // raw scanlines com filtro 0
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  // zlib com blocos "stored"
  const MAX = 65535;
  const blocks = Math.ceil(raw.length / MAX);
  const z = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  z[0] = 0x78; z[1] = 0x01;
  let p = 2, off = 0;
  while (off < raw.length) {
    const len = Math.min(MAX, raw.length - off);
    z[p++] = off + len >= raw.length ? 1 : 0;
    z[p++] = len & 0xff; z[p++] = (len >> 8) & 0xff;
    z[p++] = ~len & 0xff; z[p++] = (~len >> 8) & 0xff;
    z.set(raw.subarray(off, off + len), p);
    p += len; off += len;
  }
  new DataView(z.buffer).setUint32(p, adler32(raw));
  p += 4;
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', z.subarray(0, p)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let q = 0;
  for (const a of parts) { out.set(a, q); q += a.length; }
  return out;
}

// Banner moderno gerado localmente (mesh gradient + glass card + vinheta)
const FONT: Record<string, string[]> = {
  A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'], D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'], F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'], H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'], J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'], L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'], N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'], P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'], R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'], V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','11011','10001'], X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'], Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10011','10101','10101','11001','10001','01110'], '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'], '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00001','01110'],
};

function bannerTitle(value: string) {
  const clean = value.replace(/\{\{[^}]+\}\}/g, '').replace(/[*_#]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const words = clean.split(' ').filter(Boolean);
  let title = '';
  for (const word of words) {
    if ((title + ' ' + word).trim().length > 42) break;
    title = `${title} ${word}`.trim();
  }
  return title || 'AVISO IMPORTANTE';
}

function wrapBannerTitle(value: string) {
  const words = bannerTitle(value).split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = `${current} ${word}`.trim();
    if (candidate.length > 22 && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function localBanner(seed: string, text?: string, style?: string) {
  const W = 1200, H = 628;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);

  // paletas modernas (base escura + 3 blobs de cor)
  const palettes = [
    { base: [7, 12, 20], blobs: [[16, 185, 129], [56, 189, 248], [99, 102, 241]] },
    { base: [10, 8, 22], blobs: [[139, 92, 246], [236, 72, 153], [59, 130, 246]] },
    { base: [8, 14, 14], blobs: [[45, 212, 191], [34, 197, 94], [14, 165, 233]] },
    { base: [18, 10, 8], blobs: [[251, 146, 60], [244, 63, 94], [168, 85, 247]] },
  ];
  const stylePalette: Record<string, number> = { moderno: 0, minimalista: 2, neon: 1, corporativo: 0 };
  const pal = palettes[stylePalette[String(style || '').toLowerCase()] ?? h % palettes.length];
  const blobs = pal.blobs.map((c, i) => ({
    c,
    x: W * (0.18 + 0.32 * i + rand() * 0.12),
    y: H * (0.22 + rand() * 0.56),
    r: W * (0.30 + rand() * 0.22),
  }));

  const px = new Uint8Array(W * H * 3);
  // card "glass" central
  const cx0 = W * 0.08, cx1 = W * 0.92, cy0 = H * 0.14, cy1 = H * 0.86, rad = 46;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = pal.base[0], g = pal.base[1], b = pal.base[2];

      // mesh gradient: soma suave dos blobs
      for (const bl of blobs) {
        const dx = (x - bl.x) / bl.r;
        const dy = (y - bl.y) / bl.r;
        let d = 1 - (dx * dx + dy * dy);
        if (d <= 0) continue;
        d = d * d * 0.85;
        r += (bl.c[0] - r) * d;
        g += (bl.c[1] - g) * d;
        b += (bl.c[2] - b) * d;
      }

      // vinheta suave nas bordas
      const vx = (x / W - 0.5) * 2, vy = (y / H - 0.5) * 2;
      const vig = Math.max(0, 1 - (vx * vx + vy * vy) * 0.42);
      r *= 0.55 + 0.45 * vig; g *= 0.55 + 0.45 * vig; b *= 0.55 + 0.45 * vig;

      // painel de vidro com cantos arredondados
      const inX = x > cx0 && x < cx1, inY = y > cy0 && y < cy1;
      if (inX && inY) {
        const qx = Math.min(x - cx0, cx1 - x), qy = Math.min(y - cy0, cy1 - y);
        const corner = qx < rad && qy < rad
          ? Math.hypot(rad - qx, rad - qy) <= rad
          : true;
        if (corner) {
          r = r * 0.78 + 255 * 0.07;
          g = g * 0.78 + 255 * 0.07;
          b = b * 0.78 + 255 * 0.08;
          const edge = Math.min(qx, qy);
          if (edge < 2) { r += 40; g += 44; b += 50; } // borda luminosa
        }
      }

      // brilho diagonal discreto (glass reflection)
      const sheen = Math.max(0, 1 - Math.abs((x * 0.6 + y) / (W * 0.6 + H) - 0.32) * 9);
      r += sheen * 16; g += sheen * 17; b += sheen * 20;

      const i = (y * W + x) * 3;
      px[i] = Math.max(0, Math.min(255, r));
      px[i + 1] = Math.max(0, Math.min(255, g));
      px[i + 2] = Math.max(0, Math.min(255, b));
    }
  }

  // Título sempre contido no painel: até duas linhas, escala calculada pela
  // largura real e margem mínima de 120 px. Isso evita qualquer corte lateral.
  const lines = wrapBannerTitle(text || seed);
  const longest = Math.max(...lines.map(line => line.length), 1);
  const scale = Math.max(6, Math.min(11, Math.floor(900 / (longest * 6))));
  const lineHeight = 10 * scale;
  const blockHeight = lines.length * lineHeight - 3 * scale;
  const firstY = Math.floor((H - blockHeight) / 2);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const title = lines[lineIndex];
    const charW = 6 * scale;
    const textWidth = title.length * charW - scale;
    const startX = Math.max(120, Math.floor((W - textWidth) / 2));
    const startY = firstY + lineIndex * lineHeight;
    for (let c = 0; c < title.length; c++) {
      const glyph = FONT[title[c]];
      if (!glyph) continue;
      for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const x = startX + c * charW + gx * scale + sx;
          const y = startY + gy * scale + sy;
          if (x < 80 || x >= W - 80 || y < 60 || y >= H - 60) continue;
          const i = (y * W + x) * 3;
          px[i] = 244; px[i + 1] = 248; px[i + 2] = 255;
        }
      }
    }
  }
  return encodePNG(W, H, px);
}

async function uploadHeaderImage(bytes: Uint8Array) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const path = `template-headers/${crypto.randomUUID()}.png`;
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.storage
    .from('reseller-assets')
    .upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`Falha ao salvar imagem: ${error.message}`);
  const { data } = admin.storage.from('reseller-assets').getPublicUrl(path);
  return data.publicUrl;
}


const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_IMAGE_MODELS = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];

// Chamada direta à API do Gemini (chave própria do projeto)
async function geminiText(system: string, user: string): Promise<string | null> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
        }),
      },
    );
    if (!res.ok) {
      console.error(`Gemini direto falhou [${res.status}]: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: any) => p?.text ?? '').join('').trim();
    return text || null;
  } catch (e) {
    console.error('Gemini direto erro de rede:', e);
    return null;
  }
}

async function geminiImage(prompt: string): Promise<Uint8Array | null> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return null;
  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
        },
      );
      if (!res.ok) {
        console.error(`Gemini image (${model}) falhou [${res.status}]: ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const inline = parts.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
      if (inline) return Uint8Array.from(atob(inline), c => c.charCodeAt(0));
    } catch (e) {
      console.error(`Gemini image (${model}) erro:`, e);
    }
  }
  return null;
}

const IMAGE_STYLES: Record<string, string> = {
  moderno: 'design 3D moderno, mesh gradient vibrante, formas geométricas flutuantes com vidro fosco (glassmorphism), iluminação volumétrica suave, profundidade e sombras realistas',
  minimalista: 'minimalismo premium, muito espaço negativo, fundo escuro sólido com um único gradiente sutil, ícone linear fino centralizado',
  neon: 'estética cyber neon, linhas de luz brilhantes, reflexos, fundo escuro profundo com brilho colorido difuso',
  corporativo: 'visual corporativo elegante, gradiente azul/verde escuro, formas suaves, aparência de aplicativo financeiro premium',
};

function buildImagePrompt(prompt: string, style?: string, imageText?: string) {
  const s = IMAGE_STYLES[String(style || 'moderno').toLowerCase()] || IMAGE_STYLES.moderno;
  const title = bannerTitle(imageText || prompt);
  return `Banner horizontal 1200x628 de altíssima qualidade para o cabeçalho de uma mensagem de WhatsApp de uma empresa de streaming/IPTV.
Tema visual: ${prompt}.
Estilo: ${s}. Paleta escura sofisticada com acentos luminosos, composição equilibrada, acabamento profissional 4K, renderização nítida.
Escreva no centro, com tipografia grande, moderna e perfeitamente legível, exatamente esta chamada: "${title}".
Regras obrigatórias: não acrescente nenhuma outra palavra, letra ou número; nenhum logotipo e nenhuma marca d'água. Sem pessoas reais.`;
}

async function generateHeaderImage(prompt: string, style?: string, imageText?: string) {
  const fullPrompt = buildImagePrompt(prompt, style, imageText);

  const direct = await geminiImage(fullPrompt);
  if (direct) return await uploadHeaderImage(direct);

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('IA indisponível para gerar imagem.');

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image',
      messages: [{ role: 'user', content: fullPrompt }],
      modalities: ['image', 'text'],
    }),
  });


  if (!res.ok) {
    const body = await res.text();
    const reason = res.status === 402
      ? 'Créditos de IA esgotados no workspace'
      : res.status === 429
        ? 'Limite de requisições da IA atingido'
        : `IA indisponível (${res.status})`;
    console.error(`image gen falhou [${res.status}]: ${body.slice(0, 300)}`);
    throw new Error(reason);
  }

  const data = await res.json();
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith('data:')) throw new Error('A IA não retornou imagem.');

  const base64 = url.split(',')[1];
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return await uploadHeaderImage(bytes);
}




Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const ok = (payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { message, hint, action, imagePrompt, imageStyle, imageText, targetRisk } = await req.json();

    if (action === 'generate-image') {
      const seed = String(imagePrompt || 'aviso ao cliente').slice(0, 400);
      try {
        const imageUrl = await generateHeaderImage(seed, imageStyle, String(imageText || seed));
        return ok({ success: true, imageUrl });
      } catch (imgErr) {
        console.error('generate-image error:', imgErr);
        // Fallback sem IA: banner gerado localmente (gradiente), sempre funciona
        try {
          const imageUrl = await uploadHeaderImage(localBanner(seed, String(imageText || seed), String(imageStyle || 'moderno')));
          return ok({
            success: true,
            imageUrl,
            fallback: true,
            notice: `${(imgErr as Error).message} — gerei um banner moderno com uma chamada extraída da sua mensagem.`,
          });
        } catch (fbErr) {
          return ok({ success: false, error: (fbErr as Error).message });
        }
      }
    }


    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'Mensagem obrigatória' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    const wantLowRisk = String(targetRisk || '').toUpperCase() === 'LOW';
    const systemPrompt = wantLowRisk ? SYSTEM + LOW_RISK_RULES : SYSTEM;

    const userPrompt = `Mensagem original:\n"""${message.slice(0, 3000)}"""\n${hint ? `Contexto adicional: ${String(hint).slice(0, 500)}` : ''}\n\nReescreva ESTA mensagem (mesmo assunto, mesmas frases sempre que possível) em um template UTILITY bem formatado. NÃO mude o tema, NÃO invente bloco de dados (usuário/plano/servidor/valor) que não esteja no texto acima. Apenas neutralize termos promocionais, formate bem e adicione saudação com {{nome}} e rodapé neutro.${wantLowRisk ? '\n\nATENÇÃO: gere obrigatoriamente uma versão de RISCO BAIXO (LOW), eliminando todo termo promocional.' : ''}`;

    // 1) Gemini com a chave própria do projeto (gratuito no free tier)
    let raw: string | null = await geminiText(systemPrompt, userPrompt);

    // 2) Fallback: Lovable AI Gateway
    if (!raw) {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        return ok({ success: true, template: localOptimize(message, wantLowRisk), fallback: true, notice: 'IA indisponível — usei o otimizador local.' });
      }

      let res: Response;
      try {
        res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3.6-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            response_format: { type: 'json_object' },
          }),
        });
      } catch (netErr) {
        console.error('AI gateway network error:', netErr);
        return ok({ success: true, template: localOptimize(message, wantLowRisk), fallback: true, notice: 'IA indisponível — usei o otimizador local.' });
      }

      if (!res.ok) {
        const body = await res.text();
        console.error(`AI gateway falhou [${res.status}]: ${body}`);
        const notice = res.status === 429
          ? 'Limite de requisições da IA atingido — usei o otimizador local.'
          : res.status === 402
            ? 'Créditos de IA esgotados no workspace — usei o otimizador local. Adicione créditos em Settings → Workspace → Usage para usar a IA.'
            : `IA indisponível (${res.status}) — usei o otimizador local.`;
        return ok({ success: true, template: localOptimize(message, wantLowRisk), fallback: true, notice });
      }

      const data = await res.json();
      raw = data?.choices?.[0]?.message?.content ?? '{}';
    }

    const rawText = raw ?? '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }


    if (!parsed?.body) {
      return ok({ success: true, template: localOptimize(message, wantLowRisk), fallback: true, notice: 'A IA não retornou um template válido — usei o otimizador local.' });
    }

    // Guarda de fidelidade: se a IA fugiu do assunto original, usa o otimizador local
    const words = (s: string) => new Set(
      String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\{\{[^}]*\}\}/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length > 3)
    );
    const origWords = words(message);
    const genWords = words(parsed.body);
    let shared = 0;
    origWords.forEach(w => { if (genWords.has(w)) shared++; });
    const fidelity = origWords.size ? shared / origWords.size : 1;
    if (origWords.size >= 6 && fidelity < 0.18) {
      return ok({
        success: true,
        template: localOptimize(message, wantLowRisk),
        fallback: true,
        notice: 'A IA fugiu do assunto — gerei uma nova versão transacional fiel às informações originais.',
      });
    }

    parsed.category = 'UTILITY';
    parsed.language = parsed.language || 'pt_BR';
    parsed.name = slug(parsed.name);
    parsed.buttons = Array.isArray(parsed.buttons) ? parsed.buttons : [];
    parsed.warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    parsed.body = String(parsed.body).replace(/\*\*/g, '*').slice(0, 1024);

    // header normalizado
    const hType = String(parsed?.header?.type || 'NONE').toUpperCase();
    parsed.header = {
      type: ['TEXT', 'IMAGE'].includes(hType) ? hType : 'NONE',
      text: String(parsed?.header?.text || '').slice(0, 60),
    };
    parsed.imagePrompt = String(parsed.imagePrompt || parsed?.header?.text || 'aviso ao cliente').slice(0, 400);


    // garante que TODAS as variáveis do corpo tenham exemplo
    const used = Array.from(new Set([...parsed.body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m: any) => m[1])));
    const provided: Record<string, string> = {};
    if (Array.isArray(parsed.variables)) {
      for (const v of parsed.variables) if (v?.name) provided[String(v.name)] = String(v.example || '');
    }
    parsed.variables = used.map((n: any) => ({ name: n, example: provided[n] || EXAMPLES[n] || 'Exemplo' }));

    // Modo risco baixo: sanitiza termos promocionais remanescentes e força risk=LOW
    if (wantLowRisk) {
      const lowerBody = String(parsed.body).toLowerCase();
      const leftovers = MARKETING_TERMS.filter(t => lowerBody.includes(t));
      if (leftovers.length) {
        const NEUTRAL: Record<string, string> = {
          'promoção': 'condição', 'promocao': 'condição', 'oferta': 'condição', 'desconto': 'ajuste de valor',
          'aproveite': 'informamos', 'novidade': 'atualização', 'assine agora': 'realize a contratação',
          'imperdível': 'disponível', 'imperdivel': 'disponível', 'cupom': 'código', 'grátis': 'sem custo',
          'gratis': 'sem custo', 'teste gratuito': 'período de teste', 'volte': 'retome',
          'últimas vagas': 'disponibilidade limitada', 'ultimas vagas': 'disponibilidade limitada',
          'corra': 'atenção', 'não perca': 'observe', 'nao perca': 'observe', 'exclusivo': 'específico',
        };
        let b = String(parsed.body);
        for (const t of leftovers) {
          b = b.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), NEUTRAL[t] || '');
        }
        parsed.body = b.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1024);
        parsed.warnings = [
          ...parsed.warnings,
          ...leftovers.map(t => `Termo promocional "${t}" foi neutralizado para reduzir o risco.`),
        ];
      }
      parsed.footer = parsed.footer || 'Mensagem automática do sistema';
      parsed.risk = 'LOW';
    }

    return ok({ success: true, template: parsed, targetRisk: wantLowRisk ? 'LOW' : undefined });
  } catch (e) {
    console.error('template-optimizer error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
