import { liveQuery, db, getSettings, saveSettings, updateSection } from './db.js';
import { groupedThemes, findTheme, applyTheme, sanitizeCss, contrastText, effectiveThemeId } from './themes.js';
import { renderDashboard } from './render.js';
import { normalizeUrl } from './io.js';

const $ = (s) => document.querySelector(s);
const root = $('#dash');
const q = $('#q');

let state = null;
let matches = [];      // enlaces visibles mientras se filtra
let sel = 0;           // índice del enlace resaltado
let renderedAll = false; // true cuando se pintan las secciones de todas las páginas (búsqueda)

const isExt = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const prefersDark = matchMedia('(prefers-color-scheme: dark)');
prefersDark.addEventListener('change', () => state && paint());

// ------------------------------------------------------------------ navegación
function go(url, newTab = false) {
  const special = /^(chrome|edge|about|file|chrome-extension):/i.test(url);
  if (isExt && chrome.tabs && (special || newTab)) {
    if (newTab) chrome.tabs.create({ url });
    else chrome.tabs.update({ url });
    return;
  }
  if (newTab) window.open(url, '_blank', 'noopener');
  else location.href = url;
}

// Los esquemas internos (chrome://, file://) no se pueden abrir con un <a> desde una página de extensión.
root.addEventListener('click', (e) => {
  const a = e.target.closest('a.item');
  if (a && isExt && /^(chrome|edge|about|file):/i.test(a.getAttribute('href'))) {
    e.preventDefault();
    go(a.getAttribute('href'), a.target === '_blank' || e.ctrlKey || e.metaKey);
    return;
  }
  const t = e.target.closest('[data-action="toggle"]');
  if (t) {
    const id = Number(t.dataset.id);
    const sec = t.closest('.sec');
    const collapsed = !sec.classList.contains('collapsed');
    sec.classList.toggle('collapsed', collapsed);
    t.setAttribute('aria-expanded', String(!collapsed));
    t.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${sec.querySelector('.sec-title').textContent}`);
    updateSection(id, { collapsed });
  }
});

// ------------------------------------------------------------------ páginas
function currentPage() {
  const { pages, settings } = state;
  return pages.find((p) => p.id === settings.activePageId) || pages[0];
}
const setPage = (id) => saveSettings({ activePageId: id });

$('#page-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-page]');
  if (b) setPage(Number(b.dataset.page));
});

function renderTabs() {
  const nav = $('#page-tabs');
  const cur = currentPage();
  nav.hidden = state.pages.length < 2;
  nav.replaceChildren(...state.pages.map((p, i) => {
    const b = document.createElement('button');
    b.className = 'ptab'; b.type = 'button'; b.dataset.page = p.id;
    b.setAttribute('aria-current', p.id === cur?.id ? 'page' : 'false');
    if (i < 9) b.title = `Alt+${i + 1}`;
    b.textContent = (p.icon ? p.icon + ' ' : '') + p.title;
    return b;
  }));
}

// ------------------------------------------------------------------ pintado
function paint() {
  const { settings, customThemes } = state;
  const theme = findTheme(effectiveThemeId(settings, prefersDark.matches), customThemes);

  applyTheme(theme, document.documentElement, { cache: true });
  document.documentElement.style.setProperty('--max-w', settings.maxWidth + 'px');
  $('#theme-css').textContent = sanitizeCss(theme.customCss);
  $('#user-css').textContent = sanitizeCss(settings.customCss);

  document.title = settings.title || 'New tab';
  $('#title').textContent = settings.title;
  $('#subtitle').textContent = settings.subtitle;
  $('#footer').textContent = settings.footer;
  $('#search-box').hidden = !settings.showSearch;

  const links = $('#header-links');
  links.replaceChildren(...settings.headerLinks.filter((l) => l.title && normalizeUrl(l.url)).map((l) => {
    const a = Object.assign(document.createElement('a'), { className: 'hbtn', textContent: l.title, href: normalizeUrl(l.url) });
    if (settings.openIn === 'new') Object.assign(a, { target: '_blank', rel: 'noopener noreferrer' });
    a.style.setProperty('--c', l.color);
    a.style.setProperty('--c-text', contrastText(l.color));
    return a;
  }));

  const sel = $('#theme-select');
  sel.replaceChildren(...groupedThemes(customThemes, settings).map((group) => {
    const options = document.createElement('optgroup');
    options.label = group.label;
    options.append(...group.themes.map((t) => new Option(t.name, t.id, false, t.id === theme.id)));
    return options;
  }));
  sel.value = theme.id;

  for (const b of document.querySelectorAll('#layout-seg button')) b.setAttribute('aria-pressed', String(b.dataset.layout === settings.layout));
  for (const b of document.querySelectorAll('#size-seg button')) b.setAttribute('aria-pressed', String(b.dataset.size === settings.itemSize));

  renderTabs();
  drawBoard();
}

/** Pinta las secciones de la página activa; al buscar con varias páginas, las de todas. */
function drawBoard() {
  const { sections, items, settings, pages } = state;
  const term = q.value.trim();
  const all = !!term && pages.length > 1;
  const page = currentPage();
  const list = all ? sections : sections.filter((s) => s.pageId === page?.id);
  renderedAll = all;
  renderDashboard(root, { sections: list, items, settings });

  if (all) {
    const names = new Map(pages.map((p) => [p.id, p.title]));
    for (const sec of root.querySelectorAll('.sec')) {
      const s = sections.find((x) => x.id === Number(sec.dataset.id));
      const tag = Object.assign(document.createElement('span'), { className: 'sec-page', textContent: names.get(s?.pageId) || '' });
      sec.querySelector('.sec-title').after(tag);
    }
  }
  $('#empty p').textContent = sections.length ? 'This page is empty.' : 'There is nothing here yet.';
  $('#empty').hidden = list.length > 0 || !!term;
  applyFilter();
}

// ------------------------------------------------------------------ filtro, selección y búsqueda
function markSel() {
  root.querySelectorAll('.item.sel').forEach((n) => n.classList.remove('sel'));
  const m = matches[sel];
  if (m) { m.classList.add('sel'); m.scrollIntoView({ block: 'nearest' }); }
}

function applyFilter() {
  const term = q.value.trim().toLowerCase();
  root.classList.toggle('filtering', !!term);
  matches = [];
  let any = false;
  for (const sec of root.querySelectorAll('.sec')) {
    const toggle = sec.querySelector('[data-action="toggle"]');
    const collapsed = sec.classList.contains('collapsed');
    const title = sec.querySelector('.sec-title').textContent;
    toggle.disabled = !!term;
    toggle.setAttribute('aria-expanded', String(!!term || !collapsed));
    toggle.setAttribute('aria-label', term ? `Expanded during search: ${title}` : `${collapsed ? 'Expand' : 'Collapse'} ${title}`);
    let visible = 0;
    for (const it of sec.querySelectorAll('.item')) {
      const ok = !term || it.dataset.search.includes(term);
      it.hidden = !ok;
      if (ok) { visible++; if (term) matches.push(it); }
    }
    sec.hidden = !!term && visible === 0;
    if (visible) any = true;
  }
  sel = 0;
  markSel();
  $('#no-results').hidden = !term || any;
}

function parseBangs(text) {
  const map = new Map();
  for (const line of String(text).split('\n')) {
    const m = line.trim().match(/^(\S+)\s+(\S+)$/);
    if (m) map.set(m[1].toLowerCase(), m[2]);
  }
  return map;
}

function submitSearch(newTab) {
  const text = q.value.trim();
  if (!text) return;
  const { settings } = state;
  const bang = text.match(/^(\S+)\s+(.+)$/);
  const bangs = parseBangs(settings.bangs);
  if (bang && bangs.has(bang[1].toLowerCase())) {
    return go(bangs.get(bang[1].toLowerCase()).replace('%s', encodeURIComponent(bang[2])), newTab);
  }
  const m = matches[sel];
  if (m) return go(m.href, newTab || m.target === '_blank');
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text)) return go('https://' + text, newTab);
  go(settings.searchEngine.replace('%s', encodeURIComponent(text)), newTab);
}

q.addEventListener('input', () => {
  const needAll = !!q.value.trim() && state.pages.length > 1;
  if (needAll !== renderedAll) drawBoard(); else applyFilter();
});
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitSearch(e.ctrlKey || e.metaKey);
  else if (e.key === 'Escape') { q.value = ''; q.dispatchEvent(new Event('input')); q.blur(); }
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && matches.length) {
    e.preventDefault();
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
    markSel();
  }
});

// Atajos globales: Alt+1..9 cambia de página, «/» o escribir enfocan el buscador.
document.addEventListener('keydown', (e) => {
  if (!state) return;
  if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
    const p = state.pages[Number(e.code.slice(5)) - 1];
    if (p) { e.preventDefault(); setPage(p.id); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || $('#search-box').hidden) return;
  if (e.key === '/') e.preventDefault();
  q.focus();
});

// ------------------------------------------------------------------ controles de cabecera
$('#theme-select').addEventListener('change', (e) => saveSettings({ themeId: e.target.value, themeMode: 'fixed' }));
$('#layout-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) saveSettings({ layout: b.dataset.layout }); });
$('#size-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) saveSettings({ itemSize: b.dataset.size }); });

function openAdmin() {
  if (isExt) chrome.runtime.openOptionsPage();
  else location.href = 'admin.html';
}
$('#admin-btn').addEventListener('click', openAdmin);
document.addEventListener('click', (e) => { if (e.target.closest('[data-open-admin]')) openAdmin(); });

// ------------------------------------------------------------------ datos en vivo (se actualiza al editar en el panel)
liveQuery(async () => ({
  pages: await db.pages.orderBy('order').toArray(),
  sections: await db.sections.orderBy('order').toArray(),
  items: await db.items.toArray(),
  settings: await getSettings(),
  customThemes: await db.themes.toArray(),
})).subscribe({
  next(s) { state = s; paint(); },
  error(err) {
    console.error(err);
    $('#empty').hidden = false;
    $('#empty').querySelector('p').textContent = 'Could not open the database: ' + (err?.message || err);
  },
});
