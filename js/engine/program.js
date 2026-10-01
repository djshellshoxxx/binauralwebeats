// Pure program-timeline maths. A program is a list of segments that glide
// beat and carrier linearly from [from, to] over `duration` seconds.

import { LIMITS } from './frequency.js';

export function programDuration(program) {
  return program.segments.reduce((sum, s) => sum + s.duration, 0);
}

export function segmentStarts(program) {
  const starts = [];
  let t = 0;
  for (const s of program.segments) {
    starts.push(t);
    t += s.duration;
  }
  return starts;
}

const lerp = (a, b, p) => a + (b - a) * p;

export function paramsAt(program, t) {
  const total = programDuration(program);
  const time = Math.min(Math.max(t, 0), total);
  let start = 0;
  const segs = program.segments;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const end = start + s.duration;
    if (time < end || i === segs.length - 1) {
      const p = Math.min(1, (time - start) / s.duration);
      return {
        beat: lerp(s.beat[0], s.beat[1], p),
        carrier: lerp(s.carrier[0], s.carrier[1], p),
        segmentIndex: i,
        segmentProgress: p,
        done: t >= total,
      };
    }
    start = end;
  }
  throw new Error('Program has no segments');
}

function inRange(v, lim) {
  return typeof v === 'number' && Number.isFinite(v) && v >= lim.min && v <= lim.max;
}

export function validateProgram(program) {
  const errors = [];
  if (!program || typeof program !== 'object') return ['program must be an object'];
  if (!program.id) errors.push('missing id');
  if (!program.name) errors.push('missing name');
  if (!Array.isArray(program.segments) || program.segments.length === 0) {
    errors.push('segments must be a non-empty array');
    return errors;
  }
  program.segments.forEach((s, i) => {
    const where = `segment ${i}`;
    if (!(typeof s.duration === 'number' && s.duration > 0)) errors.push(`${where}: duration must be > 0`);
    for (const key of ['beat', 'carrier']) {
      const pair = s[key];
      if (!Array.isArray(pair) || pair.length !== 2) {
        errors.push(`${where}: ${key} must be [from, to]`);
      } else if (!pair.every((v) => inRange(v, LIMITS[key]))) {
        errors.push(`${where}: ${key} out of range`);
      }
    }
  });
  return errors;
}
