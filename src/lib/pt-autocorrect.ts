// Autocorreção PT-BR para o composer.
// Estratégia:
// 1) Dicionário leve interno (correção instantânea para abreviações/acentos comuns).
// 2) Spell checker Hunspell pt-BR carregado preguiçosamente via CDN + nspell.
//    Quando disponível, qualquer palavra desconhecida é trocada pela melhor
//    sugestão (apenas se for muito próxima — distância pequena).
//
// O corretor só roda quando o usuário digita espaço/pontuação/Enter — mantém
// a digitação fluida e preserva o undo nativo do navegador (setRangeText).

// @ts-ignore - sem types
import nspell from 'nspell';

const QUICK_DICT: Record<string, string> = {
  nao: 'não', naum: 'não',
  voce: 'você', vc: 'você', vcs: 'vocês', voces: 'vocês',
  eh: 'é', ja: 'já', ate: 'até', so: 'só',
  tb: 'também', tbm: 'também', tmb: 'também', tambem: 'também',
  pq: 'porque', pf: 'por favor', obg: 'obrigado', vlw: 'valeu', blz: 'beleza',
  qnd: 'quando', qto: 'quanto', qtd: 'quantidade', qq: 'qualquer',
  td: 'tudo', tds: 'todos', hj: 'hoje', amh: 'amanhã', amanha: 'amanhã',
  esta: 'está', estao: 'estão',
  sao: 'são', nos: 'nós',
  alem: 'além', porem: 'porém', apos: 'após', atras: 'atrás',
  facil: 'fácil', dificil: 'difícil', possivel: 'possível', impossivel: 'impossível',
  ultimo: 'último', proximo: 'próximo', publico: 'público',
  numero: 'número', codigo: 'código', credito: 'crédito', debito: 'débito',
  servico: 'serviço', servicos: 'serviços', usuario: 'usuário', usuarios: 'usuários',
  pagina: 'página', historico: 'histórico',
  mes: 'mês', mae: 'mãe', irmao: 'irmão',
  funcao: 'função', informacao: 'informação', informacoes: 'informações',
  configuracao: 'configuração', configuracoes: 'configurações',
  notificacao: 'notificação', notificacoes: 'notificações',
  renovacao: 'renovação', renovacoes: 'renovações',
  ativacao: 'ativação', ativacoes: 'ativações',
  acao: 'ação', acoes: 'ações',
  cartao: 'cartão', cartoes: 'cartões',
  ola: 'olá', manha: 'manhã', familia: 'família', ne: 'né',
};

const TRIGGERS = new Set([' ', '\n', '\t', '.', ',', '!', '?', ';', ':']);

// ---- Hunspell loader (lazy, cached) ----------------------------------------
const DICT_URLS = {
  // pt-BR Hunspell (mantido por wooorm/dictionaries, redistribuído no jsdelivr)
  aff: 'https://cdn.jsdelivr.net/npm/dictionary-pt@2.0.0/index.aff',
  dic: 'https://cdn.jsdelivr.net/npm/dictionary-pt@2.0.0/index.dic',
};
const CACHE_KEY = 'pt_hunspell_v1';

type Speller = {
  correct: (w: string) => boolean;
  suggest: (w: string) => string[];
};

let speller: Speller | null = null;
let loading: Promise<Speller | null> | null = null;

async function loadSpeller(): Promise<Speller | null> {
  if (speller) return speller;
  if (loading) return loading;
  loading = (async () => {
    try {
      let aff: string | null = null;
      let dic: string | null = null;
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const j = JSON.parse(cached);
          aff = j.aff; dic = j.dic;
        }
      } catch {}
      if (!aff || !dic) {
        const [a, d] = await Promise.all([
          fetch(DICT_URLS.aff).then((r) => r.text()),
          fetch(DICT_URLS.dic).then((r) => r.text()),
        ]);
        aff = a; dic = d;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ aff, dic })); } catch {}
      }
      speller = nspell(aff, dic) as Speller;
      return speller;
    } catch (e) {
      console.warn('[pt-autocorrect] falha ao carregar dicionário', e);
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

// Dispara o carregamento assim que o módulo é importado.
if (typeof window !== 'undefined') {
  setTimeout(() => { loadSpeller(); }, 200);
}

// ---- Helpers ----------------------------------------------------------------
function preserveCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Levenshtein simples (palavras curtas; ok para até ~20 chars)
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function bestSuggestion(word: string, suggestions: string[]): string | null {
  if (!suggestions.length) return null;
  const lower = word.toLowerCase();
  // só aceita sugestão muito próxima para evitar trocas indesejadas
  const maxDist = lower.length <= 4 ? 1 : lower.length <= 8 ? 2 : 3;
  let best: string | null = null;
  let bestD = Infinity;
  for (const s of suggestions.slice(0, 6)) {
    // não aceitar sugestões com espaço (multi-palavra)
    if (/\s/.test(s)) continue;
    const d = lev(lower, s.toLowerCase());
    if (d < bestD) { bestD = d; best = s; }
  }
  if (!best || bestD > maxDist) return null;
  return best;
}

/**
 * Tenta substituir a palavra que acabou de ser finalizada quando o usuário
 * digita um caractere de trigger. Preserva o trigger e o undo nativo.
 */
export function tryAutocorrectOnInput(
  el: HTMLTextAreaElement,
  insertedChar: string,
): boolean {
  if (!TRIGGERS.has(insertedChar)) return false;
  const caret = el.selectionStart ?? 0;
  if (caret < 2) return false;
  const value = el.value;
  const wordEnd = caret - 1;
  if (wordEnd <= 0) return false;
  let wordStart = wordEnd;
  while (wordStart > 0) {
    const ch = value[wordStart - 1];
    if (!ch || /\s|[.,!?;:()"'`]/.test(ch)) break;
    wordStart--;
  }
  if (wordStart === wordEnd) return false;
  const original = value.slice(wordStart, wordEnd);
  if (original.length < 2) return false;
  if (!/^[A-Za-zÀ-ÿ]+$/.test(original)) return false;
  const lower = original.toLowerCase();

  let replacement: string | null = null;

  // 1) Dicionário rápido (instantâneo)
  if (QUICK_DICT[lower]) {
    replacement = QUICK_DICT[lower];
  } else if (speller) {
    // 2) Hunspell pt-BR
    if (!speller.correct(lower) && !speller.correct(original)) {
      const sug = speller.suggest(lower);
      const best = bestSuggestion(lower, sug);
      if (best && best.toLowerCase() !== lower) replacement = best;
    }
  } else {
    // dicionário ainda carregando — garante o carregamento
    loadSpeller();
  }

  if (!replacement) return false;
  const final = preserveCase(original, replacement);
  if (final === original) return false;

  el.setSelectionRange(wordStart, wordEnd);
  el.setRangeText(final, wordStart, wordEnd, 'end');
  const newCaret = wordStart + final.length + 1;
  el.setSelectionRange(newCaret, newCaret);
  return true;
}
