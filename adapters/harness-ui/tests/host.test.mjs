import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { apply, CLEAR_WRITING, createBridge, validateRequest } from '../src/index.js';
import { createClientPlugin } from '../src/client.js';

function context() {
  const sections = [], routes = [], effects = [], activeRoutes = new Map();
  return { sections, routes, effects, activeRoutes, systemPrompt: { section: section => sections.push(section) },
    webServer: { register(route) { routes.push(route); activeRoutes.set(route.path, route.handler); return () => activeRoutes.delete(route.path); } },
    effect(callback) { const dispose = callback(); if (typeof dispose === 'function') effects.push(dispose); },
    dispose() { for (const dispose of effects.splice(0).reverse()) dispose(); } };
}

async function invokeRoute(ctx, endpoint, body, method = 'POST') {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]);
  request.method = method;
  request.headers = { host: '127.0.0.1:3920', 'x-plainspeak': '1' };
  request.socket = { remoteAddress: '127.0.0.1' };
  const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
    setHeader() {}, end(value) { this.body = JSON.parse(value); this.writableEnded = true; } });
  await ctx.activeRoutes.get(`/api/plainspeak/${endpoint}`)(request, response);
  return response;
}

test('native host proxy starts once, authenticates the bridge, and disposes its child', async () => {
  const bridge = createBridge({ pythonCommand: process.execPath, pythonArgs: [fileURLToPath(new URL('./fixtures/bridge.mjs', import.meta.url))] });
  try {
    assert.equal(bridge.started, false);
    assert.deepEqual(await bridge.request('/health'), { ok: true, modelReady: false });
    assert.equal(bridge.started, true);
    await assert.rejects(() => bridge.request('/busy'), (error) => error.status === 429);
    const results = await Promise.all([bridge.request('/rewrite', { text: 'first', language: 'zh-CN' }), bridge.request('/rewrite', { text: 'second', language: 'en' })]);
    assert.equal(results[0].text, 'zh-CN:first');
    assert.equal(results[1].text, 'en:second');
  } finally { bridge.dispose(); }
  for (let i = 0; i < 30 && bridge.started; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(bridge.started, false);
  await assert.rejects(() => bridge.request('/health'), /stopped/);
});

test('host routes accept only loopback authorities, peers and matching HTTP origins', () => {
  assert.equal(validateRequest({ headers: { host: 'localhost:3920', origin: 'http://localhost:3920', 'x-plainspeak': '1' } }), true);
  assert.equal(validateRequest({ headers: { host: 'localhost:3920', origin: 'https://elsewhere.invalid', 'x-plainspeak': '1' } }), false);
  assert.equal(validateRequest({ headers: { host: 'localhost:3920' } }), false);
  for (const host of ['localhost', 'localhost:3920', '127.0.0.1:3920', '[::1]:3920']) {
    for (const peer of [undefined, '127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      assert.equal(validateRequest({ headers: { host, 'x-plainspeak': '1' }, socket: { remoteAddress: peer } }), true, `${host} peer ${peer}`);
    }
  }
  for (const host of ['evil.invalid', 'localhost.evil.invalid', '127.1', '2130706433', '127.0.0.2', '[::ffff:127.0.0.1]',
    'localhost.', 'localhost:0', 'localhost:65536', 'localhost/path', 'localhost@evil.invalid']) {
    assert.equal(validateRequest({ headers: { host, origin: `http://${host}`, 'x-plainspeak': '1' } }), false, host);
  }
  for (const peer of ['10.0.0.1', '192.168.1.2', '::ffff:10.0.0.1']) {
    assert.equal(validateRequest({ headers: { host: 'localhost:3920', 'x-plainspeak': '1' }, socket: { remoteAddress: peer } }), false, peer);
  }
  assert.equal(validateRequest({ headers: { host: 'localhost:3920', 'x-plainspeak': '1', 'sec-fetch-site': 'cross-site' } }), false);
  for (const origin of ['null', 'file://localhost:3920', 'http://localhost:3921', 'http://127.0.0.1:3920',
    'http://user@localhost:3920', 'http://localhost:3920/path']) {
    assert.equal(validateRequest({ headers: { host: 'localhost:3920', origin, 'x-plainspeak': '1' } }), false, origin);
  }
});

test('clear writing uses durable settings and changes on the next prompt assembly', async () => {
  let settings = { enabled: true, language: 'zh-CN', clearWriting: true, saveHistory: true };
  const bridge = { async request(path, body) {
    assert.equal(path, '/settings');
    if (body) settings = { ...settings, ...body };
    return settings;
  }, dispose() {} };
  const enabled = context();
  await apply(enabled, {}, { bridge });
  assert.equal(enabled.sections.length, 1);
  assert.equal(enabled.sections[0].text(), CLEAR_WRITING);
  assert.equal(enabled.routes.length, 9);
  assert.equal(enabled.sections[0].name, 'plainspeak:clear-writing');
  const routes = new Map(enabled.routes.map((route) => [route.path, route.handler]));
  const server = createServer((req, res) => routes.get(req.url)(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/plainspeak/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PlainSpeak': '1' },
      body: JSON.stringify({ clearWriting: false }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).clearWriting, false);
    assert.equal(enabled.sections[0].text(), '');
  } finally { await new Promise((resolve) => server.close(resolve)); }
  const disabled = context();
  await apply(disabled, {}, { bridge });
  assert.equal(disabled.sections[0].text(), '');
});

test('browser bundle uses the native shared React and assistant renderer', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(source.includes('window.__ModuleLoader__.load('));
  assert.ok(source.includes('createClientPlugin(require("react"),require("react-dom"),require("@deepseek-ai/dsh-client-ui-primitives"))'));
  assert.ok(source.includes("entry.options.key === 'assistant-step'"));
  assert.ok(source.includes('h(Original, props)'));
  assert.ok(!source.includes('innerHTML'));
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'));
});

test('unavailable settings keep the native UI reachable with writing and translation off', async () => {
  const ctx = context();
  const bridge = { request: async () => { throw new Error('Local settings storage unavailable'); }, dispose() {} };
  await apply(ctx, {}, { bridge });
  assert.equal(ctx.sections[0].text(), '');
  assert.ok(ctx.routes.some((route) => route.path === '/api/plainspeak/settings'));
  assert.ok(ctx.routes.some((route) => route.path === '/api/plainspeak/history'));
});

test('unloading releases host routes so a reload uses the new bridge', async () => {
  const ctx = context();
  const settings = { enabled: true, language: 'zh-CN', clearWriting: true, saveHistory: true };
  let disposed = 0;
  const makeBridge = label => ({ request: async endpoint => endpoint === '/settings' ? settings : { label }, dispose() { disposed++; } });
  await apply(ctx, {}, { bridge: makeBridge('first') });
  assert.equal(ctx.activeRoutes.size, 9);
  ctx.dispose();
  assert.equal(ctx.activeRoutes.size, 0);
  assert.equal(disposed, 1);
  await apply(ctx, {}, { bridge: makeBridge('second') });
  assert.equal(ctx.activeRoutes.size, 9);
  const response = await invokeRoute(ctx, 'models', undefined, 'GET');
  assert.deepEqual(response.body, { label: 'second' });
  ctx.dispose();
  assert.equal(ctx.activeRoutes.size, 0);
  assert.equal(disposed, 2);
});

test('cancel forwards validated request IDs and rejects malformed IDs before reaching the bridge', async () => {
  const ctx = context(), calls = [];
  const bridge = { async request(endpoint, body) { calls.push({ endpoint, body }); return endpoint === '/settings' ? { clearWriting: false } : { ok: true }; }, dispose() {} };
  await apply(ctx, {}, { bridge });
  const requestId = 'request_123-XYZ';
  const cancelled = await invokeRoute(ctx, 'cancel', { requestId });
  assert.equal(cancelled.statusCode, 200);
  assert.deepEqual(calls.at(-1), { endpoint: '/cancel', body: { requestId } });
  const validRewrite = { text: 'Synthetic paragraph', language: 'en', requestId };
  assert.equal((await invokeRoute(ctx, 'rewrite', validRewrite)).statusCode, 200);
  assert.deepEqual(calls.at(-1), { endpoint: '/rewrite', body: validRewrite });
  assert.equal((await invokeRoute(ctx, 'rewrite', { text: 'Synthetic paragraph', language: 'en' })).statusCode, 200);
  for (const invalid of [undefined, null, 12345678, 'short', 'x'.repeat(129), 'nonascii_中文', 'invalid.id']) {
    const before = calls.length;
    assert.equal((await invokeRoute(ctx, 'cancel', { requestId: invalid })).statusCode, 400);
    if (invalid !== undefined) assert.equal((await invokeRoute(ctx, 'rewrite', { ...validRewrite, requestId: invalid })).statusCode, 400);
    assert.equal(calls.length, before);
  }
  assert.equal((await invokeRoute(ctx, 'cancel', { requestId, extra: true })).statusCode, 400);
  assert.equal((await invokeRoute(ctx, 'cancel', undefined, 'GET')).statusCode, 405);
  ctx.dispose();
});

test('rewrite forwards bounded optional context and rejects invalid context before bridge dispatch', async () => {
  const ctx = context(), calls = [];
  const bridge = { async request(endpoint, body) { calls.push({ endpoint, body }); return endpoint === '/settings' ? { clearWriting: false } : { ok: true }; }, dispose() {} };
  await apply(ctx, {}, { bridge });
  const paragraph = { text: 'Synthetic target', language: 'en' };
  for (const value of [undefined, '', 'Nearby explanation', 'x'.repeat(2400)]) {
    const body = value === undefined ? paragraph : { ...paragraph, context: value };
    assert.equal((await invokeRoute(ctx, 'rewrite', body)).statusCode, 200);
    assert.deepEqual(calls.at(-1), { endpoint: '/rewrite', body });
  }
  for (const value of [null, 10, {}, [], 'x'.repeat(2401)]) {
    const before = calls.length;
    assert.equal((await invokeRoute(ctx, 'rewrite', { ...paragraph, context: value })).statusCode, 400);
    assert.equal(calls.length, before);
  }
  ctx.dispose();
});

test('native assistant wrapper preserves the stored entry locale and injection currency', async () => {
  const originalGlobals = { fetch: globalThis.fetch, document: globalThis.document, localStorage: globalThis.localStorage };
  const registrations = [];
  const nativeInject = () => ({ openFile() {} });
  const nativeStore = {};
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ translationEnabled: true, language: 'zh-CN' }) });
  globalThis.document = { createElement: () => ({ dataset: {}, remove() {} }), head: { append() {} } };
  globalThis.localStorage = { getItem: () => null };
  try {
    await createClientPlugin({ createElement() {} }, { createPortal() {} }, { MarkdownText() {} }).apply({
      effect() {},
      slots: {
        inject(_name, callback) { return callback(); },
        entriesOfSlot() { return [{ options: { key: 'assistant-step' }, component() {}, locale: 'conversation', inject: nativeInject, store: nativeStore }]; },
        register(options, component) { registrations.push({ options, component }); return () => {}; },
      },
    });
    const wrapper = registrations.find(({ options }) => options.key === 'assistant-step');
    assert.equal(wrapper.options.locale, 'conversation');
    assert.equal(wrapper.options.inject, nativeInject);
    assert.equal(wrapper.options.store, nativeStore);
    assert.equal(wrapper.options.priority, -1);
  } finally {
    for (const [key, value] of Object.entries(originalGlobals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
