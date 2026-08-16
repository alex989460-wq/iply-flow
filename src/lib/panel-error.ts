// Traduz o erro cru devolvido por qualquer painel/edge function em um motivo
// real e legível — sem esconder o detalhe técnico, para o revendedor conseguir corrigir.

const RULES: Array<[RegExp, string]> = [
  [/insufficient|sem\s+cr[eé]dito|cr[eé]ditos?\s+insuficien|no\s+credits?|saldo\s+insuficiente|not\s+enough\s+credit/i,
    'Créditos insuficientes no painel — compre créditos com o seu fornecedor.'],
  [/cr[eé]ditos insuficientes\. necess[aá]rio/i,
    'Créditos insuficientes na plataforma — peça créditos ao seu revendedor superior.'],
  [/invalid\s+(token|credential|api\s*key)|unauthorized|não autorizado|nao autorizado|401|senha inv[aá]lida|login .*(recusad|falhou)/i,
    'Credenciais do painel recusadas — revise usuário, senha, token ou chave de API em Configurações → APIs.'],
  [/forbidden|403|sem permiss/i, 'O painel negou o acesso desta conta (permissão insuficiente).'],
  [/n[aã]o encontrado|not\s*found|does not exist/i,
    'Usuário não encontrado no painel — confira se o login do cliente é o mesmo cadastrado lá.'],
  [/expirad|expired|session/i, 'A sessão/token do painel expirou — reconecte o painel em Configurações → APIs.'],
  [/captcha|cloudflare|challenge|just a moment/i,
    'O painel exigiu verificação (captcha/Cloudflare) — use o proxy ou renove manualmente.'],
  [/timeout|timed out|network|failed to fetch|econnrefused/i,
    'O painel não respondeu a tempo — tente novamente em alguns minutos.'],
  [/429|rate limit|muitas requisi/i, 'Limite de requisições do painel atingido — aguarde alguns minutos.'],
  [/already|duplicate|duplicidade/i, 'O painel recusou por duplicidade — a linha já foi renovada recentemente.'],
  [/credenciais.*n[aã]o configurad/i, 'As credenciais deste painel ainda não foram preenchidas em Configurações → APIs.'],
  [/manuten|maintenance/i, 'O painel está em manutenção.'],
  [/HTTP\s*5\d\d|erro interno/i, 'O painel está com erro interno no momento.'],
];

const GENERIC = [
  'edge function returned a non-2xx status code',
  'failed to send a request to the edge function',
  'functionshttperror',
];

/** Retorna o motivo real do erro, com o detalhe técnico entre parênteses. */
export function describePanelError(panelLabel: string, raw: unknown): string {
  const text = String(
    (raw as { message?: string } | null)?.message ?? raw ?? '',
  ).trim();

  if (!text || GENERIC.some((g) => text.toLowerCase().includes(g))) {
    return `${panelLabel}: o painel recusou a renovação e não informou o motivo. Verifique créditos e credenciais em Configurações → APIs.`;
  }

  for (const [pattern, reason] of RULES) {
    if (pattern.test(text)) return `${panelLabel}: ${reason} (detalhe: ${text.slice(0, 220)})`;
  }
  return `${panelLabel}: ${text.slice(0, 300)}`;
}
