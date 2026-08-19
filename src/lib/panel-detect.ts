export type PanelType =
  | 'natv'
  | 'natv2'
  | 'vplay'
  | 'rush'
  | 'thebest'
  | 'uniplay'
  | 'p2cine'
  | 'koffice'
  | 'none';

export const PANEL_OPTIONS: { value: PanelType | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Automático (detectar pelo nome/host)' },
  { value: 'natv', label: 'NATV' },
  { value: 'natv2', label: 'NATV²' },
  { value: 'vplay', label: 'VPlay' },
  { value: 'rush', label: 'Rush' },
  { value: 'thebest', label: 'The Best' },
  { value: 'uniplay', label: 'Uniplay' },
  { value: 'koffice', label: 'kOffice Panel (P2Cine)' },
  { value: 'none', label: 'Nenhum (renovar só no sistema)' },
];

const VALID: PanelType[] = ['natv', 'natv2', 'vplay', 'rush', 'thebest', 'uniplay', 'p2cine', 'koffice', 'none'];

/**
 * Resolve qual painel externo deve ser usado para um servidor.
 * Prioriza a seleção manual (servers.panel_type); se estiver vazia/"auto",
 * mantém exatamente a detecção antiga por nome/host.
 */
export function resolvePanel(server?: {
  server_name?: string | null;
  host?: string | null;
  panel_type?: string | null;
} | null): PanelType | null {
  const manual = String(server?.panel_type || '').trim().toLowerCase();
  if (manual && manual !== 'auto' && VALID.includes(manual as PanelType)) {
    return (manual === 'koffice' ? 'p2cine' : manual) as PanelType;
  }

  const sn = String(server?.server_name || '').toLowerCase();
  const sh = String(server?.host || '').toLowerCase();
  const hay = `${sn} ${sh}`;

  if (sn.includes('natv²') || sn.includes('natv2') || sh.includes('natv2')) return 'natv2';
  if (sn.includes('best') || sh.includes('best')) return 'thebest';
  if (sn.includes('natv') || sh.includes('pixbot') || sh.includes('natv')) return 'natv';
  if (sn.includes('vplay') || sh.includes('vplay')) return 'vplay';
  if (sn.includes('rush') || sh.includes('rush')) return 'rush';
  if (hay.includes('uniplay') || hay.includes('searchdefense') || hay.includes('gesapioffice')) return 'uniplay';
  if (hay.includes('p2cine') || hay.includes('daily3') || hay.includes('painelacesso') || /\bp2c\b/.test(hay)) return 'p2cine';

  return null;
}
