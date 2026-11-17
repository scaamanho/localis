// Motor de temas: un tema es un objeto plano de "tokens" que se traduce a variables CSS.
// Los temas integrados viven en código; los personalizados se guardan en Dexie (tabla `themes`).

export const THEME_DEFAULTS = {
  bg: '#0f1117',
  bgImage: '',        // URL, data: URL o degradado CSS (linear-gradient(...))
  bgBlur: 0,          // px
  overlay: 0,         // % de oscurecimiento sobre la imagen
  surface: '#171a23', // panel de cada sección
  surfaceOpacity: 100,
  surfaceBlur: 0,     // px (efecto cristal)
  item: '#222633',    // tarjeta de cada enlace
  itemOpacity: 100,
  itemHover: '#2d3345',
  text: '#e8eaf0',
  muted: '#9aa1b5',
  accent: '#6c8cff',
  border: '#2a2f3d',
  radius: 10,
  gap: 18,
  fontSize: 15,
  shadow: 30,         // 0-80
  secStyle: 'solid',  // solid | outline | minimal
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headingFont: '',
  customCss: '',
};

export const FONT_PRESETS = [
  ['Sistema', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
  ['Redondeada', 'ui-rounded, "Nunito", "Varela Round", system-ui, sans-serif'],
  ['Monoespaciada', 'ui-monospace, "Cascadia Code", "Fira Code", Consolas, monospace'],
  ['Serif', 'Georgia, "Times New Roman", serif'],
  ['Humanista', 'Optima, Candara, "Segoe UI", sans-serif'],
];

export const BUILTIN_THEMES = [
  { id: 'midnight', name: 'Midnight' },
  {
    id: 'neon', name: 'Neón',
    bg: '#0a0a0c', surface: '#15161a', item: '#0e0f12', itemHover: '#1d1f26', text: '#f2f2f2', muted: '#9a9aa5',
    accent: '#c35bff', border: '#26272e', radius: 0, gap: 22, shadow: 55, secStyle: 'solid',
    font: FONT_PRESETS[2][1],
  },
  {
    id: 'nord', name: 'Nord',
    bg: '#2e3440', surface: '#3b4252', item: '#434c5e', itemHover: '#4c566a', text: '#eceff4', muted: '#aeb6c6',
    accent: '#88c0d0', border: '#4c566a', radius: 8, shadow: 20,
  },
  {
    id: 'dracula', name: 'Dracula',
    bg: '#282a36', surface: '#303241', item: '#44475a', itemHover: '#515470', text: '#f8f8f2', muted: '#a4a9cf',
    accent: '#bd93f9', border: '#44475a', radius: 10,
  },
  {
    id: 'mocha', name: 'Catppuccin Mocha',
    bg: '#1e1e2e', surface: '#181825', item: '#313244', itemHover: '#45475a', text: '#cdd6f4', muted: '#a6adc8',
    accent: '#cba6f7', border: '#45475a', radius: 14, secStyle: 'minimal',
  },
  {
    id: 'paper', name: 'Paper (claro)',
    bg: '#f3f4f7', surface: '#ffffff', item: '#f0f2f6', itemHover: '#e3e8f2', text: '#1f2430', muted: '#6b7385',
    accent: '#3b6cff', border: '#e0e4ec', radius: 12, shadow: 10,
  },
  {
    id: 'solarized', name: 'Solarized claro',
    bg: '#fdf6e3', surface: '#eee8d5', item: '#fdf6e3', itemHover: '#f6efd9', text: '#586e75', muted: '#93a1a1',
    accent: '#268bd2', border: '#d9d2bc', radius: 6, shadow: 8, secStyle: 'outline',
    font: FONT_PRESETS[3][1],
  },
  {
    id: 'cyber', name: 'Cyber',
    bg: '#0a0014', surface: '#14002a', item: '#1d0840', itemHover: '#2c0f5c', text: '#f0e6ff', muted: '#a88bd6',
    accent: '#ff2bd6', border: '#3a1470', radius: 2, gap: 20, shadow: 0, secStyle: 'outline',
    font: FONT_PRESETS[2][1],
  },
  {
    id: 'glass', name: 'Cristal',
    bg: '#1b2a4e', bgImage: 'linear-gradient(135deg, #1d2b64 0%, #6b3fa0 55%, #f8a5c2 100%)',
    surface: '#ffffff', surfaceOpacity: 14, surfaceBlur: 16,
    item: '#ffffff', itemOpacity: 12, itemHover: '#ffffff',
    text: '#ffffff', muted: '#d6d9ee', accent: '#ffd36b', border: '#ffffff', radius: 16, shadow: 25, secStyle: 'minimal',
  },
].map((t) => ({ ...THEME_DEFAULTS, ...t, builtin: true }));

export const DEFAULT_THEME_ID = 'midnight';

export function allThemes(custom = []) {
  return [...BUILTIN_THEMES, ...custom.map((t) => ({ ...THEME_DEFAULTS, ...t }))];
}
export function findTheme(id, custom = []) {
  return allThemes(custom).find((t) => t.id === id) || BUILTIN_THEMES[0];
}

// ---------------------------------------------------------------- utilidades de color
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function normHex(c, fallback = '#000000') {
  if (typeof c !== 'string' || !HEX.test(c.trim())) return fallback;
  let h = c.trim().toLowerCase();
  if (h.length === 4) h = '#' + [...h.slice(1)].map((x) => x + x).join('');
  return h;
}
export function luminance(hex) {
  const h = normHex(hex);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const isDark = (hex) => luminance(hex) < 0.35;
export const contrastText = (hex) => (luminance(hex) > 0.4 ? '#111318' : '#ffffff');

const mix = (c, pct) => (pct >= 100 ? c : `color-mix(in srgb, ${c} ${pct}%, transparent)`);

function cssUrl(u) {
  return String(u).replace(/["\\\n\r]/g, (ch) => '\\' + ch.charCodeAt(0).toString(16) + ' ');
}
function bgValue(v) {
  if (!v) return 'none';
  if (/^(repeating-)?(linear|radial|conic)-gradient\(/i.test(v) && !/url\(/i.test(v)) return v;
  return `url("${cssUrl(v)}")`;
}

// ---------------------------------------------------------------- tema -> variables CSS
export function themeVars(theme) {
  const t = { ...THEME_DEFAULTS, ...theme };
  const base = isDark(t.bg) ? 'dark' : 'light';
  return {
    '--bg': t.bg,
    '--bg-image': bgValue(t.bgImage),
    '--bg-blur': `${t.bgBlur}px`,
    '--overlay': `rgba(0,0,0,${Math.min(100, Math.max(0, t.overlay)) / 100})`,
    '--surface': mix(t.surface, t.surfaceOpacity),
    '--surface-blur': `${t.surfaceBlur}px`,
    '--item': mix(t.item, t.itemOpacity),
    '--item-hover': mix(t.itemHover, Math.min(100, t.itemOpacity + (t.itemOpacity < 100 ? 12 : 0))),
    '--text': t.text,
    '--muted': t.muted,
    '--accent': t.accent,
    '--accent-text': contrastText(t.accent),
    '--border': t.border === '#ffffff' && t.surfaceOpacity < 100 ? 'rgba(255,255,255,.22)' : t.border,
    '--radius': `${t.radius}px`,
    '--gap': `${t.gap}px`,
    '--font-size': `${t.fontSize}px`,
    '--shadow': t.shadow > 0 ? `0 6px 18px rgba(0,0,0,${t.shadow / 100})` : 'none',
    '--font': t.font || THEME_DEFAULTS.font,
    '--font-heading': t.headingFont || t.font || THEME_DEFAULTS.font,
    'color-scheme': base,
  };
}

const CACHE_KEY = 'startboard:theme-cache';

/**
 * Aplica un tema sobre un elemento (por defecto <html>). Si `cache` es true guarda
 * las variables en localStorage para que boot.js pinte sin parpadeo en la siguiente apertura.
 */
export function applyTheme(theme, el = document.documentElement, { cache = false } = {}) {
  const vars = themeVars(theme);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.dataset.secStyle = theme.secStyle || 'solid';
  if (cache) {
    try {
      const light = { ...vars };
      if (String(light['--bg-image']).length > 200000) light['--bg-image'] = 'none';
      localStorage.setItem(CACHE_KEY, JSON.stringify({ vars: light, secStyle: el.dataset.secStyle }));
    } catch { /* cuota o modo privado: no pasa nada */ }
  }
  return vars;
}

export function sanitizeCss(css) {
  return String(css || '').replace(/@import[^;]*;?/gi, '').slice(0, 20000);
}

// ---------------------------------------------------------------- validación de temas importados
const NUM = {
  bgBlur: [0, 40], overlay: [0, 90], surfaceOpacity: [0, 100], surfaceBlur: [0, 40], itemOpacity: [0, 100],
  radius: [0, 40], gap: [0, 60], fontSize: [10, 26], shadow: [0, 100],
};
const COLORS = ['bg', 'surface', 'item', 'itemHover', 'text', 'muted', 'accent', 'border'];

export function sanitizeTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = { ...THEME_DEFAULTS };
  for (const k of COLORS) t[k] = normHex(raw[k], THEME_DEFAULTS[k]);
  for (const [k, [lo, hi]] of Object.entries(NUM)) {
    const n = Number(raw[k]);
    t[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : THEME_DEFAULTS[k];
  }
  t.secStyle = ['solid', 'outline', 'minimal'].includes(raw.secStyle) ? raw.secStyle : 'solid';
  const font = (v, d) => (typeof v === 'string' ? v.replace(/[;{}<>]/g, '').slice(0, 200) : d);
  t.font = font(raw.font, THEME_DEFAULTS.font) || THEME_DEFAULTS.font;
  t.headingFont = font(raw.headingFont, '');
  t.bgImage = typeof raw.bgImage === 'string' && raw.bgImage.length < 6_000_000 ? raw.bgImage : '';
  t.customCss = sanitizeCss(raw.customCss);
  t.name = String(raw.name || 'Tema importado').slice(0, 60);
  t.id = typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : newThemeId();
  return t;
}

/** Tema que toca aplicar: el fijo, o el claro/oscuro según la preferencia del sistema. */
export function effectiveThemeId(settings, prefersDark) {
  if (settings.themeMode === 'system') {
    return (prefersDark ? settings.themeDarkId : settings.themeLightId) || settings.themeId;
  }
  return settings.themeId;
}

export function newThemeId() {
  return 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
