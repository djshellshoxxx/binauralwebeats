import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBIENCE_RATE, NATURE_LABELS, NATURE_TYPES, renderNature, renderThunder } from '../js/engine/ambience.js';

const EXPECTED_SECONDS = { waves: 64, rain: 32, thunder: 75, rainthunder: 75 };

for (const type of NATURE_TYPES.filter((t) => t !== 'off')) {
  test(`${type}: stereo, right length, bounded, audible, within budget`, () => {
    const t0 = performance.now();
    const { left, right, sampleRate } = renderNature(type);
    const ms = performance.now() - t0;
    assert.equal(sampleRate, AMBIENCE_RATE);
    assert.equal(left.length, right.length);
    assert.equal(left.length, EXPECTED_SECONDS[type] * AMBIENCE_RATE);
    let peak = 0, sumSq = 0, diff = 0;
    for (let i = 0; i < left.length; i++) {
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      sumSq += left[i] * left[i];
      diff += Math.abs(left[i] - right[i]);
    }
    assert.ok(peak <= 1, `peak ${peak}`);
    assert.ok(Math.sqrt(sumSq / left.length) > 0.01, 'non-silent');
    assert.ok(diff / left.length > 0.001, 'channels are decorrelated');
    assert.ok(ms < 3000, `render took ${ms} ms`);
    assert.ok(NATURE_LABELS[type]);
  });
}

test('loop seam is smooth (no click at wrap-around)', () => {
  for (const type of ['waves', 'rain', 'thunder']) {
    const { left } = renderNature(type);
    const jump = Math.abs(left[0] - left[left.length - 1]);
    // compare with typical sample-to-sample movement
    let typical = 0;
    for (let i = 1; i < 2000; i++) typical = Math.max(typical, Math.abs(left[i] - left[i - 1]));
    assert.ok(jump <= typical * 1.5 + 0.02, `${type} seam ${jump} vs ${typical}`);
  }
});

test('thunder has distinct loud events over a quiet bed', () => {
  const { left, events } = renderThunder(75, 9);
  assert.equal(events.length, 3);
  const win = AMBIENCE_RATE; // 1 s windows
  const rms = [];
  for (let i = 0; i + win <= left.length; i += win) {
    let s = 0;
    for (let k = i; k < i + win; k++) s += left[k] * left[k];
    rms.push(Math.sqrt(s / win));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(sorted.at(-1) > median * 4, `peak ${sorted.at(-1)} vs median ${median}`);
});
