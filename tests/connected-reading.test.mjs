import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createServer } from '../server.mjs';
import { addQuote, combinedSelection, quotedContexts, sentenceSegments, validateTranslation, translationKey } from '../public/connected-reading.mjs';
import { readAnswerStream, partialAnswer } from '../public/answer-stream.mjs';
import { conversationHistory } from '../public/reading-thread.mjs';

test('multiple quotes retain location, deduplicate and prioritize each selected block', () => {
  const blocks = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, text: `paragraph ${i}`, page: i + 1 }));
  const quotes = [blocks[0], blocks[8], blocks[14]].reduce((q, b) => addQuote(q, { text: b.text, blockId: b.id, page: b.page }), []);
  assert.equal(addQuote(quotes, quotes[0]).length, 3);
  const selected = combinedSelection(quotes);
  assert.match(selected.text, /引用 3/); assert.equal(selected.quotes[2].page, 15);
  const contexts = quotedContexts({ blocks }, selected);
  for (const q of quotes) assert.ok(contexts.some(c => c.id === q.blockId));
  assert.throws(() => addQuote([...quotes, { text: 'fourth' }], { text: 'fifth' }), /最多/);
  assert.throws(() => addQuote([{ text: 'a', includeImage: true }], { text: 'b', includeImage: true }), /1 张/);
});

test('translations validate every sentence ID and invalidate cache on source or model changes', () => {
  const block = { id: 'p1', text: 'A first sentence. A second sentence.' };
  const segments = sentenceSegments(block);
  assert.equal(segments.length, 2);
  const good = JSON.stringify({ segments: [...segments].reverse().map(s => ({ id: s.id, text: '译文' })) });
  assert.deepEqual(validateTranslation(good, segments).map(s => s.id), segments.map(s => s.id));
  for (const raw of ['{}', '{"segments":[]}', JSON.stringify({ segments: [{ id: 'invented', text: 'x' }] })]) assert.throws(() => validateTranslation(raw, segments));
  assert.notEqual(translationKey('d', block, 'zh', 'a'), translationKey('d', { ...block, text: 'Changed' }, 'zh', 'a'));
  assert.notEqual(translationKey('d', block, 'zh', 'a'), translationKey('d', block, 'zh', 'b'));
});

test('partial structured text decodes escapes without showing JSON scaffolding', () => {
  assert.equal(partialAnswer('{"summary":"中文\\n\\u4f60').summary, '中文\n你');
  assert.equal(partialAnswer('{"summary":"unfinished\\u4f').summary, 'unfinished');
  assert.equal(partialAnswer('{"title":"T","summary":"a \\"quote\\"').summary, 'a "quote"');
  assert.equal(partialAnswer('{"title":"T"').summary, '');
});

test('client stream preserves UTF-8 deltas and requires an explicit completion', async () => {
  const text = [{ type: 'delta', text: '中文' }, { type: 'complete', result: { summary: '完成' } }].map(JSON.stringify).join('\r\n');
  const bytes = new TextEncoder().encode(text);
  const response = new Response(new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i++) c.enqueue(bytes.slice(i, i + 1)); c.close(); } }));
  let output = '';
  assert.equal((await readAnswerStream(response, d => output += d)).summary, '完成'); assert.equal(output, '中文');
  await assert.rejects(readAnswerStream(new Response('{"type":"delta","text":"partial"}\n')), /连接中断/);
  await assert.rejects(readAnswerStream(new Response('{"type":"error","error":"provider failed"}\n')), /provider failed/);
});

test('interrupted model answers stay visible but cannot become complete reasoning in model history', () => {
  const a = { id: 'a', docId: 'd', selected: { text: 'x' }, result: { mode: 'model', summary: 'incomplete' }, status: 'stopped' };
  assert.deepEqual(conversationHistory(a, [a]), []);
});

async function listen(t, server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('proxy relays actual model deltas, filters citations and distinguishes truncated responses', async t => {
  const upstream = await listen(t, http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body); assert.equal(input.stream, true);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = value => res.write('data: ' + JSON.stringify(value) + '\r\n\r\n');
    const content = JSON.stringify({ summary: '真实增量中文', sources: ['p1', 'invented'] });
    for (const char of content) send({ choices: [{ delta: { content: char } }] });
    if (input.model !== 'drop') send({ choices: [{ delta: {}, finish_reason: input.model === 'limit' ? 'length' : 'stop' }] });
    res.end('data: [DONE]\n\n');
  }));
  const app = await listen(t, createServer());
  const post = model => fetch(app + '/api/answer', { method: 'POST', headers: { Origin: app, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: upstream + '/v1', model, stream: true, selected: { text: 'x' }, contexts: [{ id: 'p1', text: 'evidence' }] }) });
  let raw = '';
  const result = await readAnswerStream(await post('good'), delta => raw += delta);
  assert.match(raw, /真实增量/); assert.deepEqual(result.sources, ['p1']);
  await assert.rejects(readAnswerStream(await post('drop')), /连接中断/);
  await assert.rejects(readAnswerStream(await post('limit')), /长度上限/);
});

test('translation route uses the active connection, validates mappings and rejects foreign origins', async t => {
  const upstream = await listen(t, http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body), user = JSON.parse(input.messages.at(-1).content);
    assert.equal(input.stream, false); assert.equal(user.target, '简体中文');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ segments: user.segments.map(s => ({ id: s.id, text: '译文' })) }) } }] }));
  }));
  const app = await listen(t, createServer());
  const options = { method: 'POST', headers: { Origin: app, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: upstream + '/v1', model: 'test', target: 'zh', segments: [{ id: 'p1:s1', blockId: 'p1', text: 'Some text.' }] }) };
  const response = await fetch(app + '/api/translate', options);
  assert.equal(response.status, 200); assert.equal((await response.json()).result[0].id, 'p1:s1');
  assert.equal((await fetch(app + '/api/translate', { ...options, headers: { Origin: 'https://other.example' } })).status, 403);
});

test('stopping a client stream closes the upstream generation connection', async t => {
  let signalClosed;
  const closed = new Promise(resolve => { signalClosed = resolve; });
  const upstream = await listen(t, http.createServer((req, res) => {
    req.resume(); res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
    res.on('close', signalClosed);
  }));
  const app = await listen(t, createServer()), controller = new AbortController();
  const response = await fetch(app + '/api/answer', { method: 'POST', signal: controller.signal, headers: { Origin: app, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: upstream + '/v1', model: 'test', stream: true, selected: { text: 'x' } }) });
  const reader = response.body.getReader();
  await reader.read(); controller.abort();
  let timer;
  try { await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('upstream stayed open')), 2000); })]); }
  finally { clearTimeout(timer); reader.releaseLock(); }
});
