import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsController, createSettingsControls, downloadHistory, historyExport, normalizeSettings, recentRecords, serviceSummary, nextSettingsTab, settingsDirty, trapDialogKey } from '../src/settings.js';
import { renderTranslation } from '../src/paragraphs.js';

const persisted = { enabled: true, language: 'ja', clearWriting: false, saveHistory: true, hideOriginal: false };
const record = { id: 'record-1', source: '<script>never execute</script>', text: '訳文', language: 'ja', pivot: 'en', model: 'local-model', created_at: '2026-11-09T05:00:00Z', report: { retained_chunks: 0 } };
function fixture(overrides = {}) {
  let settings = normalizeSettings({});
  const calls = [];
  const downloads = [];
  let cleared = 0;
  const history = { records: [record], count: 1, limit: 1000, path: 'C:/PlainSpeak/history.json', settings: persisted };
  const api = async (endpoint, body) => {
    calls.push({ endpoint, body });
    if (overrides[endpoint]) return overrides[endpoint](body);
    if (endpoint === 'settings') return body ?? persisted;
    if (endpoint === 'history') return history;
    if (endpoint === 'history/clear') return { ...history, records: [], count: 0 };
    if (endpoint === 'health') return { ok: true, modelReady: true, status: { model: 'local-model', ready: true } };
    if (endpoint === 'models') return { models: [], status: { model: 'local-model' } };
    throw new Error(endpoint);
  };
  const controller = createSettingsController(api, { getSettings: () => settings, onSaved: (value) => { settings = value; }, beforeClear: () => { cleared++; }, download: (value) => downloads.push(value) });
  return { controller, calls, downloads, history, get settings() { return settings; }, get cleared() { return cleared; } };
}

test('opening reads authoritative server settings, history, model and service', async () => {
  const f = fixture();
  await f.controller.open();
  assert.deepEqual(f.calls.map((call) => call.endpoint), ['settings', 'history', 'health', 'models']);
  assert.deepEqual(f.settings, persisted);
  assert.equal(f.controller.getSnapshot().history.path, f.history.path);
  assert.equal(f.controller.getSnapshot().loading, false);
  assert.equal(f.calls.some((call) => call.body !== undefined), false);
  f.controller.change('saveHistory', false);
  f.controller.change('language', 'en');
  await f.controller.save();
  assert.deepEqual(f.calls.at(-1), { endpoint: 'settings', body: { ...persisted, saveHistory: false, language: 'en' } });
  assert.match(f.controller.getSnapshot().notice, /设置已保存/);
});

test('settings read failures keep translation disabled and expose the failure', async () => {
  const f = fixture({ settings: async () => { throw new Error('service unavailable'); } });
  await f.controller.open();
  assert.equal(f.settings.enabled, false);
  assert.equal(f.controller.getSnapshot().draft.enabled, false);
  assert.match(f.controller.getSnapshot().error, /settings：service unavailable/);
});

test('clear requires two deliberate clicks, aborts pending work once and does not resave records', async () => {
  const f = fixture();
  await f.controller.open();
  const before = f.calls.length;
  await f.controller.clear();
  assert.equal(f.controller.getSnapshot().confirmClear, true);
  assert.equal(f.calls.length, before);
  assert.equal(f.cleared, 0);
  await f.controller.clear();
  assert.equal(f.cleared, 1);
  assert.deepEqual(f.calls.slice(before), [{ endpoint: 'history/clear', body: {} }]);
  assert.equal(f.controller.getSnapshot().history.count, 0);
  assert.match(f.controller.getSnapshot().notice, /当前页面已显示的译文保留/);
});

test('save errors clear the busy state and preserve the editable draft', async () => {
  const f = fixture({ settings: async (body) => { if (body) throw new Error('disk full'); return persisted; } });
  await f.controller.open();
  f.controller.change('clearWriting', true);
  await f.controller.save();
  assert.equal(f.controller.getSnapshot().busy, '');
  assert.equal(f.controller.getSnapshot().draft.clearWriting, true);
  assert.equal(f.settings.clearWriting, false);
  assert.match(f.controller.getSnapshot().error, /disk full/);
});

test('export fetches all current records and downloads JSON through a temporary Blob URL', async () => {
  const f = fixture();
  await f.controller.open();
  await f.controller.export();
  assert.equal(f.calls.at(-1).endpoint, 'history');
  assert.deepEqual(f.downloads[0].records, [record]);
  const json = JSON.parse(historyExport(f.history, new Date('2026-11-09T06:00:00Z')));
  assert.equal(json.records[0].source, record.source);
  assert.equal(json.records[0].created_at, record.created_at);
  assert.equal(json.count, 1);
  let blob, clicked = false, removed = false, revoked = false;
  const anchor = { click() { clicked = true; }, remove() { removed = true; } };
  downloadHistory(f.history, {
    BlobCtor: class { constructor(parts, options) { blob = { parts, options }; } },
    documentRef: { createElement: (tag) => { assert.equal(tag, 'a'); return anchor; }, body: { append(node) { assert.equal(node, anchor); } } },
    urlApi: { createObjectURL: () => 'blob:local-export', revokeObjectURL(url) { revoked = url === 'blob:local-export'; } }, defer: (fn) => fn(),
  });
  assert.equal(blob.options.type, 'application/json;charset=utf-8');
  assert.deepEqual(JSON.parse(blob.parts[0]).records, [record]);
  assert.equal(anchor.href, 'blob:local-export');
  assert.match(anchor.download, /^plainspeak-records-.*\.json$/);
  assert.ok(clicked && removed && revoked);
});

test('settings panel exposes an accessible dialog and record text as React children', async () => {
  const f = fixture();
  await f.controller.open();
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useRef: () => ({ current: null }), useEffect() {} };
  const tree = createSettingsControls(React, f.controller)();
  const nodes = [];
  function visit(node) { if (!node || typeof node !== 'object') return; nodes.push(node); for (const child of node.children ?? []) visit(child); }
  visit(tree);
  const dialog = nodes.find((node) => node.props.role === 'dialog');
  assert.equal(dialog.props['aria-modal'], true);
  assert.equal(nodes.filter((node) => node.type === 'input' && node.props.type === 'checkbox').length, 4);
  assert.equal(nodes.filter((node) => node.type === 'option').length, 7);
  assert.ok(nodes.some((node) => node.type === 'pre' && node.children.includes(record.source)));
  assert.ok(nodes.every((node) => !('dangerouslySetInnerHTML' in node.props)));
  assert.deepEqual(nodes.filter((node) => node.props.role === 'tab').map((node) => node.props['aria-selected']), [true, false]);
  assert.deepEqual(nodes.filter((node) => node.props.role === 'tabpanel').map((node) => node.props.hidden), [false, true]);
});

test('tabs retain unsaved reading changes and expose keyboard navigation', async () => {
  const f = fixture();
  await f.controller.open();
  assert.equal(settingsDirty(f.controller.getSnapshot().draft, f.controller.getSnapshot().saved), false);
  f.controller.change('hideOriginal', true);
  f.controller.selectTab('records');
  assert.equal(f.controller.getSnapshot().tab, 'records');
  assert.equal(f.controller.getSnapshot().draft.hideOriginal, true);
  assert.equal(settingsDirty(f.controller.getSnapshot().draft, f.controller.getSnapshot().saved), true);
  await f.controller.refresh();
  assert.equal(f.controller.getSnapshot().draft.hideOriginal, true, 'refreshing records must not discard unsaved reading changes');
  assert.equal(nextSettingsTab('ArrowRight', 'reading'), 'records');
  assert.equal(nextSettingsTab('ArrowLeft', 'records'), 'reading');
  assert.equal(nextSettingsTab('Home', 'records'), 'reading');
  assert.equal(nextSettingsTab('End', 'reading'), 'records');
  assert.equal(nextSettingsTab('Enter', 'reading'), null);
  await f.controller.save();
  assert.equal(settingsDirty(f.controller.getSnapshot().draft, f.controller.getSnapshot().saved), false);
});

test('dialog keyboard loop excludes hidden tab panels and inactive tabs', () => {
  let focused, prevented = false, closed = false;
  const element = (id, hidden = false, tabIndex = 0) => ({ id, tabIndex, closest: () => hidden, getClientRects: () => [1], focus() { focused = id; } });
  const first = element('close'), inactive = element('inactive', false, -1), hidden = element('hidden', true), last = element('save');
  const root = { querySelectorAll: () => [first, inactive, hidden, last], contains: (node) => [first, inactive, hidden, last].includes(node) };
  const event = { key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } };
  trapDialogKey(event, root, () => {}, last);
  assert.equal(focused, 'close'); assert.equal(prevented, true);
  event.shiftKey = true;
  trapDialogKey(event, root, () => {}, first);
  assert.equal(focused, 'save');
  trapDialogKey({ key: 'Escape', stopPropagation() {} }, root, () => { closed = true; }, first);
  assert.equal(closed, true);
});

test('service status uses the actual managed model ID and records sort newest first', () => {
  const summary = serviceSummary({ ok: true, modelReady: true, status: { model: 'qwen-local' } }, null);
  assert.equal(summary.model, 'qwen-local');
  assert.match(summary.service, /就绪/);
  assert.deepEqual(recentRecords([{ created_at: '2026-11-01', id: 1 }, { created_at: '2026-11-09', id: 2 }]).map((item) => item.id), [2, 1]);
});

test('storage failure remains visible beside usable translated text', () => {
  const output = { dataset: {}, textContent: '' };
  renderTranslation(output, { text: '可用译文', report: { retained_chunks: 0 }, storage_error: 'disk full' });
  assert.equal(output.dataset.status, 'storage-error');
  assert.match(output.textContent, /^可用译文/);
  assert.match(output.textContent, /本地记录未保存：disk full/);
});
