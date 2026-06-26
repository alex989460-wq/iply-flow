export type CrmBroadcastSummary = {
  broadcasts_count: number;
  recipients_total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  templates_approved: number;
};

const emptySummary: CrmBroadcastSummary = {
  broadcasts_count: 0,
  recipients_total: 0,
  sent: 0,
  delivered: 0,
  read: 0,
  failed: 0,
  pending: 0,
  templates_approved: 0,
};

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pickNumber(source: any, keys: string[]): number {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) return toNumber(source[key]);
  }
  return 0;
}

function extractPayload(response: any): any {
  return response?.results?.broadcasts_stats?.body
    ?? response?.broadcasts_stats?.body
    ?? response?.results?.broadcasts_stats
    ?? response?.broadcasts_stats
    ?? response?.body
    ?? response;
}

function normalizeSummary(summary: any): CrmBroadcastSummary {
  return {
    broadcasts_count: pickNumber(summary, ['broadcasts_count', 'broadcasts', 'total_broadcasts', 'totalBroadcasts']),
    recipients_total: pickNumber(summary, ['recipients_total', 'recipients', 'total_recipients', 'totalRecipients']),
    sent: pickNumber(summary, ['sent', 'total_sent', 'totalSent']),
    delivered: pickNumber(summary, ['delivered', 'total_delivered', 'totalDelivered']),
    read: pickNumber(summary, ['read', 'total_read', 'totalRead']),
    failed: pickNumber(summary, ['failed', 'total_failed', 'totalFailed']),
    pending: pickNumber(summary, ['pending', 'total_pending', 'totalPending']),
    templates_approved: pickNumber(summary, ['templates_approved', 'approved_templates', 'templatesApproved']),
  };
}

function summarizeBroadcasts(broadcasts: any[]): CrmBroadcastSummary {
  const totals = broadcasts.reduce((acc, item) => {
    const recipients = pickNumber(item, ['total', 'recipients_total', 'recipients', 'count']);
    const sent = pickNumber(item, ['sent', 'total_sent']);
    const failed = pickNumber(item, ['failed', 'total_failed']);
    const pending = pickNumber(item, ['pending', 'total_pending']) || Math.max(0, recipients - sent - failed);

    acc.recipients_total += recipients;
    acc.sent += sent;
    acc.delivered += pickNumber(item, ['delivered', 'total_delivered']);
    acc.read += pickNumber(item, ['read', 'total_read']);
    acc.failed += failed;
    acc.pending += pending;
    return acc;
  }, { ...emptySummary, broadcasts_count: broadcasts.length });

  return totals;
}

export function extractCrmBroadcastSummary(response: any): CrmBroadcastSummary {
  const payload = extractPayload(response);
  const summary = payload?.summary ?? payload;
  const normalized = normalizeSummary(summary);

  if (Object.values(normalized).some((value) => value > 0)) return normalized;

  const broadcasts = Array.isArray(payload?.broadcasts)
    ? payload.broadcasts
    : Array.isArray(payload)
      ? payload
      : [];

  return broadcasts.length ? summarizeBroadcasts(broadcasts) : emptySummary;
}