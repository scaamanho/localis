import {
  db, liveQuery, getSettings, saveSettings, resetAll,
  addSection, updateSection, deleteSection, moveSection, shiftSection,
  addItem, updateItem, deleteItem, duplicateItem, moveItem, saveTheme, deleteTheme,
  addPage, updatePage, deletePage, movePage,
} from './db.js';
import {
  allThemes, findTheme, applyTheme, sanitizeTheme, sanitizeCss, newThemeId, normHex, effectiveThemeId,
  THEME_DEFAULTS, FONT_PRESETS,
} from './themes.js';
import { renderDashboard, makeIcon } from './render.js';
import {
  exportData, importData, parseImportText, parseBookmarksHtml, normalizeUrl,
  download, stamp, snapshot, restoreBackup, FORMAT, VERSION,
} from './io.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

let state = null;       // { sections, items, settings, customThemes }
let backups = [];       // metadatos de copias de seguridad

// ------------------------------------------------------------------ utilidades
let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(document.createTextNode(msg));
  if (action) {
    const b = el('button', 'toast-btn', action.label);
    b.type = 'button';
    b.addEventListener('click', async () => { t.hidden = true; try { await action.fn(); } catch (err) { fail(err); } });
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 8000 : 2800);
}
const fail = (err) => { console.error(err); toast('Error: ' + (err?.message || err)); };

const readText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
const readDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

/** Reduce la imagen para no engordar la base de datos. Los SVG se guardan tal cual. */
async function imageToDataUrl(file, maxDim, mime = 'image/png', quality = 0.85) {
  if (file.type === 'image/svg+xml' && file.size < 200_000) return readDataUrl(file);
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(bmp.width * k)), height: Math.max(1, Math.round(bmp.height * k)) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL(mime, quality);
}

const prefersDark = matchMedia('(prefers-color-scheme: dark)');
prefersDark.addEventListener('change', () => state && paintDash());
const activeTheme = () => findTheme(effectiveThemeId(state.settings, prefersDark.matches), state.customThemes);

const curPage = () => state.pages.find((p) => p.id === state.settings.activePageId) || state.pages[0];
const pageSections = () => { const p = curPage(); return p ? state.sections.filter((s) => s.pageId === p.id) : []; };

// ------------------------------------------------------------------ pestañas
function showTab(name) {
  for (const b of $$('#tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const s of $$('.tab')) s.hidden = s.id !== `tab-${name}`;
  history.replaceState(null, '', `#${name}`);
  if (name === 'settings' && state) populateSettings();
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });

// ------------------------------------------------------------------ CONTENIDO: pintado
const dashEl = $('#dash');

function paintDash() {
  applyTheme(activeTheme(), $('#dash-scope'));
  renderDashboard(dashEl, { ...state, sections: pageSections() }, { edit: true });
  renderPageBar();
}

function renderPageBar() {
  const cur = curPage();
  $('#page-tabs').replaceChildren(...state.pages.map((p) => {
    const b = el('button', null, (p.icon ? p.icon + ' ' : '') + p.title);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(p.id === cur?.id));
    b.addEventListener('click', () => saveSettings({ activePageId: p.id }));
    return b;
  }));
  const i = state.pages.findIndex((p) => p.id === cur?.id);
  $('#btn-page-del').disabled = state.pages.length < 2;
  $('#btn-page-left').disabled = i <= 0;
  $('#btn-page-right').disabled = i < 0 || i >= state.pages.length - 1;
}

dashEl.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const id = Number(b.dataset.id);
  try {
    switch (b.dataset.action) {
      case 'toggle': await updateSection(id, { collapsed: !state.sections.find((s) => s.id === id).collapsed }); break;
      case 'edit-item': openItemDialog(state.items.find((i) => i.id === id)); break;
      case 'add-item': openItemDialog(null, id); break;
      case 'dup-item': await duplicateItem(id); toast('Enlace duplicado'); break;
      case 'del-item': {
        const it = state.items.find((i) => i.id === id);
        const undo = await deleteItem(id);
        toast(`«${it.title}» eliminado`, { label: 'Deshacer', fn: undo });
        break;
      }
      case 'edit-section': openSectionDialog(state.sections.find((s) => s.id === id)); break;
      case 'add-section': openSectionDialog(null); break;
      case 'move-left': await shiftSection(id, -1); break;
      case 'move-right': await shiftSection(id, 1); break;
      case 'del-section': {
        const sec = state.sections.find((s) => s.id === id);
        const n = state.items.filter((i) => i.sectionId === id).length;
        const undo = await deleteSection(id);
        toast(`Sección «${sec.title}» eliminada${n ? ` (${n} enlaces)` : ''}`, { label: 'Deshacer', fn: undo });
        break;
      }
    }
  } catch (err) { fail(err); }
});

dashEl.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.item[data-action]')) { e.preventDefault(); e.target.click(); }
});
$('#btn-add-section').addEventListener('click', () => openSectionDialog(null));

// ------------------------------------------------------------------ PÁGINAS
const dlgPage = $('#dlg-page');
const formPage = $('#form-page');
let editingPageId = null;

function openPageDialog(page) {
  editingPageId = page ? page.id : null;
  $('#page-dlg-title').textContent = page ? 'Editar página' : 'Nueva página';
  formPage.elements.title.value = page ? page.title : '';
  formPage.elements.icon.value = page ? page.icon : '';
  dlgPage.showModal();
  formPage.elements.title.focus();
}
formPage.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = formPage.elements;
  const data = { title: f.title.value.trim() || 'Página', icon: f.icon.value.trim().slice(0, 8) };
  try {
    if (editingPageId != null) await updatePage(editingPageId, data);
    else await saveSettings({ activePageId: await addPage(data) });
    dlgPage.close();
  } catch (err) { fail(err); }
});
$('#btn-page-add').addEventListener('click', () => openPageDialog(null));
$('#btn-page-edit').addEventListener('click', () => openPageDialog(curPage()));
$('#btn-page-left').addEventListener('click', () => movePage(curPage().id, -1).catch(fail));
$('#btn-page-right').addEventListener('click', () => movePage(curPage().id, 1).catch(fail));
$('#btn-page-del').addEventListener('click', async () => {
  const p = curPage();
  const n = state.sections.filter((s) => s.pageId === p.id).length;
  if (n && !confirm(`¿Eliminar la página «${p.title}» con sus ${n} secciones?`)) return;
  try {
    const undo = await deletePage(p.id);
    toast(`Página «${p.title}» eliminada`, { label: 'Deshacer', fn: undo });
  } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ CONTENIDO: arrastrar y soltar
let drag = null;
let lastTarget = null;

const clearMarks = () => $$('.drop-before,.drop-after,.drop-into', dashEl).forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into', 'v'));
const isBefore = (e, node, vert) => {
  const r = node.getBoundingClientRect();
  return vert ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
};

dashEl.addEventListener('dragstart', (e) => {
  const src = e.target.closest?.('[draggable="true"]');
  if (!src) return;
  drag = { kind: src.dataset.kind, id: Number(src.dataset.id) };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', `${drag.kind}:${drag.id}`);
  if (drag.kind === 'section') e.dataTransfer.setDragImage(src.closest('.sec'), 24, 18);
  requestAnimationFrame(() => (drag.kind === 'section' ? src.closest('.sec') : src).classList.add('dragging'));
});

dashEl.addEventListener('dragover', (e) => {
  if (!drag) return;
  let t = null;
  if (drag.kind === 'item') {
    const it = e.target.closest('.item[data-kind="item"]');
    if (it) {
      if (Number(it.dataset.id) !== drag.id) { const vert = !!it.closest('.items-list'); t = { type: 'item', el: it, vert, before: isBefore(e, it, vert) }; }
    } else {
      const sec = e.target.closest('.sec');
      if (sec) t = { type: 'append', el: $('.sec-body', sec), secId: Number(sec.dataset.id) };
    }
  } else {
    const sec = e.target.closest('.sec');
    if (sec && Number(sec.dataset.id) !== drag.id) {
      const vert = dashEl.dataset.layout === 'vertical';
      t = { type: 'sec', el: sec, vert, before: isBefore(e, sec, vert) };
    }
  }
  clearMarks();
  lastTarget = t;
  if (!t) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (t.type === 'append') t.el.classList.add('drop-into');
  else { t.el.classList.add(t.before ? 'drop-before' : 'drop-after'); if (t.vert) t.el.classList.add('v'); }
});

dashEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  const t = lastTarget, d = drag;
  clearMarks();
  drag = lastTarget = null;
  if (!t || !d) return;
  try {
    if (d.kind === 'item') {
      if (t.type === 'append') return void (await moveItem(d.id, t.secId, null));
      const sid = Number(t.el.closest('.sec').dataset.id);
      let before = null;
      if (t.before) before = Number(t.el.dataset.id);
      else { let n = t.el.nextElementSibling; while (n && n.dataset.kind !== 'item') n = n.nextElementSibling; before = n ? Number(n.dataset.id) : null; }
      await moveItem(d.id, sid, before);
    } else {
      let before = null;
      if (t.before) before = Number(t.el.dataset.id);
      else { let n = t.el.nextElementSibling; while (n && !n.classList.contains('sec')) n = n.nextElementSibling; before = n ? Number(n.dataset.id) : null; }
      await moveSection(d.id, before);
    }
  } catch (err) { fail(err); }
});

dashEl.addEventListener('dragend', () => { clearMarks(); $$('.dragging', dashEl).forEach((n) => n.classList.remove('dragging')); drag = lastTarget = null; });

// ------------------------------------------------------------------ CONTENIDO: diálogo de enlace
const dlgItem = $('#dlg-item');
const formItem = $('#form-item');
let editingItemId = null;

for (const dlg of $$('dialog')) {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
}

function updateItemIconUI() {
  const f = formItem.elements;
  const type = f.iconType.value;
  f.icon.hidden = type === 'favicon' || type === 'upload';
  $('#item-icon-file').hidden = type !== 'upload';
  f.icon.placeholder = type === 'emoji' ? '🚀' : 'https://…/icono.png';
  const url = normalizeUrl(f.url.value) || f.url.value;
  const prev = makeIcon({ iconType: type, icon: f.icon.value.trim(), url, title: f.title.value }, state.settings.faviconProvider);
  $('#item-icon-preview').replaceChildren(prev);
}
formItem.addEventListener('input', updateItemIconUI);
$('#item-icon-file').addEventListener('click', () => $('#item-icon-input').click());
$('#item-icon-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { formItem.elements.icon.value = await imageToDataUrl(file, 96); updateItemIconUI(); } catch (err) { fail(err); }
});

function openItemDialog(item, sectionId) {
  const f = formItem.elements;
  editingItemId = item ? item.id : null;
  $('#item-dlg-title').textContent = item ? 'Editar enlace' : 'Nuevo enlace';
  f.sectionId.replaceChildren(...state.sections.map((s) => new Option(s.title, s.id)));
  const src = item || { title: '', url: '', description: '', iconType: 'favicon', icon: '', tags: '', target: 'default', sectionId };
  for (const k of ['title', 'url', 'description', 'iconType', 'icon', 'tags', 'target', 'sectionId']) f[k].value = src[k] ?? '';
  $('#item-error').hidden = true;
  updateItemIconUI();
  dlgItem.showModal();
  f.title.focus();
}

formItem.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = formItem.elements;
  const err = $('#item-error');
  const url = normalizeUrl(f.url.value);
  const type = f.iconType.value;
  const icon = f.icon.value.trim();
  const problem = !url ? 'La URL no es válida (se admiten http, https, ftp, mailto, chrome, file…).'
    : type === 'url' && !/^(https?:|data:image\/)/i.test(icon) ? 'La URL del icono debe empezar por http(s):'
    : type === 'upload' && !icon ? 'Elige una imagen para subir.'
    : type === 'emoji' && !icon ? 'Escribe un emoji o texto corto.' : '';
  if (problem) { err.textContent = problem; err.hidden = false; return; }
  const data = {
    title: f.title.value.trim(), url, description: f.description.value.trim(), target: f.target.value,
    iconType: type, icon: type === 'favicon' ? '' : icon, tags: f.tags.value.trim(), sectionId: Number(f.sectionId.value),
  };
  try {
    if (editingItemId != null) await updateItem(editingItemId, data);
    else await addItem(data.sectionId, data);
    dlgItem.close();
  } catch (e2) { fail(e2); }
});

// ------------------------------------------------------------------ CONTENIDO: diálogo de sección
const dlgSec = $('#dlg-section');
const formSec = $('#form-section');
let editingSectionId = null;
const SWATCHES = ['#7c5cff', '#4f8cff', '#2fd6a3', '#7bd957', '#ffb020', '#ff7a45', '#ff6fa5', '#e0485c', '#9aa4b8', '#2b3140'];

$('#section-swatches').replaceChildren(...SWATCHES.map((c) => {
  const b = el('button'); b.type = 'button'; b.style.setProperty('--c', c); b.dataset.color = c; b.title = c;
  return b;
}));
function syncSwatches() { for (const b of $$('#section-swatches button')) b.setAttribute('aria-pressed', String(b.dataset.color === formSec.elements.color.value)); }
$('#section-swatches').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { formSec.elements.color.value = b.dataset.color; syncSwatches(); } });
formSec.elements.color.addEventListener('input', syncSwatches);

function openSectionDialog(sec) {
  const f = formSec.elements;
  editingSectionId = sec ? sec.id : null;
  $('#section-dlg-title').textContent = sec ? 'Editar sección' : 'Nueva sección';
  const src = sec || { title: '', icon: '', color: SWATCHES[0], span: 1, layout: 'grid', collapsed: false };
  f.pageId.replaceChildren(...state.pages.map((p) => new Option(p.title, p.id)));
  f.pageId.value = String(sec ? sec.pageId : curPage().id);
  f.title.value = src.title; f.icon.value = src.icon; f.color.value = normHex(src.color, SWATCHES[0]);
  f.span.value = String(src.span); f.layout.value = src.layout; f.collapsed.checked = !!src.collapsed;
  syncSwatches();
  dlgSec.showModal();
  f.title.focus();
}
formSec.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = formSec.elements;
  const data = { pageId: Number(f.pageId.value), title: f.title.value.trim() || 'Sección', icon: f.icon.value.trim(), color: f.color.value, span: Number(f.span.value), layout: f.layout.value, collapsed: f.collapsed.checked };
  try {
    if (editingSectionId != null) await updateSection(editingSectionId, data);
    else await addSection(data);
    dlgSec.close();
  } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ TEMAS: lista
const themeList = $('#theme-list');

function renderThemeList() {
  const activeId = activeTheme().id;
  themeList.replaceChildren(...allThemes(state.customThemes).map((t) => {
    const card = el('article', 'theme-card');
    card.dataset.active = String(t.id === activeId);
    const sw = el('div', 'theme-swatch');
    sw.style.background = /gradient\(/i.test(t.bgImage) ? t.bgImage : t.bg;
    sw.style.setProperty('--r', t.radius + 'px');
    const dots = [t.accent, t.surface, t.item].map((c) => { const i = el('i'); i.style.setProperty('--s', c); i.style.background = c; return i; });
    sw.append(...dots);
    const info = el('div', 'theme-info');
    info.append(el('strong', null, t.name), el('span', 'badge' + (t.id === activeId ? ' on' : ''), t.id === activeId ? 'Activo' : t.builtin ? 'Integrado' : 'Propio'));
    const acts = el('div', 'theme-actions');
    const btn = (label, fn, cls = '') => { const b = el('button', `btn small ${cls}`, label); b.type = 'button'; b.addEventListener('click', () => Promise.resolve(fn()).catch(fail)); acts.append(b); };
    if (t.id !== activeId) btn('Activar', () => saveSettings({ themeId: t.id, themeMode: 'fixed' }), 'primary');
    if (t.builtin) btn('Personalizar', () => startEdit(t, true));
    else {
      btn('Editar', () => startEdit(t, false));
      btn('Duplicar', () => startEdit(t, true));
      btn('Exportar', () => exportTheme(t));
      btn('Eliminar', async () => {
        if (!confirm(`¿Eliminar el tema «${t.name}»?`)) return;
        if (t.id === activeId) await saveSettings({ themeId: 'midnight' });
        await deleteTheme(t.id);
        if (editing?.id === t.id) closeEditor();
      }, 'danger');
    }
    card.append(sw, info, acts);
    return card;
  }));
}

function exportTheme(t) {
  const { builtin, ...theme } = t;
  download(`tema-${theme.name.toLowerCase().replace(/\W+/g, '-')}.json`, JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), themes: [theme] }, null, 2));
}

$('#btn-theme-new').addEventListener('click', () => startEdit(activeTheme(), true));
$('#btn-theme-import').addEventListener('click', () => $('#theme-file').click());
$('#theme-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const v = parseImportText(await readText(file));
    if (!v.ok || !v.clean.themes?.length) return toast(v.error || 'El archivo no contiene temas.');
    await importData({ themes: v.clean.themes }, { mode: 'merge', backup: false });
    toast(`${v.clean.themes.length} tema(s) importado(s)`);
  } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ TEMAS: editor
const FIELDS = [
  { group: 'Colores', items: [
    { k: 'bg', t: 'color', l: 'Fondo' }, { k: 'surface', t: 'color', l: 'Paneles' }, { k: 'item', t: 'color', l: 'Enlaces' },
    { k: 'itemHover', t: 'color', l: 'Enlace (hover)' }, { k: 'text', t: 'color', l: 'Texto' }, { k: 'muted', t: 'color', l: 'Texto suave' },
    { k: 'accent', t: 'color', l: 'Acento' }, { k: 'border', t: 'color', l: 'Bordes' },
  ] },
  { group: 'Fondo', items: [
    { k: 'bgImage', t: 'bg', l: 'Imagen / degradado' },
    { k: 'bgBlur', t: 'range', min: 0, max: 30, l: 'Desenfoque' },
    { k: 'overlay', t: 'range', min: 0, max: 90, l: 'Oscurecer %' },
  ] },
  { group: 'Cristal', items: [
    { k: 'surfaceOpacity', t: 'range', min: 0, max: 100, l: 'Opacidad paneles' },
    { k: 'surfaceBlur', t: 'range', min: 0, max: 30, l: 'Desenfoque paneles' },
    { k: 'itemOpacity', t: 'range', min: 0, max: 100, l: 'Opacidad enlaces' },
  ] },
  { group: 'Forma', items: [
    { k: 'radius', t: 'range', min: 0, max: 30, l: 'Redondeo' },
    { k: 'gap', t: 'range', min: 4, max: 40, l: 'Separación' },
    { k: 'shadow', t: 'range', min: 0, max: 80, l: 'Sombra' },
    { k: 'secStyle', t: 'select', l: 'Cabecera', options: [['solid', 'Sólida'], ['outline', 'Subrayada'], ['minimal', 'Minimal']] },
  ] },
  { group: 'Tipografía', items: [
    { k: 'fontSize', t: 'range', min: 11, max: 22, l: 'Tamaño base' },
    { k: 'font', t: 'font', l: 'Texto' },
    { k: 'headingFont', t: 'font', l: 'Títulos', allowEmpty: true },
  ] },
  { group: 'Avanzado', items: [{ k: 'customCss', t: 'css', l: 'CSS del tema' }] },
];

let editing = null;
let dirty = false;
let previewQueued = false;

function startEdit(theme, asCopy) {
  if (dirty && !confirm('Hay cambios sin guardar en el editor. ¿Descartarlos?')) return;
  const { builtin, ...rest } = theme;
  editing = { ...THEME_DEFAULTS, ...rest };
  if (asCopy) { editing.id = newThemeId(); editing.name = `${theme.name} (copia)`; }
  dirty = asCopy;
  $('#theme-name').value = editing.name;
  buildFields();
  $('#theme-editor').hidden = false;
  refreshPreview();
  $('#theme-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeEditor() {
  editing = null; dirty = false;
  $('#theme-editor').hidden = true;
  $('#preview-css').textContent = '';
}

function set(k, v) {
  editing[k] = v; dirty = true;
  if (!previewQueued) { previewQueued = true; requestAnimationFrame(() => { previewQueued = false; refreshPreview(); }); }
}

function buildFields() {
  const host = $('#theme-fields');
  host.replaceChildren(...FIELDS.map((g) => {
    const box = el('div', 'group');
    box.append(el('h3', null, g.group), ...g.items.map(fieldNode));
    return box;
  }));
}

function fieldNode(f) {
  const v = editing[f.k];
  if (f.t === 'css') {
    const wrap = el('div', 'field-block');
    const ta = el('textarea'); ta.rows = 6; ta.spellcheck = false; ta.value = v || '';
    ta.placeholder = '.sec-title { text-transform: uppercase; }';
    ta.addEventListener('input', () => set(f.k, ta.value));
    wrap.append(el('span', null, f.l), ta);
    return wrap;
  }
  const row = el('label', 'field');
  const ctl = el('div', 'ctl-inline');
  row.append(el('span', null, f.l), ctl);

  if (f.t === 'color') {
    const c = el('input'); c.type = 'color'; c.value = normHex(v);
    const t = el('input'); t.type = 'text'; t.value = normHex(v); t.maxLength = 7; t.spellcheck = false;
    c.addEventListener('input', () => { t.value = c.value; set(f.k, c.value); });
    t.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) { c.value = t.value.toLowerCase(); set(f.k, c.value); } });
    ctl.append(c, t);
  } else if (f.t === 'range') {
    const r = el('input'); r.type = 'range'; r.min = f.min; r.max = f.max; r.value = v;
    const o = el('output', null, String(v));
    r.addEventListener('input', () => { o.textContent = r.value; set(f.k, Number(r.value)); });
    ctl.append(r, o);
  } else if (f.t === 'select') {
    const s = el('select');
    s.append(...f.options.map(([val, label]) => new Option(label, val)));
    s.value = v;
    s.addEventListener('input', () => set(f.k, s.value));
    ctl.append(s);
  } else if (f.t === 'font') {
    const s = el('select');
    s.append(...(f.allowEmpty ? [new Option('Igual que el texto', '')] : []), ...FONT_PRESETS.map(([n, stack]) => new Option(n, stack)), new Option('Personalizada…', '__custom'));
    const t = el('input'); t.type = 'text'; t.value = v || ''; t.spellcheck = false; t.placeholder = '"Mi fuente", sans-serif';
    const sync = () => { s.value = [...s.options].some((o) => o.value === t.value) ? t.value : '__custom'; };
    sync();
    s.addEventListener('input', () => { if (s.value !== '__custom') { t.value = s.value; set(f.k, s.value); } else t.focus(); });
    t.addEventListener('input', () => { sync(); set(f.k, t.value.replace(/[;{}<>]/g, '')); });
    ctl.append(s);
    ctl.style.flexWrap = 'wrap';
    ctl.append(t);
  } else if (f.t === 'bg') {
    ctl.style.flexWrap = 'wrap';
    const t = el('input'); t.type = 'text'; t.spellcheck = false; t.placeholder = 'https://… o linear-gradient(…)';
    const show = () => { t.value = String(editing.bgImage).startsWith('data:') ? '(imagen subida)' : editing.bgImage; };
    show();
    t.addEventListener('input', () => { if (t.value !== '(imagen subida)') set(f.k, t.value.trim()); });
    const up = el('button', 'btn small', 'Subir…'); up.type = 'button';
    const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      try { set(f.k, await imageToDataUrl(file.files[0], 1920, 'image/jpeg', 0.82)); show(); } catch (err) { fail(err); }
    });
    const clr = el('button', 'btn small', 'Quitar'); clr.type = 'button';
    clr.addEventListener('click', () => { set(f.k, ''); show(); });
    ctl.append(t, up, clr, file);
  }
  return row;
}

$('#theme-name').addEventListener('input', (e) => { if (editing) { editing.name = e.target.value; dirty = true; } });

function refreshPreview() {
  if (!editing) return;
  applyTheme(editing, $('#theme-preview'));
  $('#preview-css').textContent = `#theme-preview{${sanitizeCss(editing.customCss)}}`;
  const secs = pageSections().slice(0, 3);
  const ids = new Set(secs.map((s) => s.id));
  const per = new Map();
  const items = state.items.filter((i) => ids.has(i.sectionId)).sort((a, b) => a.order - b.order)
    .filter((i) => { const n = (per.get(i.sectionId) || 0) + 1; per.set(i.sectionId, n); return n <= 6; });
  renderDashboard($('#preview-dash'), { sections: secs, items, settings: { ...state.settings, layout: 'auto' } });
}

async function saveEditing(activate) {
  if (!editing) return;
  const clean = sanitizeTheme({ ...editing, name: editing.name.trim() || 'Sin nombre' });
  clean.id = editing.id;
  await saveTheme(clean);
  if (activate) await saveSettings({ themeId: clean.id, themeMode: 'fixed' });
  dirty = false;
  editing = { ...THEME_DEFAULTS, ...clean };
  toast(activate ? 'Tema guardado y activado' : 'Tema guardado');
}
$('#theme-save').addEventListener('click', () => saveEditing(false).catch(fail));
$('#theme-save-apply').addEventListener('click', () => saveEditing(true).catch(fail));
$('#theme-cancel').addEventListener('click', () => { if (!dirty || confirm('¿Descartar los cambios?')) closeEditor(); });

// ------------------------------------------------------------------ AJUSTES
const settingsForm = $('#settings-form');
let pendingPatch = {};
let saveTimer = null;

function queueSave(patch) {
  Object.assign(pendingPatch, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const p = pendingPatch; pendingPatch = {}; saveTimer = null;
    try { await saveSettings(p); } catch (err) { fail(err); }
  }, 350);
}

function syncThemeMode() {
  const f = settingsForm.elements;
  f.themeLightId.disabled = f.themeDarkId.disabled = f.themeMode.value !== 'system';
}

function populateSettings() {
  const s = state.settings;
  for (const name of ['themeLightId', 'themeDarkId']) {
    settingsForm.elements[name].replaceChildren(...allThemes(state.customThemes).map((t) => new Option(t.name, t.id)));
  }
  for (const c of settingsForm.elements) {
    if (!c.name) continue;
    if (c.type === 'checkbox') c.checked = !!s[c.name];
    else c.value = s[c.name] ?? '';
  }
  renderHeaderLinks(s.headerLinks);
  syncThemeMode();
}

settingsForm.addEventListener('input', (e) => {
  const c = e.target;
  if (!c.name) return;
  if (c.name === 'themeMode') queueMicrotask(syncThemeMode);
  let v;
  if (c.type === 'checkbox') v = c.checked;
  else if (c.type === 'number') { v = Math.min(Number(c.max), Math.max(Number(c.min), Number(c.value) || Number(c.min))); }
  else v = c.value;
  queueSave({ [c.name]: v });
});

function renderHeaderLinks(links) {
  const host = $('#header-links');
  host.replaceChildren(...links.map((l, i) => {
    const row = el('div', 'hlink-row');
    const title = Object.assign(el('input'), { value: l.title, placeholder: 'Título', maxLength: 40 });
    const url = Object.assign(el('input'), { value: l.url, placeholder: 'https://…', spellcheck: false });
    const color = Object.assign(el('input'), { type: 'color', value: normHex(l.color, '#6c8cff') });
    const del = Object.assign(el('button', 'btn small', '✕'), { type: 'button', title: 'Quitar' });
    row.append(title, url, color, del);
    row.addEventListener('input', () => queueSave({ headerLinks: collectLinks() }));
    del.addEventListener('click', () => { row.remove(); queueSave({ headerLinks: collectLinks() }); });
    return row;
  }));
}
function collectLinks() {
  return $$('.hlink-row', $('#header-links')).map((r) => {
    const [t, u, c] = $$('input', r);
    return { title: t.value, url: u.value, color: c.value };
  });
}
$('#btn-add-hlink').addEventListener('click', () => {
  const cur = collectLinks();
  cur.push({ title: '', url: '', color: '#6c8cff' });
  renderHeaderLinks(cur);
  $$('.hlink-row input', $('#header-links')).at(-3)?.focus();
});

// ------------------------------------------------------------------ DATOS: exportar / importar
$('#btn-export').addEventListener('click', async () => {
  try {
    const data = await exportData({ content: $('#exp-content').checked, settings: $('#exp-settings').checked, themes: $('#exp-themes').checked });
    if (!data.sections && !data.settings && !data.themes) return toast('Selecciona qué quieres exportar.');
    download(`startboard-${stamp()}.json`, JSON.stringify(data, null, 2));
  } catch (err) { fail(err); }
});

let pending = null;
function showPending(v, source) {
  pending = v;
  const s = v.summary;
  const parts = [];
  if (s.sections) parts.push(`${s.pages ? s.pages + ' páginas, ' : ''}${s.sections} secciones y ${s.items} enlaces`);
  if (s.themes) parts.push(`${s.themes} tema(s)`);
  if (s.settings) parts.push('ajustes');
  $('#import-summary').textContent = `${source}: ${parts.join(', ')}`;
  $('#import-warnings').replaceChildren(...v.warnings.map((w) => el('li', null, w)));
  $('#import-preview').hidden = false;
  $('input[name="import-mode"][value="merge"]').checked = true;
}
function clearPending() { pending = null; $('#import-preview').hidden = true; $('#import-file').value = ''; $('#bookmarks-file').value = ''; }

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const v = parseImportText(await readText(file));
  if (!v.ok) { clearPending(); return toast(v.error); }
  showPending(v, file.name);
});
$('#bookmarks-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const v = parseBookmarksHtml(await readText(file));
  if (!v.ok) { clearPending(); return toast(v.error); }
  showPending(v, file.name);
});
$('#btn-import-cancel').addEventListener('click', clearPending);
$('#btn-import').addEventListener('click', async () => {
  if (!pending) return;
  const mode = $('input[name="import-mode"]:checked').value;
  if (mode === 'replace' && !confirm('Se sustituirá el contenido actual por el del archivo. Se creará antes una copia de seguridad. ¿Continuar?')) return;
  try {
    await importData(pending.clean, { mode, pageTitle: pending.pageTitle });
    toast('Importación completada');
    clearPending();
  } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ DATOS: copias y reinicio
function renderBackups() {
  const host = $('#backup-list');
  if (!backups.length) return host.replaceChildren(el('p', 'hint', 'Todavía no hay copias.'));
  host.replaceChildren(...backups.map((b) => {
    const row = el('div', 'backup-row');
    const info = el('div', 'grow');
    info.append(el('strong', null, b.label), el('small', null, `${new Date(b.createdAt).toLocaleString()} · ${b.sections} secciones, ${b.items} enlaces, ${b.themes} temas`));
    const act = (label, fn, cls = '') => { const x = el('button', `btn small ${cls}`, label); x.type = 'button'; x.addEventListener('click', () => Promise.resolve(fn()).catch(fail)); return x; };
    row.append(info,
      act('Restaurar', async () => { if (confirm('¿Restaurar esta copia? El estado actual se guardará antes como otra copia.')) { await restoreBackup(b.id); toast('Copia restaurada'); } }),
      act('Descargar', async () => { const full = await db.backups.get(b.id); download(`startboard-copia-${stamp()}.json`, JSON.stringify(full.data, null, 2)); }),
      act('✕', () => db.backups.delete(b.id), 'danger'));
    return row;
  }));
}
$('#btn-backup-now').addEventListener('click', () => snapshot('Copia manual').then(() => toast('Copia creada')).catch(fail));
$('#btn-reset').addEventListener('click', async () => {
  if (!confirm('Se borrarán secciones, enlaces, temas y ajustes. ¿Seguro?')) return;
  try { await snapshot('Antes de restablecer'); await resetAll(); toast('Restablecido'); } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ arranque
liveQuery(async () => ({
  pages: await db.pages.orderBy('order').toArray(),
  sections: await db.sections.orderBy('order').toArray(),
  items: await db.items.toArray(),
  settings: await getSettings(),
  customThemes: await db.themes.toArray(),
})).subscribe({
  next(s) {
    const first = !state;
    state = s;
    paintDash();
    renderThemeList();
    if (editing) refreshPreview();
    if (first) populateSettings();
    else if (!settingsForm.contains(document.activeElement) && !saveTimer) populateSettings();
  },
  error: fail,
});

liveQuery(async () => (await db.backups.orderBy('createdAt').reverse().toArray()).map((b) => ({
  id: b.id, createdAt: b.createdAt, label: b.label,
  sections: b.data?.sections?.length ?? 0, items: b.data?.items?.length ?? 0, themes: b.data?.themes?.length ?? 0,
}))).subscribe({ next(list) { backups = list; renderBackups(); }, error: fail });

{
  const tab = location.hash.slice(1);
  if (['dash', 'themes', 'settings', 'data'].includes(tab)) showTab(tab);
}
