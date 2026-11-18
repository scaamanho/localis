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
    case 'browser': return hasChrome() ? `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}` : '';
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
  n.setAttribute('aria-hidden', 'true');
  return n;
}

function iconPixels(img) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  canvas.getContext('2d').drawImage(img, 0, 0, 32, 32);
  return canvas.toDataURL();
}

const browserFallbacks = new Map();

function browserFallbackPixels() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  if (!browserFallbacks.has(dark)) {
    browserFallbacks.set(dark, new Promise((resolve) => {
      const img = document.createElement('img');
      img.addEventListener('load', () => resolve(iconPixels(img)), { once: true });
      img.addEventListener('error', () => {
        console.warn('Unable to load the browser fallback favicon; keeping letter icons.');
        browserFallbacks.delete(dark);
        resolve(null);
      }, { once: true });
      // Chromium devuelve un globo, no un error, cuando no tiene favicon en su caché.
      img.src = faviconUrl('https://localis-favicon-fallback.invalid/', 'browser');
    }));
  }
  return browserFallbacks.get(dark);
}

/** Crea el icono de un item o sección. e = { iconType, icon, url, title } */
export function makeIcon(e, provider = 'auto') {
  const type = e.iconType || 'favicon';
  if (type === 'emoji' && e.icon) {
    const icon = el('span', 'ico ico-emoji', e.icon);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }
  let src = '';
  if ((type === 'url' || type === 'upload') && e.icon) src = e.icon;
  else if (type === 'favicon') src = faviconUrl(e.url, provider);
  const letter = letterIcon(e.title);
  if (!src) return letter;
  // Se muestra la letra al instante y se sustituye por la imagen solo si carga bien (sin huecos ni parpadeos).
  const img = el('img', 'ico ico-img');
  Object.assign(img, { alt: '', draggable: false, referrerPolicy: 'no-referrer' });
  img.addEventListener('load', async () => {
    if (type === 'favicon' && resolveProvider(provider) === 'browser') {
      const fallback = await browserFallbackPixels();
      if (!fallback || iconPixels(img) === fallback) return;
    }
    letter.replaceWith(img);
  }, { once: true });
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
  } else {
    root.href = normalizeUrl(it.url) || '#';
    const target = it.target === 'default' || !it.target ? settings.openIn : it.target;
    if (target === 'new') { root.target = '_blank'; root.rel = 'noopener noreferrer'; }
  }
  const text = el('span', 'item-text');
  text.append(el('span', 'item-title', it.title));
  if (it.description) text.append(el('span', 'item-desc', it.description));
  if (edit) {
    const editButton = el('button', 'item-edit');
    editButton.type = 'button'; editButton.dataset.action = 'edit-item'; editButton.dataset.id = it.id;
    editButton.setAttribute('aria-label', `Edit ${it.title}`);
    editButton.append(makeIcon(it, settings.faviconProvider), text);
    const acts = el('span', 'item-actions');
    for (const [a, label, t] of [['move-item', '↕', 'Move'], ['dup-item', '⧉', 'Duplicate'], ['del-item', '✕', 'Delete']]) {
      const b = el('button', 'mini', label);
      b.type = 'button'; b.title = t; b.dataset.action = a; b.dataset.id = it.id;
      b.setAttribute('aria-label', `${t} ${it.title}`);
      acts.append(b);
    }
    root.append(editButton, acts);
  } else root.append(makeIcon(it, settings.faviconProvider), text);
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
    chev.title = 'Collapse / expand'; chev.setAttribute('aria-expanded', String(!sec.collapsed));
    chev.setAttribute('aria-label', `${sec.collapsed ? 'Expand' : 'Collapse'} ${sec.title}`);
    head.append(chev);
    if (sec.icon) head.append(makeIcon({ iconType: looksLikeImage(sec.icon) ? 'url' : 'emoji', icon: sec.icon, title: sec.title }));
    head.append(el('h2', 'sec-title', sec.title));
    if (edit) {
      head.append(el('span', 'sec-count', String(list.length)));
      const acts = el('span', 'sec-actions');
      for (const [a, label, t] of [['move-left', '◀', 'Move earlier'], ['move-right', '▶', 'Move later'], ['edit-section', '✎', 'Edit section'], ['del-section', '✕', 'Delete section']]) {
        const b = el('button', 'mini', label);
        b.type = 'button'; b.title = t; b.dataset.action = a; b.dataset.id = sec.id;
        b.setAttribute('aria-label', `${t} ${sec.title}`);
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
      add.append(el('span', 'ico ico-letter', '＋'), el('span', 'item-title', 'Add'));
      body.append(add);
    }
    node.append(body);
    root.append(node);
  }

  if (edit) {
    const add = el('button', 'sec-add', '＋ New section');
    add.type = 'button'; add.dataset.action = 'add-section';
    root.append(add);
  }
}

export { normalizeUrl };
