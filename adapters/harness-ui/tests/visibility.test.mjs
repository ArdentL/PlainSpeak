import test from 'node:test';
import assert from 'node:assert/strict';
import { mountParagraphTranslations, paragraphCandidates, updateOriginalVisibility } from '../src/paragraphs.js';

test('only complete usable translations hide their original paragraph', () => {
  const element = { tagName: 'P', hidden: false };
  for (const status of [undefined, 'error', 'retained']) {
    const output = { dataset: { status } };
    updateOriginalVisibility(element, output, true);
    assert.equal(element.hidden, false);
    assert.equal(output.dataset.sourceHidden, 'false');
  }
  for (const status of ['ready', 'storage-error']) {
    const output = { dataset: { status } };
    updateOriginalVisibility(element, output, true);
    assert.equal(element.hidden, true);
    updateOriginalVisibility(element, output, false);
    assert.equal(element.hidden, false);
  }
  updateOriginalVisibility(element, { dataset: { status: 'ready' } }, false, true);
  assert.equal(element.hidden, true, 'pre-existing host visibility is retained');
});

test('list source hides through a class while its translated child remains visible', () => {
  const classes = new Set();
  for (const tagName of ['LI', 'TD', 'TH']) {
    const element = { tagName, hidden: false, classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); } } };
    const output = { dataset: { status: 'ready' }, hidden: false };
    updateOriginalVisibility(element, output, true);
    assert.equal(element.hidden, false);
    assert.equal(output.hidden, false);
    assert.ok(classes.has('plainspeak-hide-inline-source'));
    updateOriginalVisibility(element, output, false);
    assert.equal(classes.size, 0);
  }
});

test('changing display mode reuses ready output; disabling translation restores original', async () => {
  const previousObserver = globalThis.MutationObserver;
  let disconnected = false;
  globalThis.MutationObserver = class { observe() {} disconnect() { disconnected = true; } };
  let resolveTranslation, calls = 0;
  const outputs = [];
  const document = { createElement: () => ({ dataset: {}, setAttribute() {}, remove() { this.removed = true; } }) };
  const element = { tagName: 'P', hidden: false, closest: () => null, querySelector: () => null, querySelectorAll: () => [],
    cloneNode: () => ({ textContent: 'A complete original paragraph.', querySelectorAll: () => [] }), after: (node) => outputs.push(node) };
  const root = { ownerDocument: document, querySelectorAll: () => [element], contains: (node) => node === element };
  let controller;
  try {
    controller = mountParagraphTranslations(root, { isRunning: () => false, hideOriginal: true, debounceMs: 0,
      translate: () => { calls++; return new Promise((resolve) => { resolveTranslation = resolve; }); } });
    assert.equal(element.hidden, false, 'pending translation preserves original');
    await new Promise((resolve) => setTimeout(resolve, 5));
    resolveTranslation({ text: '完整译文', report: { retained_chunks: 0 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(element.hidden, true);
    assert.equal(outputs[0].textContent, '完整译文');
    controller.setHideOriginal(false);
    assert.equal(element.hidden, false);
    controller.setHideOriginal(true);
    assert.equal(element.hidden, true);
    assert.equal(calls, 1, 'display-only changes must not translate again');
    controller.dispose(); controller = null;
    assert.equal(element.hidden, false);
    assert.equal(outputs[0].removed, true);
    assert.equal(disconnected, true);
  } finally { controller?.dispose(); globalThis.MutationObserver = previousObserver; }
});

test('list blocks containing code, tables or reasoning never become hideable candidates', () => {
  for (const nested of ['pre', 'table', 'reasoning']) {
    const element = { tagName: 'LI', closest: () => null,
      querySelector: (selector) => selector.includes('pre, table') ? { nested } : null };
    assert.deepEqual(paragraphCandidates({ querySelectorAll: () => [element] }), []);
  }
});

test('table comparison shows one version, preserves equal cells and restores the source on disposal', async () => {
  const previousObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const controls = [], outputs = [], classes = new Set();
  const document = { createElement: () => ({ dataset: {}, children: [], attributes: {}, hidden: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this[name] = callback; },
    append(...nodes) { this.children.push(...nodes); }, remove() { this.removed = true; } }) };
  const table = { before: (node) => controls.push(node) };
  const makeCell = (value) => ({ tagName: 'TD', hidden: false,
    classList: { toggle(name, enabled) { if (enabled) classes.add(value); else classes.delete(value); } },
    closest: (selector) => selector === 'table' ? table : null,
    querySelector: () => null, querySelectorAll: () => [],
    cloneNode: () => ({ textContent: value, querySelectorAll: () => [] }), append: (node) => outputs.push(node) });
  const cells = [makeCell('Service status'), makeCell('Description')];
  const root = { ownerDocument: document, querySelectorAll: () => cells, contains: (node) => cells.includes(node) };
  let calls = 0, controller;
  try {
    controller = mountParagraphTranslations(root, { isRunning: () => false, hideOriginal: false, debounceMs: 0,
      translate: async (value) => { calls++; return { text: value === 'Description' ? value : '服务状态', report: { retained_chunks: 0 } }; } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(controls.length, 1);
    assert.deepEqual([...classes], ['Service status'], 'equal cells retain their one original copy');
    assert.equal(outputs[1].hidden, true, 'equal output is omitted');
    controls[0].children[1].click();
    assert.equal(classes.size, 0);
    assert.ok(outputs.every((output) => output.hidden), 'original view has no visible translated cells');
    controls[0].children[0].click();
    assert.equal(outputs[0].hidden, false);
    assert.ok(classes.has('Service status'));
    controller.setHideOriginal(true);
    assert.equal(controls[0].hidden, true);
    controller.setHideOriginal(false);
    assert.equal(controls[0].hidden, false);
    assert.equal(calls, 2, 'switching never re-runs translation');
    controller.dispose(); controller = null;
    assert.equal(classes.size, 0);
    assert.ok(outputs.every((output) => output.removed));
    assert.equal(controls[0].removed, true);
  } finally { controller?.dispose(); globalThis.MutationObserver = previousObserver; }
});
