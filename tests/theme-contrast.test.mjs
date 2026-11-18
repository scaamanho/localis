import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILTIN_THEMES, contrastText } from '../js/themes.js';

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

test('opaque built-in themes keep text and muted text legible on their surfaces', () => {
  for (const theme of BUILTIN_THEMES.filter((t) => t.surfaceOpacity === 100 && t.itemOpacity === 100)) {
    for (const background of ['bg', 'surface', 'item']) {
      for (const foreground of ['text', 'muted']) {
        assert.ok(contrast(theme[foreground], theme[background]) >= 4.5, `${theme.name}: ${foreground} on ${background}`);
      }
    }
    assert.ok(contrast(theme.text, theme.itemHover) >= 4.5, `${theme.name}: text on hovered item`);
  }
});

test('accent and section text use a readable foreground for light and mid-tone colors', () => {
  for (const color of ['#7c5cff', '#ff6fa5', '#2fd6a3', '#ffb020', '#777777', '#ffffff', '#000000']) {
    assert.ok(contrast(contrastText(color), color) >= 4.5, color);
  }
});
