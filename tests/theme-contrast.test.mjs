import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILTIN_THEMES, contrastText, effectiveThemeId, findTheme, groupedThemes } from '../js/themes.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const composite = (foreground, background, opacity) =>
  foreground.map((channel, i) => channel * opacity + background[i] * (1 - opacity));

function luminance(color) {
  const channels = (Array.isArray(color) ? color : rgb(color)).map((v) => v / 255)
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

test('curated glass themes keep text legible across their gradients and composed surfaces', () => {
  const glassThemes = groupedThemes().filter((group) => group.label.startsWith('Glass')).flatMap((group) => group.themes);
  for (const theme of glassThemes) {
    const stops = [...theme.bgImage.matchAll(/#[\da-f]{6}/gi)].map((match) => rgb(match[0]));
    assert.ok(stops.length >= 2, `${theme.name}: gradient stops`);
    const backgrounds = [rgb(theme.bg)];
    for (let i = 0; i < stops.length - 1; i++) {
      for (let step = 0; step <= 100; step++) {
        backgrounds.push(composite(stops[i + 1], stops[i], step / 100));
      }
    }
    for (const rawBackground of backgrounds) {
      const background = composite([0, 0, 0], rawBackground, theme.overlay / 100);
      const surface = composite(rgb(theme.surface), background, theme.surfaceOpacity / 100);
      const item = composite(rgb(theme.item), surface, theme.itemOpacity / 100);
      const hover = composite(rgb(theme.itemHover), surface, Math.min(100, theme.itemOpacity + 12) / 100);
      for (const [name, color] of Object.entries({ background, surface, item, hover })) {
        for (const foreground of ['text', 'muted']) {
          assert.ok(contrast(theme[foreground], color) >= 4.5, `${theme.name}: ${foreground} on ${name}`);
        }
      }
    }
  }
});

test('light glass themes show background variation through sections and links', () => {
  const themes = groupedThemes().find((group) => group.label === 'Glass · Light').themes;
  for (const theme of themes) {
    const stops = [...theme.bgImage.matchAll(/#[\da-f]{6}/gi)].map((match) => rgb(match[0]));
    const first = stops[0], last = stops.at(-1);
    const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
    const throughLayers = (bg) => composite(rgb(theme.item),
      composite(rgb(theme.surface), bg, theme.surfaceOpacity / 100), theme.itemOpacity / 100);
    assert.ok(distance(first, last) > 20, `${theme.name}: gradient must be visible`);
    assert.ok(distance(throughLayers(first), throughLayers(last)) / distance(first, last) >= 0.45,
      `${theme.name}: background variation through link cards`);
  }
});

test('curated groups are balanced while configured classics remain available', () => {
  const groups = groupedThemes();
  assert.deepEqual(groups.map((group) => [group.label, group.themes.length]), [
    ['Dark', 3], ['Light', 3], ['Glass · Dark', 3], ['Glass · Light', 3],
  ]);
  const settings = { themeId: 'dracula', themeLightId: 'arctic', themeDarkId: 'aero-forest' };
  const classics = groupedThemes([], settings).find((group) => group.label === 'Classics');
  assert.deepEqual(new Set(classics.themes.map((theme) => theme.id)), new Set(Object.values(settings)));
  for (const id of Object.values(settings)) assert.equal(findTheme(id).id, id);
  assert.ok(!groups.flatMap((group) => group.themes).some((theme) => Object.values(settings).includes(theme.id)));
  const system = { themeMode: 'system', themeLightId: 'arctic-glass', themeDarkId: 'dracula' };
  assert.equal(findTheme(effectiveThemeId(system, false)).id, 'arctic-glass');
  assert.equal(findTheme(effectiveThemeId(system, true)).id, 'dracula');
  const custom = { id: 'custom-example', name: 'Custom example', bg: '#ffffff' };
  assert.ok(groupedThemes([custom]).find((group) => group.label === 'Light').themes.some((theme) => theme.id === custom.id));
});

test('accent and section text use a readable foreground for light and mid-tone colors', () => {
  for (const color of ['#7c5cff', '#ff6fa5', '#2fd6a3', '#ffb020', '#777777', '#ffffff', '#000000']) {
    assert.ok(contrast(contrastText(color), color) >= 4.5, color);
  }
});
