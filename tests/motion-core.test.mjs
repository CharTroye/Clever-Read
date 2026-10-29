import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSpring, fitRect } from '../public/motion-core.mjs';

test('a resting surface approaches its destination monotonically without bounce', () => {
  let p = 0, v = 0;
  for (let i = 0; i < 120; i++) {
    const next = advanceSpring(p, v, 500, 1 / 120);
    assert.ok(next.value >= p && next.value <= 500);
    p = next.value; v = next.velocity;
  }
  assert.ok(Math.abs(p - 500) < .001);
});
test('a reversal retains momentum then changes direction continuously', () => {
  let { value, velocity } = advanceSpring(0, 0, 500, .1);
  assert.ok(velocity > 0);
  const reversed = advanceSpring(value, velocity, 0, .001);
  assert.ok(reversed.value > value && reversed.velocity > 0);
  let p = reversed.value, v = reversed.velocity;
  for (let i = 0; i < 120; i++) ({ value: p, velocity: v } = advanceSpring(p, v, 0, 1 / 120));
  assert.ok(Math.abs(p) < .001);
});
test('uniform fitting preserves page aspect ratio across portrait and landscape cards', () => {
  const from = { left: 900, top: 180, width: 160, height: 210 };
  const to = { left: 80, top: 100, width: 800, height: 450 };
  const fit = fitRect(from, to);
  assert.equal(fit.scale, .2);
  assert.ok(to.width * fit.scale <= from.width && to.height * fit.scale <= from.height);
  assert.equal(to.width * fit.scale / (to.height * fit.scale), to.width / to.height);
});
