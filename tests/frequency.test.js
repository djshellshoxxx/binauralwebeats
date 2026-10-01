import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, LIMITS, bandFor, clamp, oscFrequencies, sanitizeBeat, sanitizeCarrier, splitFrequencies,
} from '../js/engine/frequency.js';

test('splitFrequencies centres the pair on the carrier', () => {
  assert.deepEqual(splitFrequencies(200, 10), { left: 195, right: 205 });
  const { left, right } = splitFrequencies(432, 7.83);
  assert.ok(Math.abs(right - left - 7.83) < 1e-9);
  assert.ok(Math.abs((left + right) / 2 - 432) < 1e-9);
});

test('oscFrequencies per mode', () => {
  assert.deepEqual(oscFrequencies('binaural', 200, 10), { left: 195, right: 205 });
  assert.deepEqual(oscFrequencies('monaural', 200, 10), { left: 195, right: 205 });
  assert.deepEqual(oscFrequencies('isochronic', 200, 10), { left: 200, right: 200 });
});

test('E-F1: lowest possible tone stays above 20 Hz', () => {
  const { left } = splitFrequencies(LIMITS.carrier.min, LIMITS.beat.max);
  assert.ok(left >= 20, `lowest tone ${left}`);
});

test('sanitize clamps and replaces garbage with defaults', () => {
  assert.equal(sanitizeBeat(100), LIMITS.beat.max);
  assert.equal(sanitizeBeat(0), LIMITS.beat.min);
  assert.equal(sanitizeBeat(NaN), LIMITS.beat.default);
  assert.equal(sanitizeBeat('7.83'), 7.83);
  assert.equal(sanitizeCarrier(undefined), LIMITS.carrier.default);
  assert.equal(sanitizeCarrier(5000), LIMITS.carrier.max);
  assert.equal(clamp(5, 0, 3), 3);
});

test('bandFor boundaries are half-open, top inclusive', () => {
  assert.equal(bandFor(0.5).id, 'epsilon');
  assert.equal(bandFor(1).id, 'delta');
  assert.equal(bandFor(3.99).id, 'delta');
  assert.equal(bandFor(4).id, 'theta');
  assert.equal(bandFor(7.83).id, 'theta');
  assert.equal(bandFor(10).id, 'alpha');
  assert.equal(bandFor(12).id, 'smr');
  assert.equal(bandFor(15).id, 'beta');
  assert.equal(bandFor(30).id, 'gamma');
  assert.equal(bandFor(45).id, 'gamma');
});

test('bands are contiguous and cover the beat range', () => {
  assert.equal(BANDS[0].min, LIMITS.beat.min);
  assert.equal(BANDS.at(-1).max, LIMITS.beat.max);
  for (let i = 1; i < BANDS.length; i++) assert.equal(BANDS[i].min, BANDS[i - 1].max);
});
