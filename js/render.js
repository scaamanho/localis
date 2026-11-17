// Renderizador compartido por la start page y el panel de administración (WYSIWYG).
import { contrastText } from './themes.js';
import { normalizeUrl } from './io.js';

const hasChrome = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id;

function resolveProvider(p) {
  if (p && p !== 'auto') return p;
  const ua = navigator.userAgent;
  return hasChrome() && /Chrome|Chromium|Edg/.test(ua) && !/Firefox/.test(ua) ? 'browser' : 'duckduckgo';
}

export function faviconUrl(pageUrl, provider = 'auto', size = 32) {
  let host;
  try { host = new URL(pageUrl).hostname; } catch { return ''; }
  switch (resolveProvider(provider)) {
    case 'browser': return `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
    case 'duckduckgo': return `https://icons.duckduckgo.com/ip3/${host}.ico`;
    case 'google': return `https://www.google.com/s2/favicons?domain=${host}&sz=${size}`;
    default: return '';
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function letterIcon(title) {
  const s = (title || '?').trim();
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  const n = el('span', 'ico ico-letter', s.charAt(0).toUpperCase() || '?');
  n.style.setProperty('--h', h);
  return n;
}

/** Crea el icono de un item o sección. e = { iconType, icon, url, title } */
export function makeIcon(e, provider = 'auto') {
  const type = e.iconType || 'favicon';
  if (type === 'emoji' && e.icon) return el('span', 'ico ico-emoji', e.icon);
  let src = '';
  if ((type === 'url' || type === 'upload') && e.icon) src = e.icon;
  else if (type === 'favicon') src = faviconUrl(e.url, provider);
  const letter = letterIcon(e.title);
  if (!src) return letter;
  // Se muestra la letra al instante y se sustituye por la imagen solo si carga bien (sin huecos ni parpadeos).
  const img = el('img', 'ico ico-img');
  Object.assign(img, { alt: '', draggable: false, referrerPolicy: 'no-referrer' });
  img.addEventListener('load', () => letter.replaceWith(img), { once: true });
  img.src = src;
  return letter;
}

const looksLikeImage = (s) => /^(https?:|data:image\/)/i.test(s || '');

function itemNode(it, settings, edit) {
  const root = edit ? el('div', 'item') : el('a', 'item');
  root.dataset.kind = 'item';
  root.dataset.id = it.id;
  root.dataset.search = `${it.title} ${it.url} ${it.description || ''} ${it.tags || ''}`.toLowerCase();
  if (it.description) root.title = it.description;
  if (edit) {
    root.draggable = true;
    root.dataset.action = 'edit-item';
    root.tabIndex = 0;
  } else {
    root.href = normalizeUrl(it.url) || '#';
    const target = it.target === 'default' || !it.target ? settings.openIn : it.target;
    if (target === 'new') { root.target = '_blank'; root.rel = 'noopener noreferrer'; }
  }
  root.append(makeIcon(it, settings.faviconProvider));
  const text = el('span', 'item-text');
  text.append(el('span', 'item-title', it.title));
  if (it.description) text.append(el('span', 'item-desc', it.description));
  root.append(text);
  if (edit) {
    const acts = el('span', 'item-actions');
    for (const [a, label, t] of [['dup-item', '⧉', 'Duplicar'], ['del-item', '✕', 'Eliminar']]) {
      const b = el('button', 'mini', label);
      b.type = 'button'; b.title = t; b.dataset.action = a; b.dataset.id = it.id;
      acts.append(b);
    }
    root.append(acts);
  }
  return root;
}

/**
 * data = { sections, items, settings }
 * opts = { edit }  -> en modo edición los items son arrastrables y aparecen controles.
 */
export function renderDashboard(root, { sections, items, settings }, { edit = false } = {}) {
  root.replaceChildren();
  root.className = 'dash' + (edit ? ' is-edit' : '');
  root.dataset.layout = settings.layout;
  root.dataset.size = settings.itemSize;

  const bySection = new Map();
  for (const it of items) {
    if (!bySection.has(it.sectionId)) bySection.set(it.sectionId, []);
    bySection.get(it.sectionId).push(it);
  }

  for (const sec of sections) {
    const list = (bySection.get(sec.id) || []).sort((a, b) => a.order - b.order);
    const node = el('section', 'sec' + (sec.collapsed ? ' collapsed' : ''));
    node.dataset.kind = 'section';
    node.dataset.id = sec.id;
    node.dataset.span = sec.span || 1;
    node.style.setProperty('--sec-color', sec.color);
    node.style.setProperty('--sec-text', contrastText(sec.color));

    const head = el('header', 'sec-head');
    if (edit) { head.draggable = true; head.dataset.kind = 'section'; head.dataset.id = sec.id; }
    const chev = el('button', 'chev', '▾');
    chev.type = 'button'; chev.dataset.action = 'toggle'; chev.dataset.id = sec.id;
    chev.title = 'Plegar / desplegar'; chev.setAttribute('aria-expanded', String(!sec.collapsed));
    head.append(chev);
    if (sec.icon) head.append(makeIcon({ iconType: looksLikeImage(sec.icon) ? 'url' : 'emoji', icon: sec.icon, title: sec.title }));
    head.append(el('h2', 'sec-title', sec.title));
    if (edit) {
      head.append(el('span', 'sec-count', String(list.length)));
      const acts = el('span', 'sec-actions');
      for (const [a, label, t] of [['move-left', '◀', 'Mover antes'], ['move-right', '▶', 'Mover después'], ['edit-section', '✎', 'Editar sección'], ['del-section', '🗑', 'Eliminar sección']]) {
        const b = el('button', 'mini', label);
        b.type = 'button'; b.title = t; b.dataset.action = a; b.dataset.id = sec.id;
        acts.append(b);
      }
      head.append(acts);
    } else {
      head.addEventListener('click', (e) => { if (e.target === head || e.target.closest('.sec-title')) chev.click(); });
    }
    node.append(head);

    const body = el('div', `sec-body items-${sec.layout || 'grid'}`);
    for (const it of list) body.append(itemNode(it, settings, edit));
    if (edit) {
      const add = el('button', 'item item-add');
      add.type = 'button'; add.dataset.action = 'add-item'; add.dataset.id = sec.id;
      add.append(el('span', 'ico ico-letter', '＋'), el('span', 'item-title', 'Añadir'));
      body.append(add);
    }
    node.append(body);
    root.append(node);
  }

  if (edit) {
    const add = el('button', 'sec-add', '＋ Nueva sección');
    add.type = 'button'; add.dataset.action = 'add-section';
    root.append(add);
  }
}

export { normalizeUrl };
