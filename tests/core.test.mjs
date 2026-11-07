import test from 'node:test';
import assert from 'node:assert/strict';
import { splitParagraphs, selectionAt, retrieveContext, validateModelResult, exportMarkdown, normalizeModelName } from '../public/core.mjs';
import { sampleDocument, localExplanation } from '../public/sample.mjs';

test('DeepSeek display names are normalized only for the official provider', () => {
  assert.equal(normalizeModelName(' DeepSeek-V4.1-Flash ', 'https://api.deepseek.com/chat/completions'), 'deepseek-flash');
  assert.equal(normalizeModelName(' DeepSeek-V4.1-Flash-1017 ', 'https://api.deepseek.com/chat/completions'), 'deepseek-flash');
  assert.equal(normalizeModelName('DeepSeek-V4-Pro', 'https://api.deepseek.com/v1/chat/completions'), 'deepseek-v4-pro');
  assert.equal(normalizeModelName('custom-model', 'https://api.deepseek.com/chat/completions'), 'custom-model');
  assert.equal(normalizeModelName('DeepSeek-V4.1-Flash', 'https://other.example/chat/completions'), 'DeepSeek-V4.1-Flash');
  assert.equal(normalizeModelName('deepseek-v4.1-flash-1017', 'https://other.example/chat/completions'), 'deepseek-v4.1-flash-1017');
});

test('long unpunctuated text is preserved in bounded blocks', () => {
  const text = 'a'.repeat(4001);
  const blocks = splitParagraphs(text);
  assert.equal(blocks.map(b => b.text).join(''), text);
  assert.ok(blocks.every(b => b.text.length <= 1400));
});

test('word and sentence selection preserves Chinese and sentence qualifiers', () => {
  const text = '我们假设样本独立同分布。结论可能成立。';
  const selected = selectionAt(text, 4, 'sentence');
  assert.equal(selected.text, '我们假设样本独立同分布。');
  assert.equal(selectionAt('An attention layer.', 7).text, 'attention');
  assert.equal(selectionAt('hello world', 5), null);
});

test('retrieval keeps neighboring context and distant definitions', () => {
  const doc = { blocks: Array.from({ length: 12 }, (_, i) => ({ id: 'p-' + i, text: i === 10 ? 'XYZ is defined as a measured signal.' : i === 2 ? 'Here we use XYZ.' : 'Other discussion.', section: '方法' })) };
  const contexts = retrieveContext(doc, { text: 'XYZ', blockId: 'p-2' });
  assert.deepEqual(contexts.map(c => c.id), ['p-1', 'p-2', 'p-3', 'p-10']);
});

test('multi-paragraph selections include their ending block; unreadable pages are excluded', () => {
  const doc = { blocks: [{ id: 'a', text: 'before' }, { id: 'b', text: 'first' }, { id: 'scan', text: 'OCR unavailable', unreadable: true }, { id: 'c', text: 'second' }, { id: 'd', text: 'after' }] };
  assert.deepEqual(retrieveContext(doc, { text: 'first second', blockId: 'b', endBlockId: 'c' }).map(c => c.id), ['a', 'b', 'c', 'd']);
});

test('invented and duplicate source ids cannot become clickable citations', () => {
  const result = validateModelResult(JSON.stringify({ title: '解释', summary: '回答', sources: ['real', 'invented', 'real', 17] }), [{ id: 'real' }]);
  assert.deepEqual(result.sources, ['real']);
  assert.throws(() => validateModelResult('{}', []), /有效/);
  assert.throws(() => validateModelResult('', []), /空回答/);
});

test('unstructured responses stay plain text and never fabricate sources', () => {
  const result = validateModelResult('<script>alert(1)</script>', [{ id: 'p-1' }]);
  assert.deepEqual(result.sources, []);
  assert.equal(result.summary, '<script>alert(1)</script>');
});

test('dedicated brief explanations are optional, bounded and distinct from the full answer', () => {
  const result = validateModelResult(JSON.stringify({ brief: '  两句内的简短定义。 ', summary: '更完整的解释。' }), []);
  assert.equal(result.brief, '两句内的简短定义。');
  assert.equal(result.summary, '更完整的解释。');
  assert.equal(validateModelResult(JSON.stringify({ summary: '旧版回答' }), []).brief, '');
  assert.equal(validateModelResult(JSON.stringify({ summary: '正文', brief: 'a'.repeat(500) }), []).brief.length, 360);
  const known = localExplanation(sampleDocument, { text: 'self-attention', blockId: 's-3' }, 'explain', []);
  assert.equal(known.localKind, 'dictionary');
  assert.ok(known.brief);
  assert.equal(localExplanation(sampleDocument, { text: '漏抗' }, 'explain', []).localKind, 'context');
});

test('supplementary knowledge is preserved and exported separately from document locations', () => {
  const contexts = [{ id: 'p-1', text: 'The device uses DMA to reduce CPU involvement.', page: 1 }];
  const background = 'DMA is a general computer architecture concept; the supplied paragraph does not define it.';
  const result = validateModelResult(JSON.stringify({ title: 'DMA', summary: 'Direct memory access, in the context of device transfers.', context: 'The paragraph describes its purpose.', background, limitations: '', sources: ['p-1', 'invented-definition'] }), contexts);
  assert.equal(result.background, background);
  assert.equal(result.limitations, '');
  assert.deepEqual(result.sources, ['p-1']);
  const record = { docId: 'doc', selected: { text: 'DMA' }, contexts, result };
  const markdown = exportMarkdown([record], [{ id: 'doc', title: 'Device transfers' }]);
  assert.ok(markdown.includes('知识补充（通用知识）\n\n' + background));
  assert.ok(markdown.indexOf(background) < markdown.indexOf('原文定位：'));
  assert.ok(!markdown.includes('invented-definition'));
  const legacy = validateModelResult(JSON.stringify({ summary: 'An older response without supplementary knowledge.' }), []);
  assert.equal(legacy.background, '');
});

test('offline free questions never masquerade as model answers', () => {
  const selected = { text: 'Self-attention', blockId: 's-3' };
  const contexts = retrieveContext(sampleDocument, selected);
  const result = localExplanation(sampleDocument, selected, 'ask', contexts);
  assert.equal(result.mode, 'local');
  assert.match(result.summary, /尚未接入模型/);
});

test('export contains the selected question, evidence and provenance', () => {
  const record = { selected: { text: 'Selected passage' }, docId: 'doc', question: 'Why?', result: { title: 'Example', summary: 'Summary', context: 'Context', logic: [], limitations: 'Verify', sources: ['p'], mode: 'model' }, contexts: [{ id: 'p', text: 'Evidence', page: 3 }] };
  const markdown = exportMarkdown([record], [{ id: 'doc', title: 'Paper' }]);
  for (const expected of ['Paper', 'Selected passage', 'Why?', 'Evidence', '第 3 页', '模型回答']) assert.ok(markdown.includes(expected));
});
