export const LANGUAGE_OPTIONS = [['zh-CN', '中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español']];

export function normalizeSettings(value, fallback = { enabled: false, language: 'zh-CN', clearWriting: true, saveHistory: true, hideOriginal: false }) {
  const source = value?.settings ?? value ?? {};
  return { enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
    language: LANGUAGE_OPTIONS.some(([code]) => code === source.language) ? source.language : fallback.language,
    clearWriting: typeof source.clearWriting === 'boolean' ? source.clearWriting : fallback.clearWriting,
    saveHistory: typeof source.saveHistory === 'boolean' ? source.saveHistory : fallback.saveHistory,
    hideOriginal: typeof source.hideOriginal === 'boolean' ? source.hideOriginal : fallback.hideOriginal ?? false };
}

export function historyExport(history, now = new Date()) {
  return JSON.stringify({ version: 1, exported_at: now.toISOString(), count: history.records.length,
    limit: history.limit ?? 1000, records: history.records }, null, 2);
}

export function downloadHistory(history, { documentRef = document, BlobCtor = Blob, urlApi = URL, defer = setTimeout } = {}) {
  const blob = new BlobCtor([historyExport(history)], { type: 'application/json;charset=utf-8' });
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = `plainspeak-records-${new Date().toISOString().slice(0, 10)}.json`;
  documentRef.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); defer(() => urlApi.revokeObjectURL(url), 1000); }
}

export function createSettingsController(api, { getSettings, onSaved, beforeClear, download = downloadHistory }) {
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

export function serviceSummary(health, models) {
  if (!health) return { service: '尚未读取', model: '尚未读取' };
  const status = health.status ?? models?.status ?? {};
  const current = status.model_id ?? status.modelId ?? status.model ?? status.current_model ?? models?.current;
  const model = typeof current === 'string' ? current : current?.name ?? current?.id;
  return { service: health.ok ? (health.modelReady || status.ready ? '本地服务就绪' : '桥接已连接，模型按需启动') : '本地服务不可用', model: model ?? (health.modelReady ? '本地模型运行中' : '尚未启动') };
}

export function recentRecords(records) {
  const time = (record) => typeof record.created_at === 'number' ? record.created_at : Date.parse(record.created_at) || 0;
  return [...records].sort((left, right) => time(right) - time(left));
}

function recordTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleString('zh-CN', { hour12: false });
}

export function settingsDirty(draft, saved) {
  return ['enabled', 'language', 'clearWriting', 'saveHistory', 'hideOriginal'].some((key) => draft[key] !== saved[key]);
}

export function nextSettingsTab(key, current) {
  if (key === 'Home') return 'reading';
  if (key === 'End') return 'records';
  if (key === 'ArrowLeft' || key === 'ArrowRight') return current === 'reading' ? 'records' : 'reading';
  return null;
}

export function trapDialogKey(event, root, close, activeElement = document.activeElement) {
  if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
  if (event.key !== 'Tab' || !root) return;
  const focusable = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [role=tabpanel]')]
    .filter((element) => element.tabIndex >= 0 && !element.closest('[hidden]') && element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && (activeElement === first || !root.contains(activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (activeElement === last || !root.contains(activeElement))) { event.preventDefault(); first.focus(); }
}

export function createSettingsControls(React, controller) {
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

export const SETTINGS_CSS = `
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
