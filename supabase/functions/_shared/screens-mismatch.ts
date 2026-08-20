// Detecta quando o cliente pagou um plano com MAIS telas/conexões do que o
// cadastro atual dele e registra uma pendência para o revendedor ajustar
// manualmente as conexões no painel.

const WORD_NUMBERS: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, "três": 3, quatro: 4,
  cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

/** Extrai a quantidade de telas do nome do plano ("Mensal 3 Telas" -> 3). */
export function parsePlanScreens(planName?: string | null): number | null {
  const raw = String(planName || '').toLowerCase();
  if (!raw) return null;
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const digit = normalized.match(/(\d+)\s*(telas?|conexoes?|conexao|screens?|pontos?|dispositivos?)/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n > 0 && n <= 20) return n;
  }

  const word = normalized.match(/\b(uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s*(telas?|conexoes?|conexao|screens?)/);
  if (word) {
    const n = WORD_NUMBERS[word[1]];
    if (n) return n;
  }

  return null;
}

export interface ScreensMismatchParams {
  customer: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
    username?: string | null;
    screens?: number | null;
    server_id?: string | null;
    created_by?: string | null;
    due_date?: string | null;
  };
  planName?: string | null;
  amount?: number | null;
  serverName?: string | null;
  serverHost?: string | null;
  source: string;
  /** Total de telas já cobertas pelo pagamento (soma dos cadastros renovados). */
  coveredScreens?: number | null;
}

/**
 * Cria uma pendência quando o plano pago tem mais telas do que o cadastro.
 * Retorna informação do que foi detectado (ou null quando não há divergência).
 */
export async function reportScreensMismatch(admin: any, params: ScreensMismatchParams) {
  try {
    const paidScreens = parsePlanScreens(params.planName);
    if (!paidScreens) return null;

    const currentScreens = Number(params.customer?.screens || 1);
    if (paidScreens <= currentScreens) return null;

    const ownerId = params.customer?.created_by;
    if (!ownerId) return null;

    // Evita duplicar a mesma pendência nas últimas 24h.
    if (params.customer?.id) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await admin
        .from('pending_manual_renewals')
        .select('id')
        .eq('customer_id', params.customer.id)
        .eq('reason', 'screens_upgrade_required')
        .gte('created_at', since)
        .maybeSingle();
      if (existing) return null;
    }

    // Resolve nome/host do servidor quando não vieram no payload
    let serverName = params.serverName || null;
    let serverHost = params.serverHost || null;
    if ((!serverName || !serverHost) && params.customer?.server_id) {
      const { data: srv } = await admin
        .from('servers')
        .select('server_name, host')
        .eq('id', params.customer.server_id)
        .maybeSingle();
      if (srv) {
        serverName = serverName || srv.server_name || null;
        serverHost = serverHost || srv.host || null;
      }
    }

    await admin.from('pending_manual_renewals').insert({
      owner_id: ownerId,
      customer_id: params.customer?.id || null,
      customer_name: params.customer?.name || 'Cliente',
      customer_phone: params.customer?.phone || null,
      username: params.customer?.username || null,
      server_id: params.customer?.server_id || null,
      server_name: serverName,
      server_host: serverHost,

      plan_name: params.planName || null,
      amount: params.amount ?? 0,
      new_due_date: params.customer?.due_date || null,
      reason: 'screens_upgrade_required',
      source: params.source,
      error_details: {
        current_screens: currentScreens,
        paid_screens: paidScreens,
        conflict_reason: `O cliente pagou por ${paidScreens} tela(s), mas o cadastro atual dele possui apenas ${currentScreens}. ja renovei manualmente os proximos quando for a mesma data voce pode renovar, so nao renove quando for data muito longe futura`,
      },
    });

    return { current_screens: currentScreens, paid_screens: paidScreens };
  } catch (error) {
    console.error('[screens-mismatch] falha ao registrar pendência:', error);
    return null;
  }
}
