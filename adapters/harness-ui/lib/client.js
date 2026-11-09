// Built from src/client.js, src/markdown.js, src/paragraphs.js and src/settings.js; do not edit.
window.__ModuleLoader__.load({id:"@plainspeak/harness-ui",factory:(require)=>{
function escapeMarkdown(value) {
  return value.replace(/([\\`*_[\]<>])/g, '\\$1');
}

function inlineCode(value) {
  const runs = value.match(/`+/g) ?? [];
  const ticks = '`'.repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${value}${pad}${ticks}`;
}

function inlineMarkdown(node) {
  if (node.nodeType === 3) return escapeMarkdown(node.textContent ?? '');
  if (node.nodeType !== undefined && node.nodeType !== 1) return '';
  const tag = node.tagName?.toUpperCase() ?? '';
  if (node.hasAttribute?.('data-plainspeak-translation') || ['SCRIPT', 'STYLE', 'BUTTON'].includes(tag)) return '';
  // KaTeX contains both MathML and visual HTML. Recover its one TeX annotation
  // instead of concatenating the duplicated accessibility/visual text.
  if (node.classList?.contains('katex') || node.classList?.contains('katex-display') || tag === 'MATH') {
    const tex = node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent;
    if (tex) return node.classList?.contains('katex-display') ? `$$\n${tex}\n$$` : `$${tex}$`;
  }
  if (node.getAttribute?.('aria-hidden') === 'true') return '';
  if (tag === 'CODE') return inlineCode(node.textContent ?? '');
  const body = node.childNodes?.length ? [...node.childNodes].map(inlineMarkdown).join('') : escapeMarkdown(node.textContent ?? '');
  if (tag === 'STRONG' || tag === 'B') return `**${body}**`;
  if (tag === 'EM' || tag === 'I') return `*${body}*`;
  if (tag === 'DEL' || tag === 'S') return `~~${body}~~`;
  if (tag === 'BR') return '  \n';
  if (tag === 'A') {
    const href = node.getAttribute?.('href');
    if (href && /^(https?:|mailto:|\/|#|\.{1,2}\/)/i.test(href)) {
      const destination = href.replace(/[<>\r\n]/g, (character) => encodeURIComponent(character));
      return `[${body}](<${destination}>)`;
    }
  }
  return tag === 'P' ? `${body}\n\n` : body;
}

function elementToMarkdown(element) {
  const text = (element.childNodes?.length ? [...element.childNodes].map(inlineMarkdown).join('') : escapeMarkdown(element.textContent ?? '')).trim();
  const heading = /^H([1-6])$/.exec(element.tagName ?? '');
  return heading ? `${'#'.repeat(Number(heading[1]))} ${text}` : text;
}

function technicalCellText(value) {
  return /^(?:https?:\/\/\S+|[+-]?\d+(?:[.,]\d+)*(?:%|ms|s|px)?|[A-Z][A-Z0-9_-]+|[\w.-]*[_/:=\\][\w./:=\\-]*)$/.test(value.trim());
}

function nativeTranslationContent(React, MarkdownText, translated) {
  const h = React.createElement;
  const retained = Number(translated.report?.retained_chunks);
  return h('div', { className: 'plainspeak-rendered-markdown' },
    retained > 0 && h('p', { className: 'plainspeak-translation-notice' }, `译文部分保留原文（${retained} 段）`),
    h(MarkdownText, { text: translated.text, streaming: false }),
    translated.storage_error && h('p', { className: 'plainspeak-translation-notice' }, `本地记录未保存：${String(translated.storage_error).slice(0, 200)}`));
}


function paragraphCopy(element) {
  const copy = element.cloneNode(true);
  for (const translation of copy.querySelectorAll('[data-plainspeak-translation]')) translation.remove();
  return copy;
}

function paragraphText(element) {
  return elementToMarkdown(paragraphCopy(element));
}

function paragraphCandidates(root) {
  return [...root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, th, td')].filter((element) => {
    if (element.closest('pre, code, [data-variant="think"], [data-plainspeak-translation]')) return false;
    const cell = element.tagName === 'TH' || element.tagName === 'TD';
    if (!cell && element.closest('table')) return false;
    if (cell && element.querySelector('table, pre, ul, ol, blockquote, details')) {
      element.dataset.plainspeakPreserved = 'complex-table-cell';
      return false;
    }
    if (element.tagName === 'LI' && element.querySelector('p, ul, ol, h1, h2, h3, h4, h5, h6')) return false;
    if (element.querySelector('pre, table, [data-variant="think"]')) return false;
    // These nodes cannot be reconstructed by the inline Markdown serializer.
    // Check only the source, because an existing translated portal may contain media.
    if (paragraphCopy(element).querySelectorAll('img, picture, svg, video, audio, iframe, object, embed, canvas').length) {
      element.dataset.plainspeakPreserved = 'unsupported-media';
      return false;
    }
    const text = paragraphText(element);
    const plainText = paragraphCopy(element).textContent.trim();
    if (cell && technicalCellText(plainText)) return false;
    return text.length > 1 && text.length <= 20000 && !/^[-\d\s.,:;!?，。；：！？]+$/.test(text)
      && ![...element.querySelectorAll('code')].some((code) => code.textContent.trim() === plainText);
  });
}

function renderTranslation(output, translated, renderOutput) {
  const retained = Number(translated.report?.retained_chunks);
  if (Number.isFinite(retained) && retained > 0) {
    output.textContent = `译文部分保留原文（${retained} 段）\n${translated.text}`;
    output.dataset.status = 'retained';
    output.dataset.retainedChunks = String(retained);
  } else {
    output.textContent = translated.text;
    output.dataset.status = 'ready';
  }
  if (translated.storage_error) {
    output.textContent += `\n（本地记录未保存：${String(translated.storage_error).slice(0, 200)}）`;
    output.dataset.storageError = 'true';
    if (!(retained > 0)) output.dataset.status = 'storage-error';
  }
  if (renderOutput) { output.textContent = ''; renderOutput(output, translated); }
}

function updateOriginalVisibility(element, output, hideOriginal, originallyHidden = false) {
  const hide = Boolean(hideOriginal) && output.dataset.duplicate !== 'true' && ['ready', 'storage-error'].includes(output.dataset.status);
  if (['LI', 'TD', 'TH'].includes(element.tagName)) element.classList.toggle('plainspeak-hide-inline-source', hide);
  else element.hidden = hide || originallyHidden;
  output.dataset.sourceHidden = String(hide);
}

// DOM belongs to the original renderer. We add disposable sibling nodes only;
// neither the conversation store nor the model's history is written here.
function mountParagraphTranslations(root, options) {
  const states = new Map();
  const tables = new Map();
  const cancelledText = new WeakMap();
  let disposed = false;
  let hideOriginal = Boolean(options.hideOriginal);
  let scanTimer;
  function hiddenContextDescendants(element, ignoreInlineMask = false) {
    for (const node of element.querySelectorAll('*')) {
      if (node.closest?.('[data-plainspeak-translation]')) continue;
      // Inspect the original nodes: clones lose computed host visibility.
      if (node.hidden || node.getAttribute?.('aria-hidden') === 'true'
        || node.style?.display === 'none' || ['hidden', 'collapse'].includes(node.style?.visibility)
        || node.style?.opacity === '0') return true;
      const style = root.ownerDocument.defaultView?.getComputedStyle?.(node);
      const ownMaskedChild = ignoreInlineMask && node.parentElement === element
        && element.classList?.contains?.('plainspeak-hide-inline-source');
      if (style && ((!ownMaskedChild && style.display === 'none')
        || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0')) return true;
    }
    return false;
  }
  function contextVisible(element) {
    const state = states.get(element);
    const hiddenByUs = state && !state.originallyHidden && state.output.dataset.sourceHidden === 'true';
    for (let node = element; node; node = node.parentElement) {
      const ownHiddenSource = node === element && hiddenByUs;
      if ((!ownHiddenSource && node.hidden) || node.getAttribute?.('aria-hidden') === 'true') return false;
      const style = root.ownerDocument.defaultView?.getComputedStyle?.(node);
      if (style && ((!ownHiddenSource && style.display === 'none') || ['hidden', 'collapse'].includes(style.visibility))) return false;
      if (node === root) break;
    }
    return hiddenByUs || !element.getClientRects || element.getClientRects().length > 0;
  }
  function nearbyContext(element, candidates = paragraphCandidates(root)) {
    // Query only this assistant renderer. Never read conversation stores or other
    // roots, and do not serialize reasoning, tool output, code or hidden content.
    const index = candidates.indexOf(element);
    if (index < 0) return '';
    function prose(candidate) {
      if (!contextVisible(candidate) || candidate.closest('[data-variant="think"], [data-variant="tool"], [data-variant="tool-output"], [data-tool-output], [data-tool-call]')) return '';
      if (states.get(candidate)?.hostHiddenDescendants || hiddenContextDescendants(candidate, true)) return '';
      const source = paragraphCopy(candidate);
      if (source.querySelectorAll('pre, code').length) return '';
      return elementToMarkdown(source);
    }
    function collect(step, limit) {
      let collected = '';
      for (let i = index + step; i >= 0 && i < candidates.length; i += step) {
        const remaining = limit - collected.length - (collected ? 2 : 0);
        if (remaining <= 0) break;
        const text = prose(candidates[i]);
        if (!text) continue;
        let part = step < 0 ? text.slice(-remaining) : text.slice(0, remaining);
        // JavaScript limits use UTF-16 units; do not send a severed emoji pair.
        part = step < 0 ? part.replace(/^[\uDC00-\uDFFF]/, '') : part.replace(/[\uD800-\uDBFF]$/, '');
        if (!part) continue;
        collected = step < 0 ? part + (collected ? `\n\n${collected}` : '') : collected + (collected ? '\n\n' : '') + part;
      }
      return collected;
    }
    const before = collect(-1, 1600), after = collect(1, 700);
    return [before ? `前文：\n${before}` : '', after ? `后文：\n${after}` : ''].filter(Boolean).join('\n\n');
  }
  function syncState(state) {
    // Capture host visibility before our inline source CSS masks direct children.
    // Keep that snapshot while masked, while still checking live attributes/styles
    // during context collection. Background exclusion never alters translation.
    if (!state.element.classList?.contains?.('plainspeak-hide-inline-source')) state.hostHiddenDescendants = hiddenContextDescendants(state.element);
    const table = state.table && tables.get(state.table);
    const sourceOnly = Boolean(table && !hideOriginal && table.sourceOnly);
    state.output.hidden = sourceOnly || state.output.dataset.duplicate === 'true';
    updateOriginalVisibility(state.element, state.output,
      !sourceOnly && (hideOriginal || Boolean(table)), state.originallyHidden);
  }
  function syncTables() {
    for (const group of tables.values()) {
      group.controls.hidden = hideOriginal;
      group.translated.setAttribute('aria-pressed', String(hideOriginal || !group.sourceOnly));
      group.original.setAttribute('aria-pressed', String(!hideOriginal && group.sourceOnly));
    }
    for (const state of states.values()) syncState(state);
  }
  function ensureTable(table) {
    if (tables.has(table)) return;
    const controls = root.ownerDocument.createElement('div');
    controls.dataset.plainspeakTableControls = '';
    controls.className = 'plainspeak-table-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', '表格显示');
    const translated = root.ownerDocument.createElement('button');
    const original = root.ownerDocument.createElement('button');
    translated.type = original.type = 'button';
    translated.textContent = '译文'; original.textContent = '原文';
    const group = { controls, translated, original, sourceOnly: false };
    translated.addEventListener('click', () => { group.sourceOnly = false; syncTables(); });
    original.addEventListener('click', () => { group.sourceOnly = true; syncTables(); });
    controls.append(translated, original);
    table.before(controls);
    tables.set(table, group);
  }
  function remove(state) {
    clearTimeout(state.timer);
    state.abort.abort();
    updateOriginalVisibility(state.element, state.output, false, state.originallyHidden);
    options.removeOutput?.(state.output);
    state.output.remove();
  }
  function scheduleTranslation(state, refreshContext = false) {
    state.refreshScheduled = refreshContext;
    state.timer = setTimeout(async () => {
      state.refreshScheduled = false;
      const { text, element, output } = state;
      if (disposed || state.abort.signal.aborted || states.get(element) !== state || !root.contains(element) || paragraphText(element) !== text) return;
      if (refreshContext && options.isRunning()) return;
      const context = nearbyContext(element);
      if (refreshContext) {
        if (context === state.context) return;
        state.finalContextRefreshed = true;
        state.abort.abort();
        state.abort = new AbortController();
      }
      state.context = context;
      const abort = state.abort;
      try {
        const translated = await options.translate(text, abort.signal, context);
        if (disposed || abort.signal.aborted || state.abort !== abort || states.get(element) !== state || paragraphText(element) !== text) return;
        delete output.dataset.duplicate;
        renderTranslation(output, translated, options.renderOutput);
        const normalize = value => value.trim().replace(/\s+/g, ' ');
        if (output.dataset.status === 'ready' && normalize(translated.text) === normalize(text)) output.dataset.duplicate = 'true';
        syncState(state);
      } catch (error) {
        if (abort.signal.aborted || disposed) return;
        // Keep an already rendered translation if an optional context refresh
        // cannot reach the provider. It remains usable without DOM portal churn.
        if (refreshContext && ['ready', 'storage-error', 'retained'].includes(output.dataset.status)) return;
        output.dataset.status = 'error';
        output.textContent = `译文暂不可用：${String(error.message ?? error).slice(0, 200)}`;
        syncState(state);
      }
    }, options.debounceMs ?? 350);
  }
  function scan() {
    if (disposed) return;
    const all = paragraphCandidates(root);
    const candidates = options.isRunning() ? all.slice(0, -1) : all;
    const wanted = new Set(candidates);
    for (const [element, state] of states) {
      if (!wanted.has(element) || paragraphText(element) !== state.text || !root.contains(element)) {
        remove(state);
        states.delete(element);
      }
    }
    for (const element of candidates) {
      const previous = states.get(element);
      if (previous) {
        // Neighbor tokens never retrigger a live answer. Once generation ends,
        // allow one refresh with final context, captured after the quiet period.
        if (!options.isRunning() && !previous.abort.signal.aborted && previous.context !== undefined && !previous.finalContextRefreshed && !previous.refreshScheduled && nearbyContext(element, all) !== previous.context) scheduleTranslation(previous, true);
        continue;
      }
      const text = paragraphText(element);
      if (cancelledText.get(element) === text) continue;
      const output = root.ownerDocument.createElement('div');
      output.dataset.plainspeakTranslation = '';
      output.dataset.sourceKind = ['TD', 'TH'].includes(element.tagName) ? 'cell' : /^H[1-6]$/.test(element.tagName) ? 'heading' : 'paragraph';
      output.className = 'plainspeak-translation';
      output.setAttribute('aria-live', 'polite');
      output.textContent = '译文准备中…';
      if (['LI', 'TD', 'TH'].includes(element.tagName)) element.append(output);
      else element.after(output);
      const table = ['TD', 'TH'].includes(element.tagName) ? element.closest('table') : null;
      if (table) ensureTable(table);
      const state = { text, element, output, table, originallyHidden: Boolean(element.hidden), abort: new AbortController(), timer: undefined,
        context: undefined, finalContextRefreshed: false, refreshScheduled: false };
      states.set(element, state);
      syncState(state);
      // A quiet period prevents a paragraph still receiving tokens from
      // repeatedly consuming translation work. The last live paragraph waits.
      scheduleTranslation(state);
    }
    const activeTables = new Set([...states.values()].map((state) => state.table).filter(Boolean));
    for (const [table, group] of tables) {
      if (!activeTables.has(table)) { group.controls.remove(); tables.delete(table); }
    }
    syncTables();
  }
  function schedule() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 80);
  }
  const observer = new MutationObserver((changes) => {
    // Ignore our own status/text inserts. Otherwise an observer would keep
    // rescheduling itself while a translation arrives.
    const relevant = changes.some((change) => {
      const parent = change.target.nodeType === 1 ? change.target : change.target.parentElement;
      if (parent?.closest('[data-plainspeak-translation], [data-plainspeak-table-controls]')) return false;
      if (change.type === 'childList' && [...change.addedNodes, ...change.removedNodes].every((node) => node.nodeType === 1 && (node.hasAttribute('data-plainspeak-translation') || node.hasAttribute('data-plainspeak-table-controls')))) return false;
      return true;
    });
    if (relevant) schedule();
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true });
  scan();
  return { refresh: schedule, setHideOriginal(value) { hideOriginal = Boolean(value); syncTables(); },
    cancelPending(reason) {
      clearTimeout(scanTimer);
      // Remember unchanged source blocks so observer refreshes cannot resubmit
      // cancelled work after history clear. Changed text and new nodes still run.
      for (const element of paragraphCandidates(root)) cancelledText.set(element, paragraphText(element));
      for (const [element, state] of states) {
        clearTimeout(state.timer);
        state.abort.abort(reason);
        if (!['ready', 'storage-error', 'retained'].includes(state.output.dataset.status)) {
          remove(state);
          states.delete(element);
        }
      }
      scan();
    },
    dispose() { disposed = true; clearTimeout(scanTimer); observer.disconnect(); for (const state of states.values()) remove(state); states.clear(); for (const group of tables.values()) group.controls.remove(); tables.clear(); } };
}


const LANGUAGE_OPTIONS = [['zh-CN', '中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español']];

function normalizeSettings(value, fallback = { enabled: false, language: 'zh-CN', clearWriting: true, saveHistory: true, hideOriginal: false }) {
  const source = value?.settings ?? value ?? {};
  return { enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
    language: LANGUAGE_OPTIONS.some(([code]) => code === source.language) ? source.language : fallback.language,
    clearWriting: typeof source.clearWriting === 'boolean' ? source.clearWriting : fallback.clearWriting,
    saveHistory: typeof source.saveHistory === 'boolean' ? source.saveHistory : fallback.saveHistory,
    hideOriginal: typeof source.hideOriginal === 'boolean' ? source.hideOriginal : fallback.hideOriginal ?? false };
}

function historyExport(history, now = new Date()) {
  return JSON.stringify({ version: 1, exported_at: now.toISOString(), count: history.records.length,
    limit: history.limit ?? 1000, records: history.records }, null, 2);
}

function downloadHistory(history, { documentRef = document, BlobCtor = Blob, urlApi = URL, defer = setTimeout } = {}) {
  const blob = new BlobCtor([historyExport(history)], { type: 'application/json;charset=utf-8' });
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = `plainspeak-records-${new Date().toISOString().slice(0, 10)}.json`;
  documentRef.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); defer(() => urlApi.revokeObjectURL(url), 1000); }
}

function createSettingsController(api, { getSettings, onSaved, beforeClear, download = downloadHistory }) {
  let state = { open: false, tab: 'reading', loading: false, busy: '', error: '', notice: '', confirmClear: false,
    draft: normalizeSettings(getSettings()), saved: normalizeSettings(getSettings()), history: { records: [], count: 0, limit: 1000, path: '' }, health: null, models: null };
  const listeners = new Set();
  function set(patch) { state = { ...state, ...patch }; for (const listener of listeners) listener(); }
  async function refresh() {
    set({ loading: true, error: '', notice: '', confirmClear: false });
    const endpoints = ['settings', 'history', 'health', 'models'];
    const results = await Promise.allSettled(endpoints.map((endpoint) => api(endpoint)));
    const updates = {};
    const errors = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i], endpoint = endpoints[i];
      if (result.status === 'rejected') { errors.push(`${endpoint}：${result.reason.message ?? result.reason}`); continue; }
      if (endpoint === 'settings') {
        const settings = normalizeSettings(result.value, getSettings());
        onSaved(settings);
        if (!settingsDirty(state.draft, state.saved)) updates.draft = settings;
        updates.saved = settings;
      }
      else updates[endpoint] = result.value;
    }
    set({ ...updates, loading: false, error: errors.length ? `读取本地数据失败：${errors.join('；')}` : '' });
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
    setError: (error) => set({ error }),
    syncSettings(value) { const saved = normalizeSettings(value, getSettings()); set({ saved, ...(!state.open ? { draft: saved } : {}) }); },
    async open() { const saved = normalizeSettings(getSettings()); set({ open: true, tab: 'reading', draft: saved, saved }); await refresh(); },
    selectTab(tab) { if (tab === 'reading' || tab === 'records') set({ tab, confirmClear: false }); },
    close() { if (!state.busy) set({ open: false, confirmClear: false }); },
    refresh,
    change(key, value) { set({ draft: { ...state.draft, [key]: value }, notice: '', confirmClear: false }); },
    async save() {
      if (state.busy || state.loading) return;
      set({ busy: 'save', error: '', notice: '' });
      try {
        const saved = normalizeSettings(await api('settings', normalizeSettings(state.draft)), getSettings());
        onSaved(saved);
        set({ draft: saved, saved, notice: '设置已保存。表达规则从下一次回复生效。' });
      } catch (error) { set({ error: `设置保存失败：${error.message ?? error}` }); }
      finally { set({ busy: '' }); }
    },
    async clear() {
      if (state.busy || state.loading) return;
      if (!state.confirmClear) { set({ confirmClear: true, notice: '', error: '' }); return; }
      set({ busy: 'clear', error: '', notice: '' });
      try {
        beforeClear();
        const history = await api('history/clear', {});
        set({ history, confirmClear: false, notice: '本地记录已清空，当前页面已显示的译文保留。' });
      } catch (error) { set({ error: `记录清空失败：${error.message ?? error}`, confirmClear: false }); }
      finally { set({ busy: '' }); }
    },
    cancelClear: () => set({ confirmClear: false }),
    async export() {
      if (state.busy || state.loading) return;
      set({ busy: 'export', error: '', notice: '' });
      try {
        const history = await api('history');
        download(history);
        set({ history, notice: `已导出 ${history.records.length} 条本地记录。` });
      } catch (error) { set({ error: `记录导出失败：${error.message ?? error}` }); }
      finally { set({ busy: '' }); }
    },
  };
}

function serviceSummary(health, models) {
  if (!health) return { service: '尚未读取', model: '尚未读取' };
  const status = health.status ?? models?.status ?? {};
  const current = status.model_id ?? status.modelId ?? status.model ?? status.current_model ?? models?.current;
  const model = typeof current === 'string' ? current : current?.name ?? current?.id;
  return { service: health.ok ? (health.modelReady || status.ready ? '本地服务就绪' : '桥接已连接，模型按需启动') : '本地服务不可用', model: model ?? (health.modelReady ? '本地模型运行中' : '尚未启动') };
}

function recentRecords(records) {
  const time = (record) => typeof record.created_at === 'number' ? record.created_at : Date.parse(record.created_at) || 0;
  return [...records].sort((left, right) => time(right) - time(left));
}

function recordTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleString('zh-CN', { hour12: false });
}

function settingsDirty(draft, saved) {
  return ['enabled', 'language', 'clearWriting', 'saveHistory', 'hideOriginal'].some((key) => draft[key] !== saved[key]);
}

function nextSettingsTab(key, current) {
  if (key === 'Home') return 'reading';
  if (key === 'End') return 'records';
  if (key === 'ArrowLeft' || key === 'ArrowRight') return current === 'reading' ? 'records' : 'reading';
  return null;
}

function trapDialogKey(event, root, close, activeElement = document.activeElement) {
  if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
  if (event.key !== 'Tab' || !root) return;
  const focusable = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [role=tabpanel]')]
    .filter((element) => element.tabIndex >= 0 && !element.closest('[hidden]') && element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && (activeElement === first || !root.contains(activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (activeElement === last || !root.contains(activeElement))) { event.preventDefault(); first.focus(); }
}

function createSettingsControls(React, controller) {
  const h = React.createElement;
  const mark = (className = '') => h('span', { className: `plainspeak-mark ${className}`, 'aria-hidden': true });
  return function SettingsControls() {
    const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const dialog = React.useRef(null);
    const trigger = React.useRef(null);
    React.useEffect(() => {
      if (!state.open) return;
      dialog.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus();
      return () => trigger.current?.focus();
    }, [state.open]);
    const blocked = Boolean(state.busy) || state.loading;
    const dirty = settingsDirty(state.draft, state.saved);
    const summary = serviceSummary(state.health, state.models);
    const records = state.history?.records ?? [];
    const count = state.history?.count ?? records.length;
    const checkbox = (key, text, help) => h('label', { className: 'plainspeak-setting-row', key },
      h('span', { className: 'plainspeak-setting-copy' }, h('span', { className: 'plainspeak-setting-title' }, text), h('small', {}, help)),
      h('input', { className: 'plainspeak-switch', type: 'checkbox', role: 'switch', checked: state.draft[key], disabled: blocked,
        onChange: (event) => controller.change(key, event.target.checked) }));
    function tabButton(tab, label) {
      return h('button', { type: 'button', role: 'tab', id: `plainspeak-tab-${tab}`, 'data-tab': tab,
        'aria-selected': state.tab === tab, 'aria-controls': `plainspeak-panel-${tab}`, tabIndex: state.tab === tab ? 0 : -1,
        onClick: () => controller.selectTab(tab), onKeyDown: (event) => {
          const next = nextSettingsTab(event.key, tab);
          if (!next) return;
          event.preventDefault(); controller.selectTab(next);
          dialog.current?.querySelector(`[role="tab"][data-tab="${next}"]`)?.focus();
        } }, label);
    }
    return h('div', { className: 'plainspeak-controls' },
      h('button', { ref: trigger, type: 'button', className: 'plainspeak-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': state.open,
        onClick: () => controller.open() }, mark(), h('span', {}, 'PlainSpeak 设置'),
        h('span', { className: 'plainspeak-status-dot', 'data-enabled': String(state.saved.enabled), 'aria-hidden': true })),
      state.error && !state.open && h('span', { role: 'status', className: 'plainspeak-control-error' }, '设置读取失败'),
      state.open && h('div', { className: 'plainspeak-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget) controller.close(); } },
        h('section', { className: 'plainspeak-panel', ref: dialog, role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'plainspeak-settings-title',
          onKeyDown: (event) => trapDialogKey(event, dialog.current, controller.close) },
          h('header', { className: 'plainspeak-brand-header' },
            h('div', { className: 'plainspeak-brand' }, mark('plainspeak-brand-mark'), h('div', {},
              h('h2', { id: 'plainspeak-settings-title' }, 'PlainSpeak', h('span', { className: 'plainspeak-sr-only' }, ' 设置')),
              h('p', {}, '让回答更好读'))),
            h('button', { className: 'plainspeak-close', type: 'button', disabled: Boolean(state.busy), onClick: controller.close, 'aria-label': '关闭 PlainSpeak 设置' }, '×')),
          h('nav', { className: 'plainspeak-tabs', role: 'tablist', 'aria-label': 'PlainSpeak 设置分类' }, tabButton('reading', '阅读设置'), tabButton('records', '本地记录')),
          h('div', { className: 'plainspeak-panel-body', 'aria-busy': blocked },
            state.loading && h('p', { role: 'status', className: 'plainspeak-inline-notice' }, '正在读取本地设置…'),
            state.error && h('p', { role: 'alert', className: 'plainspeak-error plainspeak-inline-notice' }, state.error),
            state.notice && h('p', { role: 'status', className: 'plainspeak-notice plainspeak-inline-notice' }, state.notice),
            h('div', { id: 'plainspeak-panel-reading', role: 'tabpanel', 'aria-labelledby': 'plainspeak-tab-reading', hidden: state.tab !== 'reading', tabIndex: 0 },
              h('fieldset', { disabled: blocked, className: 'plainspeak-settings-list' }, h('legend', { className: 'plainspeak-sr-only' }, '阅读设置'),
                checkbox('enabled', '自动翻译助手正文', '段落上下对照，表格整张切换。相同内容只显示一次。'),
                h('label', { className: 'plainspeak-setting-row plainspeak-language-row' },
                  h('span', { className: 'plainspeak-setting-copy' }, h('span', { className: 'plainspeak-setting-title' }, '译文语言'), h('small', {}, '逐段显示，跟随回复更新。')),
                  h('select', { value: state.draft.language, onChange: (event) => controller.change('language', event.target.value) }, ...LANGUAGE_OPTIONS.map(([value, title]) => h('option', { key: value, value }, title)))),
                checkbox('hideOriginal', '隐藏原文', '译文完成后收起原文；生成中或失败时继续显示。'),
                checkbox('clearWriting', '中文清晰表达', '直接回答、使用常用词；从下一次回复生效。'),
                checkbox('saveHistory', '保存并复用本地记录', '译文留在此设备，最多保留 1000 条。')),
              h('section', { className: 'plainspeak-service', 'aria-label': '本地服务状态' },
                h('div', { className: 'plainspeak-service-heading' }, h('span', { className: 'plainspeak-status-dot', 'data-enabled': String(Boolean(state.health?.ok)), 'aria-hidden': true }), h('h3', {}, summary.service)),
                h('p', { className: 'plainspeak-model' }, `模型：${summary.model}`),
                h('details', { className: 'plainspeak-storage-path' }, h('summary', {}, '记录保存位置'), h('p', {}, state.history?.path || '尚未读取')))),
            h('div', { id: 'plainspeak-panel-records', role: 'tabpanel', 'aria-labelledby': 'plainspeak-tab-records', hidden: state.tab !== 'records', tabIndex: 0 },
              h('div', { className: 'plainspeak-record-heading' }, h('div', {}, h('h3', {}, '本地翻译记录'), h('p', {}, `${count} 条，最多保留 ${state.history?.limit ?? 1000} 条`)),
                h('button', { type: 'button', className: 'plainspeak-text-button', disabled: blocked, onClick: controller.refresh }, '刷新')),
              h('div', { className: 'plainspeak-records' }, records.length ? recentRecords(records).map((record, index) => h('details', { className: 'plainspeak-record', key: record.id ?? index },
                h('summary', {}, h('span', { className: 'plainspeak-record-top' }, h('time', { dateTime: record.created_at }, recordTime(record.created_at)),
                  h('span', { className: 'plainspeak-language-label' }, LANGUAGE_OPTIONS.find(([code]) => code === record.language)?.[1] ?? record.language ?? '')), h('span', { className: 'plainspeak-record-preview' }, (record.source ?? '').slice(0, 90))),
                h('div', { className: 'plainspeak-record-content' },
                  h('p', { className: 'plainspeak-record-meta' }, `模型：${record.model ?? '未记录'}；中转语言：${record.pivot ?? '默认'}`),
                  Number(record.report?.retained_chunks) > 0 && h('p', {}, `部分保留原文：${record.report.retained_chunks} 段`),
                  h('h4', {}, '原文'), h('pre', {}, record.source ?? ''), h('h4', {}, '译文'), h('pre', { className: 'plainspeak-record-translation' }, record.text ?? ''))))
                : h('div', { className: 'plainspeak-empty' }, mark('plainspeak-empty-mark'), h('h3', {}, '还没有翻译记录'), h('p', {}, '开启自动翻译后，回复中的译文会保存在这里。'))),
              h('div', { className: 'plainspeak-record-actions' },
                h('button', { type: 'button', className: 'plainspeak-secondary-button', disabled: blocked || !count, onClick: controller.export }, state.busy === 'export' ? '正在导出…' : '导出全部 JSON'),
                h('button', { type: 'button', className: 'plainspeak-clear-button', disabled: blocked || !count, onClick: controller.clear }, state.busy === 'clear' ? '正在清空…' : state.confirmClear ? '确认清空全部本地记录' : '清空记录'),
                state.confirmClear && h('button', { type: 'button', className: 'plainspeak-text-button', disabled: blocked, onClick: controller.cancelClear }, '取消')),
              state.confirmClear && h('p', { role: 'alert', className: 'plainspeak-clear-notice' }, '将删除此设备保存的全部翻译记录。再次点击确认清空。'))),
          h('footer', { className: 'plainspeak-footer' },
            h('span', { className: 'plainspeak-save-state', role: 'status', 'data-dirty': String(dirty) }, state.loading ? '正在读取…' : dirty ? '有未保存的更改' : state.error ? '请检查上方提示' : '设置已保存到此设备'),
            h('button', { type: 'button', className: 'plainspeak-primary-button', disabled: blocked || !dirty, onClick: controller.save }, state.busy === 'save' ? '正在保存…' : '保存设置')))));
  };
}

const SETTINGS_CSS = `
.plainspeak-controls{--ps-surface:var(--dsw-alias-bg-base,#fff);--ps-ink:var(--dsw-alias-label-primary,#1B2E3D);--ps-muted:var(--dsw-alias-label-secondary,#617780);--ps-rule:var(--dsw-alias-border-l1,#DDE6EA);--ps-mist:var(--dsw-alias-markdown-code-block,#F3F7F8);--ps-accent:var(--dsw-alias-state-business-primary,#4176e6);--ps-accent-text:var(--ps-accent);--ps-soft:color-mix(in srgb,var(--ps-accent) 7%,var(--ps-surface));display:flex;align-items:center;gap:8px;font:13px/1.5 "Segoe UI","Microsoft YaHei UI",sans-serif}
.plainspeak-controls *{box-sizing:border-box}
.plainspeak-controls button,.plainspeak-controls select,.plainspeak-controls input{font:inherit}
.plainspeak-controls button{cursor:pointer}
.plainspeak-trigger{display:inline-flex;align-items:center;gap:8px;min-height:34px;padding:5px 10px;border:1px solid var(--ps-rule);border-radius:8px;background:var(--ps-surface);color:var(--ps-ink);white-space:nowrap}
.plainspeak-trigger:hover{background:var(--ps-soft);border-color:var(--ps-accent-text)}
.plainspeak-mark{position:relative;display:inline-block;flex:none;width:18px;height:18px;color:var(--ps-accent-text)}
.plainspeak-mark:before,.plainspeak-mark:after{content:"";position:absolute;left:0;height:2px;border-radius:1px;background:currentColor}
.plainspeak-mark:before{top:5px;width:100%}.plainspeak-mark:after{top:11px;width:70%;opacity:.65}
.plainspeak-status-dot{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--ps-muted);opacity:.55}
.plainspeak-status-dot[data-enabled=true]{background:var(--ps-accent-text);opacity:1}
.plainspeak-backdrop{position:fixed;inset:0;z-index:10000;background:#14293266;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto}
.plainspeak-panel{display:flex;flex-direction:column;width:min(560px,100%);max-height:min(760px,calc(100dvh - 48px));border:1px solid var(--ps-rule);border-radius:16px;background:var(--ps-surface);color:var(--ps-ink);box-shadow:0 16px 64px #07192330;font:14px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif;text-align:left;overflow:hidden}
.plainspeak-panel h2,.plainspeak-panel h3,.plainspeak-panel h4,.plainspeak-panel p{margin:0}
.plainspeak-panel button,.plainspeak-panel select{min-height:36px}
.plainspeak-brand-header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px 26px 20px;flex:none}
.plainspeak-brand{display:flex;align-items:center;gap:13px}
.plainspeak-brand-mark{width:28px;height:30px}.plainspeak-brand-mark:before{top:8px;height:3px}.plainspeak-brand-mark:after{top:18px;height:3px}
.plainspeak-brand h2{font-size:22px;font-weight:650;letter-spacing:-.6px;line-height:1.25}.plainspeak-brand p{margin-top:4px;color:var(--ps-muted);font-size:12px;letter-spacing:.2px}
.plainspeak-panel .plainspeak-close{align-self:flex-start;min-width:36px;min-height:36px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--ps-muted);font-size:25px;font-weight:300;line-height:1}
.plainspeak-close:hover{background:var(--ps-mist);color:var(--ps-ink)}
.plainspeak-tabs{display:flex;gap:24px;flex:none;padding:0 26px;border-bottom:1px solid var(--ps-rule)}
.plainspeak-tabs [role=tab]{position:relative;min-height:43px;padding:4px 0 11px;border:0;background:transparent;color:var(--ps-muted);font-weight:500}
.plainspeak-tabs [aria-selected=true]{color:var(--ps-accent-text);font-weight:650}
.plainspeak-tabs [aria-selected=true]:after{content:"";position:absolute;bottom:-1px;left:0;right:0;height:2px;background:var(--ps-accent-text)}
.plainspeak-panel-body{overflow:auto;overscroll-behavior:contain;min-height:0;padding:4px 26px 24px;scrollbar-gutter:stable}
.plainspeak-panel [hidden]{display:none!important}
.plainspeak-panel [role=tabpanel]{outline-offset:2px}
.plainspeak-settings-list{border:0;margin:0;padding:0;min-width:0}
.plainspeak-setting-row{display:flex;align-items:center;justify-content:space-between;gap:22px;min-height:83px;padding:16px 0;border-bottom:1px solid var(--ps-rule);cursor:pointer}
.plainspeak-setting-copy{display:flex;flex-direction:column;gap:5px;min-width:0}.plainspeak-setting-title{font-size:14px;font-weight:600;color:var(--ps-ink)}
.plainspeak-setting-copy small{color:var(--ps-muted);font-size:12px;line-height:1.6}
.plainspeak-panel .plainspeak-switch{appearance:none;position:relative;flex:none;min-height:0;width:36px;height:21px;margin:0;border:1px solid color-mix(in srgb,var(--ps-muted) 45%,var(--ps-rule));border-radius:12px;background:color-mix(in srgb,var(--ps-muted) 18%,var(--ps-surface));cursor:pointer}
.plainspeak-switch:before{content:"";position:absolute;top:3px;left:3px;width:13px;height:13px;border-radius:50%;background:var(--ps-muted);box-shadow:0 1px 2px #0002}
.plainspeak-panel .plainspeak-switch:checked{background:var(--ps-accent);border-color:var(--ps-accent)}.plainspeak-switch:checked:before{left:18px;background:#fff}
.plainspeak-language-row select{max-width:145px;flex:none;padding:6px 27px 6px 10px;border:1px solid var(--ps-rule);border-radius:7px;background:var(--ps-surface);color:var(--ps-ink)}
.plainspeak-service{margin-top:20px;padding-top:2px;color:var(--ps-muted);font-size:12px}
.plainspeak-service-heading{display:flex;align-items:center;gap:7px}.plainspeak-service-heading h3{font-size:12px;font-weight:500}.plainspeak-service .plainspeak-model{margin-top:5px;overflow-wrap:anywhere}
.plainspeak-storage-path{margin-top:9px}.plainspeak-storage-path summary{cursor:pointer;width:fit-content;font-size:12px}.plainspeak-storage-path p{margin-top:7px;padding-left:13px;overflow-wrap:anywhere;font-size:11px;line-height:1.6}
.plainspeak-inline-notice{margin-top:12px!important;padding:9px 11px;border-left:2px solid var(--ps-rule);font-size:12px;overflow-wrap:anywhere}
.plainspeak-notice{background:var(--ps-soft);color:var(--ps-accent-text)}.plainspeak-error,.plainspeak-control-error{color:var(--dsw-alias-state-error-primary,#a23b3b)}.plainspeak-error{background:var(--ps-mist)}
.plainspeak-record-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:19px 0 14px}.plainspeak-record-heading h3{font-size:14px;font-weight:600}.plainspeak-record-heading p{margin-top:4px;font-size:12px;color:var(--ps-muted)}
.plainspeak-panel .plainspeak-text-button{padding:5px 3px;border:0;background:transparent;color:var(--ps-accent-text);font-size:12px}
.plainspeak-records{border-top:1px solid var(--ps-rule)}
.plainspeak-record{border-bottom:1px solid var(--ps-rule)}.plainspeak-record>summary{position:relative;padding:13px 18px 13px 0;list-style:none;cursor:pointer}.plainspeak-record>summary::-webkit-details-marker{display:none}
.plainspeak-record>summary:after{content:"";position:absolute;right:3px;top:21px;width:6px;height:6px;border-right:1px solid var(--ps-muted);border-bottom:1px solid var(--ps-muted);transform:rotate(-45deg)}.plainspeak-record[open]>summary:after{transform:rotate(45deg)}
.plainspeak-record-top{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--ps-muted);font-size:11px}.plainspeak-language-label{color:var(--ps-accent-text);white-space:nowrap}
.plainspeak-record-preview{display:block;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ps-ink);font-size:13px}
.plainspeak-record-content{padding:0 0 15px}.plainspeak-record-meta{font-size:11px;color:var(--ps-muted);overflow-wrap:anywhere}.plainspeak-record-content h4{margin-top:12px;font-size:11px;font-weight:500;color:var(--ps-muted)}
.plainspeak-records pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 "Segoe UI","Microsoft YaHei UI",sans-serif;margin:4px 0 0;padding:0;color:var(--ps-ink)}.plainspeak-records .plainspeak-record-translation{color:var(--ps-muted)}
.plainspeak-record-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px}
.plainspeak-panel .plainspeak-secondary-button{padding:7px 11px;border:1px solid var(--ps-rule);border-radius:7px;background:var(--ps-surface);color:var(--ps-ink);font-size:12px}
.plainspeak-panel .plainspeak-clear-button{padding:7px 1px;border:0;background:transparent;color:var(--ps-muted);font-size:12px}.plainspeak-clear-button:hover{color:var(--dsw-alias-state-error-primary,#a23b3b)}
.plainspeak-clear-notice{margin-top:10px!important;color:var(--dsw-alias-state-error-primary,#a23b3b);font-size:12px}
.plainspeak-empty{padding:32px 10px;text-align:center;color:var(--ps-muted)}.plainspeak-empty-mark{width:25px;height:24px;opacity:.5}.plainspeak-empty h3{margin:9px 0 6px;font-size:14px;font-weight:500;color:var(--ps-ink)}.plainspeak-empty p{font-size:12px}
.plainspeak-footer{display:flex;justify-content:space-between;align-items:center;gap:16px;flex:none;padding:15px 26px;border-top:1px solid var(--ps-rule);background:var(--ps-surface)}
.plainspeak-save-state{color:var(--ps-muted);font-size:11px;line-height:1.5}.plainspeak-save-state[data-dirty=true]{color:var(--ps-accent-text)}
.plainspeak-panel .plainspeak-primary-button{padding:8px 17px;min-height:38px;border:1px solid var(--ps-accent);border-radius:7px;background:var(--ps-accent);color:#fff;font-size:13px;font-weight:600;white-space:nowrap}
.plainspeak-primary-button:not(:disabled):hover{background:color-mix(in srgb,var(--ps-accent) 85%,#000)}.plainspeak-panel button:disabled,.plainspeak-panel input:disabled,.plainspeak-panel select:disabled{opacity:.45;cursor:default}
.plainspeak-controls :is(button,select,input,summary,[role=tabpanel]):focus-visible{outline:2px solid var(--ps-accent-text);outline-offset:3px}
.plainspeak-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;clip-path:inset(50%);overflow:hidden;white-space:nowrap;border:0}
.plainspeak-translation{position:relative;color:var(--dsw-alias-label-secondary,#617780);font:.94em/1.8 "Segoe UI","Microsoft YaHei UI",sans-serif;margin:5px 0 17px;padding:0;border:0;white-space:normal;overflow-wrap:anywhere}
.plainspeak-translation[hidden],.plainspeak-table-controls[hidden]{display:none!important}
.plainspeak-translation:not([data-source-hidden=true]) .plainspeak-rendered-markdown>div,
.plainspeak-translation:not([data-source-hidden=true]) .plainspeak-rendered-markdown :is(p,li,h1,h2,h3,h4,h5,h6){color:inherit;font-size:inherit}
.plainspeak-table-controls{display:flex;justify-content:flex-end;gap:2px;margin:12px 0 3px;font:12px/1.5 "Segoe UI","Microsoft YaHei UI",sans-serif}
.plainspeak-table-controls button{padding:3px 10px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary,#617780);cursor:pointer;font:inherit}
.plainspeak-table-controls button[aria-pressed=true]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 9%,transparent);color:var(--dsw-alias-state-business-primary,#4176e6)}
.plainspeak-table-controls button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:2px}
.plainspeak-translation[data-status=error]{font-size:12px}.plainspeak-translation[data-status=retained],.plainspeak-translation[data-status=storage-error]{border-left-style:dashed}
[data-plainspeak-assistant] :is(p,h1,h2,h3,h4,h5,h6)[hidden]{display:none!important}
.plainspeak-translation[data-source-hidden=true]{color:var(--dsw-alias-label-primary-dimmed,#405862);margin-top:0;margin-bottom:14px;padding-left:0;border-left:0}
.plainspeak-translation[data-source-hidden=true]:before{display:none}
.plainspeak-hide-inline-source{font-size:0!important;line-height:0!important;color:transparent!important}
li.plainspeak-hide-inline-source::marker{font-size:16px;color:var(--dsw-alias-label-secondary,#617780)}
.plainspeak-hide-inline-source>:not([data-plainspeak-translation]){display:none!important}
.plainspeak-hide-inline-source>[data-plainspeak-translation]{font-size:15px;line-height:1.8;color:var(--dsw-alias-label-primary-dimmed,#405862)}
li.plainspeak-hide-inline-source>[data-plainspeak-translation],
li.plainspeak-hide-inline-source>[data-plainspeak-translation]>.plainspeak-rendered-markdown,
li.plainspeak-hide-inline-source>[data-plainspeak-translation]>.plainspeak-rendered-markdown>div,
li.plainspeak-hide-inline-source>[data-plainspeak-translation]>.plainspeak-rendered-markdown>div>p{display:inline;margin:0;padding:0;vertical-align:baseline}
.plainspeak-translation[data-source-kind=cell]{font-size:14px;line-height:1.65;margin:5px 0 0;padding-left:8px}
.plainspeak-translation[data-source-kind=cell][data-source-hidden=true]{margin:0;padding:0}
.plainspeak-rendered-markdown>div>:first-child{margin-top:0}.plainspeak-rendered-markdown>div>:last-child{margin-bottom:0}
.plainspeak-translation-notice{font-size:11px;line-height:1.6;margin:3px 0 6px;color:var(--dsw-alias-label-secondary,#617780)}
@media(max-width:520px){.plainspeak-backdrop{padding:12px;align-items:flex-end}.plainspeak-panel{width:100%;max-height:calc(100dvh - 24px);border-radius:14px}.plainspeak-brand-header{padding:20px 20px 17px}.plainspeak-tabs{padding:0 20px}.plainspeak-panel-body{padding:2px 20px 20px}.plainspeak-footer{padding:13px 20px}.plainspeak-setting-row{gap:14px;min-height:82px}.plainspeak-setting-copy small{max-width:30ch}.plainspeak-language-row select{max-width:120px}.plainspeak-trigger{min-height:36px;padding:5px 8px}.plainspeak-panel button{min-height:40px}}
@media(max-width:360px){.plainspeak-backdrop{padding:8px}.plainspeak-panel{max-height:calc(100dvh - 16px)}.plainspeak-brand-header,.plainspeak-footer{padding-left:16px;padding-right:16px}.plainspeak-tabs,.plainspeak-panel-body{padding-left:16px;padding-right:16px}.plainspeak-setting-copy small{font-size:11px}.plainspeak-record-actions{gap:9px}}
@media(prefers-reduced-motion:reduce){.plainspeak-controls *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;


function retryDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function retryBusy(operation, signal, { maxWaitMs = 30000, now = Date.now, sleep = retryDelay } = {}) {
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

function createClientPlugin(React, ReactDOM, primitives) {
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

return createClientPlugin(require("react"),require("react-dom"),require("@deepseek-ai/dsh-client-ui-primitives"));
}});
