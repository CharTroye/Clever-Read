import test from 'node:test';
import assert from 'node:assert/strict';
import { appearancePreferences, documentCover } from '../public/appearance.mjs';

test('existing readers keep their background when appearance styles are introduced', () => {
  assert.deepEqual(appearancePreferences({ theme: 'graphite' }, { existing: true }), { style: 'classic', theme: 'graphite', motion: true });
  assert.equal(appearancePreferences({ theme: 'gray' }, { existing: true }).theme, 'gray');
  assert.equal(appearancePreferences({}, { existing: true, systemTheme: 'graphite' }).theme, 'graphite');
});
test('new readers get Swiss appearance; saved choices and disabled motion survive reloads', () => {
  assert.deepEqual(appearancePreferences(), { style: 'swiss', theme: 'gray', motion: true });
  assert.deepEqual(appearancePreferences({ style: 'editorial', theme: 'graphite', motion: false }, { existing: true }), { style: 'editorial', theme: 'graphite', motion: false });
  assert.equal(appearancePreferences({ style: 'classic' }).theme, 'graphite');
});
test('invalid appearance values cannot enter dataset selectors', () => {
  assert.deepEqual(appearancePreferences({ style: '__proto__', theme: 'invalid' }), { style: 'swiss', theme: 'gray', motion: true });
});
test('paper is an additional saved style and does not replace existing choices', () => {
  for (const style of ['swiss', 'editorial', 'classic', 'paper']) assert.equal(appearancePreferences({ style }, { existing: true }).style, style);
  assert.deepEqual(appearancePreferences({ style: 'paper', theme: 'graphite', motion: false }, { existing: true }), { style: 'paper', theme: 'graphite', motion: false });
});
test('covers remain stable and preserve real non-Latin document titles', () => {
  const doc = { id: 'reading-1', title: '电机学 第2章 变压器', type: 'pptx' };
  assert.deepEqual(documentCover(doc), documentCover({ ...doc, lastOpenedAt: Date.now() }));
  assert.equal(documentCover(doc).title, doc.title);
  assert.equal(documentCover(doc).format, 'PPTX');
  assert.ok(documentCover(doc).variant >= 0 && documentCover(doc).variant < 3);
});
