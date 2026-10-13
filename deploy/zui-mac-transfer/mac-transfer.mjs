// Customer-initiated activation transfer between two registered devices.
// MACs and device credentials stay immutable: only the entitlement fields swap.
export const TRANSFER_LIMIT = 3;
export const TRANSFER_FIELDS = ['activeUntil', 'playlists', 'activePlaylistId', 'source', 'serverCode',
  'partnerLicense', 'partnerAccessRequired', 'lastPartnerAccess', 'resellerId', 'macTransfers'];

export function transferError(message, statusCode = 400) {
  return Object.assign(new Error(message), {statusCode});
}

// from: logged-in device (proved by MAC+key). to: new device (proved by its own MAC+key).
export function transferActivation(from, to, now = Date.now()) {
  if (!from || !to) throw transferError('Aparelho novo não encontrado. Abra o ZUI no aparelho novo uma vez e confira o MAC e a chave.', 404);
  if (from.id === to.id || from.mac === to.mac) throw transferError('Informe o MAC de outro aparelho.');
  if (from.enabled === false || to.enabled === false) throw transferError('Um dos aparelhos está desativado. Fale com o suporte.', 403);
  if (from.resellerId && to.resellerId && from.resellerId !== to.resellerId)
    throw transferError('O aparelho novo pertence a outra revenda. Fale com o suporte.', 403);
  const used = Number(from.macTransfers?.count || 0);
  if (used >= TRANSFER_LIMIT) throw transferError(`Limite de ${TRANSFER_LIMIT} transferências atingido para esta ativação. Fale com o suporte.`, 403);
  const a = {}, b = {};
  for (const k of TRANSFER_FIELDS) { a[k] = from[k]; b[k] = to[k]; }
  for (const k of TRANSFER_FIELDS) {
    if (b[k] === undefined) delete from[k]; else from[k] = b[k];
    if (a[k] === undefined) delete to[k]; else to[k] = a[k];
  }
  to.macTransfers = {count: used + 1, lastAt: now, lastFromMac: from.mac};
  for (const d of [from, to]) { d.revision = (d.revision || 0) + 1; d.updatedAt = now; }
  return {remaining: TRANSFER_LIMIT - used - 1};
}

export function transfersRemaining(device) {
  return Math.max(0, TRANSFER_LIMIT - Number(device?.macTransfers?.count || 0));
}
