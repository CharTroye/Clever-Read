import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preparePreviewHtml, runMacCommand } from '../mac-presentations.mjs';
import { importPresentation, presentationCapabilities } from '../presentations.mjs';

const preview = body => `<html><head><style>div.slide, div.loading-slide { width: 960; height: 540;}</style></head><body>${body}</body></html>`;
test('Mac preview printing preserves pages and escaped text while refusing resource escapes', () => {
  const value = preparePreviewHtml(preview('<div class="slide">&lt;img src=x onerror=alert(1)><img src="Attachment1.png"><a href="https://example.com">Link</a></div><div class="loading-slide"></div><div class="slide"></div>'), ['Attachment1.png']);
  assert.equal(value.pages, 2);
  assert.match(value.html, /size:960px 540px/);
  assert.match(value.html, /&lt;img src=x onerror=alert/);
  assert.ok(!value.html.includes('href='));
  for (const markup of ['<img src="file:///private/file.png">', '<img src="../Attachment1.png">', '<script>alert(1)</script>', '<iframe src="https://example.com"></iframe>', '<div style="background:url(https://example.com/image.png)"></div>', '<img src="Attachment1.png" onerror="alert(1)">']) {
    assert.throws(() => preparePreviewHtml(preview('<div class="slide">' + markup + '</div>'), ['Attachment1.png']), /不支持/);
  }
  assert.throws(() => preparePreviewHtml(preview('<div class="slide"></div>'.repeat(301)), []), /PRESENTATION_SLIDE_LIMIT:300:301/);
});

test('cancelled Mac conversion cannot start a child process', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runMacCommand('/does-not-exist', [], { signal: controller.signal }), { name: 'AbortError' });
});

for (const extension of ['pptx', 'ppt']) test(`Mac imports ${extension} and cleans temporary profiles`, { skip: process.platform !== 'darwin' || process.env.CLEVER_MAC_TEST !== '1' }, async t => {
  assert.equal((await presentationCapabilities()).preferred, 'macos');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clever-mac-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await importPresentation(await readFile(new URL(`./fixtures/reading-test.${extension}`, import.meta.url)), extension, directory, { renderer: 'macos' });
  assert.equal(result.pages, 2); assert.equal(result.rendererId, 'macos');
  assert.equal(Buffer.from(result.pdf, 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(await readdir(directory), []);
});

test('cancelled Mac imports release the importer and remove partial files', { skip: process.platform !== 'darwin' || process.env.CLEVER_MAC_TEST !== '1' }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clever-mac-cancel-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const controller = new AbortController();
  await assert.rejects(importPresentation(await readFile(new URL('./fixtures/reading-test.pptx', import.meta.url)), 'pptx', directory, { onProgress: () => controller.abort(), signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(await readdir(directory), []);
});
