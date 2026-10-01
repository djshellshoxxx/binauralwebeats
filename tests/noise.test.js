import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillBrown, fillPink, fillWhite, mulberry32 } from '../js/engine/noise.js';

const stats = (a) => {
  let peak = 0, sumSq = 0;
  for (const v of a) { peak = Math.max(peak, Math.abs(v)); sumSq += v * v; }
  return { peak, rms: Math.sqrt(sumSq / a.length) };
};

for (const [name, fill] of [['white', fillWhite], ['pink', fillPink], ['brown', fillBrown]]) {
  test(`${name} noise is bounded (E-N1) and non-silent`, () => {
    const out = fill(new Float32Array(48000), mulberry32(1));
    const { peak, rms } = stats(out);
    assert.ok(peak <= 1, `peak ${peak}`);
    assert.ok(rms > 0.01, `rms ${rms}`);
  });

  test(`${name} noise is deterministic with a seeded RNG`, () => {
    const a = fill(new Float32Array(1000), mulberry32(42));
    const b = fill(new Float32Array(1000), mulberry32(42));
    assert.deepEqual(a, b);
  });
}

test('mulberry32 stays in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 10000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});
