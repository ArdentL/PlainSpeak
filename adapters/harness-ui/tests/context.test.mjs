import test from 'node:test';
import assert from 'node:assert/strict';
import { mountParagraphTranslations } from '../src/paragraphs.js';

const settled = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, values, { running = false, hideOriginal = false, translate } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const oldObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  t.after(() => { globalThis.MutationObserver = oldObserver; });
  const outputs = [], calls = [];
  const document = { createElement: () => ({ dataset: {}, setAttribute() {}, remove() { this.removed = true; } }),
    defaultView: { getComputedStyle: node => ({ display: node.style?.display || node.computedDisplay
      || (node.parentElement?.classList?.contains('plainspeak-hide-inline-source') ? 'none' : 'block'),
    visibility: node.style?.visibility || 'visible', opacity: node.style?.opacity ?? '1' }) },
    querySelectorAll: () => [paragraph('Other assistant secret')] };
  const paragraph = input => {
    const value = typeof input === 'string' ? { value: input } : input;
    const classes = new Set();
    const element = { tagName: 'P', hidden: false, dataset: {}, descendants: [], ...value,
      classList: { contains: name => classes.has(name), toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
      closest(selector) {
        if (this.think && selector.includes('[data-variant="think"]')) return this;
        if (this.tool && selector.includes('[data-variant="tool"]')) return this;
        return null;
      },
      getAttribute(name) { return name === 'aria-hidden' && this.ariaHidden ? 'true' : null; },
      querySelector: () => null,
      querySelectorAll(selector) { return selector === '*' ? this.descendants : selector === 'code' && this.code ? [{ textContent: 'synthetic_code' }] : []; },
      cloneNode() { return { textContent: this.value, querySelectorAll: selector => (selector.includes('img') && this.media) || (selector.includes('code') && this.code) ? [{}] : [] }; },
      after(output) { outputs.push(output); }, append(output) { outputs.push(output); } };
    for (const child of element.descendants) { child.parentElement = element; child.closest ??= () => null; }
    return element;
  };
  const elements = values.map(paragraph);
  const root = { ownerDocument: document, querySelectorAll: () => elements, contains: node => elements.includes(node) };
  for (const element of elements) element.parentElement = root;
  const controller = mountParagraphTranslations(root, { isRunning: () => running, hideOriginal,
    translate: async (text, signal, context) => { calls.push({ text, context, signal }); return translate
      ? translate(text, signal, context) : { text: `Translated ${text}`, report: { retained_chunks: 0 } }; } });
  t.after(() => controller.dispose());
  async function advance(ms) { t.mock.timers.tick(ms); await settled(); }
  async function refresh() { controller.refresh(); await advance(80); }
  return { elements, calls, outputs, root, paragraph, controller, advance, refresh, setRunning(value) { running = value; } };
}

test('dispatch sends only nearby visible prose from its own assistant root, excluding target and protected content', async t => {
  const f = fixture(t, [
    'Prior explanation', { value: 'Private reasoning', think: true }, { value: 'Tool output', tool: true },
    { value: 'Hidden host content', hidden: true }, { value: 'Aria hidden content', ariaHidden: true },
    { value: 'Use synthetic_code here', code: true }, { value: 'Media caption', media: true },
    'Target sentence', 'Following explanation',
  ]);
  await f.advance(350);
  assert.equal(f.calls.find(call => call.text === 'Target sentence').context, '前文：\nPrior explanation\n\n后文：\nFollowing explanation');
});

test('nearby context keeps the closest 1600 preceding and 700 following characters', async t => {
  const f = fixture(t, ['Distant prior', 'A'.repeat(2000), 'Target sentence', 'B'.repeat(1000), 'Distant following']);
  await f.advance(350);
  const context = f.calls.find(call => call.text === 'Target sentence').context;
  assert.equal(context, `前文：\n${'A'.repeat(1600)}\n\n后文：\n${'B'.repeat(700)}`);
  assert.ok(context.length <= 2400);
});

test('context windows do not split UTF-16 surrogate pairs at their bounds', async t => {
  const f = fixture(t, [`prefix\u{1F642}${'A'.repeat(1599)}`, 'Target sentence', `${'B'.repeat(699)}\u{1F642}suffix`]);
  await f.advance(350);
  const context = f.calls.find(call => call.text === 'Target sentence').context;
  assert.equal(context, `前文：\n${'A'.repeat(1599)}\n\n后文：\n${'B'.repeat(699)}`);
  assert.equal(context.isWellFormed(), true);
});

test('background paragraphs containing hidden descendants are excluded while target translation stays unchanged', async t => {
  const hiddenDescendants = [
    { hidden: true }, { getAttribute: name => name === 'aria-hidden' ? 'true' : null },
    { style: { display: 'none' } }, { style: { visibility: 'hidden' } },
    { style: { opacity: '0' } }, { computedDisplay: 'none' },
  ];
  const f = fixture(t, [
    ...hiddenDescendants.map((child, index) => ({ value: `Public text with hidden secret ${index}`, descendants: [child] })),
    'Target sentence',
  ]);
  await f.advance(350);
  assert.equal(f.calls.find(call => call.text === 'Target sentence').context, '');
  for (let index = 0; index < hiddenDescendants.length; index++) {
    assert.ok(f.calls.some(call => call.text === `Public text with hidden secret ${index}`), 'only context collection changes');
  }
});

test('plugin inline source masking preserves visible background but retains preexisting host-hidden exclusions', async t => {
  const f = fixture(t, [
    { value: 'Visible list explanation', tagName: 'LI', descendants: [{}] },
    { value: 'Host hidden list secret', tagName: 'LI', descendants: [{ computedDisplay: 'none' }] },
  ], { hideOriginal: true });
  await f.advance(350);
  f.elements.push(f.paragraph('Target sentence'));
  await f.refresh(); await f.advance(350);
  assert.equal(f.calls.find(call => call.text === 'Target sentence').context, '前文：\nVisible list explanation');
});

test('new host-hidden attributes under an existing plugin mask are excluded, while hidden portal children are ignored', async t => {
  const sourceChild = {};
  const f = fixture(t, [
    { value: 'Newly hidden host secret', tagName: 'LI', descendants: [sourceChild] },
    { value: 'Visible source beside portal', descendants: [{ hidden: true, closest: () => ({}) }] },
  ], { hideOriginal: true });
  await f.advance(350);
  sourceChild.hidden = true;
  f.elements.push(f.paragraph('Target sentence'));
  await f.refresh(); await f.advance(350);
  assert.equal(f.calls.find(call => call.text === 'Target sentence').context, '前文：\nVisible source beside portal');
});

test('context is captured at debounce dispatch and includes source hidden only by PlainSpeak', async t => {
  const f = fixture(t, ['First explanation'], { hideOriginal: true });
  await f.advance(350);
  assert.equal(f.elements[0].hidden, true);
  f.elements.push(f.paragraph('Target sentence'));
  await f.refresh();
  f.elements.push(f.paragraph('Following text added before dispatch'));
  await f.advance(350);
  assert.equal(f.calls.find(call => call.text === 'Target sentence').context, '前文：\nFirst explanation\n\n后文：\nFollowing text added before dispatch');
});

test('streamed neighbor changes do not retrigger target work; final context gets one bounded refresh', async t => {
  const f = fixture(t, ['Target sentence', 'Following partial'], { running: true, hideOriginal: true });
  await f.advance(350);
  for (let token = 0; token < 4; token++) {
    f.elements[1].value = `Following partial ${token}`;
    await f.refresh(); await f.advance(350);
  }
  assert.equal(f.calls.filter(call => call.text === 'Target sentence').length, 1);
  f.elements.unshift(f.paragraph('Late preceding explanation'));
  f.elements[2].value = 'Following complete explanation';
  f.setRunning(false);
  await f.refresh(); await f.advance(350);
  const targetCalls = f.calls.filter(call => call.text === 'Target sentence');
  assert.equal(targetCalls.length, 2);
  assert.equal(targetCalls[1].context, '前文：\nLate preceding explanation\n\n后文：\nFollowing complete explanation');
  assert.equal(f.outputs[0].removed, undefined, 'final refresh retains the existing output node');
  f.elements[2].value = 'Another late final edit';
  await f.refresh(); await f.advance(350);
  assert.equal(f.calls.filter(call => call.text === 'Target sentence').length, 2);
});

test('late final DOM neighbors refresh once, but clear suppresses old ready targets', async t => {
  const f = fixture(t, ['Target sentence']);
  await f.advance(350);
  f.elements.unshift(f.paragraph('Late preceding final text'));
  f.elements.push(f.paragraph('Late following final text'));
  await f.refresh(); await f.advance(350);
  assert.deepEqual(f.calls.filter(call => call.text === 'Target sentence').map(call => call.context), [
    '', '前文：\nLate preceding final text\n\n后文：\nLate following final text',
  ]);
  f.controller.cancelPending();
  f.elements.push(f.paragraph('New response after clear'));
  await f.refresh(); await f.advance(350);
  assert.equal(f.calls.filter(call => call.text === 'Target sentence').length, 2);
  assert.ok(f.calls.some(call => call.text === 'New response after clear'));
});

test('a final-context refresh cancels superseded work and ignores its late result', async t => {
  let finishOld, targetCalls = 0;
  const f = fixture(t, ['Target sentence'], { translate: text => {
    if (text === 'Target sentence' && ++targetCalls === 1) return new Promise(resolve => { finishOld = resolve; });
    return { text: 'Fresh translation', report: { retained_chunks: 0 } };
  } });
  await f.advance(350);
  f.elements.push(f.paragraph('Late final explanation'));
  await f.refresh(); await f.advance(350);
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.outputs[0].textContent, 'Fresh translation');
  finishOld({ text: 'Stale translation', report: { retained_chunks: 0 } });
  await settled();
  assert.equal(f.outputs[0].textContent, 'Fresh translation');
});

test('clear cancels a scheduled final-context refresh without discarding the ready output', async t => {
  const f = fixture(t, ['Target sentence'], { hideOriginal: true });
  await f.advance(350);
  f.elements.push(f.paragraph('New final explanation'));
  await f.refresh();
  f.controller.cancelPending();
  await f.advance(1000);
  f.elements[1].value = 'Changed explanation after clear';
  await f.refresh(); await f.advance(350);
  assert.equal(f.calls.filter(call => call.text === 'Target sentence').length, 1);
  assert.equal(f.outputs[0].removed, undefined);
  assert.equal(f.outputs[0].textContent, 'Translated Target sentence');
  assert.equal(f.elements[0].hidden, true);
});
