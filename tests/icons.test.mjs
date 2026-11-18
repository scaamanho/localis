import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { makeIcon } from '../js/render.js';

let images;

class Element extends EventTarget {
  style = { setProperty() {} };
  textContent = '';
  replacement = null;

  replaceWith(node) { this.replacement = node; }
}

beforeEach(() => {
  images = [];
  globalThis.chrome = { runtime: { id: 'localis', getURL: (path) => `chrome-extension://localis${path}` } };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        let pixels;
        return {
          getContext: () => ({ drawImage: (img) => { pixels = img.pixels; } }),
          toDataURL: () => pixels,
        };
      }
      const node = new Element();
      if (tag === 'img') images.push(node);
      return node;
    },
  };
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('empty image URL reuses the colored title initial without loading an image', () => {
  const letter = makeIcon({ title: 'Localis', iconType: 'url', icon: '' });
  assert.equal(letter.textContent, 'L');
  assert.equal(letter.className, 'ico ico-letter');
  assert.equal(images.length, 0);
});

test('failed favicon and custom image keep the original title initial', () => {
  for (const iconType of ['favicon', 'url', 'upload']) {
    const letter = makeIcon({ title: 'Example', url: 'https://example.com', iconType, icon: 'https://example.com/icon.png' }, 'duckduckgo');
    images.at(-1).dispatchEvent(new Event('error'));
    assert.equal(letter.textContent, 'E');
    assert.equal(letter.replacement, null);
  }
});

test('a successfully loaded custom image replaces the initial', () => {
  const letter = makeIcon({ title: 'Example', iconType: 'url', icon: 'https://example.com/icon.png' });
  const image = images[0];
  image.dispatchEvent(new Event('load'));
  assert.equal(letter.replacement, image);
});

test('browser generic favicon keeps the initial while a real favicon replaces it', async () => {
  const generic = makeIcon({ title: 'Missing', url: 'https://missing.invalid' }, 'browser');
  const genericImage = images[0];
  genericImage.pixels = 'generic-globe';
  genericImage.dispatchEvent(new Event('load'));
  const fallbackImage = images[1];
  assert.match(fallbackImage.src, /localis-favicon-fallback\.invalid/);
  fallbackImage.pixels = 'generic-globe';
  fallbackImage.dispatchEvent(new Event('load'));
  await settle();
  assert.equal(generic.textContent, 'M');
  assert.equal(generic.replacement, null);

  const real = makeIcon({ title: 'Real', url: 'https://example.com' }, 'browser');
  const realImage = images[2];
  realImage.pixels = 'real-favicon';
  realImage.dispatchEvent(new Event('load'));
  await settle();
  assert.equal(real.replacement, realImage);
  assert.equal(images.length, 3, 'the browser fallback image is shared between items');
});
