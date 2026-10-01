// Pure frequency maths for the beat engine. No DOM / Web Audio here.

export const LIMITS = Object.freeze({
  carrier: Object.freeze({ min: 60, max: 1000, default: 200, step: 0.01 }),
  beat: Object.freeze({ min: 0.5, max: 45, default: 10, step: 0.01 }),
});

export const MODES = Object.freeze(['binaural', 'monaural', 'isochronic']);
export const WAVEFORMS = Object.freeze(['sine', 'triangle', 'square', 'sawtooth']);

export const BANDS = Object.freeze([
  { id: 'epsilon', name: 'Epsilon', min: 0.5, max: 1, color: '#8b7cf6',
    summary: 'The slowest rhythms. Associated with very deep meditative and "suspended" states reported by experienced meditators.' },
  { id: 'delta', name: 'Delta', min: 1, max: 4, color: '#5b8def',
    summary: 'Deep, dreamless sleep, physical rest and recovery. Used for falling asleep and deep relaxation.' },
  { id: 'theta', name: 'Theta', min: 4, max: 8, color: '#38bdf8',
    summary: 'Light sleep, dreaming, deep meditation, the drowsy hypnagogic state, creativity and intuition.' },
  { id: 'alpha', name: 'Alpha', min: 8, max: 12, color: '#34d399',
    summary: 'Relaxed wakefulness: calm, present, stress relief and light meditation.' },
  { id: 'smr', name: 'SMR', min: 12, max: 15, color: '#a3e635',
    summary: 'Sensorimotor rhythm: calm but alert focus with a still body. Often used for studying and reading.' },
  { id: 'beta', name: 'Beta', min: 15, max: 30, color: '#fbbf24',
    summary: 'Active thinking, concentration, problem solving and alertness. High beta can feel tense.' },
  { id: 'gamma', name: 'Gamma', min: 30, max: 45, color: '#f472b6',
    summary: 'High-level information processing, peak focus, memory and perceptual "binding". 40 Hz is widely researched.' },
].map(Object.freeze));

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitize(value, lim) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return lim.default;
  return clamp(n, lim.min, lim.max);
}

export const sanitizeCarrier = (v) => sanitize(v, LIMITS.carrier);
export const sanitizeBeat = (v) => sanitize(v, LIMITS.beat);

export function splitFrequencies(carrier, beat) {
  return { left: carrier - beat / 2, right: carrier + beat / 2 };
}

// Oscillator frequencies for a given beat mode (see spec 01 §2).
export function oscFrequencies(mode, carrier, beat) {
  if (mode === 'isochronic') return { left: carrier, right: carrier };
  return splitFrequencies(carrier, beat);
}

export function bandFor(beat) {
  for (let i = 0; i < BANDS.length; i++) {
    const b = BANDS[i];
    const last = i === BANDS.length - 1;
    if (beat >= b.min && (beat < b.max || (last && beat <= b.max))) return b;
  }
  return beat < BANDS[0].min ? BANDS[0] : BANDS[BANDS.length - 1];
}
