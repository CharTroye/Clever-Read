import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDF_LIMITS, validateImportFile, outlineBatches, validateOutlineInput, validateOutlineResult, currentChapter, outlineTree, filterOutlineTree } from '../public/outline.mjs';
import { pdfBookmarks, pdfOutlineText } from '../public/documents.mjs';
import { OutlineSidebar } from '../public/outline-ui.mjs';
import { createServer } from '../server.mjs';

test('textbook PDF limits are independent of other file formats', () => {
  assert.doesNotThrow(() => validateImportFile({ size: 180 * 1024 * 1024 }, 'pdf'));
  assert.throws(() => validateImportFile({ size: PDF_LIMITS.bytes + 1 }, 'pdf'), /200 MB/);
  assert.throws(() => validateImportFile({ size: 31 * 1024 * 1024 }, 'pptx'), /30 MB/);
  const pages = Array.from({ length: 2000 }, (_, n) => ({ page: n + 1, text: 'x'.repeat(950) }));
  const batches = outlineBatches(pages);
  assert.equal(batches.flat().length, 2000);
  for (const samples of batches) assert.doesNotThrow(() => validateOutlineInput({ pages: 2000, samples }));
  assert.throws(() => validateOutlineInput({ pages: 2001, samples: [pages[0]] }), /页数/);
});

test('AI chapters require evidence on the actual PDF page and cannot use printed page numbers', () => {
  const samples = [{ page: 12, text: 'Chapter 1 Foundations\nIntroduction to reading.' }, { page: 42, text: '第二章 建模基础\n本章讨论模型。' }];
  const entries = validateOutlineResult(JSON.stringify({ entries: [
    { title: 'Chapter 1 Foundations', page: 12, level: 1, quote: 'Chapter 1 Foundations' },
    { title: '第二章 建模基础', page: 42, level: 2, quote: '第二章 建模基础' },
    { title: 'Wrong printed page', page: 1, level: 1, quote: 'Chapter 1 Foundations' },
    { title: '<script>invented</script>', page: 42, quote: 'no such evidence' }
  ] }), samples, 100);
  assert.deepEqual(entries.map(e => e.page), [12, 42]);
  assert.equal(currentChapter(entries, 43), entries[1].id);
  assert.equal(currentChapter(entries, 1), '');
  assert.throws(() => validateOutlineResult('{"entries":[{"title":"fake","page":42,"quote":"invented"}]}', samples, 100), /未能对应/);
  assert.throws(() => validateOutlineResult('{"entries":[', samples, 100), /不完整/);
  assert.throws(() => validateOutlineInput({ pages: 100, samples: [samples[0], samples[0]] }), /片段/);
});

test('native PDF bookmarks resolve named and explicit destinations, preserve hierarchy, skip invalid targets', async () => {
  const pdf = {
    numPages: 180,
    getOutline: async () => [{ title: '第一章', dest: 'intro', items: [{ title: '1.1 章节', dest: [3] }] }, { title: 'bad', dest: 'missing' }],
    getDestination: async name => name === 'intro' ? [{ num: 7, gen: 0 }] : null,
    getPageIndex: async () => 2
  };
  const result = await pdfBookmarks(pdf);
  assert.deepEqual(result.map(e => [e.title, e.page, e.level]), [['第一章', 3, 1], ['1.1 章节', 4, 2]]);
});

test('book-style chapters retain three levels; searching a subsection retains its ancestors', () => {
  const entries = [
    { id: '1', title: '第一章 基础', page: 1, level: 1 },
    { id: '2', title: '1.1 建模', page: 2, level: 2 },
    { id: '3', title: '1.1.1 参数选择', page: 3, level: 3 },
    { id: '4', title: '1.2 验证', page: 4, level: 2 },
    { id: '5', title: '第二章 推理', page: 7, level: 1 }
  ];
  const tree = outlineTree(entries); assert.equal(tree.length, 2);
  assert.equal(tree[0].children.length, 2); assert.equal(tree[0].children[0].children[0].id, '3');
  const filtered = filterOutlineTree(tree, '参数');
  assert.equal(filtered.length, 1); assert.equal(filtered[0].id, '1');
  assert.equal(filtered[0].children[0].id, '2'); assert.equal(filtered[0].children[0].children[0].id, '3');
  assert.equal(filterOutlineTree(tree, '基础')[0].children.length, 2);
  assert.equal(entries.length, 5);
});

test('textbook model samples retain internal section headings without sending entire pages', () => {
  const items = Array.from({ length: 40 }, (_, n) => ({ str: 'Normal body text with evidence and context. '.repeat(2), transform: [12, 0, 0, 12, 40, 700 - n * 18], height: 12, hasEOL: true }));
  items[20] = { ...items[20], str: '1.2.3 Model selection', height: 16 };
  const text = pdfOutlineText(items, 30);
  assert.ok(text.length < 400); assert.match(text, /1\.2\.3 Model selection/);
  assert.equal(pdfOutlineText([], 1), '');
});

function sidebarHarness(doc, request, connection = { model: 'test' }) {
  const writes = [];
  const sidebar = Object.assign(Object.create(OutlineSidebar.prototype), {
    getDocument: () => doc, getConnection: () => connection, jobs: new Map(),
    save: async state => writes.push(structuredClone(state)), request, render() {}, onError() {}
  });
  return { sidebar, writes };
}

test('directory generation persists once, re-opening reads the result without model calls', async () => {
  const doc = { id: 'book', type: 'pdf', pages: 180, outline: [{ id: 'native-1', title: 'Original bookmark', page: 1, level: 1 }], outlinePages: [{ page: 1, text: 'Chapter 1 Basics' }] };
  let calls = 0;
  const { sidebar, writes } = sidebarHarness(doc, async () => { calls++; return { entries: [{ title: 'Chapter 1 Basics', page: 1, level: 1 }] }; });
  await sidebar.generate(doc);
  assert.equal(calls, 1); assert.equal(writes.at(-1).status, 'ready');
  const reopened = { ...doc, outlineState: structuredClone(writes.at(-1)) };
  const second = sidebarHarness(reopened, async () => { calls++; });
  assert.equal(second.sidebar.entries()[0].page, 1);
  assert.equal(calls, 1); assert.equal(second.writes.length, 0);
  await sidebar.showNative(); assert.equal(doc.outlineState.source, 'native');
  await sidebar.showNative(); assert.equal(doc.outlineState.source, 'llm');
  assert.equal(doc.outlineState.entries[0].title, 'Chapter 1 Basics');
  assert.equal(calls, 1);
});

test('failed and cancelled regeneration preserves the complete saved directory', async () => {
  for (const error of [new Error('Provider unavailable'), new DOMException('Stopped', 'AbortError')]) {
    const previous = { entries: [{ id: 'old', title: 'Saved', page: 10, level: 1 }], source: 'llm', status: 'ready' };
    const doc = { id: 'book', type: 'pdf', pages: 180, outlineState: previous, outlinePages: [{ page: 1, text: 'Chapter 1 Basics' }] };
    const { sidebar, writes } = sidebarHarness(doc, async () => { throw error; });
    await sidebar.generate(doc);
    assert.deepEqual(writes.at(-1).entries, previous.entries);
    assert.equal(writes.at(-1).status, 'error'); assert.equal(sidebar.jobs.size, 0);
  }
});

test('a scanned textbook with a text-only archive appendix makes no model requests', async () => {
  const original = [{ id: 'saved', title: 'Saved chapter', page: 25, level: 1 }];
  const doc = { id: 'scan-book', type: 'pdf', pages: 494, unreadablePages: 493, outline: original,
    outlinePages: [{ page: 494, text: 'Document generated as part of an archive collection.' }] };
  let calls = 0;
  const { sidebar, writes } = sidebarHarness(doc, async () => { calls++; return { entries: [] }; });
  await sidebar.generate(doc);
  assert.equal(calls, 0);
  assert.equal(writes.at(-1).status, 'error');
  assert.deepEqual(writes.at(-1).entries, original);
  assert.match(writes.at(-1).message, /494 页中仅 1 页/);
  assert.match(writes.at(-1).message, /OCR/);
});

test('outline API uses the saved model, validates page evidence and rejects other origins', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clever-outline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let received;
  const provider = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = { body: JSON.parse(Buffer.concat(chunks)), auth: req.headers.authorization };
    const input = JSON.parse(received.body.messages.at(-1).content);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ entries: [
      { title: 'Chapter 1 Basics', page: input.samples[0].page, level: 1, quote: 'Chapter 1 Basics' },
      { title: 'Invented', page: 99, quote: 'unverified' }
    ] }) } }] }));
  });
  const app = createServer({ runtimeDirectory: directory });
  provider.listen(0, '127.0.0.1'); app.listen(0, '127.0.0.1');
  await Promise.all([once(provider, 'listening'), once(app, 'listening')]);
  t.after(() => { provider.closeAllConnections(); app.closeAllConnections(); provider.close(); app.close(); });
  const base = `http://127.0.0.1:${app.address().port}`, headers = { Origin: base, 'Content-Type': 'application/json' };
  const saved = await (await fetch(base + '/api/vault', { method: 'POST', headers, body: JSON.stringify({ model: 'saved-test', endpoint: `http://127.0.0.1:${provider.address().port}/v1`, apiKey: 'disposable-outline-secret' }) })).json();
  const input = { profileId: saved.activeId, model: 'ignored-override', pages: 180, samples: [{ page: 12, text: 'Chapter 1 Basics\nSome text.' }] };
  const request = { method: 'POST', headers, body: JSON.stringify(input) };
  const response = await fetch(base + '/api/outline', request);
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).entries.map(e => e.page), [12]);
  assert.equal(received.body.model, 'saved-test'); assert.equal(received.auth, 'Bearer disposable-outline-secret');
  assert.match(received.body.messages[0].content, /物理页/);
  const denied = await fetch(base + '/api/outline', { ...request, headers: { ...headers, Origin: 'https://other.example' } });
  assert.equal(denied.status, 403);
});
