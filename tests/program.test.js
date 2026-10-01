import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paramsAt, programDuration, segmentStarts, validateProgram } from '../js/engine/program.js';

const prog = {
  id: 't', name: 'Test',
  segments: [
    { label: 'a', duration: 10, beat: [10, 6], carrier: [200, 180] },
    { label: 'b', duration: 20, beat: [6, 6], carrier: [180, 180] },
  ],
};

test('duration and segment starts', () => {
  assert.equal(programDuration(prog), 30);
  assert.deepEqual(segmentStarts(prog), [0, 10]);
});

test('paramsAt interpolates linearly within a segment', () => {
  const p = paramsAt(prog, 5);
  assert.equal(p.beat, 8);
  assert.equal(p.carrier, 190);
  assert.equal(p.segmentIndex, 0);
  assert.equal(p.segmentProgress, 0.5);
  assert.equal(p.done, false);
});

test('paramsAt at boundaries and out of range', () => {
  assert.equal(paramsAt(prog, 0).beat, 10);
  assert.equal(paramsAt(prog, 10).segmentIndex, 1);
  assert.equal(paramsAt(prog, -5).beat, 10);
  const end = paramsAt(prog, 99);
  assert.equal(end.beat, 6);
  assert.equal(end.segmentIndex, 1);
  assert.equal(end.done, true);
});

test('validateProgram reports problems', () => {
  assert.deepEqual(validateProgram(prog), []);
  assert.ok(validateProgram({ id: 'x', name: 'x', segments: [] }).length > 0);
  const bad = validateProgram({ id: 'x', name: 'x', segments: [{ duration: 0, beat: [100, 1], carrier: [200] }] });
  assert.ok(bad.some((e) => e.includes('duration')));
  assert.ok(bad.some((e) => e.includes('beat out of range')));
  assert.ok(bad.some((e) => e.includes('carrier must be')));
});
