// Procedural nature sounds (spec 01 §7.2). Pure DSP: every renderer returns
// { left, right } Float32Arrays at AMBIENCE_RATE that loop seamlessly.

import { mulberry32 } from './noise.js';

export const AMBIENCE_RATE = 22050;
export const NATURE_TYPES = Object.freeze([
  'off', 'waves', 'rain', 'thunder', 'rainthunder', 'wind', 'stream', 'fire', 'forest', 'purr',
]);
export const NATURE_LABELS = Object.freeze({
  off: 'Off', waves: 'Crashing Waves', rain: 'Rain', thunder: 'Thunder', rainthunder: 'Rain + Thunder',
  wind: 'Wind', stream: 'Babbling Stream', fire: 'Crackling Fire', forest: 'Forest Birds', purr: 'Cat Purr',
});
export const NATURE_TRIM = Object.freeze({
  waves: 0.7, rain: 1.0, thunder: 1.0, rainthunder: 1.0, wind: 0.8, stream: 0.75, fire: 0.9, forest: 0.8, purr: 1.0,
});

export const ILLUSION_TYPES = Object.freeze(['off', 'shepard-up', 'shepard-down']);
export const ILLUSION_LABELS = Object.freeze({ off: 'Off', 'shepard-up': 'Endless rise', 'shepard-down': 'Endless fall' });
export const ILLUSION_TRIM = Object.freeze({ 'shepard-up': 0.5, 'shepard-down': 0.5 });

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


// ------------------------------------------------------------ helpers v2 --

// Chamberlin state-variable filter; returns { low, band, high } per call.
function svf() {
  let low = 0, band = 0;
  return (x, fc, q) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / SR);
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    return { low, band, high };
  };
}

function pinkGen(rand) {
  let b0 = 0, b1 = 0, b2 = 0;
  return () => {
    const w = rand() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return (b0 + b1 + b2 + w * 0.1848) * 0.11;
  };
}

function brownGen(rand) {
  let last = 0;
  return () => { last = (last + 0.02 * (rand() * 2 - 1)) / 1.02; return last * 3.5; };
}

// Periodic smooth envelope from a few sines whose periods divide `seconds`.
function periodicEnv(rand, seconds, harmonics = [1, 2, 3, 5]) {
  const parts = harmonics.map((h) => ({ h, a: 0.5 / h, p: rand() * TAU }));
  const norm = parts.reduce((s, x) => s + x.a, 0);
  return (t) => {
    let v = 0;
    for (const x of parts) v += x.a * Math.sin((TAU * x.h * t) / seconds + x.p);
    return 0.5 + 0.5 * (v / norm); // 0..1
  };
}

// ----------------------------------------------------------------- wind --

export function renderWind(seconds = 48, seed = 5) {
  const rand = mulberry32(seed);
  const [L, R] = alloc(seconds);
  const gust = periodicEnv(rand, seconds, [1, 2, 3, 7]);
  const outs = [L, R];
  for (let ch = 0; ch < 2; ch++) {
    const out = outs[ch];
    const pink = pinkGen(rand);
    const brown = brownGen(rand);
    const body = svf();
    const whistle = svf();
    const shift = ch * 1.3;
    for (let i = 0; i < out.length; i++) {
      const g = Math.min(1, Math.max(0.08, gust(i / SR + shift) * 1.15 - 0.05));
      const src = brown() * 0.8 + pink() * 0.6;
      const fc = 250 + 950 * g ** 1.5;
      const b = body(src, fc, 1.2).band;
      const w = whistle(rand() * 2 - 1, 700 + 600 * g, 0.08).band;
      out[i] = b * (0.15 + 0.85 * g) + w * 0.02 * g ** 3;
    }
  }
  return finish(L, R, seconds);
}

// --------------------------------------------------------------- stream --

export function renderStream(seconds = 30, seed = 6) {
  const rand = mulberry32(seed);
  const [L, R] = alloc(seconds);
  const n = L.length;
  for (const out of [L, R]) {
    const pink = pinkGen(rand);
    const f = svf();
    for (let i = 0; i < n; i++) out[i] = f(pink(), 1200, 1.0).band * 0.6;
  }
  const bubbles = Math.round(140 * (seconds + LOOP_XFADE));
  for (let b = 0; b < bubbles; b++) {
    const start = Math.floor(rand() * n);
    const len = Math.floor((0.004 + rand() * 0.026) * SR);
    const f0 = 300 + rand() * 600;
    const f1 = f0 * (1.5 + rand() * 1.5);
    const amp = 0.05 + 0.4 * rand() ** 2;
    const pan = rand();
    const gl = Math.sqrt(1 - pan) * amp;
    const gr = Math.sqrt(pan) * amp;
    const tau = len / 3;
    let phase = 0;
    for (let k = 0; k < len && start + k < n; k++) {
      const p = k / len;
      phase += (TAU * (f0 + (f1 - f0) * p)) / SR;
      const v = Math.sin(phase) * Math.exp(-k / tau) * Math.min(1, k / 20);
      L[start + k] += v * gl;
      R[start + k] += v * gr;
    }
  }
  return finish(L, R, seconds);
}

// ----------------------------------------------------------------- fire --

export function renderFire(seconds = 40, seed = 7) {
  const rand = mulberry32(seed);
  const [L, R] = alloc(seconds);
  const n = L.length;
  // Roar with a slow random flicker.
  for (const out of [L, R]) {
    const brown = brownGen(rand);
    let lp1 = 0, lp2 = 0, flick = 0, hp = 0;
    const a = lpCoef(300);
    const fa = lpCoef(2);
    const ha = lpCoef(3000);
    for (let i = 0; i < n; i++) {
      lp1 += a * (brown() - lp1);
      lp2 += a * (lp1 - lp2);
      flick += fa * ((rand() * 2 - 1) * 3 - flick);
      const w = rand() * 2 - 1;
      hp += ha * (w - hp);
      out[i] = lp2 * (0.6 + 0.4 * Math.tanh(flick)) * 0.9 + (w - hp) * 0.015;
    }
  }
  // Crackles (Poisson with bursts) and pops.
  const crackle = (start, amp, pan) => {
    const len = Math.max(2, Math.floor((0.0003 + rand() * 0.0017) * SR));
    const gl = Math.sqrt(1 - pan) * amp;
    const gr = Math.sqrt(pan) * amp;
    let prev = 0;
    for (let k = 0; k < len && start + k < n; k++) {
      const w = rand() * 2 - 1;
      const v = (w - prev) * Math.exp((-4 * k) / len);
      prev = w;
      L[start + k] += v * gl;
      R[start + k] += v * gr;
    }
  };
  let t = 0;
  const end = seconds + LOOP_XFADE;
  while (t < end) {
    t += -Math.log(1 - rand()) / 12;
    const pan = 0.2 + rand() * 0.6;
    const amp = 0.2 + 0.8 * rand() ** 2;
    crackle(Math.floor(t * SR), amp, pan);
    if (rand() < 0.2) {
      const burst = 3 + Math.floor(rand() * 6);
      for (let k = 0; k < burst; k++) crackle(Math.floor((t + rand() * 0.05) * SR), amp * (0.4 + rand() * 0.6), pan);
    }
  }
  const pops = Math.round(1.5 * end);
  for (let p = 0; p < pops; p++) {
    const start = Math.floor(rand() * n);
    const len = Math.floor((0.01 + rand() * 0.03) * SR);
    const amp = 0.3 + rand() * 0.5;
    const pan = 0.2 + rand() * 0.6;
    const a = lpCoef(800 + rand() * 1200);
    let y = 0;
    for (let k = 0; k < len && start + k < n; k++) {
      y += a * ((rand() * 2 - 1) - y);
      const v = y * Math.exp((-5 * k) / len) * amp;
      L[start + k] += v * Math.sqrt(1 - pan);
      R[start + k] += v * Math.sqrt(pan);
    }
  }
  return finish(L, R, seconds);
}

// --------------------------------------------------------------- forest --

function addBirdCall(L, R, rand, start) {
  const n = L.length;
  const base = 2000 + rand() * 3000;
  const notes = 2 + Math.floor(rand() * 6);
  const amp = 0.1 + 0.4 * rand();
  const pan = rand();
  const gl = Math.sqrt(1 - pan) * amp;
  const gr = Math.sqrt(pan) * amp;
  const glide = (rand() - 0.5) * 1.0; // octaves over a note
  const vibRate = 20 + rand() * 40;
  const vibDepth = 0.01 + rand() * 0.03;
  let pos = start;
  let phase = 0;
  for (let k = 0; k < notes; k++) {
    const len = Math.floor((0.04 + rand() * 0.18) * SR);
    const f0 = base * (0.85 + rand() * 0.3);
    for (let j = 0; j < len && pos + j < n; j++) {
      const p = j / len;
      const f = f0 * 2 ** (glide * p) * (1 + vibDepth * Math.sin((TAU * vibRate * j) / SR));
      phase += (TAU * Math.min(f, SR / 2.2)) / SR;
      const env = Math.min(1, j / (0.005 * SR)) * Math.exp(-3 * p) * (1 - p) ** 0.5;
      const v = (Math.sin(phase) + 0.15 * Math.sin(2 * phase)) * env;
      L[pos + j] += v * gl;
      R[pos + j] += v * gr;
    }
    pos += len + Math.floor((0.02 + rand() * 0.06) * SR);
  }
}

export function renderForest(seconds = 60, seed = 8) {
  const rand = mulberry32(seed);
  const [L, R] = alloc(seconds);
  const swell = periodicEnv(rand, seconds, [1, 2, 4]);
  for (const out of [L, R]) {
    const pink = pinkGen(rand);
    let lp = 0;
    const a = lpCoef(1500);
    for (let i = 0; i < out.length; i++) {
      lp += a * (pink() - lp);
      out[i] = lp * (0.3 + 0.7 * swell(i / SR)) * 0.5;
    }
  }
  let t = 0.5;
  while (t < seconds - 2) {
    addBirdCall(L, R, rand, Math.floor(t * SR));
    t += 0.8 + rand() * 3.2;
  }
  return finish(L, R, seconds);
}

// ----------------------------------------------------------------- purr --

export function renderPurr(seconds = 16, seed = 9) {
  const rand = mulberry32(seed);
  const [L, R] = alloc(seconds);
  const cycle = 4;
  // Breath: inhale 0-1.8 s (22 Hz, softer), pause, exhale 2.0-3.8 s (26 Hz), pause.
  const breath = (t) => {
    const c = ((t % cycle) + cycle) % cycle;
    if (c < 1.8) return { rate: 22, amp: 0.6 * Math.sin((Math.PI * c) / 1.8) ** 0.5 };
    if (c >= 2 && c < 3.8) return { rate: 26, amp: Math.sin((Math.PI * (c - 2)) / 1.8) ** 0.5 };
    return { rate: 24, amp: 0 };
  };
  const outs = [L, R];
  const decay = Math.exp(-1 / (0.012 * SR));
  const a = lpCoef(250);
  const a2 = lpCoef(400);
  for (let ch = 0; ch < 2; ch++) {
    const out = outs[ch];
    let ph = 0, env = 0, lp = 0, lp2 = 0;
    for (let i = 0; i < out.length; i++) {
      const { rate, amp } = breath(i / SR);
      ph += rate / SR;
      if (ph >= 1) { ph -= 1; env = amp; }
      env *= decay;
      lp += a * ((rand() * 2 - 1) - lp);
      lp2 += a2 * (lp * env - lp2);
      out[i] = lp2;
    }
  }
  return finish(L, R, seconds);
}

// -------------------------------------------------------------- shepard --

// Shepard–Risset glissando. Phases are chained so each partial continues
// seamlessly into its neighbour at the loop point (spec 07 §8).
// Returns a function giving the raw (un-normalised) sample at index n.
export function shepardSampler(direction = 'up', { seconds = 24, partials = 9, f0 = 12 } = {}) {
  const s = direction === 'down' ? -1 : 1;
  const P = seconds;
  const LN2 = Math.LN2;
  const idx = [...Array(partials).keys()].map((i) => (s > 0 ? i : i + 1));
  // Phase advance of partial i over one period.
  const adv = (i) => (s > 0 ? (TAU * f0 * 2 ** i * P) / LN2 : (TAU * f0 * 2 ** i * P) / (2 * LN2));
  const phase0 = new Map();
  if (s > 0) {
    phase0.set(0, 0);
    for (let i = 0; i < partials - 1; i++) phase0.set(i + 1, (phase0.get(i) + adv(i)) % TAU);
  } else {
    phase0.set(partials, 0);
    for (let i = partials; i > 1; i--) phase0.set(i - 1, (phase0.get(i) + adv(i)) % TAU);
  }
  return (n) => {
    const t = n / SR;
    const g = 2 ** ((s * t) / P);
    let v = 0;
    for (const i of idx) {
      const x = i + (s * t) / P;
      if (x <= 0 || x >= partials) continue;
      const w = 0.5 - 0.5 * Math.cos((TAU * x) / partials);
      v += w * Math.sin(phase0.get(i) + ((TAU * f0 * 2 ** i * P) / (s * LN2)) * (g - 1));
    }
    return v;
  };
}

export function renderShepard(direction = 'up', opts = {}) {
  const seconds = opts.seconds ?? 24;
  const sample = shepardSampler(direction, opts);
  const N = Math.round(seconds * SR);
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) out[n] = sample(n);
  scaleTo(PEAK, out);
  return { left: out, right: out.slice(), sampleRate: SR };
}

export const NATURE_RENDERERS = Object.freeze({
  waves: renderWaves, rain: renderRain, thunder: renderThunder, rainthunder: renderRainThunder,
  wind: renderWind, stream: renderStream, fire: renderFire, forest: renderForest, purr: renderPurr,
});

export const ILLUSION_RENDERERS = Object.freeze({
  'shepard-up': () => renderShepard('up'),
  'shepard-down': () => renderShepard('down'),
});

// Renders any background buffer type (nature or illusion).
export function renderNature(type) {
  const fn = NATURE_RENDERERS[type] || ILLUSION_RENDERERS[type];
  if (!fn) throw new Error(`Unknown ambience type: ${type}`);
  return fn();
}
