import test from 'node:test';
import assert from 'node:assert/strict';
import { retryBusy } from '../src/client.js';
import { renderTranslation } from '../src/paragraphs.js';

function failure(status, message) { return Object.assign(new Error(message), { status }); }

test('temporary busy replies retry with backoff and preserve the final report', async () => {
  const attempts = [failure(429, 'Translation is busy'), failure(503, 'Temporarily busy'), { text: '译文', report: { retained_chunks: 1 } }];
  let clock = 0;
  const waits = [];
  const result = await retryBusy(async () => {
    const next = attempts.shift();
    if (next instanceof Error) throw next;
    return next;
  }, undefined, { now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
  assert.deepEqual(waits, [600, 1200]);
  assert.equal(result.report.retained_chunks, 1);
});

test('busy retries stop at their deadline and abort immediately on cancellation', async () => {
  let clock = 0, attempts = 0;
  await assert.rejects(retryBusy(async () => { attempts++; throw failure(429, 'busy'); }, undefined,
    { maxWaitMs: 1800, now: () => clock, sleep: async (ms) => { clock += ms; } }), /busy/);
  assert.equal(clock, 1800);
  assert.equal(attempts, 2);
  const abort = new AbortController();
  attempts = 0;
  await assert.rejects(retryBusy(async () => { attempts++; throw failure(429, 'busy'); }, abort.signal,
    { sleep: async () => { abort.abort(); abort.signal.throwIfAborted(); } }), { name: 'AbortError' });
  assert.equal(attempts, 1);
});

test('permanent service errors and other status codes are never retried', async () => {
  for (const error of [failure(503, 'Model file is missing'), failure(502, 'busy'), failure(400, 'invalid input')]) {
    let attempts = 0;
    await assert.rejects(retryBusy(async () => { attempts++; throw error; }), (caught) => caught === error);
    assert.equal(attempts, 1);
  }
});

test('retained source is visibly marked while preserving output text', () => {
  const output = { textContent: '', dataset: {} };
  renderTranslation(output, { text: 'Some original source\n部分译文', report: { retained_chunks: 2 } });
  assert.equal(output.dataset.status, 'retained');
  assert.equal(output.dataset.retainedChunks, '2');
  assert.ok(output.textContent.startsWith('译文部分保留原文（2 段）\n'));
  assert.ok(output.textContent.endsWith('Some original source\n部分译文'));
  const clean = { textContent: '', dataset: {} };
  renderTranslation(clean, { text: '完整译文', report: { retained_chunks: 0 } });
  assert.equal(clean.dataset.status, 'ready');
  assert.equal(clean.textContent, '完整译文');
});
