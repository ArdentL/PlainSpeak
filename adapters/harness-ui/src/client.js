import { mountParagraphTranslations } from './paragraphs.js';
import { nativeTranslationContent } from './markdown.js';
import { createSettingsController, createSettingsControls, normalizeSettings, SETTINGS_CSS } from './settings.js';

function retryDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function retryBusy(operation, signal, { maxWaitMs = 30000, now = Date.now, sleep = retryDelay } = {}) {
  const deadline = now() + maxWaitMs;
  let attempt = 0;
  while (true) {
    signal?.throwIfAborted();
    try { return await operation(); }
    catch (error) {
      const busy = error.status === 429 || (error.status === 503 && /busy|temporar|try again|retry|忙|稍后/i.test(error.message));
      const remaining = deadline - now();
      if (!busy || signal?.aborted || remaining <= 0) throw error;
      await sleep(Math.min(600 * 2 ** Math.min(attempt++, 4), 5000, remaining), signal);
      if (now() >= deadline) throw error;
    }
  }
}

export function createClientPlugin(React, ReactDOM, primitives) {
  const h = React.createElement;
  let settings = { enabled: false, language: 'zh-CN', clearWriting: true, saveHistory: true, hideOriginal: false };
  const listeners = new Set();
  const queue = [];
  const runningJobs = new Set();
  const paragraphControllers = new Set();
  let active = 0;
  let requestSequence = 0;
  function update(next) {
    const normalized = normalizeSettings(next, settings);
    if (JSON.stringify(normalized) === JSON.stringify(settings)) return;
    settings = normalized;
    for (const listener of listeners) listener();
  }
  function useSettings() {
    return React.useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => settings);
  }
  async function api(endpoint, body, signal) {
    const response = await fetch(`/api/plainspeak/${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-PlainSpeak': '1' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error ?? `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function pump() {
    while (active < 1 && queue.length) {
      const job = queue.shift();
      if (job.signal.aborted) { job.reject(new DOMException('Cancelled', 'AbortError')); continue; }
      active++;
      runningJobs.add(job);
      // The request may still be executing after fetch aborts. Send cancellation
      // independently so it can reach the bridge even though workSignal is aborted.
      const cancel = () => { api('cancel', { requestId: job.requestId }).catch(() => {}); };
      job.workSignal.addEventListener('abort', cancel, { once: true });
      retryBusy(() => api('rewrite', { text: job.text, language: job.language, requestId: job.requestId, context: job.context }, job.workSignal), job.workSignal).then((result) => {
        job.workSignal.throwIfAborted();
        if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('Empty translation response');
        // Reuse is owned by the backend, whose key includes the active model
        // and validation schema. Keep its report and persistence warnings.
        job.resolve(result);
      }).catch(job.reject).finally(() => { job.workSignal.removeEventListener('abort', cancel); runningJobs.delete(job); active--; pump(); });
    }
  }
  function translate(text, language, signal, context) {
    return new Promise((resolve, reject) => {
      const abort = new AbortController();
      const workSignal = AbortSignal.any([signal, abort.signal]);
      const requestId = globalThis.crypto?.randomUUID?.() ?? `plainspeak-${Date.now().toString(36)}-${++requestSequence}-${Math.random().toString(36).slice(2)}`;
      const job = { text, language, signal, workSignal, abort, resolve, reject, requestId, context };
      queue.push(job);
      signal.addEventListener('abort', () => {
        const index = queue.indexOf(job);
        if (index !== -1) { queue.splice(index, 1); reject(new DOMException('Cancelled', 'AbortError')); }
      }, { once: true });
      pump();
    });
  }
  function cancelPendingWork() {
    const reason = new DOMException('已清空记录；新回复继续自动处理', 'AbortError');
    for (const controller of paragraphControllers) controller.cancelPending(reason);
    for (const job of queue.splice(0)) { job.abort.abort(reason); job.reject(reason); }
    for (const job of runningJobs) job.abort.abort(reason);
  }
  const panel = createSettingsController(api, { getSettings: () => settings, onSaved: update, beforeClear: cancelPendingWork });
  const Controls = createSettingsControls(React, panel);
  const inject = ['slots', 'conversation', 'locale'];
  async function apply(ctx) {
    if (!ReactDOM?.createPortal || !primitives?.MarkdownText) throw new Error('PlainSpeak requires the shared Harness ReactDOM and MarkdownText modules');
    try { update(await api('settings')); panel.syncSettings(settings); }
    catch (error) { panel.setError(`无法读取本地设置，自动翻译尚未启动：${error.message ?? error}`); }
    const style = document.createElement('style');
    style.dataset.plainspeak = '';
    style.textContent = SETTINGS_CSS;
    document.head.append(style);
    ctx.effect(() => () => { style.remove(); cancelPendingWork(); });
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'plainspeak-translations', order: 20 }, Controls));
    ctx.slots.inject('conversation.chat.node', () => {
      const original = ctx.slots.entriesOfSlot('conversation.chat.node').find((entry) => entry.options.key === 'assistant-step');
      if (!original) throw new Error('PlainSpeak requires the Harness assistant-step renderer');
      const Original = original.component;
      function AssistantWithTranslations(props) {
        const container = React.useRef(null);
        const running = React.useRef(props.node.data.status === 'running');
        running.current = props.node.data.status === 'running';
        const current = useSettings();
        const controller = React.useRef(null);
        const portalSequence = React.useRef(0);
        const [portals, setPortals] = React.useState(() => new Map());
        React.useEffect(() => {
          if (!current.enabled || !container.current) return;
          const mounted = mountParagraphTranslations(container.current, {
            isRunning: () => running.current,
            hideOriginal: current.hideOriginal,
            translate: (text, signal, context) => translate(text, current.language, signal, context),
            renderOutput: (output, translated) => setPortals((previous) => {
              const next = new Map(previous);
              next.set(output, { translated, key: previous.get(output)?.key ?? String(++portalSequence.current) });
              return next;
            }),
            removeOutput: (output) => setPortals((previous) => {
              if (!previous.has(output)) return previous;
              const next = new Map(previous); next.delete(output); return next;
            }),
          });
          controller.current = mounted;
          paragraphControllers.add(mounted);
          return () => { paragraphControllers.delete(mounted); mounted.dispose(); controller.current = null; };
        }, [current.enabled, current.language]);
        React.useEffect(() => { controller.current?.setHideOriginal(current.hideOriginal); }, [current.hideOriginal]);
        React.useEffect(() => { controller.current?.refresh(); }, [props.node.data]);
        return h('div', { ref: container, 'data-plainspeak-assistant': '', 'data-plainspeak-running': String(running.current) }, h(Original, props),
          ...[...portals].map(([output, entry]) => ReactDOM.createPortal(nativeTranslationContent(React, primitives.MarkdownText, entry.translated), output, entry.key)));
      }
      // SlotCore stores renderer currency (locale/inject/store) beside options;
      // options contains only the key/id/order/label/priority election fields.
      // Losing locale here makes the native renderer's `t` undefined, so its
      // boundary abdicates this entry and silently reveals the stock renderer.
      return ctx.slots.register({ ...original.options,
        ...(original.locale === undefined ? {} : { locale: original.locale }),
        ...(original.inject === undefined ? {} : { inject: original.inject }),
        ...(original.store === undefined ? {} : { store: original.store }),
        name: 'conversation.chat.node', key: 'assistant-step', priority: (original.options.priority ?? 0) - 1,
      }, AssistantWithTranslations);
    });
  }
  return { inject, apply };
}
