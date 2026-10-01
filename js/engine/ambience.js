// Procedural nature sounds (spec 01 §7.2). Pure DSP: every renderer returns
// { left, right } Float32Arrays at AMBIENCE_RATE that loop seamlessly.

import { mulberry32 } from './noise.js';

export const AMBIENCE_RATE = 22050;
export const NATURE_TYPES = Object.freeze(['off', 'waves', 'rain', 'thunder', 'rainthunder']);
export const NATURE_LABELS = Object.freeze({
  off: 'Off', waves: 'Crashing Waves', rain: 'Rain', thunder: 'Thunder', rainthunder: 'Rain + Thunder',
});
export const NATURE_TRIM = Object.freeze({ waves: 0.7, rain: 1.0, thunder: 1.0, rainthunder: 1.0 });

const SR = AMBIENCE_RATE;
const LOOP_XFADE = 1.0; // seconds rendered past the end and folded into the start
const PEAK = 0.95;
const TAU = Math.PI * 2;

const lpCoef = (hz) => 1 - Math.exp((-TAU * hz) / SR);

// Fold the extra tail (length F) into the head with an equal-power crossfade
// so the buffer loops without a click.
function loopify(x, length) {
  const F = x.length - length;
  const out = x.slice(0, length);
  for (let i = 0; i < F; i++) {
    const p = i / F;
    out[i] = x[i] * Math.sin((p * Math.PI) / 2) + x[length + i] * Math.cos((p * Math.PI) / 2);
  }
  return out;
}

function peakOf(...arrays) {
  let m = 0;
  for (const a of arrays) for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) m = v; }
  return m;
}

function scaleTo(peak, ...arrays) {
  const m = peakOf(...arrays);
  if (m === 0) return;
  const k = peak / m;
  for (const a of arrays) for (let i = 0; i < a.length; i++) a[i] *= k;
}

function finish(left, right, seconds) {
  const n = Math.round(seconds * SR);
  const l = loopify(left, n);
  const r = loopify(right, n);
  scaleTo(PEAK, l, r);
  return { left: l, right: r, sampleRate: SR };
}

function alloc(seconds) {
  const n = Math.round((seconds + LOOP_XFADE) * SR);
  return [new Float32Array(n), new Float32Array(n)];
}

// ---------------------------------------------------------------- waves --

export function renderWaves(seconds = 64, seed = 1) {
  const rand = mulberry32(seed);
  const [L, R] = alloc(seconds);

  // Irregular swell lengths that sum exactly to `seconds` (periodic envelope).
  const count = Math.max(2, Math.round(seconds / 8));
  const raw = Array.from({ length: count }, () => 6 + rand() * 4);
  const sum = raw.reduce((a, b) => a + b, 0);
  const lens = raw.map((v) => (v * seconds) / sum);
  const amps = raw.map(() => 0.6 + rand() * 0.4);
  const starts = [];
  lens.reduce((t, len) => (starts.push(t), t + len), 0);

  // Returns { body, froth } for absolute time t (wraps around the loop).
  function envAt(t) {
    const tt = ((t % seconds) + seconds) % seconds;
    let i = starts.length - 1;
    while (i > 0 && starts[i] > tt) i--;
    const p = (tt - starts[i]) / lens[i];
    const peakAt = 0.6;
    let shape;
    if (p < peakAt) shape = Math.sin((Math.PI / 2) * (p / peakAt)) ** 2;
    else shape = (1 - (p - peakAt) / (1 - peakAt)) ** 2;
    const froth = p > peakAt - 0.05 ? Math.max(0, shape) * (p < peakAt + 0.25 ? 1 : 0.5) : 0;
    return { body: shape * amps[i], froth: froth * amps[i] };
  }

  const offsets = [0, 0.4];
  const outs = [L, R];
  for (let ch = 0; ch < 2; ch++) {
    const out = outs[ch];
    let brown = 0, lp = 0, hpState = 0;
    let b0 = 0, b1 = 0, b2 = 0;
    const hpA = lpCoef(2500);
    for (let i = 0; i < out.length; i++) {
      const t = i / SR - offsets[ch];
      const { body, froth } = envAt(t);
      const w = rand() * 2 - 1;
      brown = (brown + 0.02 * w) / 1.02;
      // cheap pink-ish noise (3-pole Kellet economy)
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      const pink = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      const src = brown * 3.5 + pink * 0.6;
      const cutoff = 250 + 2250 * Math.pow(body, 1.5);
      lp += lpCoef(cutoff) * (src - lp);
      const w2 = rand() * 2 - 1;
      hpState += hpA * (w2 - hpState);
      const hiss = w2 - hpState;
      out[i] = lp * (0.25 + 0.75 * body) + hiss * froth * 0.08;
    }
  }
  return finish(L, R, seconds);
}

// ----------------------------------------------------------------- rain --

export function renderRain(seconds = 32, seed = 2) {
  const rand = mulberry32(seed);
  const [L, R] = alloc(seconds);
  const n = L.length;

  // Steady band-passed hiss + a soft low "surface" layer, per channel.
  const hpA = lpCoef(600);
  const lpA = lpCoef(7000);
  const lowA = lpCoef(400);
  for (const out of [L, R]) {
    let b0 = 0, b1 = 0, b2 = 0, hp = 0, lp = 0, brown = 0, low = 0;
    for (let i = 0; i < n; i++) {
      const w = rand() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      const pink = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      hp += hpA * (pink - hp);
      const band = pink - hp;
      lp += lpA * (band - lp);
      brown = (brown + 0.02 * w) / 1.02;
      low += lowA * (brown - low);
      out[i] = lp * 0.35 + low * 0.5;
    }
  }

  // Droplets: short decaying noise blips, randomly panned; some ring a little.
  const drops = Math.round(900 * (seconds + LOOP_XFADE));
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(rand() * n);
    const len = Math.floor((0.002 + rand() * 0.01) * SR);
    const amp = 0.04 + 0.5 * rand() ** 3;
    const pan = rand();
    const gl = Math.sqrt(1 - pan) * amp;
    const gr = Math.sqrt(pan) * amp;
    const a = lpCoef(1000 + rand() * 5000);
    const tau = len / 4;
    const ring = rand() < 0.1 ? 1500 + rand() * 2500 : 0;
    let y = 0;
    for (let k = 0; k < len && start + k < n; k++) {
      const env = Math.exp(-k / tau);
      y += a * ((rand() * 2 - 1) - y);
      let s = y * env;
      if (ring) s += Math.sin((TAU * ring * k) / SR) * env * 0.5;
      L[start + k] += s * gl;
      R[start + k] += s * gr;
    }
  }
  return finish(L, R, seconds);
}

// -------------------------------------------------------------- thunder --

function addThunderEvent(L, R, rand, startSec) {
  const n = L.length;
  const distant = rand() < 0.35;
  const amp = distant ? 0.35 + rand() * 0.25 : 0.7 + rand() * 0.3;
  const pan = 0.25 + rand() * 0.5;
  const panL = Math.sqrt(1 - pan), panR = Math.sqrt(pan);
  const s0 = Math.floor(startSec * SR);

  // Crackle (close strikes only): high-passed noise with a jagged envelope.
  if (!distant) {
    const len = Math.floor((0.1 + rand() * 0.3) * SR);
    const hpA = lpCoef(1500);
    let lp = 0, flick = 1;
    for (let k = 0; k < len && s0 + k < n; k++) {
      if (k % 200 === 0) flick = 0.3 + rand() * 0.7;
      const attack = Math.min(1, k / (0.005 * SR));
      const env = attack * Math.exp((-3 * k) / len) * flick;
      const w = rand() * 2 - 1;
      lp += hpA * (w - lp);
      const s = (w - lp) * env * amp * 0.5;
      L[s0 + k] += s * panL;
      R[s0 + k] += s * panR;
    }
  }

  // Rolling rumble.
  const dur = 4 + rand() * 6;
  const rs = s0 + Math.floor((0.05 + rand() * 0.25) * SR);
  const len = Math.floor(dur * SR);
  const rolls = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => ({
    t: rand() * dur * 0.7, w: 0.3 + rand() * 0.8, a: 0.5 + rand() * 0.5,
  }));
  const fStart = distant ? 160 : 300;
  const st = [{ br: 0, lp: 0, mid: 0, pk: 0 }, { br: 0, lp: 0, mid: 0, pk: 0 }];
  for (let k = 0; k < len && rs + k < n; k++) {
    const t = k / SR;
    const attack = Math.min(1, t / 0.3);
    const decay = Math.exp(-t / (dur / 3));
    let roll = 0;
    for (const r of rolls) roll += r.a * Math.exp(-(((t - r.t) / r.w) ** 2));
    const env = attack * decay * (0.4 + 0.6 * Math.min(1, roll)) * amp;
    const cutoff = 80 + (fStart - 80) * Math.exp(-t / 1.5);
    const a = lpCoef(cutoff);
    const aMid = lpCoef(500);
    for (let ch = 0; ch < 2; ch++) {
      const s = st[ch];
      const w = rand() * 2 - 1;
      s.br = (s.br + 0.02 * w) / 1.02;
      s.lp += a * (s.br * 6 - s.lp);
      s.mid += aMid * (w - s.mid);
      const v = (s.lp + s.mid * (distant ? 0.05 : 0.12)) * env;
      if (ch === 0) L[rs + k] += v * panL * 1.2;
      else R[rs + k] += v * panR * 1.2;
    }
  }
}

export function renderThunder(seconds = 75, seed = 3) {
  const rand = mulberry32(seed);
  const [L, R] = alloc(seconds);
  // Faint continuous rumble bed.
  const bedA = lpCoef(120);
  for (const out of [L, R]) {
    let br = 0, lp = 0;
    for (let i = 0; i < out.length; i++) {
      br = (br + 0.02 * (rand() * 2 - 1)) / 1.02;
      lp += bedA * (br * 6 - lp);
      out[i] = lp * 0.06;
    }
  }
  // Three events in three slots; each ends well before the loop point.
  const slots = 3;
  const slot = seconds / slots;
  const times = [];
  for (let i = 0; i < slots; i++) {
    const t = i * slot + 1 + rand() * Math.max(0, slot - 20);
    times.push(t);
    addThunderEvent(L, R, rand, t);
  }
  const out = finish(L, R, seconds);
  out.events = times;
  return out;
}

// --------------------------------------------------------- rain+thunder --

export function renderRainThunder(seconds = 75, seed = 4) {
  const rain = renderRain(seconds, seed);
  const thunder = renderThunder(seconds, seed + 100);
  const left = new Float32Array(rain.left.length);
  const right = new Float32Array(rain.right.length);
  for (let i = 0; i < left.length; i++) {
    left[i] = rain.left[i] * 0.45 + thunder.left[i] * 0.75;
    right[i] = rain.right[i] * 0.45 + thunder.right[i] * 0.75;
  }
  if (peakOf(left, right) > PEAK) scaleTo(PEAK, left, right);
  return { left, right, sampleRate: SR, events: thunder.events };
}

export const NATURE_RENDERERS = Object.freeze({
  waves: renderWaves, rain: renderRain, thunder: renderThunder, rainthunder: renderRainThunder,
});

export function renderNature(type) {
  const fn = NATURE_RENDERERS[type];
  if (!fn) throw new Error(`Unknown nature type: ${type}`);
  return fn();
}
