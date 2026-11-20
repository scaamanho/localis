import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titleFromUrl } from '../js/io.js';

test('a pasted URL can provide a hostname for a link title', () => {
  assert.equal(titleFromUrl('https://example.com:8443/path?q=test'), 'example.com');
  assert.equal(titleFromUrl('example.org/path'), 'example.org');
});

test('URLs without a valid hostname do not provide a title', () => {
  assert.equal(titleFromUrl('mailto:user@example.com'), '');
  assert.equal(titleFromUrl('https://'), '');
  assert.equal(titleFromUrl('javascript:alert(1)'), '');
});
