import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHz, formatHzShort, formatPercent, formatTime, sliderToValue, valueToSlider } from '../js/ui/format.js';

test('formatTime', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65.9), '01:05');
  assert.equal(formatTime(3725), '1:02:05');
  assert.equal(formatTime(Infinity), '∞');
});

test('Hz and percent formatting', () => {
  assert.equal(formatHz(7.83), '7.83');
  assert.equal(formatHz(10), '10.00');
  assert.equal(formatHzShort(10), '10');
  assert.equal(formatHzShort(136.1), '136.1');
  assert.equal(formatPercent(0.404), '40%');
  assert.equal(formatPercent(3), '100%');
});

test('log slider mapping round-trips and hits the ends', () => {
  assert.equal(sliderToValue(0, 0.5, 45), 0.5);
  assert.ok(Math.abs(sliderToValue(1000, 0.5, 45) - 45) < 1e-9);
  for (const v of [0.5, 1, 7.83, 10, 40, 45]) {
    const back = sliderToValue(valueToSlider(v, 0.5, 45), 0.5, 45);
    assert.ok(Math.abs(back - v) / v < 0.006, `${v} -> ${back}`);
  }
});
