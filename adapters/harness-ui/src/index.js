import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'plainspeak-harness-ui';
export const inject = ['webServer', 'systemPrompt'];

// These are the core rules of the bundled clear-writing skill, applied at
// prompt assembly rather than waiting for the model to discover a tool.
export const CLEAR_WRITING = `中文表达规则：直接回答问题，先给出证据允许的判断，再解释原因。简单问题短答；复杂问题保留讲懂机制所需的解释、例子与衔接。用常用词、具体对象和动作，首次出现的必要术语就近解释。优先自然段，比较和步骤按需列表。只在相关处说明一次会影响结论或行动的限定；证据不足时收窄结论。删除重复免责、假想反驳、自我辩护、说教、黑话和无信息的总结，不用刻意的“不是A而是B”。保留事实、数字、范围、因果、负结果和必要的不确定性，不把计划写成成果。科研结果按实验条件、观测结果、证据支持的结论组织，范围已清楚就自然结束。科研探索先说明具体问题、近邻差异和最小验证；建议放弃时给出具体重合、反证或不可行理由。`;

export function createBridge(config = {}, spawnProcess = spawn) {
  let child;
  let ready;
  let port;
  let rewriteTail = Promise.resolve();
  let disposed = false;
  const token = randomBytes(32).toString('hex');
  const projectRoot = resolve(config.projectRoot ?? config.pythonCwd ?? fileURLToPath(new URL('../../../', import.meta.url)));
  async function start() {
    if (disposed) throw new Error('PlainSpeak is stopped');
    if (ready) return ready;
    ready = new Promise((resolveReady, reject) => {
      const args = [...(config.pythonArgs ?? []), '-m', 'plainspeak.bridge', '--port', '0', '--token', token, '--exit-on-stdin-close'];
      const spawned = spawnProcess(config.pythonCommand ?? 'python', args, {
        cwd: projectRoot,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8',
          PYTHONPATH: [resolve(projectRoot, 'src'), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
          PLAINSPEAK_PROVIDER: 'managed',
          PLAINSPEAK_UI_DEFAULTS: JSON.stringify({ enabled: config.translationEnabled !== false,
            language: config.language ?? 'zh-CN', clearWriting: config.clearWriting !== false,
            saveHistory: config.saveHistory !== false }),
          ...(config.dataHome ? { PLAINSPEAK_HOME: config.dataHome } : {}) },
      });
      child = spawned;
      let buffer = '';
      let settled = false;
      const timer = setTimeout(() => fail(new Error('PlainSpeak bridge did not start within 30 seconds')), 30000);
      function fail(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (child === spawned) ready = undefined;
        spawned.kill();
        reject(error);
      }
      spawned.once('error', fail);
      // stderr is deliberately consumed without logging source paragraphs or tokens.
      spawned.stderr.on('data', () => {});
      spawned.stdout.setEncoding('utf8');
      spawned.stdout.on('data', (chunk) => {
        if (settled) return;
        buffer += chunk;
        if (buffer.length > 16384) return fail(new Error('Invalid PlainSpeak startup response'));
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        try {
          const message = JSON.parse(buffer.slice(0, newline));
          if (message.service !== 'plainspeak' || message.host !== '127.0.0.1' || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) throw new Error('Invalid PlainSpeak bridge address');
          port = message.port;
          settled = true;
          clearTimeout(timer);
          resolveReady(port);
        } catch (error) { fail(error); }
      });
      spawned.once('exit', (code) => {
        if (child === spawned) port = undefined;
        if (!settled) fail(new Error(`PlainSpeak bridge exited during startup (${code})`));
        if (child === spawned) ready = undefined;
      });
    });
    return ready;
  }
  return {
    request(path, body, signal) {
      async function invoke() {
        signal?.throwIfAborted();
        await start();
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method: body === undefined ? 'GET' : 'POST', signal,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const result = await response.json();
        if (!response.ok) {
          const error = new Error(typeof result.error === 'string' ? result.error : `PlainSpeak bridge HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return result;
      }
      if (path !== '/rewrite') return invoke();
      // All tabs share one Python worker. Serialization here prevents separate
      // pages from racing the bridge's single-model inference lock.
      const operation = rewriteTail.then(invoke);
      rewriteTail = operation.catch(() => {});
      return operation;
    },
    get started() { return port !== undefined; },
    dispose() {
      disposed = true;
      if (!child) return;
      child.stdin.end();
      const ownChild = child;
      const backup = setTimeout(() => ownChild.kill(), 2000);
      backup.unref();
      ownChild.once('exit', () => clearTimeout(backup));
    },
  };
}

export function validateRequest(req) {
  // The static marker distinguishes our API traffic; it is not authentication.
  // Local authority and peer checks also cover requests with no browser Origin.
  if (req.headers['x-plainspeak'] !== '1') return false;
  const host = req.headers.host;
  if (typeof host !== 'string') return false;
  const authority = /^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i.exec(host);
  if (!authority || (authority[2] !== undefined && (Number(authority[2]) < 1 || Number(authority[2]) > 65535))) return false;
  const peer = req.socket?.remoteAddress ?? req.connection?.remoteAddress;
  if (peer !== undefined && peer !== null && (typeof peer !== 'string' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer.toLowerCase()))) return false;
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && (typeof site !== 'string' || !['same-origin', 'same-site', 'none'].includes(site.toLowerCase()))) return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    if (typeof origin !== 'string') return false;
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.origin !== new URL(`${parsed.protocol}//${host}`).origin) return false;
    } catch { return false; }
  }
  return true;
}

function validRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100000) throw new Error('Paragraph request exceeds 100 KB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function apply(ctx, config = {}, dependencies = {}) {
  const bridge = dependencies.bridge ?? createBridge(config);
  ctx.effect(() => () => bridge.dispose());
  // Read durable state before registering the prompt. The provider is evaluated
  // on every assembly, so a saved toggle applies to the next model reply.
  let settings = { enabled: false, language: 'zh-CN', clearWriting: false, saveHistory: false };
  try { settings = await bridge.request('/settings'); }
  catch { /* Keep the settings UI available; its GET reports the storage/startup error. */ }
  ctx.systemPrompt.section({ name: 'plainspeak:clear-writing', order: 30,
    text: () => settings.clearWriting ? CLEAR_WRITING : '' });
  const routes = ['rewrite', 'cancel', 'health', 'models', 'languages', 'config', 'settings', 'history', 'history/clear'];
  for (const endpoint of routes) ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: `/api/plainspeak/${endpoint}`,
    async handler(req, res) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      function send(status, value) { if (!res.destroyed) { res.statusCode = status; res.end(JSON.stringify(value)); } }
      if (!validateRequest(req)) return send(403, { error: 'PlainSpeak requires a local same-origin request' });
      const methods = endpoint === 'settings' ? ['GET', 'POST'] : [['rewrite', 'cancel', 'history/clear'].includes(endpoint) ? 'POST' : 'GET'];
      if (!methods.includes(req.method)) return send(405, { error: 'Method not allowed' });
      const abort = new AbortController();
      res.once('close', () => { if (!res.writableEnded) abort.abort(); });
      try {
        if (endpoint === 'config') return send(200, { translationEnabled: settings.enabled,
          language: settings.language, clearWriting: settings.clearWriting, saveHistory: settings.saveHistory });
        if (endpoint === 'health' && !bridge.started) return send(200, { ok: true, modelReady: false, bridgeStarted: false });
        const body = req.method === 'POST' ? await readJson(req) : undefined;
        if (endpoint === 'rewrite' && (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 20000 || typeof body.language !== 'string' || body.language.length > 64 || (body.pivot !== undefined && typeof body.pivot !== 'string'))) return send(400, { error: 'Invalid paragraph or language' });
        if (endpoint === 'rewrite' && body.requestId !== undefined && !validRequestId(body.requestId)) return send(400, { error: 'Invalid requestId' });
        if (endpoint === 'rewrite' && body.context !== undefined && (typeof body.context !== 'string' || body.context.length > 2400)) return send(400, { error: 'Invalid context; use at most 2400 characters' });
        if (endpoint === 'cancel' && (!body || !validRequestId(body.requestId) || Object.keys(body).length !== 1)) return send(400, { error: 'Invalid cancellation requestId' });
        const result = await bridge.request(`/${endpoint}`, body, endpoint === 'settings' ? undefined : abort.signal);
        // Even if the browser disconnects just after a settings write, update
        // the next prompt using the successful durable response.
        if (endpoint === 'settings') settings = result;
        send(200, result);
      } catch (error) {
        if (abort.signal.aborted) return;
        const status = [400, 409, 413, 429, 503].includes(error.status) ? error.status : 502;
        send(status, { error: String(error.message ?? error).slice(0, 500) });
      }
    },
  }));
}
