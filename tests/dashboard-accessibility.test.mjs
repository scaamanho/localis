import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { renderDashboard } from '../js/render.js';

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = {};
    this.children = [];
    this.textContent = '';
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener() {}
}

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new Element(tag) };
});

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const dashboard = (edit, collapsed = false) => {
  const root = new Element('div');
  renderDashboard(root, {
    settings: { layout: 'auto', itemSize: 'medium', faviconProvider: 'none' },
    sections: [{ id: 1, title: 'Development', color: '#123456', collapsed }],
    items: [{ id: 2, sectionId: 1, title: 'Example', url: 'https://example.com', order: 0 }],
  }, { edit });
  return descendants(root);
};

test('section toggle has a descriptive label and expanded state', () => {
  for (const [collapsed, label] of [[false, 'Collapse Development'], [true, 'Expand Development']]) {
    const toggle = dashboard(false, collapsed).find((node) => node.dataset.action === 'toggle');
    assert.equal(toggle.attributes['aria-label'], label);
    assert.equal(toggle.attributes['aria-expanded'], String(!collapsed));
  }
});

test('editable links expose named edit, move, duplicate and delete buttons', () => {
  const nodes = dashboard(true);
  for (const [action, label] of [['edit-item', 'Edit Example'], ['move-item', 'Move Example'], ['dup-item', 'Duplicate Example'], ['del-item', 'Delete Example']]) {
    const button = nodes.find((node) => node.dataset.action === action);
    assert.equal(button.tagName, 'button');
    assert.equal(button.attributes['aria-label'], label);
  }
});
