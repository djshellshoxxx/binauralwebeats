import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_PRESETS, CARRIER_PRESETS, PROGRAMS, MODE_INFO } from '../js/app/presets.js';
import { bandFor, LIMITS, MODES } from '../js/engine/frequency.js';
import { validateProgram } from '../js/engine/program.js';

const inRange = (v, lim) => v >= lim.min && v <= lim.max;

test('every beat preset is within limits and in its declared band', () => {
  for (const p of BEAT_PRESETS) {
    assert.ok(inRange(p.beat, LIMITS.beat), p.id);
    assert.ok(inRange(p.carrier, LIMITS.carrier), p.id);
    assert.equal(bandFor(p.beat).id, p.band, `${p.id} band`);
    assert.ok(p.description.length > 20, `${p.id} description`);
  }
});

test('every band has at least one preset', () => {
  const bands = new Set(BEAT_PRESETS.map((p) => p.band));
  for (const id of ['epsilon', 'delta', 'theta', 'alpha', 'smr', 'beta', 'gamma']) assert.ok(bands.has(id), id);
});

test('carrier presets are within limits', () => {
  for (const c of CARRIER_PRESETS) assert.ok(inRange(c.hz, LIMITS.carrier), c.id);
});

test('every program validates', () => {
  for (const p of PROGRAMS) assert.deepEqual(validateProgram(p), [], p.id);
});

test('ids are unique', () => {
  for (const list of [BEAT_PRESETS, CARRIER_PRESETS, PROGRAMS]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('every mode has info, and binaural requires headphones', () => {
  for (const m of MODES) assert.ok(MODE_INFO[m]);
  assert.equal(MODE_INFO.binaural.headphones, 'required');
});
