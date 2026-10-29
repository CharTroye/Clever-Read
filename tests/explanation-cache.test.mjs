import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { explanationKey, validateBriefResult } from '../public/explanation-cache.mjs';
import { briefRequestOptions, createServer } from '../server.mjs';
import { readAnswerStream } from '../public/answer-stream.mjs';
import { conversationHistory } from '../public/reading-thread.mjs';

test('cached explanations cannot cross document, context, target, model or history boundaries', async () => {
  const input = { kind: 'brief', doc: { id: 'd', title: 'Physics' }, selected: { text: 'field', blockId: 'p1', page: 1 }, contexts: [{ id: 'p1', text: 'Electric field.' }], model: ['endpoint', 'model', 'profile'], depth: 'brief' };
  const key = await explanationKey(input);
  assert.equal(key, await explanationKey(structuredClone(input)));
  assert.equal(key, await explanationKey({ ...input, selected: { ...input.selected, image: 'not part of cache storage' } }));
  for (const change of [
    { doc: { ...input.doc, id: 'd2' } }, { contexts: [{ id: 'p1', text: 'A field of study.' }] },
    { selected: { ...input.selected, page: 2 } }, { model: ['endpoint', 'different model', 'profile'] },
    { kind: 'full' }, { history: [{ role: 'user', content: 'different question' }] }
  ]) assert.notEqual(key, await explanationKey({ ...input, ...change }));
});

test('brief validation limits output, filters sources and cannot masquerade as a full conversation turn', () => {
  const result = validateBriefResult(JSON.stringify({ brief: '释义'.repeat(300), context: '本文语境', sources: ['p1', 'invented'] }), [{ id: 'p1' }]);
  assert.equal(result.brief.length, 360); assert.equal(result.summary, result.brief); assert.equal(result.briefOnly, true);
  assert.deepEqual(result.sources, ['p1']);
  assert.deepEqual(conversationHistory({ id: 'a', docId: 'd', selected: { text: 'x' }, result }, []), []);
  const full = { id: 'b', docId: 'd', selected: { text: 'x' }, result: { summary: 'full', mode: 'model', cached: true } };
  assert.equal(JSON.parse(conversationHistory(full, [full])[1].content).cached, undefined);
  assert.throws(() => validateBriefResult('{"summary":"long but missing brief"}', []), /短释义/);
});

test('non-thinking extension is limited to the documented DeepSeek host and models', () => {
  assert.deepEqual(briefRequestOptions('https://api.deepseek.com/chat/completions', 'deepseek-flash'), { thinking: { type: 'disabled' } });
  assert.deepEqual(briefRequestOptions('https://api.deepseek.com/v1/chat/completions', 'deepseek-v4-pro'), { thinking: { type: 'disabled' } });
  assert.deepEqual(briefRequestOptions('https://example.com/chat/completions', 'deepseek-flash'), {});
  assert.deepEqual(briefRequestOptions('https://api.deepseek.com.example.com/chat/completions', 'deepseek-flash'), {});
  assert.deepEqual(briefRequestOptions('https://api.deepseek.com/chat/completions', 'unknown'), {});
});

test('short explanation route streams brief text without requiring a full summary', async t => {
  const provider = http.createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    assert.equal(body.stream, true); assert.equal(body.thinking, undefined);
    assert.match(body.messages[0].content, /40至100/);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const text of ['{"brief":"它表示', '当前语境中的向量。","title":"向量","sources":["p1","fake"]}']) res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
    res.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  const app = createServer(); provider.listen(0, '127.0.0.1'); app.listen(0, '127.0.0.1');
  await Promise.all([once(provider, 'listening'), once(app, 'listening')]);
  t.after(() => { provider.closeAllConnections(); app.closeAllConnections(); provider.close(); app.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const response = await fetch(base + '/api/answer', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: `http://127.0.0.1:${provider.address().port}`, model: 'qa', brief: true, stream: true, selected: { text: 'query' }, contexts: [{ id: 'p1', text: 'source' }] }) });
  let deltas = 0;
  const result = await readAnswerStream(response, () => deltas++);
  assert.ok(deltas >= 2); assert.equal(result.briefOnly, true); assert.deepEqual(result.sources, ['p1']);
});
