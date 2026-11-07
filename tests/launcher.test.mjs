import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { launch, projectId } from '../scripts/launch.mjs';
import { readFile, writeFile, mkdtemp, realpath, rm } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('Mac launcher starts once, reuses the process, and stops its own server', async t => {
  const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  t.after(() => launch({ port, stop: true, openBrowser: false }).catch(() => {}));
  const [first, second] = await Promise.all([launch({ port, openBrowser: false }), launch({ port, openBrowser: false })]);
  assert.equal(Number(first.reused) + Number(second.reused), 1);
  const health = await (await fetch(first.url + '/api/health')).json();
  assert.equal(health.version, version); assert.equal(health.platform, process.platform);
  assert.equal((await launch({ port, openBrowser: false })).reused, true);
  assert.equal((await launch({ port, stop: true, openBrowser: false })).stopped, true);
  await assert.rejects(fetch(first.url + '/api/health'));
});

test('launcher never takes over a port occupied by another application', async t => {
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, app: 'other-application', pid: process.pid })); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await assert.rejects(launch({ port: server.address().port, openBrowser: false }), /占用/);
  assert.equal((await (await fetch(`http://127.0.0.1:${server.address().port}/api/health`)).json()).app, 'other-application');
});

test('launcher replaces its own healthy-looking process when the homepage becomes unreadable', async t => {
  const directory = await realpath(await mkdtemp('/tmp/clever-read-home-'));
  const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  t.after(async () => { await launch({ directory, port, stop: true, openBrowser: false }).catch(() => {}); await rm(directory, { recursive: true, force: true }); });
  await writeFile(directory + '/package.json', JSON.stringify({ version, type: 'module' }));
  await writeFile(directory + '/server.mjs', `
    import http from 'node:http';
    import { existsSync, unlinkSync } from 'node:fs';
    let blocked = false;
    http.createServer((req, res) => {
      if (req.url === '/api/health') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ app: 'clever-read', projectId: ${JSON.stringify(projectId(directory))}, version: ${JSON.stringify(version)}, pid: process.pid }));
      }
      if (existsSync('block-home')) { blocked = true; unlinkSync('block-home'); }
      res.setHeader('Content-Type', blocked ? 'application/json' : 'text/html');
      res.statusCode = blocked ? 400 : 200;
      res.end(blocked ? JSON.stringify({ error: 'EPERM: operation not permitted, open index.html' }) : '<html><title>Clever Read</title></html>');
    }).listen(Number(process.env.PORT), '127.0.0.1');
  `);
  const first = await launch({ directory, port, openBrowser: false });
  const previous = await (await fetch(first.url + '/api/health')).json();
  await writeFile(directory + '/block-home', '');
  const recovered = await launch({ directory, port, openBrowser: false });
  const current = await (await fetch(recovered.url + '/api/health')).json();
  assert.equal(recovered.reused, false);
  assert.notEqual(current.pid, previous.pid);
  assert.equal((await fetch(recovered.url + '/')).status, 200);
});
