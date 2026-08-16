// Traduz erros crus dos painéis externos para um motivo real, legível,
// sempre mantendo o detalhe técnico para diagnóstico.

function extractDetail(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw !== "string") {
    try { return JSON.stringify(raw); } catch { return String(raw); }
  }
  const text = raw.trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    const collect = (v: unknown, depth = 0): string => {
      if (depth > 3) return "";
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return v.map((x) => collect(x, depth + 1)).filter(Boolean).join(" | ");
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        for (const k of ["detail", "message", "error", "errors", "msg", "description", "non_field_errors"]) {
          const found = collect(o[k], depth + 1);
          if (found) return found;
        }
        return Object.values(o).map((x) => collect(x, depth + 1)).filter(Boolean).join(" | ");
      }
      return "";
    };
    return collect(parsed) || text;
  } catch {
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

const RULES: Array<[RegExp, string]> = [
  [/insufficient|sem\s+cr[eé]dito|cr[eé]ditos?\s+insuficien|no\s+credits?|saldo\s+insuficiente|not\s+enough\s+credit/i,
    "Créditos insuficientes no painel. Compre créditos com o seu fornecedor e tente novamente."],
  [/invalid\s+(token|credential|api\s*key)|unauthorized|não autorizado|nao autorizado|authentication|senha inv[aá]lida/i,
    "Login/credenciais do painel recusados. Revise usuário, senha, token ou chave de API em Configurações → APIs."],
  [/forbidden|permission|sem permiss/i,
    "O painel bloqueou a ação para este usuário (permissão insuficiente na conta de revenda)."],
  [/not\s*found|não encontrado|nao encontrado|does not exist/i,
    "Usuário/linha não encontrado no painel. Confira se o login do cliente confere com o do painel."],
  [/expired|expirad|session/i,
    "A sessão/token do painel expirou. Reconecte o painel em Configurações → APIs."],
  [/captcha|cloudflare|challenge|just a moment/i,
    "O painel exigiu verificação (captcha/Cloudflare). Use o proxy configurado ou renove manualmente."],
  [/timeout|timed out|etimedout|network|econnrefused|dns/i,
    "O painel não respondeu (rede/tempo esgotado). Tente novamente em alguns minutos."],
  [/already|duplicate|já renovado|ja renovado/i,
    "O painel recusou por duplicidade — esta linha já foi renovada recentemente."],
  [/maintenance|manuten/i, "O painel está em manutenção."],
];

function byStatus(status: number): string {
  if (status === 401) return "Credenciais do painel recusadas (HTTP 401).";
  if (status === 402) return "Pagamento/créditos pendentes no painel (HTTP 402).";
  if (status === 403) return "Acesso negado pelo painel (HTTP 403).";
  if (status === 404) return "Recurso não encontrado no painel (HTTP 404).";
  if (status === 409) return "Conflito no painel — a linha pode já ter sido renovada (HTTP 409).";
  if (status === 422 || status === 400) return "O painel recusou os dados enviados (HTTP " + status + ").";
  if (status === 429) return "Muitas requisições — o painel aplicou limite temporário (HTTP 429).";
  if (status >= 500) return "O painel está com erro interno (HTTP " + status + ").";
  return status ? `O painel respondeu HTTP ${status}.` : "O painel não informou o motivo.";
}

/** Monta a mensagem final: painel + motivo real + detalhe técnico. */
export function explainPanelError(panel: string, status: number, raw: unknown, action = "renovar"): string {
  const detail = extractDetail(raw);
  let reason = "";
  for (const [pattern, message] of RULES) {
    if (pattern.test(detail)) { reason = message; break; }
  }
  if (!reason) reason = byStatus(status);
  const technical = detail ? ` [detalhe do painel: ${detail.slice(0, 300)}]` : "";
  return `Não foi possível ${action} no painel ${panel}. ${reason}${technical}`;
}
