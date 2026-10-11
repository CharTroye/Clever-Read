import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkPresentationInput } from '../presentation-input.mjs';
import { importPresentation, presentationCapabilities } from '../presentations.mjs';
import { textInRegion } from '../public/regions.mjs';

function zip(entries) {
  const parts = [], directory = []; let offset = 0;
  for (const [filename, data] of entries) {
    const name = Buffer.from(filename), content = Buffer.from(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt32LE(content.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(header, name, content); directory.push(central, name); offset += header.length + name.length + content.length;
  }
  const cd = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const fixtures = Object.fromEntries(await Promise.all(['ppt', 'pptx'].map(async extension => [extension, await readFile(new URL('./fixtures/reading-test.' + extension, import.meta.url))])));

test('ordinary PPT and PPTX fixtures pass passive inspection', () => {
  for (const extension of ['ppt', 'pptx']) assert.doesNotThrow(() => checkPresentationInput(fixtures[extension], extension));
});

test('PPTX macro projects and renamed macro presentations are refused before Office starts', () => {
  const baseline = [['ppt/presentation.xml', '<presentation/>'], ['[Content_Types].xml', '<Types/>']];
  assert.doesNotThrow(() => checkPresentationInput(zip(baseline), 'pptx'));
  assert.doesNotThrow(() => checkPresentationInput(zip([...baseline, ['ppt/media/macroeconomics.png', 'passive image']]), 'pptx'));
  for (const entry of [['ppt/vbaProject.bin', 'payload'], ['ppt/jsaProject.bin', 'payload'], ['ppt/scripts/payload.js', 'payload'], ['ppt/_rels/presentation.xml.rels', '<Relationship Type="vbaProject"/>']]) assert.throws(() => checkPresentationInput(zip([...baseline, entry]), 'pptx'), /宏或脚本/);
  assert.throws(() => checkPresentationInput(zip([['ppt/presentation.xml', ''], ['[Content_Types].xml', '<Types ContentType="application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml"/>']]), 'pptx'), /宏或脚本/);
});

test('legacy PPT VBA atoms and WPS script storages are refused', () => {
  const legacy = Buffer.alloc(768); Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(legacy);
  Buffer.from([2, 0, 0, 4, 12, 0, 0, 0]).copy(legacy, 520); legacy.writeUInt32LE(1, 532);
  assert.throws(() => checkPresentationInput(legacy, 'ppt'), /宏或脚本/);
  legacy.fill(0, 512); const name = Buffer.from('JSAProject\0', 'utf16le'); name.copy(legacy, 512); legacy.writeUInt16LE(name.length, 576); legacy[578] = 1;
  assert.throws(() => checkPresentationInput(legacy, 'ppt'), /宏或脚本/);
});

test('damaged ZIP metadata fails without opening an installed presentation app', () => {
  assert.throws(() => checkPresentationInput(Buffer.from('PKnot-a-presentation'), 'pptx'));
  assert.throws(() => checkPresentationInput(zip([['word/document.xml', '<doc/>']]), 'pptx'));
  const broken = zip([['ppt/presentation.xml', 'x']]); broken.writeUInt32LE(0xfffffff0, broken.length - 6);
  assert.throws(() => checkPresentationInput(broken, 'pptx'));
});

for (const extension of ['pptx', 'ppt']) test(`WPS-only import preserves images and word selection for ${extension}`, { skip: process.env.CLEVER_WPS_TEST !== '1' }, async t => {
  assert.equal((await presentationCapabilities()).preferred, 'wps');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clever-wps-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await importPresentation(fixtures[extension], extension, directory, { renderer: 'wps' });
  assert.equal(result.renderer, 'WPS'); assert.equal(result.rendererId, 'wps'); assert.equal(result.pages, 2);
  assert.ok(result.slides[1].image.startsWith('data:image/png;base64,'));
  const word = result.slides[0].words.find(word => word.text.includes('Self-attention'));
  assert.ok(word?.w > 0);
  const region = { x: (word.x - 1) / result.slideWidth, y: (word.y - 1) / result.slideHeight, w: (word.w + 2) / result.slideWidth, h: (word.h + 2) / result.slideHeight };
  assert.equal(textInRegion(result.slides[0], region, result.slideWidth, result.slideHeight), 'Self-attention');
  assert.deepEqual(await readdir(directory), []);
});
