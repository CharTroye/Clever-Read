import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createServer, validateEndpoint, formatProviderError } from '../server.mjs';

test('endpoint validation permits HTTPS and local models only', () => {
  assert.equal(validateEndpoint('https://example.com/v1/chat/completions'), 'https://example.com/v1/chat/completions');
  assert.equal(validateEndpoint('http://127.0.0.1:9999/v1/chat/completions'), 'http://127.0.0.1:9999/v1/chat/completions');
  assert.equal(validateEndpoint('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
  assert.equal(validateEndpoint('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(validateEndpoint('https://api.deepseek.com/chat/completions/'), 'https://api.deepseek.com/chat/completions');
  assert.equal(validateEndpoint('https://api.openai.com'), 'https://api.openai.com/v1/chat/completions');
  for (const url of ['http://example.com/v1/chat/completions', 'file:///tmp/key', 'https://example.com/v1/chat/completions?key=secret', 'https://example.com/v1/models']) assert.throws(() => validateEndpoint(url));
});

test('provider errors identify invalid requests, protect keys and tolerate missing details', () => {
  const key = 'test-secret-key';
  const error = formatProviderError(400, { error: { message: `Model Not Exist; token=${key}; Bearer ${key}; sk-another-secret` } }, key);
  assert.match(error, /HTTP 400/); assert.match(error, /Model Not Exist/);
  assert.match(error, /模型名称/); assert.doesNotMatch(error, /稍后重试/);
  assert.ok(!error.includes(key)); assert.ok(!error.includes('sk-another-secret'));
  assert.match(formatProviderError(402, null), /余额不足/);
  assert.match(formatProviderError(422, { message: 'Invalid messages' }), /Invalid messages/);
  assert.match(formatProviderError(503, null), /HTTP 503/);
  assert.ok(formatProviderError(400, { error: { message: 'x'.repeat(10_000) } }).length < 700);
});

test('local proxy relays selected context, filters citations and rejects other origins', async t => {
  let requestBody;
  const provider = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requestBody = JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: '联调回执', summary: '测试回答', sources: ['p-1', 'fake'] }) } }] }));
  });
  const app = createServer();
  provider.listen(0, '127.0.0.1'); app.listen(0, '127.0.0.1');
  await Promise.all([once(provider, 'listening'), once(app, 'listening')]);
  t.after(() => { provider.closeAllConnections(); app.closeAllConnections(); provider.close(); app.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const body = JSON.stringify({ endpoint: `http://127.0.0.1:${provider.address().port}/v1/chat/completions`, model: 'test-model', selected: { text: 'selected passage' }, contexts: [{ id: 'p-1', text: 'The evidence.', page: 3 }], history: [{ role: 'user', content: 'Previous question' }], action: 'ask', question: 'Why?', depth: '专业' });
  const rejected = await fetch(base + '/api/answer', { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body });
  assert.equal(rejected.status, 403);
  const response = await fetch(base + '/api/answer', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.result.sources, ['p-1']);
  const user = JSON.parse(requestBody.messages.at(-1).content);
  assert.equal(user.selection, 'selected passage'); assert.equal(user.question, 'Why?'); assert.equal(user.sourceFragments[0].page, 3);
  assert.equal(requestBody.messages[1].content, 'Previous question');
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.app, 'clever-read');
  const page = await fetch(base + '/'); assert.equal(page.status, 200); assert.match(await page.text(), /Clever Read/);
});

test('proxy surfaces provider 400 details without echoing keys and handles non-JSON errors', async t => {
  const received = [];
  const provider = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());
    received.push({ path: req.url, input });
    if (input.model === 'html-error') { res.writeHead(502, { 'Content-Type': 'text/html' }); res.end('<html>Proxy error page</html>'); return; }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Model Not Exist: display name; key=test-secret-key', code: 'invalid_request_error' } }));
  });
  const app = createServer();
  provider.listen(0, '127.0.0.1'); app.listen(0, '127.0.0.1');
  await Promise.all([once(provider, 'listening'), once(app, 'listening')]);
  t.after(() => { provider.closeAllConnections(); app.closeAllConnections(); provider.close(); app.close(); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const input = { endpoint: `http://127.0.0.1:${provider.address().port}/v1`, model: 'display-name', apiKey: 'test-secret-key', selected: { text: '这句话为什么成立？' }, action: 'logic' };
  const options = { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' } };
  const response = await fetch(base + '/api/answer', { ...options, body: JSON.stringify(input) });
  assert.equal(response.status, 502);
  const error = (await response.json()).error;
  assert.match(error, /HTTP 400/); assert.match(error, /Model Not Exist/); assert.ok(!error.includes(input.apiKey));
  assert.equal(received[0].path, '/v1/chat/completions');
  assert.equal(JSON.parse(received[0].input.messages.at(-1).content).task, 'logic');
  const html = await fetch(base + '/api/answer', { ...options, body: JSON.stringify({ ...input, model: 'html-error' }) });
  const htmlError = (await html.json()).error;
  assert.match(htmlError, /HTTP 502/); assert.doesNotMatch(htmlError, /html|Proxy error page/);
});
