import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryName, categoryNames, filterDocuments, documentMeta, readingPosition } from '../public/library.mjs';

test('existing documents without categories remain in the library and uncategorized list', () => {
  const docs = [{ id: 'old', title: '旧论文', type: 'pdf', createdAt: 1 }, { id: 'new', title: '课件', category: '电机学', createdAt: 2 }];
  assert.deepEqual(filterDocuments(docs).map(doc => doc.id), ['new', 'old']);
  assert.deepEqual(filterDocuments(docs, 'uncategorized').map(doc => doc.id), ['old']);
  assert.deepEqual(docs.map(doc => doc.id), ['old', 'new']);
});
test('category filtering and normalized multilingual search work together', () => {
  const docs = [{ title: 'Ａttention 论文', category: '机器学习' }, { title: 'Attention', category: '电机学' }];
  assert.equal(filterDocuments(docs, 'category:机器学习', ' attention ').length, 1);
  assert.equal(filterDocuments(docs, 'all', '机器学习').length, 1);
  assert.equal(categoryName('  机器\u0000学习  '), '机器学习');
  assert.deepEqual(categoryNames(docs, ['机器学习', '', null]), ['电机学', '机器学习']);
});
test('recent reading follows the last visit rather than import time', () => {
  const docs = [{ id: 'new', title: 'A', createdAt: 50, lastOpenedAt: 10 }, { id: 'old', title: 'B', createdAt: 1, lastOpenedAt: 100 }, { id: 'unread', title: 'C', createdAt: 100 }];
  assert.deepEqual(filterDocuments(docs, 'recent').map(doc => doc.id), ['old', 'new']);
});
test('reading metadata distinguishes presentation slides, PDF pages, paragraphs and unread documents', () => {
  assert.equal(documentMeta({ type: 'pptx', pages: 190 }), 'PPTX · 190 张');
  assert.equal(documentMeta({ type: 'pdf', pages: 3 }), 'PDF · 3 页');
  assert.equal(readingPosition({ type: 'pptx', lastOpenedAt: 1, readingState: { position: { page: 43 } } }), '第 43 张');
  assert.equal(readingPosition({ type: 'pdf', lastOpenedAt: 1, readingState: { position: { page: 2 } } }), '第 2 页');
  assert.equal(readingPosition({ blocks: [{ id: 'a' }, { id: 'b' }], lastOpenedAt: 1, readingState: { position: { blockId: 'b' } } }), '第 2 段');
  assert.equal(readingPosition({ type: 'pdf' }), '未阅读');
});
