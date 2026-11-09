import test from 'node:test';
import assert from 'node:assert/strict';
import { elementToMarkdown, nativeTranslationContent } from '../src/markdown.js';
import { paragraphCandidates, paragraphText, renderTranslation } from '../src/paragraphs.js';

// Minimal inert DOM fixture: no HTML parsing or execution. Real Harness renders
// Markdown/KaTeX; these tests exercise preservation of the resulting node tree.
function node(tag, children = [], attributes = {}) {
  const element = { nodeType: 1, tagName: tag.toUpperCase(), childNodes: children, attributes, dataset: {}, parentElement: null,
    get textContent() { return this.childNodes.map((child) => child.textContent).join(''); },
    hasAttribute(name) { return name in this.attributes; }, getAttribute(name) { return this.attributes[name] ?? null; },
    classList: { contains: (name) => (attributes.class ?? '').split(' ').includes(name) },
    querySelectorAll(selector) {
      const result = [];
      function visit(parent) { for (const child of parent.childNodes ?? []) { if (matches(child, selector)) result.push(child); visit(child); } }
      visit(this); return result;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    closest(selector) { for (let current = this; current; current = current.parentElement) if (matches(current, selector)) return current; return null; },
    cloneNode() { return node(this.tagName, this.childNodes.map((child) => child.nodeType === 3 ? text(child.textContent) : child.cloneNode()), { ...this.attributes }); },
    remove() { if (this.parentElement) this.parentElement.childNodes = this.parentElement.childNodes.filter((child) => child !== this); },
  };
  for (const child of children) child.parentElement = element;
  return element;
}
function text(value) { return { nodeType: 3, textContent: value }; }
function matches(element, selector) {
  if (element.nodeType !== 1) return false;
  return selector.split(',').some((part) => {
    const match = /^\s*([a-z0-9]+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?\s*$/i.exec(part);
    return match && (!match[1] || element.tagName === match[1].toUpperCase())
      && (!match[2] || (element.hasAttribute(match[2]) && (match[3] === undefined || element.getAttribute(match[2]) === match[3])));
  });
}

test('source Markdown retains emphasis, inline code, links and heading depth', () => {
  const paragraph = node('p', [text('Use '), node('strong', [text('bounded retries')]), text(' with '), node('em', [text('care')]), text(' and '),
    node('code', [text('retry_count')]), text('; '), node('a', [text('read docs')], { href: 'https://example.com/reference' }), text('.')]);
  assert.equal(paragraphText(paragraph), 'Use **bounded retries** with *care* and `retry_count`; [read docs](<https://example.com/reference>).');
  assert.equal(elementToMarkdown(node('h2', [node('strong', [text('Reading guide')])])), '## **Reading guide**');
  assert.equal(elementToMarkdown(node('p', [node('del', [text('old')]), text(' '), node('code', [text('x`y')])])), '~~old~~ ``x`y``');
});

test('KaTeX source is recovered once from its TeX annotation', () => {
  const formula = node('span', [node('math', [node('annotation', [text('x^2+y^2=1')], { encoding: 'application/x-tex' })]),
    node('span', [text('x2+y2=1')], { 'aria-hidden': 'true' })], { class: 'katex' });
  assert.equal(elementToMarkdown(node('p', [text('The formula is '), formula, text('.') ])), 'The formula is $x^2+y^2=1$.');
  assert.equal(elementToMarkdown(node('div', [node('span', [formula], { class: 'katex-display' })])), '$$\nx^2+y^2=1\n$$');
});

test('headings and natural table cells translate while technical values and complex cells stay intact', () => {
  const header = node('h1', [text('Configuration guide')]);
  const natural = node('td', [node('p', [text('Use '), node('strong', [text('safe defaults')]), text(' with '), node('code', [text('retry_count')])])]);
  const technical = node('td', [node('code', [text('/v1/models')])]);
  const complex = node('td', [node('ul', [node('li', [text('nested content')])])]);
  const table = node('table', [node('tr', [node('th', [text('Description')]), natural, technical, complex])]);
  const root = node('div', [header, table]);
  const candidates = paragraphCandidates(root);
  assert.ok(candidates.includes(header)); assert.ok(candidates.includes(natural));
  assert.ok(!candidates.includes(natural.childNodes[0]), 'the cell owns translation rather than its nested paragraph');
  assert.ok(!candidates.includes(technical)); assert.ok(!candidates.includes(complex));
  assert.equal(complex.dataset.plainspeakPreserved, 'complex-table-cell');
  assert.equal(table.childNodes[0].childNodes.length, 4, 'table row/column structure is unchanged');
});

test('unsafe link destinations and source controls are not reconstructed as active markup', () => {
  const paragraph = node('p', [node('a', [text('safe text')], { href: 'javascript:alert(1)' }), node('script', [text('bad()')]),
    node('button', [text('copy')]), node('div', [text('existing translation')], { 'data-plainspeak-translation': '' })]);
  assert.equal(elementToMarkdown(paragraph), 'safe text');
});

test('blocks with unsupported source media stay intact instead of hiding their media', () => {
  for (const media of ['img', 'picture', 'svg', 'video', 'audio', 'iframe', 'object', 'embed', 'canvas']) {
    for (const tag of ['p', 'li', 'h2', 'td', 'th']) {
      const source = node(tag, [text('Chart explanation '), node(media)]);
      const container = ['td', 'th'].includes(tag) ? node('table', [node('tr', [source])]) : source;
      assert.ok(!paragraphCandidates(node('div', [container])).includes(source), `${tag} with ${media} must retain its complete source`);
    }
  }
});

test('media inside an existing translation does not disqualify a plain source cell', () => {
  const source = node('td', [text('Plain source explanation'), node('div', [node('img')], { 'data-plainspeak-translation': '' })]);
  assert.ok(paragraphCandidates(node('div', [node('table', [node('tr', [source])])])).includes(source));
});

test('translated Markdown is delegated unchanged to the native renderer with report notices', () => {
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
  const MarkdownText = () => {};
  const translated = { text: '**加粗** 与 `code`，公式 $x^2=1$。', report: { retained_chunks: 1 }, storage_error: 'disk full' };
  const content = nativeTranslationContent(React, MarkdownText, translated);
  const native = content.children.find((child) => child?.type === MarkdownText);
  assert.equal(native.props.text, translated.text);
  assert.equal(native.props.streaming, false);
  assert.ok(content.children.some((child) => child?.children?.[0]?.includes?.('部分保留原文')));
  const output = { dataset: {}, textContent: '译文准备中…' };
  let delegated;
  renderTranslation(output, translated, (_target, value) => { delegated = value; });
  assert.equal(delegated, translated);
  assert.equal(output.textContent, '', 'placeholder is cleared for the React portal');
  assert.equal(output.dataset.status, 'retained');
});
