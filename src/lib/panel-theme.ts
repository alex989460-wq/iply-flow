// Per-user panel color customization. Stored in localStorage and applied as CSS variables.
// Lightweight: 3 colors (primary, background, accent) override semantic tokens at runtime.

const STORAGE_KEY = 'panel_theme_v1';

export interface PanelTheme {
  primary: string;   // hex "#rrggbb"
  background: string;
  accent: string;
}

export const DEFAULT_THEME: PanelTheme = {
  primary: '#e8590c',
  background: '#0a0a0a',
  accent: '#fde68a',
};

export function loadTheme(): PanelTheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (t && typeof t.primary === 'string') return t as PanelTheme;
  } catch {}
  return null;
}

export function saveTheme(t: PanelTheme) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  applyTheme(t);
}

export function clearTheme() {
  // Removes the saved theme AND resets the runtime CSS vars (used by "Restaurar padrão").
  localStorage.removeItem(STORAGE_KEY);
  resetThemeVars();
}

export function resetThemeVars() {
  // Only clears the runtime CSS vars; does NOT touch localStorage.
  // Use this for layout cleanup so the saved theme survives navigation.
  document.documentElement.style.removeProperty('--primary');
  document.documentElement.style.removeProperty('--background');
  document.documentElement.style.removeProperty('--accent');
  document.documentElement.style.removeProperty('--ring');
  document.documentElement.style.removeProperty('--sidebar-primary');
}

function hexToHsl(hex: string): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return '';
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyTheme(t: PanelTheme) {
  const root = document.documentElement.style;
  const p = hexToHsl(t.primary);
  const b = hexToHsl(t.background);
  const a = hexToHsl(t.accent);
  if (p) {
    root.setProperty('--primary', p);
    root.setProperty('--ring', p);
    root.setProperty('--sidebar-primary', p);
  }
  if (b) root.setProperty('--background', b);
  if (a) root.setProperty('--accent', a);
}

export function bootstrapTheme() {
  const t = loadTheme();
  if (t) applyTheme(t);
}
