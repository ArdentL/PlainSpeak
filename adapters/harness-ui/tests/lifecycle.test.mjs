import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientPlugin } from '../src/client.js';
import { mountParagraphTranslations } from '../src/paragraphs.js';

const settled = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, values) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const old = { observer: globalThis.MutationObserver, document: globalThis.document, fetch: globalThis.fetch };
  t.after(() => { globalThis.MutationObserver = old.observer; globalThis.document = old.document; globalThis.fetch = old.fetch; });
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const outputs = [];
  const document = { createElement: () => ({ dataset: {}, setAttribute() {}, remove() { this.removed = true; } }), head: { append() {} } };
  globalThis.document = document;
  const paragraph = value => ({ value, tagName: 'P', hidden: false, closest: () => null, querySelector: () => null, querySelectorAll: () => [],
    cloneNode() { return { textContent: this.value, querySelectorAll: () => [] }; }, after(output) { outputs.push(output); } });
  const elements = values.map(paragraph);
  const root = { ownerDocument: document, querySelectorAll: () => elements, contains: node => elements.includes(node) };
  async function advance(ms) { t.mock.timers.tick(ms); await settled(); }
  return { root, outputs, elements, paragraph, advance };
}

test('clear cancels old debounce timers, keeps ready translations and accepts changed or new text', async t => {
  const f = fixture(t, ['Ready source paragraph']);
  const calls = [];
  const controller = mountParagraphTranslations(f.root, { isRunning: () => false, hideOriginal: true,
    translate: async text => { calls.push(text); return { text: `Translated ${text}`, report: { retained_chunks: 0 } }; } });
  t.after(() => controller.dispose());
  await f.advance(350);
  const readyOutput = f.outputs[0];
  const pending = f.paragraph('Old pending paragraph');
  f.elements.push(pending);
  controller.refresh(); await f.advance(80);
  controller.cancelPending();
  await f.advance(1000);
  controller.refresh(); await f.advance(80); await f.advance(350);
  assert.deepEqual(calls, ['Ready source paragraph']);
  assert.equal(readyOutput.textContent, 'Translated Ready source paragraph');
  assert.equal(readyOutput.removed, undefined);
  assert.equal(f.elements[0].hidden, true);
  assert.equal(pending.hidden, false);
  pending.value = 'Changed pending paragraph';
  f.elements.push(f.paragraph('New reply paragraph'));
  controller.refresh(); await f.advance(80); await f.advance(350);
  assert.deepEqual(calls, ['Ready source paragraph', 'Changed pending paragraph', 'New reply paragraph']);
});

test('clear aborts submitted paragraph work and ignores a late provider result', async t => {
  const f = fixture(t, ['Inflight paragraph']);
  let finish, signal;
  const controller = mountParagraphTranslations(f.root, { isRunning: () => false, hideOriginal: true,
    translate: (_text, workSignal) => { signal = workSignal; return new Promise(resolve => { finish = resolve; }); } });
  t.after(() => controller.dispose());
  await f.advance(350);
  controller.cancelPending();
  assert.equal(signal.aborted, true);
  finish({ text: 'Late translation', report: { retained_chunks: 0 } });
  await settled();
  assert.equal(f.outputs[0].removed, true);
  assert.equal(f.elements[0].hidden, false);
});

test('settings clear reaches every mounted controller before their timers enter the request queue', async t => {
  const f = fixture(t, ['Synthetic paragraph before clear']);
  const events = [], effects = [], registrations = new Map();
  const settings = { enabled: true, language: 'zh-CN', clearWriting: true, saveHistory: true, hideOriginal: false };
  globalThis.fetch = async (url, options) => {
    const endpoint = url.replace('/api/plainspeak/', '');
    events.push({ endpoint, body: options.body ? JSON.parse(options.body) : undefined });
    return { ok: true, json: async () => endpoint === 'settings' ? settings : endpoint === 'rewrite'
      ? { text: 'Synthetic translated output', report: { retained_chunks: 0 } } : { records: [], count: 0 } };
  };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useRef: value => ({ current: value === null ? f.root : value }),
    useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect: effect => effects.push(effect) };
  const plugin = createClientPlugin(React, { createPortal() {} }, { MarkdownText() {} });
  await plugin.apply({ effect() {}, slots: { inject: (_slot, callback) => callback(),
    entriesOfSlot: () => [{ options: { key: 'assistant-step' }, component() {} }],
    register: (options, component) => registrations.set(options.name, component) } });
  // Two assistant mounts exercise the plugin-wide controller registry.
  for (let i = 0; i < 2; i++) registrations.get('conversation.chat.node')({ node: { data: { status: 'completed' } } });
  const mountEffects = effects.splice(0);
  const dispose = mountEffects.map(effect => effect());
  t.after(() => { for (const cleanup of dispose) cleanup?.(); });
  const Controls = registrations.get('conversation.session.header.utilities');
  await Controls().children[0].props.onClick();
  const findClear = node => node && typeof node === 'object' ? node.props?.className === 'plainspeak-clear-button'
    ? node : node.children?.map(findClear).find(Boolean) : undefined;
  const clear = findClear(Controls());
  await clear.props.onClick(); await clear.props.onClick();
  await f.advance(1000);
  assert.equal(events.filter(event => event.endpoint === 'history/clear').length, 1);
  assert.deepEqual(events.filter(event => event.endpoint === 'rewrite'), []);
  f.elements[0].value = 'Synthetic changed paragraph after clear';
  mountEffects[2](); await f.advance(80); await f.advance(350);
  assert.deepEqual(events.filter(event => event.endpoint === 'rewrite').map(event => event.body.text), ['Synthetic changed paragraph after clear']);
});

test('unmount cancels only submitted jobs using their request ID and an independent transport signal', async t => {
  const f = fixture(t, ['Synthetic active paragraph', 'Synthetic queued paragraph']);
  const events = [], effects = [], registrations = new Map();
  const settings = { enabled: true, language: 'zh-CN', clearWriting: true, saveHistory: true, hideOriginal: false };
  globalThis.fetch = async (url, options) => {
    const endpoint = url.replace('/api/plainspeak/', '');
    events.push({ endpoint, body: options.body ? JSON.parse(options.body) : undefined, signal: options.signal });
    if (endpoint === 'rewrite') return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    if (endpoint === 'cancel') throw new Error('Synthetic cancellation transport failure');
    return { ok: true, json: async () => settings };
  };
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useRef: value => ({ current: value === null ? f.root : value }),
    useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect: effect => effects.push(effect) };
  const plugin = createClientPlugin(React, { createPortal() {} }, { MarkdownText() {} });
  await plugin.apply({ effect() {}, slots: { inject: (_slot, callback) => callback(),
    entriesOfSlot: () => [{ options: { key: 'assistant-step' }, component() {} }],
    register: (options, component) => registrations.set(options.name, component) } });
  registrations.get('conversation.chat.node')({ node: { data: { status: 'completed' } } });
  const dispose = effects.splice(0).map(effect => effect());
  await f.advance(350);
  const rewrite = events.find(event => event.endpoint === 'rewrite');
  assert.equal(typeof rewrite.body.requestId, 'string');
  assert.ok(rewrite.body.requestId.length > 0);
  assert.equal(rewrite.body.context, '后文：\nSynthetic queued paragraph');
  for (const cleanup of dispose) cleanup?.();
  await settled();
  const cancellations = events.filter(event => event.endpoint === 'cancel');
  assert.deepEqual(cancellations.map(event => event.body.requestId), [rewrite.body.requestId]);
  assert.ok(cancellations.every(event => !event.signal?.aborted));
  assert.equal(events.filter(event => event.endpoint === 'rewrite').length, 1);
  assert.ok(f.outputs.every(output => output.removed));
});
