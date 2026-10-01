import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREATH_PATTERNS, breathAt, breathEvents, cycleLength } from '../js/engine/breath.js';
import { encodeWav, wavSize } from '../js/engine/wav.js';

test('cycle lengths', () => {
  assert.ok(Math.abs(cycleLength(BREATH_PATTERNS.resonance) - 10.9) < 1e-9);
  assert.equal(cycleLength(BREATH_PATTERNS.box), 16);
  assert.equal(cycleLength(BREATH_PATTERNS[478]), 19);
});

test('breathAt phases and levels (box)', () => {
  const p = BREATH_PATTERNS.box;
  assert.equal(breathAt(p, 0).phase, 'in');
  assert.equal(breathAt(p, 0).level, 0);
  assert.ok(Math.abs(breathAt(p, 2).level - 0.5) < 1e-9);
  const hold = breathAt(p, 5);
  assert.equal(hold.phase, 'hold-in');
  assert.equal(hold.level, 1);
  assert.equal(hold.label, 'Hold');
  assert.equal(breathAt(p, 9).phase, 'out');
  const hold2 = breathAt(p, 13);
  assert.equal(hold2.phase, 'hold-out');
  assert.equal(hold2.level, 0);
  assert.equal(breathAt(p, 16 + 1).cycle, 1);
  assert.ok(Math.abs(breathAt(p, 1).remaining - 3) < 1e-9);
});

test('breathEvents cover the horizon with monotonic times in [0,1]', () => {
  const ev = breathEvents(BREATH_PATTERNS[478], 5, 60);
  assert.ok(ev.at(-1).time >= 65);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].time >= ev[i - 1].time);
  for (const e of ev) assert.ok(e.level >= 0 && e.level <= 1);
});

test('WAV header and samples', () => {
  const l = new Float32Array([0, 1, -1, 0.5]);
  const r = new Float32Array([0, -1, 1, -0.5]);
  const buf = encodeWav([l, r], 22050, () => 0.5); // zero dither
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 22050);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 16);
  assert.equal(buf.byteLength, wavSize(4 / 22050, 22050));
  assert.equal(v.getInt16(44 + 4, true), 32767);   // frame 1 L
  assert.equal(v.getInt16(44 + 6, true), -32768);  // frame 1 R
  assert.equal(v.getInt16(44 + 12, true), 16384);  // frame 3 L (0.5)
});
