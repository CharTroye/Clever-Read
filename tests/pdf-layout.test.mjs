import test from 'node:test';
import assert from 'node:assert/strict';
import { pageLayout, spreadStart, spreadPages, adjacentPdfPage, spreadReadingPage, facingPageGeometry, fitPageInside } from '../public/pdf-layout.mjs';

test('facing pages stay visible with either or both sidebars open', () => {
  const clear = { requested: 'double', original: true, outlineOpen: false, assistantOpen: false };
  assert.deepEqual(pageLayout(clear), { available: true, mode: 'double' });
  assert.deepEqual(pageLayout({ ...clear, requested: 'single' }), { available: true, mode: 'single' });
  for (const changed of [{ outlineOpen: true }, { assistantOpen: true }, { outlineOpen: true, assistantOpen: true }]) {
    assert.deepEqual(pageLayout({ ...clear, ...changed }), { available: true, mode: 'double' });
  }
  for (const changed of [{ original: false }, { comparing: true }]) {
    assert.deepEqual(pageLayout({ ...clear, ...changed }), { available: false, mode: 'single' });
  }
  // The preference survives a temporary sidebar or translation view.
  assert.equal(pageLayout(clear).mode, 'double');
});

test('book spreads cover every page once and leave the last odd page unpaired', () => {
  assert.deepEqual(spreadPages(8, 11), [7, 8]);
  assert.deepEqual(spreadPages(11, 11), [11]);
  assert.deepEqual(spreadPages(1, 1), [1]);
  assert.deepEqual(spreadPages(1, 0), []);
  const all = Array.from({ length: 1000 }, (_, index) => spreadPages(index * 2 + 1, 1999)).flat();
  assert.equal(all.length, 1999); assert.equal(new Set(all).size, 1999);
  assert.equal(all.at(-1), 1999); assert.equal(spreadStart(2000), 1999);
});

test('spread navigation advances a pair and handles first, last and right-hand pages', () => {
  assert.equal(adjacentPdfPage(8, 11, 1, 'double'), 9);
  assert.equal(adjacentPdfPage(8, 11, -1, 'double'), 5);
  assert.equal(adjacentPdfPage(1, 11, -1, 'double'), 1);
  assert.equal(adjacentPdfPage(11, 11, 1, 'double'), 11);
  assert.equal(adjacentPdfPage(8, 11, 1, 'single'), 9);
});

test('right-hand chapter targets stay current until another row or horizontal view is selected', () => {
  assert.equal(spreadReadingPage(8, 8, 11, [7, 8]), 8);
  assert.equal(spreadReadingPage(8, 8, 11, [7]), 7);
  assert.equal(spreadReadingPage(8, 7, 11, [8]), 8);
  assert.equal(spreadReadingPage(10, 8, 11, [9, 10]), 9);
  assert.equal(spreadReadingPage(11, 10, 11), 11);
});

test('width fitting uses the entire available width with two identical sheets and no horizontal clipping', () => {
  for (const width of [308, 603, 1260, 1500, 2300]) {
    const sheet = facingPageGeometry({ width, height: 800 });
    assert.equal(sheet.width * 2 + sheet.gap, width);
    assert.ok(Math.abs(sheet.height / sheet.width - 990 / 700) < 1e-10);
  }
  const whole = facingPageGeometry({ width: 1500, height: 700, fit: 'page' });
  assert.ok(whole.width * 2 + whole.gap <= 1500);
  assert.ok(whole.height <= 700);
});

test('mixed portrait and landscape PDF pages share equal sheet sizes without stretching or clipping the original', () => {
  const box = facingPageGeometry({ width: 1500, height: 800 });
  for (const source of [{ width: 612, height: 792 }, { width: 792, height: 612 }]) {
    const page = fitPageInside(source, box);
    assert.ok(page.width <= box.width + 1e-8 && page.height <= box.height + 1e-8);
    assert.ok(page.left >= -1e-8 && page.top >= -1e-8);
    assert.ok(Math.abs(page.width / page.height - source.width / source.height) < 1e-10);
  }
});
