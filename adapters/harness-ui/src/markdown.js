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

export function elementToMarkdown(element) {
  const text = (element.childNodes?.length ? [...element.childNodes].map(inlineMarkdown).join('') : escapeMarkdown(element.textContent ?? '')).trim();
  const heading = /^H([1-6])$/.exec(element.tagName ?? '');
  return heading ? `${'#'.repeat(Number(heading[1]))} ${text}` : text;
}

export function technicalCellText(value) {
  return /^(?:https?:\/\/\S+|[+-]?\d+(?:[.,]\d+)*(?:%|ms|s|px)?|[A-Z][A-Z0-9_-]+|[\w.-]*[_/:=\\][\w./:=\\-]*)$/.test(value.trim());
}

export function nativeTranslationContent(React, MarkdownText, translated) {
  const h = React.createElement;
  const retained = Number(translated.report?.retained_chunks);
  return h('div', { className: 'plainspeak-rendered-markdown' },
    retained > 0 && h('p', { className: 'plainspeak-translation-notice' }, `译文部分保留原文（${retained} 段）`),
    h(MarkdownText, { text: translated.text, streaming: false }),
    translated.storage_error && h('p', { className: 'plainspeak-translation-notice' }, `本地记录未保存：${String(translated.storage_error).slice(0, 200)}`));
}
