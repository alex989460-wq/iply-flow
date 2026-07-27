// Per-user panel design customization.
// Stored in localStorage and applied as CSS variables at runtime.
// Besides the 3 base colors, it now derives the FULL surface set
// (cards, popovers, borders, sidebar, gradients, shadows, radius, fonts)
// so a preset really changes the whole design — not only the accent colors.

const STORAGE_KEY = 'panel_theme_v1';

export type PanelStyle = 'default' | 'zapcrm' | 'soft' | 'sharp';

export interface PanelTheme {
  primary: string;   // hex "#rrggbb"
  background: string;
  accent: string;
  style?: PanelStyle;
}

export const DEFAULT_THEME: PanelTheme = {
  primary: '#e8590c',
  background: '#0a0a0a',
  accent: '#fde68a',
  style: 'default',
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
  localStorage.removeItem(STORAGE_KEY);
  resetThemeVars();
}

const MANAGED_VARS = [
  '--primary', '--primary-foreground', '--background', '--foreground',
  '--card', '--card-foreground', '--popover', '--popover-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
  '--accent', '--accent-foreground', '--border', '--input', '--ring',
  '--radius', '--font-sans',
  '--sidebar', '--sidebar-background', '--sidebar-foreground', '--sidebar-primary',
  '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
  '--sidebar-border', '--sidebar-ring',
  '--gradient-primary', '--gradient-card', '--shadow-glow', '--shadow-card',
  '--shadow-sm', '--shadow-md', '--shadow-lg',
];

export function resetThemeVars() {
  const s = document.documentElement.style;
  MANAGED_VARS.forEach((v) => s.removeProperty(v));
}

type Hsl = { h: number; s: number; l: number };

function hexToHslObj(hex: string): Hsl | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
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
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const str = (c: Hsl) => `${c.h} ${clamp(c.s)}% ${clamp(c.l)}%`;
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

// Move a color towards the "surface" direction (lighter on dark themes,
// darker on light themes) by `amount` lightness points.
function step(base: Hsl, amount: number, dark: boolean, satBoost = 0): Hsl {
  return { h: base.h, s: clamp(base.s + satBoost), l: clamp(base.l + (dark ? amount : -amount)) };
}

function readableOn(c: Hsl): Hsl {
  return c.l > 60 ? { h: c.h, s: Math.min(c.s, 30), l: 8 } : { h: c.h, s: Math.min(c.s, 25), l: 98 };
}

function hexToHsl(hex: string): string {
  const c = hexToHslObj(hex);
  return c ? str(c) : '';
}

const RADIUS: Record<PanelStyle, string> = {
  default: '0.75rem',
  zapcrm: '1rem',
  soft: '1.25rem',
  sharp: '0.25rem',
};

export function applyTheme(t: PanelTheme) {
  const root = document.documentElement.style;
  const primary = hexToHslObj(t.primary);
  const bg = hexToHslObj(t.background);
  const accent = hexToHslObj(t.accent);
  if (!primary || !bg) return;

  const dark = bg.l < 50;
  const style: PanelStyle = t.style ?? 'default';

  // Base
  root.setProperty('--background', str(bg));
  root.setProperty('--foreground', str(readableOn(bg)));

  // Surfaces derived from the background so cards/popovers/sidebar
  // all follow the chosen palette instead of staying on the old theme.
  const card = step(bg, dark ? 4 : 3, dark);
  const popover = step(bg, dark ? 7 : 5, dark);
  const secondary = step(bg, dark ? 12 : 8, dark);
  const muted = step(bg, dark ? 14 : 9, dark);
  const border = step(bg, dark ? 16 : 12, dark);
  const sidebar = step(bg, dark ? 2 : 1, dark);
  const sidebarAccent = step(bg, dark ? 10 : 7, dark);

  root.setProperty('--card', str(card));
  root.setProperty('--card-foreground', str(readableOn(card)));
  root.setProperty('--popover', str(popover));
  root.setProperty('--popover-foreground', str(readableOn(popover)));
  root.setProperty('--secondary', str(secondary));
  root.setProperty('--secondary-foreground', str(readableOn(secondary)));
  root.setProperty('--muted', str(muted));
  root.setProperty('--muted-foreground', str({ h: bg.h, s: Math.min(bg.s + 5, 25), l: dark ? 65 : 40 }));
  root.setProperty('--border', str(border));
  root.setProperty('--input', str(border));

  // Brand
  root.setProperty('--primary', str(primary));
  root.setProperty('--primary-foreground', str(readableOn(primary)));
  root.setProperty('--ring', str(primary));

  if (accent) {
    root.setProperty('--accent', str(accent));
    root.setProperty('--accent-foreground', str(readableOn(accent)));
  }

  // Sidebar
  root.setProperty('--sidebar', str(sidebar));
  root.setProperty('--sidebar-background', str(sidebar));
  root.setProperty('--sidebar-foreground', str(readableOn(sidebar)));
  root.setProperty('--sidebar-primary', str(primary));
  root.setProperty('--sidebar-primary-foreground', str(readableOn(primary)));
  root.setProperty('--sidebar-accent', str(sidebarAccent));
  root.setProperty('--sidebar-accent-foreground', str(readableOn(sidebarAccent)));
  root.setProperty('--sidebar-border', str(border));
  root.setProperty('--sidebar-ring', str(primary));

  // Gradients + shadows follow the brand color
  const primaryGlow = { h: primary.h, s: clamp(primary.s), l: clamp(primary.l + 12) };
  root.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${str(primary)}) 0%, hsl(${str(primaryGlow)}) 100%)`);
  root.setProperty('--gradient-card', `linear-gradient(180deg, hsl(${str(card)}) 0%, hsl(${str(bg)}) 100%)`);
  root.setProperty('--shadow-glow', `0 0 40px hsl(${str(primary)} / ${style === 'zapcrm' ? 0.28 : 0.15})`);

  const shadowAlpha = dark ? 0.55 : 0.12;
  root.setProperty('--shadow-sm', `0 1px 2px 0 hsl(0 0% 0% / ${shadowAlpha})`);
  root.setProperty('--shadow-md', `0 4px 12px -2px hsl(0 0% 0% / ${shadowAlpha})`);
  root.setProperty('--shadow-lg', `0 12px 32px -8px hsl(0 0% 0% / ${shadowAlpha})`);
  root.setProperty('--shadow-card', `0 8px 24px -12px hsl(0 0% 0% / ${shadowAlpha})`);

  // Shape + typography per style
  root.setProperty('--radius', RADIUS[style] ?? RADIUS.default);
  if (style === 'zapcrm') {
    root.setProperty('--font-sans', "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif");
  } else {
    root.removeProperty('--font-sans');
  }
}

export function bootstrapTheme() {
  const t = loadTheme();
  if (t) applyTheme(t);
}

export { hexToHsl };
