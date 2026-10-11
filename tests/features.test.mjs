import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ModelVault } from '../vault.mjs';
import { createServer, validateImage } from '../server.mjs';
import { clampRegion, textInRegion } from '../public/regions.mjs';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+jIAAAAASUVORK5CYII=';
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clever-features-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function listen(t, server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('rectangle selection clamps reverse drags and selects words, not entire overlapping text boxes', () => {
  assert.deepEqual(clampRegion({ x: 1.4, y: .8 }, { x: -.1, y: .2 }), { x: 0, y: .2, w: 1, h: .6000000000000001 });
  const slide = { words: [
    { text: 'First ', block: 0, x: 10, y: 10, w: 20, h: 10 },
    { text: 'second ', block: 0, x: 40, y: 10, w: 20, h: 10 },
    { text: '图像', block: 1, x: 40, y: 30, w: 20, h: 10 }
  ] };
  assert.equal(textInRegion(slide, { x: .35, y: .05, w: .3, h: .2 }, 100, 100), 'second');
  assert.equal(textInRegion(slide, { x: .35, y: 0, w: .3, h: .5 }, 100, 100), 'second\n图像');
  assert.equal(textInRegion(slide, { x: .7, y: .7, w: .2, h: .2 }, 100, 100), '');
});

test('model library encrypts keys, survives a new process instance and preserves keys during edits', async t => {
  const directory = await temporary(t);
  const vault = new ModelVault(directory);
  const first = await vault.save({ name: '文字阅读', model: 'text-test', endpoint: 'https://example.com/v1', apiKey: 'disposable-vault-secret' });
  const id = first.activeId;
  assert.equal(first.profiles[0].hasKey, true);
  assert.ok(!JSON.stringify(first).includes('disposable-vault-secret'));
  const encrypted = await readFile(path.join(directory, 'model-vault.json'), 'utf8');
  assert.ok(!encrypted.includes('disposable-vault-secret'));
  if (process.platform === 'win32') assert.equal(JSON.parse(encrypted).protection, 'windows-dpapi');
  const reopened = new ModelVault(directory);
  assert.equal((await reopened.list()).activeId, id);
  assert.equal((await reopened.credentials(id)).apiKey, 'disposable-vault-secret');
  await reopened.save({ id, name: '更新名称', model: 'new-model-id', endpoint: 'https://example.com/v1', apiKey: '', vision: true });
  assert.equal((await reopened.credentials(id)).apiKey, 'disposable-vault-secret');
  assert.equal((await reopened.credentials(id)).vision, true);
  await assert.rejects(reopened.save({ id, model: 'other', endpoint: 'https://other.example/v1' }), /重新输入/);
  await Promise.all(['second', 'third'].map(model => reopened.save({ model, endpoint: 'http://127.0.0.1:1234/v1', apiKey: '' })));
  assert.equal((await reopened.list()).profiles.length, 3);
  await reopened.activate(id);
  await reopened.remove(id);
  assert.equal((await new ModelVault(directory).list()).activeId, '');
  await writeFile(path.join(directory, 'model-vault.json'), '{corrupt');
  const corrupt = new ModelVault(directory);
  await assert.rejects(corrupt.save({ model: 'replacement', endpoint: 'http://localhost:1234/v1' }), /原库不会被覆盖/);
  assert.equal(await readFile(path.join(directory, 'model-vault.json'), 'utf8'), '{corrupt');
});

test('saved profile credentials stay server-side; vision requests carry only the selected crop', async t => {
  const directory = await temporary(t);
  let upstream;
  const provider = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    upstream = { authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks)) };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: '回执', summary: '已收到选区', sources: ['slide-1', 'invented'] }) } }] }));
  });
  const endpoint = await listen(t, provider);
  const app = createServer({ runtimeDirectory: directory });
  const base = await listen(t, app);
  const headers = { Origin: base, 'Content-Type': 'application/json', 'X-Clever-Test-Session': 'isolated' };
  const saved = await fetch(base + '/api/vault', { method: 'POST', headers, body: JSON.stringify({ name: '图片模型', endpoint, model: 'vision-test', apiKey: 'disposable-server-key', vision: true }) });
  assert.equal(saved.status, 200);
  const profile = await saved.json();
  assert.ok(!JSON.stringify(profile).includes('disposable-server-key'));
  const wrongOrigin = await fetch(base + '/api/vault', { headers: { Origin: 'https://other.example' } });
  assert.equal(wrongOrigin.status, 403);
  const main = await (await fetch(base + '/api/vault', { headers: { Origin: base } })).json();
  assert.equal(main.profiles.length, 0);
  const answer = { profileId: profile.activeId, model: 'client-must-not-override', endpoint: 'https://other.example', image, selected: { text: 'Selected slide area', page: 1 }, question: 'What is shown?', contexts: [{ id: 'slide-1', text: 'Slide text', page: 1 }] };
  const response = await fetch(base + '/api/answer', { method: 'POST', headers, body: JSON.stringify(answer) });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).result.sources, ['slide-1']);
  assert.equal(upstream.authorization, 'Bearer disposable-server-key');
  assert.equal(upstream.body.model, 'vision-test');
  const content = upstream.body.messages.at(-1).content;
  assert.equal(content.length, 2);
  assert.equal(content[1].image_url.url, image);
  assert.equal(JSON.parse(content[0].text).selection, 'Selected slide area');
  await fetch(base + '/api/vault', { method: 'POST', headers, body: JSON.stringify({ id: profile.activeId, endpoint, model: 'vision-test', vision: false }) });
  const blocked = await fetch(base + '/api/answer', { method: 'POST', headers, body: JSON.stringify(answer) });
  assert.equal(blocked.status, 400); assert.match((await blocked.json()).error, /图片输入/);
  const textOnly = await fetch(base + '/api/answer', { method: 'POST', headers, body: JSON.stringify({ ...answer, image: undefined }) });
  assert.equal(textOnly.status, 200);
  assert.equal(typeof upstream.body.messages.at(-1).content, 'string');
});

test('image input refuses remote URLs, SVG, disguised contents and overlarge crops', () => {
  assert.equal(validateImage(image), image);
  for (const invalid of ['https://example.com/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YWJj', image + '!', 'data:image/png;base64,' + 'A'.repeat(2_600_001)]) assert.throws(() => validateImage(invalid));
});
