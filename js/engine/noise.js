// Pure noise generators. Each fills a Float32Array in place and normalises
// the result to a peak of PEAK. `rand` returns [0, 1) and is injectable for tests.

export const NOISE_TYPES = Object.freeze(['off', 'white', 'pink', 'brown']);
export const NOISE_TRIM = Object.freeze({ white: 0.25, pink: 0.45, brown: 0.8 });
const PEAK = 0.95;

// Small, fast, seedable PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalize(out, peak = PEAK) {
  let max = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    if (a > max) max = a;
  }
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  return out;
}

export function fillWhite(out, rand = Math.random) {
  for (let i = 0; i < out.length; i++) out[i] = rand() * 2 - 1;
  return normalize(out);
}

// Paul Kellet's refined pink-noise filter.
export function fillPink(out, rand = Math.random) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return normalize(out);
}

// Brown (red) noise: leaky integrator of white noise.
export function fillBrown(out, rand = Math.random) {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rand() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = last;
  }
  return normalize(out);
}

export const NOISE_FILLERS = Object.freeze({ white: fillWhite, pink: fillPink, brown: fillBrown });
