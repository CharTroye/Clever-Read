import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustRegion } from '../public/regions.mjs';
import { readPresentationStream } from '../public/presentation-stream.mjs';

test('moving a selection preserves its dimensions and stays inside the slide', () => {
  const original = { x: .2, y: .3, w: .4, h: .2 };
  assert.deepEqual(adjustRegion(original, { x: 2, y: -2 }), { x: .6, y: 0, w: .4, h: .2 });
  assert.deepEqual(original, { x: .2, y: .3, w: .4, h: .2 });
});
test('resizing clamps edges and prevents inverted or zero-size selections', () => {
  const original = { x: .2, y: .3, w: .4, h: .2 };
  const minimum = { w: .05, h: .05 };
  const crossed = adjustRegion(original, { x: 2, y: 2 }, 'nw', minimum);
  assert.ok(Math.abs(crossed.w - .05) < 1e-10 && Math.abs(crossed.h - .05) < 1e-10);
  const expanded = adjustRegion(original, { x: 2, y: 2 }, 'se', minimum);
  assert.equal(expanded.x + expanded.w, 1); assert.equal(expanded.y + expanded.h, 1);
  assert.equal(adjustRegion(original, { x: -.1, y: 2 }, 'w', minimum).y, original.y);
});
test('presentation progress survives split JSON lines and split Chinese UTF-8 characters', async () => {
  const events = [{ type: 'progress', page: 0, total: 190, renderer: 'WPS' }, { type: 'progress', page: 190, total: 190, renderer: 'WPS' }, { type: 'complete', document: { pages: 190, title: '中文课件' } }];
  const bytes = new TextEncoder().encode(events.map(JSON.stringify).join('\n') + '\n');
  const response = new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); } }));
  const progress = [];
  assert.deepEqual(await readPresentationStream(response, value => progress.push(value.page)), { pages: 190, title: '中文课件' });
  assert.deepEqual(progress, [0, 190]);
});
test('failed or disconnected import streams do not produce a saved document', async () => {
  await assert.rejects(readPresentationStream(new Response('{"type":"error","error":"超过页数上限"}\n'), () => {}), /超过页数/);
  await assert.rejects(readPresentationStream(new Response('{"type":"progress","page":1}\n'), () => {}), /连接中断/);
});
