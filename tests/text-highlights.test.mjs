import test from 'node:test';
import assert from 'node:assert/strict';
import { textAnchor, locateTextAnchor } from '../public/text-highlights.mjs';

test('text marks preserve exact offsets even when the same sentence repeats', () => {
  const text = '前文。重点句。中间。重点句。后文。', start = text.lastIndexOf('重点句');
  const anchor = textAnchor(text, start, start + 4);
  assert.deepEqual(locateTextAnchor(text, anchor), { start, end: start + 4 });
  const changed = '新增引言。' + text;
  assert.deepEqual(locateTextAnchor(changed, anchor), { start: start + 5, end: start + 9 });
});

test('PDF and flowing text can locate the same marked passage despite whitespace changes', () => {
  const anchor = textAnchor('Before The important sentence. After', 7, 30);
  const text = 'Before\nThe\nimportant   sentence.\nAfter';
  const found = locateTextAnchor(text, anchor);
  assert.equal(text.slice(found.start, found.end).replace(/\s/g, ''), anchor.text.replace(/\s/g, ''));
});

test('missing and ambiguous passages cannot create invented highlight locations', () => {
  const anchor = { text: 'same', start: 100, end: 104, prefix: '', suffix: '' };
  assert.equal(locateTextAnchor('same and same', anchor), null);
  assert.equal(locateTextAnchor('different', anchor), null);
});

test('anchors retain UTF-16 offsets for emoji, Chinese and inline formula text', () => {
  const text = '📖 公式 x² + y² = z²。下一句。', start = text.indexOf('公式'), end = text.indexOf('下一句');
  const anchor = textAnchor(text, start, end);
  assert.deepEqual(locateTextAnchor(text, anchor), { start, end });
});
