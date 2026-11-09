import { elementToMarkdown, technicalCellText } from './markdown.js';

function paragraphCopy(element) {
  const copy = element.cloneNode(true);
  for (const translation of copy.querySelectorAll('[data-plainspeak-translation]')) translation.remove();
  return copy;
}

export function paragraphText(element) {
  return elementToMarkdown(paragraphCopy(element));
}

export function paragraphCandidates(root) {
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

export function renderTranslation(output, translated, renderOutput) {
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

export function updateOriginalVisibility(element, output, hideOriginal, originallyHidden = false) {
  const hide = Boolean(hideOriginal) && output.dataset.duplicate !== 'true' && ['ready', 'storage-error'].includes(output.dataset.status);
  if (['LI', 'TD', 'TH'].includes(element.tagName)) element.classList.toggle('plainspeak-hide-inline-source', hide);
  else element.hidden = hide || originallyHidden;
  output.dataset.sourceHidden = String(hide);
}

// DOM belongs to the original renderer. We add disposable sibling nodes only;
// neither the conversation store nor the model's history is written here.
export function mountParagraphTranslations(root, options) {
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

