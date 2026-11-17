// Capa de datos: Dexie sobre IndexedDB.
import Dexie from '../lib/dexie.mjs';

export const db = new Dexie('startboard');
export const liveQuery = Dexie.liveQuery;

db.version(1).stores({
  settings: 'key',                 // un único documento { key: 'main', ... }
  sections: '++id, order',
  items: '++id, sectionId, order',
  themes: 'id',                    // solo temas personalizados
  backups: '++id, createdAt',      // instantáneas automáticas / manuales
});

db.version(2).stores({
  pages: '++id, order',            // tableros: cada uno agrupa varias secciones
  sections: '++id, order, pageId',
}).upgrade(async (tx) => {
  const pid = await tx.table('pages').add({ title: 'Home', icon: '', order: 0 });
  await tx.table('sections').toCollection().modify({ pageId: pid });
  const st = await tx.table('settings').get('main');
  if (st) await tx.table('settings').put({ ...st, activePageId: pid });
});

db.version(3).stores({}).upgrade(async (tx) => {
  const settings = await tx.table('settings').get('main');
  if (!settings) return;
  const patch = {};
  if (settings.title === 'Startboard') patch.title = 'Tabra';
  if (settings.subtitle === 'Mi página de inicio') patch.subtitle = 'My start page';
  if (Object.keys(patch).length) await tx.table('settings').update('main', patch);
});

export const DEFAULT_SETTINGS = {
  key: 'main',
  activePageId: null,
  themeMode: 'fixed',      // fixed | system
  themeLightId: 'paper',
  themeDarkId: 'midnight',
  title: 'Tabra',
  subtitle: 'My start page',
  themeId: 'glass',
  layout: 'auto',          // auto | horizontal | vertical
  itemSize: 'medium',      // small | medium | large
  openIn: 'same',          // same | new
  showSearch: true,
  searchEngine: 'https://www.google.com/search?q=%s',
  bangs: [
    'g https://www.google.com/search?q=%s',
    'ddg https://duckduckgo.com/?q=%s',
    'yt https://www.youtube.com/results?search_query=%s',
    'mdn https://developer.mozilla.org/search?q=%s',
    'gh https://github.com/search?q=%s',
  ].join('\n'),
  headerLinks: [],         // [{ title, url, color }]
  footer: '',
  faviconProvider: 'auto', // auto | browser | duckduckgo | google | none
  maxWidth: 1500,
  customCss: '',
};

export const SECTION_DEFAULTS = { title: 'New section', icon: '', color: '#4f8cff', span: 1, layout: 'grid', collapsed: false };
export const ITEM_DEFAULTS = { title: '', url: '', description: '', iconType: 'favicon', icon: '', tags: '', target: 'default' };

// ---------------------------------------------------------------- datos de ejemplo (primer arranque)
const SEED = [
  { title: 'Development', icon: '💻', color: '#7c5cff', span: 2, items: [
    ['GitHub', 'https://github.com', 'Repositories'],
    ['MDN', 'https://developer.mozilla.org', 'Web documentation'],
    ['Stack Overflow', 'https://stackoverflow.com'],
    ['npm', 'https://www.npmjs.com'],
    ['Can I use', 'https://caniuse.com', 'Browser compatibility'],
    ['DevDocs', 'https://devdocs.io'],
    ['Dexie', 'https://dexie.org', 'IndexedDB wrapper'],
    ['Regex101', 'https://regex101.com'],
    ['CodePen', 'https://codepen.io'],
    ['JSON Crack', 'https://jsoncrack.com'],
  ] },
  { title: 'Design', icon: '🎨', color: '#ff6fa5', items: [
    ['Figma', 'https://www.figma.com'],
    ['Coolors', 'https://coolors.co', 'Color palettes'],
    ['Excalidraw', 'https://excalidraw.com'],
    ['Unsplash', 'https://unsplash.com'],
  ] },
  { title: 'Utilities', icon: '🧰', color: '#2fd6a3', layout: 'list', items: [
    ['Wikipedia', 'https://en.wikipedia.org', 'Encyclopedia'],
    ['Translate', 'https://translate.google.com', 'Google Translate'],
    ['Maps', 'https://maps.google.com'],
    ['Mail', 'https://mail.google.com'],
    ['Calendar', 'https://calendar.google.com'],
  ] },
  { title: 'Reading', icon: '📰', color: '#ffb020', layout: 'list', items: [
    ['Hacker News', 'https://news.ycombinator.com'],
    ['Lobsters', 'https://lobste.rs'],
    ['Smashing Magazine', 'https://www.smashingmagazine.com'],
  ] },
];

async function seed(d) {
  const pageId = await d.table('pages').add({ title: 'Home', icon: '', order: 0 });
  await d.table('settings').put({ ...DEFAULT_SETTINGS, activePageId: pageId });
  let order = 0;
  for (const s of SEED) {
    const id = await d.table('sections').add({
      ...SECTION_DEFAULTS, pageId, title: s.title, icon: s.icon, color: s.color,
      span: s.span || 1, layout: s.layout || 'grid', order: order++,
    });
    await d.table('items').bulkAdd(s.items.map(([title, url, description], i) => ({
      ...ITEM_DEFAULTS, title, url, description: description || '', sectionId: id, order: i,
    })));
  }
}
db.on('populate', (tx) => seed(tx));

/** Borra todo y vuelve a los datos de ejemplo. */
export async function resetAll() {
  await db.transaction('rw', db.settings, db.sections, db.items, db.themes, db.pages, async () => {
    await Promise.all([db.settings.clear(), db.sections.clear(), db.items.clear(), db.themes.clear(), db.pages.clear()]);
    await seed(db);
  });
}

// ---------------------------------------------------------------- ajustes
export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get('main')) || {}) };
}
export function saveSettings(patch) {
  return db.transaction('rw', db.settings, async () => {
    const cur = await getSettings();
    await db.settings.put({ ...cur, ...patch, key: 'main' });
  });
}

// ---------------------------------------------------------------- secciones
export async function addSection(data = {}) {
  const last = await db.sections.orderBy('order').last();
  return db.sections.add({ ...SECTION_DEFAULTS, ...data, order: (last ? last.order : -1) + 1 });
}
export async function updateSection(id, patch) {
  if (patch.pageId != null) {
    const cur = await db.sections.get(id);
    if (cur && cur.pageId !== patch.pageId) { // al cambiar de página, pasa al final
      const last = await db.sections.orderBy('order').last();
      patch = { ...patch, order: (last ? last.order : -1) + 1 };
    }
  }
  return db.sections.update(id, patch);
}

/** Elimina la sección y sus enlaces. Devuelve una función que lo deshace. */
export function deleteSection(id) {
  return db.transaction('rw', db.sections, db.items, async () => {
    const sec = await db.sections.get(id);
    const items = await db.items.where('sectionId').equals(id).toArray();
    await db.items.where('sectionId').equals(id).delete();
    await db.sections.delete(id);
    return () => db.transaction('rw', db.sections, db.items, async () => {
      if (sec) await db.sections.put(sec);
      await db.items.bulkPut(items);
    });
  });
}

export function moveSection(id, beforeId = null) {
  return db.transaction('rw', db.sections, async () => {
    const all = (await db.sections.orderBy('order').toArray()).filter((s) => s.id !== id);
    const cur = await db.sections.get(id);
    if (!cur) return;
    let idx = beforeId == null ? all.length : all.findIndex((s) => s.id === beforeId);
    if (idx < 0) idx = all.length;
    all.splice(idx, 0, cur);
    await db.sections.bulkPut(all.map((s, i) => ({ ...s, order: i })));
  });
}

export async function shiftSection(id, dir) {
  const cur = await db.sections.get(id);
  if (!cur) return;
  const all = (await db.sections.orderBy('order').toArray()).filter((s) => s.pageId === cur.pageId);
  const i = all.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  await moveSection(id, dir < 0 ? all[j].id : all[j + 1] ? all[j + 1].id : null);
}

// ---------------------------------------------------------------- items
export async function addItem(sectionId, data = {}) {
  const list = await db.items.where('sectionId').equals(sectionId).sortBy('order');
  const max = list.length ? list[list.length - 1].order : -1;
  return db.items.add({ ...ITEM_DEFAULTS, ...data, sectionId, order: max + 1 });
}

export function updateItem(id, patch) {
  return db.transaction('rw', db.items, async () => {
    const cur = await db.items.get(id);
    if (!cur) return;
    if (patch.sectionId != null && patch.sectionId !== cur.sectionId) {
      const list = await db.items.where('sectionId').equals(patch.sectionId).sortBy('order');
      patch = { ...patch, order: list.length ? list[list.length - 1].order + 1 : 0 };
    }
    await db.items.update(id, patch);
  });
}

/** Elimina el enlace. Devuelve una función que lo deshace. */
export async function deleteItem(id) {
  const row = await db.items.get(id);
  await db.items.delete(id);
  return () => (row ? db.items.put(row) : undefined);
}

export function duplicateItem(id) {
  return db.transaction('rw', db.items, async () => {
    const it = await db.items.get(id);
    if (!it) return;
    const { id: _omit, ...rest } = it;
    const copyId = await db.items.add({ ...rest, order: it.order + 0.5 });
    const fresh = (await db.items.where('sectionId').equals(it.sectionId).sortBy('order'));
    await db.items.bulkPut(fresh.map((x, i) => ({ ...x, order: i })));
    return copyId;
  });
}

export function moveItem(itemId, targetSectionId, beforeItemId = null) {
  return db.transaction('rw', db.items, async () => {
    const it = await db.items.get(itemId);
    if (!it) return;
    const srcId = it.sectionId;
    const target = (await db.items.where('sectionId').equals(targetSectionId).sortBy('order'))
      .filter((x) => x.id !== itemId);
    let idx = beforeItemId == null ? target.length : target.findIndex((x) => x.id === beforeItemId);
    if (idx < 0) idx = target.length;
    target.splice(idx, 0, { ...it, sectionId: targetSectionId });
    await db.items.bulkPut(target.map((x, i) => ({ ...x, order: i })));
    if (srcId !== targetSectionId) {
      const src = await db.items.where('sectionId').equals(srcId).sortBy('order');
      await db.items.bulkPut(src.map((x, i) => ({ ...x, order: i })));
    }
  });
}

// ---------------------------------------------------------------- páginas
export const getPages = () => db.pages.orderBy('order').toArray();

export async function addPage(data = {}) {
  const last = await db.pages.orderBy('order').last();
  return db.pages.add({ title: 'New page', icon: '', ...data, order: (last ? last.order : -1) + 1 });
}
export const updatePage = (id, patch) => db.pages.update(id, patch);

export async function movePage(id, dir) {
  const all = await getPages();
  const i = all.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.pages.bulkPut(all.map((p, k) => ({ ...p, order: k })));
}

/** Elimina la página con sus secciones y enlaces. Devuelve una función que lo deshace. */
export async function deletePage(id) {
  const restore = await db.transaction('rw', db.pages, db.sections, db.items, async () => {
    if ((await db.pages.count()) < 2) throw new Error('At least one page must remain.');
    const page = await db.pages.get(id);
    const sections = await db.sections.where('pageId').equals(id).toArray();
    const items = await db.items.where('sectionId').anyOf(sections.map((s) => s.id)).toArray();
    await db.items.bulkDelete(items.map((i) => i.id));
    await db.sections.bulkDelete(sections.map((s) => s.id));
    await db.pages.delete(id);
    return async () => db.transaction('rw', db.pages, db.sections, db.items, async () => {
      if (page) await db.pages.put(page);
      await db.sections.bulkPut(sections);
      await db.items.bulkPut(items);
    });
  });
  const cfg = await getSettings();
  if (cfg.activePageId === id) await saveSettings({ activePageId: (await getPages())[0]?.id ?? null });
  return async () => { await restore(); await saveSettings({ activePageId: id }); };
}

// ---------------------------------------------------------------- temas personalizados
export const getCustomThemes = () => db.themes.toArray();
export const saveTheme = (t) => db.themes.put(t);
export const deleteTheme = (id) => db.themes.delete(id);
