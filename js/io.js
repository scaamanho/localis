// Exportación / importación (JSON propio + marcadores HTML) y copias de seguridad.
import { db, getSettings, DEFAULT_SETTINGS, SECTION_DEFAULTS, ITEM_DEFAULTS } from './db.js';
import { sanitizeTheme, normHex, newThemeId } from './themes.js';

export const FORMAT = 'startboard';
export const VERSION = 2;
const MAX_BACKUPS = 10;

// ---------------------------------------------------------------- URLs
const SAFE_PROTOCOLS = ['http:', 'https:', 'ftp:', 'mailto:', 'file:', 'chrome:', 'edge:', 'about:', 'chrome-extension:', 'moz-extension:'];

/** Añade https:// si falta el esquema. Devuelve '' si el resultado no es una URL segura. */
export function normalizeUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try {
    return SAFE_PROTOCOLS.includes(new URL(u).protocol) ? u : '';
  } catch { return ''; }
}

// ---------------------------------------------------------------- exportar
export async function exportData({ content = true, settings = true, themes = true } = {}) {
  const out = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString() };
  if (settings) out.settings = await getSettings();
  if (content) {
    out.pages = await db.pages.orderBy('order').toArray();
    out.sections = await db.sections.orderBy('order').toArray();
    out.items = (await db.items.toArray()).sort((a, b) => a.sectionId - b.sectionId || a.order - b.order);
  }
  if (themes) out.themes = await db.themes.toArray();
  return out;
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, (c) => (c === 'T' ? '-' : ''));

// ---------------------------------------------------------------- validar / sanear
const str = (v, max, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

function cleanSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  s.title = str(raw.title, 80, s.title);
  s.subtitle = str(raw.subtitle, 160, s.subtitle);
  s.themeId = /^[\w-]{1,64}$/.test(raw.themeId) ? raw.themeId : s.themeId;
  s.themeMode = pick(raw.themeMode, ['fixed', 'system'], 'fixed');
  s.themeLightId = /^[\w-]{1,64}$/.test(raw.themeLightId) ? raw.themeLightId : s.themeLightId;
  s.themeDarkId = /^[\w-]{1,64}$/.test(raw.themeDarkId) ? raw.themeDarkId : s.themeDarkId;
  s.activePageId = null; // se reasigna al importar
  s.layout = pick(raw.layout, ['auto', 'horizontal', 'vertical'], s.layout);
  s.itemSize = pick(raw.itemSize, ['small', 'medium', 'large'], s.itemSize);
  s.openIn = pick(raw.openIn, ['same', 'new'], s.openIn);
  s.showSearch = raw.showSearch !== false;
  s.searchEngine = str(raw.searchEngine, 300, s.searchEngine);
  s.bangs = str(raw.bangs, 4000, s.bangs);
  s.footer = str(raw.footer, 300, '');
  s.faviconProvider = pick(raw.faviconProvider, ['auto', 'browser', 'duckduckgo', 'google', 'none'], 'auto');
  s.maxWidth = Math.min(4000, Math.max(600, Number(raw.maxWidth) || s.maxWidth));
  s.customCss = str(raw.customCss, 20000, '').replace(/@import[^;]*;?/gi, '');
  s.headerLinks = (Array.isArray(raw.headerLinks) ? raw.headerLinks : []).slice(0, 12).map((l) => ({
    title: str(l?.title, 40), url: normalizeUrl(l?.url), color: normHex(l?.color, '#6c8cff'),
  })).filter((l) => l.title && l.url);
  return s;
}

/**
 * Valida un objeto ya parseado. Devuelve { ok, error?, clean, summary, warnings }.
 * `clean` solo contiene campos conocidos y valores saneados; los ids originales se
 * conservan únicamente para poder relacionar items con secciones al importar.
 */
export function validateImport(obj) {
  const warnings = [];
  if (!obj || typeof obj !== 'object' || obj.format !== FORMAT) {
    return { ok: false, error: 'The file is not a Tabra export.' };
  }
  if (typeof obj.version !== 'number' || obj.version < 1 || obj.version > VERSION) {
    return { ok: false, error: 'The file is from a newer version of Tabra.' };
  }
  const clean = {};

  if (Array.isArray(obj.sections)) {
    const pageIds = new Set();
    clean.pages = (Array.isArray(obj.pages) ? obj.pages : []).filter((p) => p && typeof p === 'object' && p.id != null)
      .map((p, i) => { pageIds.add(p.id); return { id: p.id, title: str(p.title, 60, 'Page'), icon: str(p.icon, 8), order: Number.isFinite(p.order) ? p.order : i }; })
      .sort((a, b) => a.order - b.order);
    const ids = new Set();
    clean.sections = obj.sections.filter((s) => s && typeof s === 'object' && s.id != null).map((s, i) => {
      ids.add(s.id);
      return {
        id: s.id,
        pageId: pageIds.has(s.pageId) ? s.pageId : null,
        title: str(s.title, 120, 'Section'),
        icon: str(s.icon, 2_000_000),
        color: normHex(s.color, SECTION_DEFAULTS.color),
        span: [1, 2, 3].includes(Number(s.span)) ? Number(s.span) : 1,
        layout: pick(s.layout, ['grid', 'list'], 'grid'),
        collapsed: !!s.collapsed,
        order: Number.isFinite(s.order) ? s.order : i,
      };
    }).sort((a, b) => a.order - b.order);

    let dropped = 0;
    clean.items = (Array.isArray(obj.items) ? obj.items : []).filter((it) => it && typeof it === 'object').flatMap((it, i) => {
      const url = normalizeUrl(it.url);
      if (!url || !ids.has(it.sectionId)) { dropped++; return []; }
      return [{
        ...ITEM_DEFAULTS,
        title: str(it.title, 160, url),
        url,
        description: str(it.description, 300),
        iconType: pick(it.iconType, ['favicon', 'emoji', 'url', 'upload'], 'favicon'),
        icon: str(it.icon, 2_000_000),
        tags: str(it.tags, 200),
        target: pick(it.target, ['default', 'new', 'same'], 'default'),
        sectionId: it.sectionId,
        order: Number.isFinite(it.order) ? it.order : i,
      }];
    });
    if (dropped) warnings.push(`${dropped} link(s) discarded due to an invalid URL or missing section.`);
  }

  if (Array.isArray(obj.themes)) {
    clean.themes = obj.themes.map(sanitizeTheme).filter(Boolean);
    if (clean.themes.some((t) => t.customCss)) warnings.push('Some themes include custom CSS.');
  }
  if (obj.settings) clean.settings = cleanSettings(obj.settings);
  if (!clean.sections && !clean.themes && !clean.settings) {
    return { ok: false, error: 'The file contains no importable data.' };
  }
  return {
    ok: true, clean, warnings,
    summary: {
      pages: clean.pages?.length ?? 0, sections: clean.sections?.length ?? 0, items: clean.items?.length ?? 0,
      themes: clean.themes?.length ?? 0, settings: !!clean.settings,
    },
  };
}

export function parseImportText(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'The file is not valid JSON.' }; }
  return validateImport(obj);
}

// ---------------------------------------------------------------- marcadores (Netscape HTML)
export function parseBookmarksHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const folders = []; // { title, items: [{title,url}] }
  const folderFor = (title) => {
    let f = folders.find((x) => x.title === title);
    if (!f) folders.push((f = { title, items: [] }));
    return f;
  };
  const walk = (dl, name) => {
    for (const child of dl.children) {
      if (child.tagName === 'DL') { walk(child, name); continue; }
      if (child.tagName !== 'DT') continue;
      const h3 = child.querySelector(':scope > h3');
      const a = child.querySelector(':scope > a');
      if (h3) {
        const sub = child.querySelector(':scope > dl') || (child.nextElementSibling?.tagName === 'DL' ? child.nextElementSibling : null);
        const title = name ? `${name} › ${h3.textContent.trim()}` : h3.textContent.trim();
        if (sub) walk(sub, title);
      } else if (a) {
        const url = normalizeUrl(a.getAttribute('href'));
        if (url) folderFor(name || 'Bookmarks').items.push({ title: a.textContent.trim() || url, url });
      }
    }
  };
  const root = doc.querySelector('dl');
  if (root) walk(root, '');

  const sections = [];
  const items = [];
  folders.filter((f) => f.items.length).forEach((f, i) => {
    sections.push({ id: i + 1, pageId: null, title: f.title.slice(0, 120), icon: '🔖', color: SECTION_DEFAULTS.color, span: 1, layout: 'list', collapsed: false, order: i });
    f.items.forEach((it, j) => items.push({ ...ITEM_DEFAULTS, title: it.title.slice(0, 160), url: it.url, sectionId: i + 1, order: j }));
  });
  return {
    ok: sections.length > 0,
    error: sections.length ? undefined : 'No bookmarks were found in the file.',
    clean: { sections, items }, warnings: [], pageTitle: 'Bookmarks',
    summary: { sections: sections.length, items: items.length, themes: 0, settings: false },
  };
}

// ---------------------------------------------------------------- importar
/**
 * mode: 'merge' (añade; mantiene ajustes actuales) | 'replace' (sustituye lo que venga en el archivo).
 * Las secciones sin página (archivos v1, marcadores) van a una página nueva: `pageTitle` al combinar, «Principal» al reemplazar.
 */
export async function importData(clean, { mode = 'merge', backup = true, pageTitle } = {}) {
  if (backup) await snapshot(mode === 'replace' ? 'Before replacing' : 'Before importing');
  await db.transaction('rw', db.sections, db.items, db.themes, db.settings, db.pages, async () => {
    let firstPage = null;
    if (clean.sections) {
      if (mode === 'replace') { await db.sections.clear(); await db.items.clear(); await db.pages.clear(); }
      const lastP = mode === 'merge' ? await db.pages.orderBy('order').last() : null;
      const pbase = lastP ? lastP.order + 1 : 0;
      const pageMap = new Map();
      for (const [i, p] of (clean.pages || []).entries()) {
        const { id, ...rest } = p;
        const nid = await db.pages.add({ ...rest, order: pbase + i });
        pageMap.set(id, nid);
        firstPage ??= nid;
      }
      let orphan = null;
      const orphanPage = async () => (orphan ??= await db.pages.add({
        title: mode === 'replace' ? 'Home' : (pageTitle || 'Imported'), icon: '', order: pbase + pageMap.size,
      }));

      const lastS = mode === 'merge' ? await db.sections.orderBy('order').last() : null;
      const base = lastS ? lastS.order + 1 : 0;
      const map = new Map();
      for (const [i, s] of clean.sections.entries()) {
        const { id, pageId, ...rest } = s;
        const pid = pageMap.get(pageId) ?? (await orphanPage());
        firstPage ??= pid;
        map.set(id, await db.sections.add({ ...rest, pageId: pid, order: base + i }));
      }
      const rows = (clean.items || []).map(({ id, ...it }) => ({ ...it, sectionId: map.get(it.sectionId) }))
        .filter((it) => it.sectionId != null);
      if (rows.length) await db.items.bulkAdd(rows);
    }
    if (clean.themes) {
      if (mode === 'replace') await db.themes.clear();
      for (const t of clean.themes) {
        const clash = mode === 'merge' && (await db.themes.get(t.id));
        await db.themes.put(clash ? { ...t, id: newThemeId() } : t);
      }
    }
    if (clean.settings && mode === 'replace') await db.settings.put({ ...clean.settings, key: 'main' });
    if (mode === 'replace' && clean.sections && firstPage != null) await db.settings.update('main', { activePageId: firstPage });
  });
}

// ---------------------------------------------------------------- copias de seguridad
export async function snapshot(label = 'Manual backup') {
  const data = await exportData();
  await db.backups.add({ createdAt: Date.now(), label, data });
  const count = await db.backups.count();
  if (count > MAX_BACKUPS) {
    const old = await db.backups.orderBy('createdAt').limit(count - MAX_BACKUPS).primaryKeys();
    await db.backups.bulkDelete(old);
  }
}

export async function restoreBackup(id) {
  const b = await db.backups.get(id);
  if (!b) throw new Error('Backup not found');
  const v = validateImport(b.data);
  if (!v.ok) throw new Error(v.error);
  await importData(v.clean, { mode: 'replace' }); // crea a su vez una copia "antes de reemplazar"
}
