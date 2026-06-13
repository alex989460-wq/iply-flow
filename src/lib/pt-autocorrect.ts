// Dicionário leve de autocorreção PT-BR para o composer de chat.
// Mantém a digitação fluida: só substitui a palavra anterior quando o usuário
// digita um espaço/pontuação/quebra de linha.

const DICT: Record<string, string> = {
  // negações / partículas comuns
  nao: 'não', naum: 'não', n: 'não',
  sim: 'sim',
  // pronomes / artigos
  voce: 'você', vc: 'você', vcs: 'vocês', voces: 'vocês',
  eh: 'é', ja: 'já', ate: 'até', so: 'só', tb: 'também', tbm: 'também', tmb: 'também',
  pq: 'porque', pf: 'por favor', obg: 'obrigado', vlw: 'valeu', blz: 'beleza',
  qnd: 'quando', qto: 'quanto', qtd: 'quantidade', qq: 'qualquer',
  td: 'tudo', tds: 'todos', hj: 'hoje', amh: 'amanhã', amanha: 'amanhã',
  ontem: 'ontem',
  // verbos / palavras frequentes
  esta: 'está', estao: 'estão', estavamos: 'estávamos',
  nao: 'não', sao: 'são', nos: 'nós',
  alem: 'além', porem: 'porém', tambem: 'também',
  ate: 'até', apos: 'após', atras: 'atrás',
  facil: 'fácil', dificil: 'difícil', possivel: 'possível', impossivel: 'impossível',
  ultimo: 'último', proximo: 'próximo', publico: 'público',
  numero: 'número', codigo: 'código', credito: 'crédito', debito: 'débito',
  servico: 'serviço', servicos: 'serviços', usuario: 'usuário', usuarios: 'usuários',
  senha: 'senha', email: 'e-mail',
  pagina: 'página', historico: 'histórico', vencimento: 'vencimento',
  mes: 'mês', ja: 'já', mae: 'mãe', pai: 'pai', irmao: 'irmão',
  funcao: 'função', informacao: 'informação', informacoes: 'informações',
  configuracao: 'configuração', configuracoes: 'configurações',
  notificacao: 'notificação', notificacoes: 'notificações',
  renovacao: 'renovação', renovacoes: 'renovações',
  ativacao: 'ativação', ativacoes: 'ativações',
  acao: 'ação', acoes: 'ações', sao: 'são',
  pagamentos: 'pagamentos', cartao: 'cartão', cartoes: 'cartões',
  ola: 'olá', oi: 'oi', tchau: 'tchau',
  boa: 'boa', bom: 'bom',
  manha: 'manhã', amanha: 'amanhã',
  voce: 'você', familia: 'família', dia: 'dia', dias: 'dias',
  // saudações compostas (uma palavra cada)
  ne: 'né',
};

const TRIGGERS = new Set([' ', '\n', '\t', '.', ',', '!', '?', ';', ':']);

/**
 * Tenta substituir a palavra que acabou de ser finalizada quando o usuário
 * digita um caractere de trigger. Preserva o caractere de trigger e mantém
 * o suporte a undo do navegador via `setRangeText`.
 * Retorna true se algo foi substituído.
 */
export function tryAutocorrectOnInput(
  el: HTMLTextAreaElement,
  insertedChar: string,
): boolean {
  if (!TRIGGERS.has(insertedChar)) return false;
  const caret = el.selectionStart ?? 0;
  if (caret < 2) return false;
  const value = el.value;
  // posição imediatamente antes do trigger
  const wordEnd = caret - 1;
  if (wordEnd <= 0) return false;
  // encontra início da palavra
  let wordStart = wordEnd;
  while (wordStart > 0) {
    const ch = value[wordStart - 1];
    if (!ch || /\s|[.,!?;:()"'`]/.test(ch)) break;
    wordStart--;
  }
  if (wordStart === wordEnd) return false;
  const original = value.slice(wordStart, wordEnd);
  if (!/^[A-Za-zÀ-ÿ]+$/.test(original)) return false;
  const lower = original.toLowerCase();
  const replacement = DICT[lower];
  if (!replacement || replacement === lower) return false;
  // preserva capitalização básica
  let final = replacement;
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    final = replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  if (original === original.toUpperCase() && original.length > 1) {
    final = replacement.toUpperCase();
  }
  if (final === original) return false;
  el.setSelectionRange(wordStart, wordEnd);
  // setRangeText mantém histórico de undo nativo
  el.setRangeText(final, wordStart, wordEnd, 'end');
  // recoloca o cursor após o trigger (que já está logo após a palavra)
  const newCaret = wordStart + final.length + 1;
  el.setSelectionRange(newCaret, newCaret);
  return true;
}
