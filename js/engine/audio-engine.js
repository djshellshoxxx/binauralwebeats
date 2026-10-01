// AudioEngine: Web Audio graph for binaural / monaural / isochronic / bilateral
// beats, extra voices, noise / nature / illusion layers and effects.
// See docs/specs/01-engine.md and docs/specs/07-v2-features.md.

import { oscFrequencies, splitFrequencies, sanitizeBeat, sanitizeCarrier, MODES, WAVEFORMS, TIMBRES } from './frequency.js';
import { paramsAt } from './program.js';
import { NOISE_FILLERS, NOISE_TRIM, mulberry32 } from './noise.js';
import { NATURE_TRIM, ILLUSION_TRIM, renderNature } from './ambience.js';
import { BREATH_PATTERNS, breathEvents } from './breath.js';

export const MAX_MASTER_GAIN = 0.5;
const TONE_TAU = 0.08;
const GAIN_TAU = 0.03;
const MODE_TAU = 0.05;
const TIMBRE_TAU = 0.1;
const LAYER_XFADE = 0.6;
const VOICE_FADE = 0.3;
const NOISE_SECONDS = 6;
const VOICE_GAIN = 0.6;
const BREATH_HORIZON = 7200; // seconds scheduled ahead for unlimited sessions
export const SPATIAL_RATES = Object.freeze([0, 2, 4, 8, 16]);
export const LAYER_PULSE_LEVELS = Object.freeze([0, 0.3, 0.6, 1]);

export const DEFAULT_VOICES = Object.freeze([
  Object.freeze({ on: false, carrier: 400, beat: 40, volume: 0.5 }),
  Object.freeze({ on: false, carrier: 100, beat: 2, volume: 0.5 }),
]);

export const DEFAULT_ENGINE_SETTINGS = Object.freeze({
  mode: 'binaural', carrier: 200, beat: 10, waveform: 'sine', timbre: 'pure', toneVolume: 0.8,
  noiseType: 'off', noiseVolume: 0.3, natureType: 'off', natureVolume: 0.3,
  illusionType: 'off', illusionVolume: 0.3, masterVolume: 0.4,
  voices: DEFAULT_VOICES, spatialRate: 0, layerPulse: 0, breathPattern: 'off', breathCue: false,
});

const ROUTING = {
  binaural: { gLL: 1, gLR: 0, gRL: 0, gRR: 1, depth: 0, bilat: 0 },
  monaural: { gLL: 0.5, gLR: 0.5, gRL: 0.5, gRR: 0.5, depth: 0, bilat: 0 },
  isochronic: { gLL: 1, gLR: 0, gRL: 0, gRR: 1, depth: 1, bilat: 0 },
  bilateral: { gLL: 0.5, gLR: 0, gRL: 0, gRR: 0.5, depth: 0, bilat: 0.5 },
};

const TIMBRE_GAINS = { pure: [1, 0, 0], pad: [0.5, 0.35, 0.35] };
const DETUNE = [0, 3, -3];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

// Loaded buffers are shared by every engine instance (live player + exporter).
const SHARED_DATA = new Map(); // type -> Promise<{left,right,sampleRate}>

function defaultContextFactory() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not supported in this browser.');
  return new Ctor({ latencyHint: 'playback' });
}

function defaultWorkerFactory() {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./ambience-worker.js', import.meta.url), { type: 'module' });
}

// Set an AudioParam glide without clicks (spec E-S1..S3).
function glide(param, value, now, tau) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(value, now, tau);
}

function ramp(param, value, now, seconds) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + Math.max(0.001, seconds));
}

function sanitizeVoices(voices) {
  if (!Array.isArray(voices)) return DEFAULT_VOICES;
  return DEFAULT_VOICES.map((d, i) => {
    const v = voices[i] || {};
    return {
      on: typeof v.on === 'boolean' ? v.on : d.on,
      carrier: v.carrier === undefined ? d.carrier : sanitizeCarrier(v.carrier),
      beat: v.beat === undefined ? d.beat : sanitizeBeat(v.beat),
      volume: v.volume === undefined ? d.volume : clamp01(v.volume),
    };
  });
}

export class AudioEngine {
  constructor({ contextFactory = defaultContextFactory, workerFactory = defaultWorkerFactory, offline = false } = {}) {
    this._contextFactory = contextFactory;
    this._workerFactory = workerFactory;
    this._offline = offline;
    this.settings = { ...DEFAULT_ENGINE_SETTINGS };
    this.ctx = null;
    this.state = 'idle';
    this.session = null;
    this.program = null;
    this.duration = Infinity;
    this.fadeDownMinutes = 0;
    this.breathOrigin = 0;
    this._startTime = 0;
    this._noiseBuffers = new Map();
    this._audioBuffers = new Map(); // type -> AudioBuffer (per context)
    this._worker = undefined;
    this._workerJobs = new Map();
    this._jobId = 0;
    this._loading = new Map(); // type -> count
    this._layersReady = Promise.resolve();
    this.onLoading = null; // (types: string[]) => void
  }

  // ---------------------------------------------------------------- context

  _ensureContext() {
    if (this.ctx) return this.ctx;
    const ctx = this._contextFactory();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = clamp01(this.settings.masterVolume) * MAX_MASTER_GAIN;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    if (!this._offline) {
      this.splitter = ctx.createChannelSplitter(2);
      this.analyserL = ctx.createAnalyser();
      this.analyserR = ctx.createAnalyser();
      for (const a of [this.analyserL, this.analyserR]) { a.fftSize = 2048; a.smoothingTimeConstant = 0.6; }
      this.limiter.connect(this.splitter);
      this.splitter.connect(this.analyserL, 0);
      this.splitter.connect(this.analyserR, 1);
    }
    this._pulseWave = this._makePulseWave(ctx);
    return ctx;
  }

  async _resumeContext() {
    if (!this._offline && this.ctx.state !== 'running' && this.ctx.resume) await this.ctx.resume();
  }

  // Rounded square wave: odd harmonics 1..7 with Lanczos sigma smoothing.
  _makePulseWave(ctx) {
    const N = 8;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    const M = N + 1;
    for (let n = 1; n < N; n += 2) {
      const x = (Math.PI * n) / M;
      imag[n] = (4 / (Math.PI * n)) * (Math.sin(x) / x);
    }
    return ctx.createPeriodicWave(real, imag);
  }

  get analysers() {
    return this.ctx && this.analyserL ? { left: this.analyserL, right: this.analyserR } : null;
  }

  get elapsed() {
    if (this.state === 'idle' || !this.ctx) return 0;
    return Math.max(0, this.ctx.currentTime - this._startTime);
  }

  // --------------------------------------------------------------- session

  _buildSession() {
    const ctx = this.ctx;
    const s = this.settings;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const side = () => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.7;
      const oscs = [];
      const gains = [];
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        o.detune.value = DETUNE[i];
        const vg = g(0);
        o.connect(vg);
        vg.connect(filter);
        oscs.push(o);
        gains.push(vg);
      }
      return { oscs, gains, filter };
    };
    const sess = {
      L: side(), R: side(), lfo: ctx.createOscillator(),
      gLL: g(), gLR: g(), gRL: g(), gRR: g(), merger: ctx.createChannelMerger(2),
      am: g(), lfoDepth: g(0), bilatL: g(0), bilatR: g(0),
      tone: g(), breathTone: g(),
      noiseBus: g(), natureBus: g(), illusionBus: g(), layerSum: g(),
      layerPulse: g(), pulseDepth: g(0), spatial: ctx.createStereoPanner(),
      spatialLfo: ctx.createOscillator(), spatialDepth: g(0), breathLayers: g(),
      fade: g(0), fadeDown: g(),
      voices: [null, null],
      layers: { noise: null, nature: null, illusion: null },
      layerTypes: { noise: 'off', nature: 'off', illusion: 'off' },
    };
    sess.lfo.setPeriodicWave(this._pulseWave);
    sess.L.filter.connect(sess.gLL); sess.L.filter.connect(sess.gLR);
    sess.R.filter.connect(sess.gRL); sess.R.filter.connect(sess.gRR);
    sess.gLL.connect(sess.merger, 0, 0); sess.gLR.connect(sess.merger, 0, 1);
    sess.gRL.connect(sess.merger, 0, 0); sess.gRR.connect(sess.merger, 0, 1);
    sess.merger.connect(sess.am);
    sess.lfo.connect(sess.lfoDepth); sess.lfoDepth.connect(sess.am.gain);
    sess.lfo.connect(sess.bilatL); sess.bilatL.connect(sess.gLL.gain);
    sess.lfo.connect(sess.bilatR); sess.bilatR.connect(sess.gRR.gain);
    sess.am.connect(sess.tone);
    sess.tone.connect(sess.breathTone);
    sess.breathTone.connect(sess.fade);

    for (const bus of [sess.noiseBus, sess.natureBus, sess.illusionBus]) bus.connect(sess.layerSum);
    sess.layerSum.connect(sess.layerPulse);
    sess.lfo.connect(sess.pulseDepth); sess.pulseDepth.connect(sess.layerPulse.gain);
    sess.layerPulse.connect(sess.spatial);
    sess.spatialLfo.type = 'sine';
    sess.spatialLfo.connect(sess.spatialDepth); sess.spatialDepth.connect(sess.spatial.pan);
    sess.spatial.connect(sess.breathLayers);
    sess.breathLayers.connect(sess.fade);
    sess.fade.connect(sess.fadeDown);
    sess.fadeDown.connect(this.master);

    // Initial values.
    const r = ROUTING[s.mode];
    for (const k of ['gLL', 'gLR', 'gRL', 'gRR']) sess[k].gain.value = r[k];
    sess.am.gain.value = 1 - r.depth / 2;
    sess.lfoDepth.gain.value = r.depth / 2;
    sess.bilatL.gain.value = r.bilat;
    sess.bilatR.gain.value = -r.bilat;
    this._applyTimbreValues(sess);
    sess.tone.gain.value = clamp01(s.toneVolume);
    sess.noiseBus.gain.value = clamp01(s.noiseVolume);
    sess.natureBus.gain.value = clamp01(s.natureVolume);
    sess.illusionBus.gain.value = clamp01(s.illusionVolume);
    sess.layerPulse.gain.value = 1 - s.layerPulse / 2;
    sess.pulseDepth.gain.value = s.layerPulse / 2;
    sess.spatialLfo.frequency.value = Math.max(s.spatialRate, 0.001) / 60;
    sess.spatialDepth.gain.value = s.spatialRate > 0 ? 0.9 : 0;
    return sess;
  }

  _applyTimbreValues(sess, now = null) {
    const { timbre, waveform, carrier } = this.settings;
    const gains = TIMBRE_GAINS[timbre];
    const cutoff = timbre === 'pad' ? Math.min(4 * carrier, 2400) : 20000;
    for (const side of [sess.L, sess.R]) {
      side.oscs.forEach((o, i) => { o.type = timbre === 'pad' ? 'sawtooth' : waveform; });
      side.gains.forEach((vg, i) => {
        if (now === null) vg.gain.value = gains[i]; else glide(vg.gain, gains[i], now, TIMBRE_TAU);
      });
      const max = this.ctx.sampleRate / 2 - 1;
      if (now === null) side.filter.frequency.value = Math.min(cutoff, max);
      else glide(side.filter.frequency, Math.min(cutoff, max), now, TIMBRE_TAU);
    }
  }

  _allOscillators(sess) {
    const list = [...sess.L.oscs, ...sess.R.oscs, sess.lfo, sess.spatialLfo];
    for (const v of sess.voices) if (v) list.push(v.oscL, v.oscR);
    for (const l of Object.values(sess.layers)) if (l) list.push(l.src);
    return list;
  }

  _teardown(sess, when) {
    for (const n of this._allOscillators(sess)) {
      try { n.stop(when); } catch { /* already stopped */ }
    }
    const delay = Math.max(0, (when - this.ctx.currentTime) * 1000) + 50;
    setTimeout(() => {
      const nodes = [
        ...Object.values(sess).filter((n) => n && typeof n.disconnect === 'function'),
        ...[sess.L, sess.R].flatMap((s) => [...s.oscs, ...s.gains, s.filter]),
        ...sess.voices.filter(Boolean).flatMap((v) => [v.oscL, v.oscR, v.merger, v.gain]),
        ...Object.values(sess.layers).filter(Boolean).flatMap((l) => [l.src, l.gain]),
      ];
      for (const n of nodes) { try { n.disconnect(); } catch { /* ignore */ } }
    }, delay);
  }

  _toneParams(sess) {
    // [param, which] where which: 'L' | 'R' | 'B' (beat)
    return [
      ...sess.L.oscs.map((o) => [o.frequency, 'L']),
      ...sess.R.oscs.map((o) => [o.frequency, 'R']),
      [sess.lfo.frequency, 'B'],
    ];
  }

  _setFrequencies(sess, now, tau) {
    const { mode, carrier, beat } = this.settings;
    const f = oscFrequencies(mode, carrier, beat);
    const val = { L: f.left, R: f.right, B: beat };
    for (const [p, w] of this._toneParams(sess)) {
      if (tau) glide(p, val[w], now, tau); else p.setValueAtTime(val[w], now);
    }
  }

  // Spec E-P1: exact linear ramps per segment from `offset` seconds into the program.
  _scheduleProgram(sess, program, offset) {
    const now = this.ctx.currentTime;
    const base = now - offset;
    const mode = this.settings.mode;
    const params = this._toneParams(sess);
    const valuesFor = (carrier, beat) => {
      const f = oscFrequencies(mode, carrier, beat);
      return { L: f.left, R: f.right, B: beat };
    };
    for (const [p] of params) p.cancelScheduledValues(now);
    let start = 0;
    for (const seg of program.segments) {
      const end = start + seg.duration;
      if (end > offset) {
        let from;
        let at;
        if (start < offset) {
          const cur = paramsAt(program, offset);
          from = valuesFor(cur.carrier, cur.beat);
          at = now;
        } else {
          from = valuesFor(seg.carrier[0], seg.beat[0]);
          at = base + start;
        }
        const to = valuesFor(seg.carrier[1], seg.beat[1]);
        for (const [p, w] of params) {
          p.setValueAtTime(from[w], at);
          p.linearRampToValueAtTime(to[w], base + end);
        }
      }
      start = end;
    }
    const cur = paramsAt(program, offset);
    this.settings.carrier = cur.carrier;
    this.settings.beat = cur.beat;
  }

  // ------------------------------------------------------------ lifecycle

  async start(settings = {}, { program = null, programOffset = 0, fadeIn = 5, duration = Infinity, fadeDownMinutes = 0 } = {}) {
    this.applySettings(settings);
    const ctx = this._ensureContext();
    await this._resumeContext();
    if (this.session) this._teardown(this.session, ctx.currentTime);

    const sess = this._buildSession();
    this.session = sess;
    this.program = program;
    const now = ctx.currentTime;
    if (program) this._scheduleProgram(sess, program, programOffset);
    else this._setFrequencies(sess, now, 0);

    this.master.gain.setValueAtTime(clamp01(this.settings.masterVolume) * MAX_MASTER_GAIN, now);
    sess.fade.gain.setValueAtTime(0, now);
    sess.fade.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fadeIn));
    for (const o of [...sess.L.oscs, ...sess.R.oscs, sess.lfo, sess.spatialLfo]) o.start(now);
    this._startTime = now - programOffset;
    this.state = 'running';

    this.setSchedule({ duration, fadeDownMinutes });
    this._applyVoices(sess, now, true);
    this._applyBreath(sess);
    this._applyNoise(sess, now);
    this._layersReady = Promise.all([this._applyBuffered(sess, 'nature'), this._applyBuffered(sess, 'illusion')]);
  }

  // Resolves when nature/illusion buffers for the current session are playing.
  whenLayersReady() {
    return this._layersReady;
  }

  async pause(fadeSec = 0.4) {
    if (this.state !== 'running') return;
    this.state = 'paused';
    const sess = this.session;
    ramp(sess.fade.gain, 0, this.ctx.currentTime, fadeSec);
    await sleep(fadeSec * 1000);
    if (this.state === 'paused' && this.session === sess && this.ctx.suspend) await this.ctx.suspend();
  }

  async resume(fadeSec = 0.4) {
    if (this.state !== 'paused') return;
    this.state = 'running';
    await this._resumeContext();
    ramp(this.session.fade.gain, 1, this.ctx.currentTime, fadeSec);
  }

  async stop(fadeSec = 3) {
    if (this.state === 'idle' || !this.session) return;
    const sess = this.session;
    const wasPaused = this.state === 'paused';
    this.state = 'idle';
    this.session = null;
    this.program = null;
    if (wasPaused) {
      // Context is suspended: no audible fade possible, so stop right away.
      await this._resumeContext();
      this._teardown(sess, this.ctx.currentTime);
      return;
    }
    const now = this.ctx.currentTime;
    ramp(sess.fade.gain, 0, now, fadeSec);
    this._teardown(sess, now + fadeSec + 0.05);
    await sleep(fadeSec * 1000);
  }

  // Offline export: fade the last `seconds` of the render to silence.
  scheduleEndFade(duration, seconds = 3) {
    if (!this.session) return;
    const p = this.session.fade.gain;
    const startAt = this._startTime + Math.max(0, duration - seconds);
    p.setValueAtTime(1, startAt);
    p.linearRampToValueAtTime(0, this._startTime + duration);
  }

  // Browsers may suspend audio on their own (e.g. iOS backgrounding).
  async ensureRunning() {
    if (this.state === 'running' && this.ctx && this.ctx.state !== 'running') {
      try { await this._resumeContext(); } catch { /* ignore */ }
    }
  }

  // 0.6 s tone in the left ear, then 0.6 s in the right ear.
  async testChannels() {
    if (this.state !== 'idle') return null;
    const ctx = this._ensureContext();
    await this._resumeContext();
    const now = ctx.currentTime + 0.05;
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const merger = ctx.createChannelMerger(2);
    const gl = ctx.createGain();
    const gr = ctx.createGain();
    osc.connect(gl); osc.connect(gr);
    gl.connect(merger, 0, 0); gr.connect(merger, 0, 1);
    merger.connect(this.master);
    const env = (node, t0) => {
      node.gain.setValueAtTime(0, now);
      node.gain.setValueAtTime(0, t0);
      node.gain.linearRampToValueAtTime(0.5, t0 + 0.04);
      node.gain.setValueAtTime(0.5, t0 + 0.56);
      node.gain.linearRampToValueAtTime(0, t0 + 0.6);
    };
    env(gl, now);
    env(gr, now + 0.8);
    osc.start(now);
    osc.stop(now + 1.45);
    setTimeout(() => { for (const n of [osc, gl, gr, merger]) { try { n.disconnect(); } catch { /* ignore */ } } }, 1600);
    return { leftAt: 0, rightAt: 0.8, duration: 1.5 };
  }

  // -------------------------------------------------------------- setters

  applySettings(partial) {
    const s = this.settings;
    if (partial.mode !== undefined && MODES.includes(partial.mode)) s.mode = partial.mode;
    if (partial.waveform !== undefined && WAVEFORMS.includes(partial.waveform)) s.waveform = partial.waveform;
    if (partial.timbre !== undefined && TIMBRES.includes(partial.timbre)) s.timbre = partial.timbre;
    if (partial.carrier !== undefined) s.carrier = sanitizeCarrier(partial.carrier);
    if (partial.beat !== undefined) s.beat = sanitizeBeat(partial.beat);
    for (const k of ['toneVolume', 'noiseVolume', 'natureVolume', 'illusionVolume', 'masterVolume']) {
      if (partial[k] !== undefined) s[k] = clamp01(partial[k]);
    }
    if (partial.noiseType !== undefined && (partial.noiseType === 'off' || NOISE_FILLERS[partial.noiseType])) s.noiseType = partial.noiseType;
    if (partial.natureType !== undefined && (partial.natureType === 'off' || NATURE_TRIM[partial.natureType])) s.natureType = partial.natureType;
    if (partial.illusionType !== undefined && (partial.illusionType === 'off' || ILLUSION_TRIM[partial.illusionType])) s.illusionType = partial.illusionType;
    if (partial.voices !== undefined) s.voices = sanitizeVoices(partial.voices);
    if (partial.spatialRate !== undefined && SPATIAL_RATES.includes(partial.spatialRate)) s.spatialRate = partial.spatialRate;
    if (partial.layerPulse !== undefined && LAYER_PULSE_LEVELS.includes(partial.layerPulse)) s.layerPulse = partial.layerPulse;
    if (partial.breathPattern !== undefined && (partial.breathPattern === 'off' || BREATH_PATTERNS[partial.breathPattern])) s.breathPattern = partial.breathPattern;
    if (partial.breathCue !== undefined) s.breathCue = !!partial.breathCue;
  }

  setTone({ carrier, beat }) {
    if (this.program) return; // E-P4
    this.applySettings({ carrier, beat });
    if (!this.session) return;
    const now = this.ctx.currentTime;
    this._setFrequencies(this.session, now, TONE_TAU);
    if (this.settings.timbre === 'pad') this._applyTimbreValues(this.session, now);
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    this.settings.mode = mode;
    if (!this.session) return;
    const sess = this.session;
    const now = this.ctx.currentTime;
    const r = ROUTING[mode];
    for (const k of ['gLL', 'gLR', 'gRL', 'gRR']) glide(sess[k].gain, r[k], now, MODE_TAU);
    glide(sess.am.gain, 1 - r.depth / 2, now, MODE_TAU);
    glide(sess.lfoDepth.gain, r.depth / 2, now, MODE_TAU);
    glide(sess.bilatL.gain, r.bilat, now, MODE_TAU);
    glide(sess.bilatR.gain, -r.bilat, now, MODE_TAU);
    if (this.program) this._scheduleProgram(sess, this.program, this.elapsed);
    else this._setFrequencies(sess, now, MODE_TAU);
  }

  setWaveform(type) {
    if (!WAVEFORMS.includes(type)) return;
    this.settings.waveform = type;
    if (this.session) this._applyTimbreValues(this.session, this.ctx.currentTime);
  }

  setTimbre(timbre) {
    if (!TIMBRES.includes(timbre)) return;
    this.settings.timbre = timbre;
    if (this.session) this._applyTimbreValues(this.session, this.ctx.currentTime);
  }

  setToneVolume(v) {
    this.settings.toneVolume = clamp01(v);
    if (this.session) glide(this.session.tone.gain, this.settings.toneVolume, this.ctx.currentTime, GAIN_TAU);
  }

  setMasterVolume(v) {
    this.settings.masterVolume = clamp01(v);
    if (this.ctx) glide(this.master.gain, this.settings.masterVolume * MAX_MASTER_GAIN, this.ctx.currentTime, GAIN_TAU);
  }

  setNoise({ type, volume } = {}) {
    this.applySettings({ noiseType: type, noiseVolume: volume });
    if (!this.session) return;
    const now = this.ctx.currentTime;
    if (volume !== undefined) glide(this.session.noiseBus.gain, this.settings.noiseVolume, now, GAIN_TAU);
    if (type !== undefined) this._applyNoise(this.session, now);
  }

  // Nature / illusion: returns a promise that resolves once the buffer is ready.
  setNature({ type, volume } = {}) {
    return this._setBuffered('nature', type, volume);
  }

  setIllusion({ type, volume } = {}) {
    return this._setBuffered('illusion', type, volume);
  }

  _setBuffered(kind, type, volume) {
    this.applySettings({ [`${kind}Type`]: type, [`${kind}Volume`]: volume });
    if (this.session && volume !== undefined) {
      glide(this.session[`${kind}Bus`].gain, this.settings[`${kind}Volume`], this.ctx.currentTime, GAIN_TAU);
    }
    if (type === undefined) return Promise.resolve();
    if (this.session) return this._applyBuffered(this.session, kind);
    const t = this.settings[`${kind}Type`];
    // Idle: pre-render so it's instant when playback starts.
    return t === 'off' ? Promise.resolve() : this._loadData(t).then(() => {}, () => {});
  }

  setVoices(voices) {
    this.settings.voices = sanitizeVoices(voices);
    if (this.session) this._applyVoices(this.session, this.ctx.currentTime, false);
  }

  setSpatial(rate) {
    if (!SPATIAL_RATES.includes(rate)) return;
    this.settings.spatialRate = rate;
    if (!this.session) return;
    const now = this.ctx.currentTime;
    if (rate > 0) glide(this.session.spatialLfo.frequency, rate / 60, now, 0.5);
    glide(this.session.spatialDepth.gain, rate > 0 ? 0.9 : 0, now, 0.5);
  }

  setLayerPulse(depth) {
    if (!LAYER_PULSE_LEVELS.includes(depth)) return;
    this.settings.layerPulse = depth;
    if (!this.session) return;
    const now = this.ctx.currentTime;
    glide(this.session.layerPulse.gain, 1 - depth / 2, now, 0.1);
    glide(this.session.pulseDepth.gain, depth / 2, now, 0.1);
  }

  setBreath({ pattern, cue } = {}) {
    this.applySettings({ breathPattern: pattern, breathCue: cue });
    if (this.session) this._applyBreath(this.session);
  }

  // Session length + sleep fade-down (spec 07 §5). Reschedules from `elapsed`.
  setSchedule({ duration = this.duration, fadeDownMinutes = this.fadeDownMinutes } = {}) {
    this.duration = duration;
    this.fadeDownMinutes = fadeDownMinutes;
    if (!this.session) return;
    const p = this.session.fadeDown.gain;
    const now = this.ctx.currentTime;
    const elapsed = this.elapsed;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    if (!(fadeDownMinutes > 0) || !Number.isFinite(duration)) {
      p.linearRampToValueAtTime(1, now + 0.5);
      return;
    }
    const endAt = now + Math.max(0.05, duration - elapsed);
    const startAt = now + (duration - fadeDownMinutes * 60 - elapsed);
    if (startAt > now) {
      p.linearRampToValueAtTime(1, Math.min(now + 0.5, startAt));
      p.setValueAtTime(1, startAt);
    }
    p.linearRampToValueAtTime(0, endAt);
  }

  // --------------------------------------------------------------- voices

  _applyVoices(sess, now, initial) {
    const ctx = this.ctx;
    this.settings.voices.forEach((v, i) => {
      const have = sess.voices[i];
      const f = splitFrequencies(v.carrier, v.beat);
      const target = v.volume * VOICE_GAIN;
      if (v.on && !have) {
        const voice = { oscL: ctx.createOscillator(), oscR: ctx.createOscillator(), merger: ctx.createChannelMerger(2), gain: ctx.createGain() };
        voice.oscL.frequency.value = f.left;
        voice.oscR.frequency.value = f.right;
        voice.oscL.connect(voice.merger, 0, 0);
        voice.oscR.connect(voice.merger, 0, 1);
        voice.merger.connect(voice.gain);
        voice.gain.connect(sess.tone);
        voice.gain.gain.setValueAtTime(initial ? target : 0, now);
        if (!initial) voice.gain.gain.linearRampToValueAtTime(target, now + VOICE_FADE);
        voice.oscL.start(now);
        voice.oscR.start(now);
        sess.voices[i] = voice;
      } else if (v.on && have) {
        glide(have.oscL.frequency, f.left, now, TONE_TAU);
        glide(have.oscR.frequency, f.right, now, TONE_TAU);
        glide(have.gain.gain, target, now, GAIN_TAU);
      } else if (!v.on && have) {
        ramp(have.gain.gain, 0, now, VOICE_FADE);
        for (const o of [have.oscL, have.oscR]) { try { o.stop(now + VOICE_FADE + 0.05); } catch { /* ignore */ } }
        sess.voices[i] = null;
        setTimeout(() => { for (const n of Object.values(have)) { try { n.disconnect(); } catch { /* ignore */ } } }, (VOICE_FADE + 0.3) * 1000);
      }
    });
  }

  // --------------------------------------------------------------- breath

  _applyBreath(sess) {
    const now = this.ctx.currentTime;
    const params = [[sess.breathLayers.gain, 0.55], [sess.breathTone.gain, 0.85]];
    const pattern = BREATH_PATTERNS[this.settings.breathPattern];
    for (const [p] of params) {
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
    }
    if (!pattern || !this.settings.breathCue) {
      for (const [p] of params) p.linearRampToValueAtTime(1, now + 0.5);
      return;
    }
    const remaining = Number.isFinite(this.duration) ? Math.max(1, this.duration - this.elapsed + 5) : BREATH_HORIZON;
    const events = breathEvents(pattern, now + 0.05, remaining);
    this.breathOrigin = this.elapsed + 0.05;
    for (const [p, low] of params) {
      for (const e of events) p.linearRampToValueAtTime(low + (1 - low) * e.level, e.time);
    }
  }

  // --------------------------------------------------------------- layers

  _fadeOutLayer(layer, now) {
    if (!layer) return;
    ramp(layer.gain.gain, 0, now, LAYER_XFADE);
    try { layer.src.stop(now + LAYER_XFADE + 0.05); } catch { /* ignore */ }
    setTimeout(() => { try { layer.src.disconnect(); layer.gain.disconnect(); } catch { /* ignore */ } }, (LAYER_XFADE + 0.2) * 1000);
  }

  _startLayer(buffer, bus, trim, now) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(trim, now + LAYER_XFADE);
    src.connect(gain);
    gain.connect(bus);
    // Random start point so repeated sessions don't sound identical.
    const offset = Math.random() * buffer.duration;
    src.start(now, Number.isFinite(offset) ? offset : 0);
    return { src, gain };
  }

  _noiseBuffer(type) {
    if (this._noiseBuffers.has(type)) return this._noiseBuffers.get(type);
    const ctx = this.ctx;
    const len = Math.round(NOISE_SECONDS * ctx.sampleRate);
    const F = Math.round(0.1 * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const rand = mulberry32(type.length * 7919 + 17);
    for (let ch = 0; ch < 2; ch++) {
      // Render a little extra and fold it into the start so the loop is seamless.
      const data = NOISE_FILLERS[type](new Float32Array(len + F), rand);
      for (let i = 0; i < F; i++) {
        const p = i / F;
        data[i] = data[i] * Math.sin((p * Math.PI) / 2) + data[len + i] * Math.cos((p * Math.PI) / 2);
      }
      buf.getChannelData(ch).set(data.subarray(0, len));
    }
    this._noiseBuffers.set(type, buf);
    return buf;
  }

  _applyNoise(sess, now) {
    const type = this.settings.noiseType;
    if (type === sess.layerTypes.noise) return;
    this._fadeOutLayer(sess.layers.noise, now);
    sess.layers.noise = null;
    sess.layerTypes.noise = type;
    if (type === 'off') return;
    sess.layers.noise = this._startLayer(this._noiseBuffer(type), sess.noiseBus, NOISE_TRIM[type], now);
  }

  _workerRender(type) {
    if (this._worker === undefined) {
      try { this._worker = this._workerFactory ? this._workerFactory() : null; } catch { this._worker = null; }
      if (this._worker) {
        this._worker.onmessage = (e) => {
          const job = this._workerJobs.get(e.data.id);
          if (!job) return;
          this._workerJobs.delete(e.data.id);
          if (e.data.error) job.reject(new Error(e.data.error));
          else job.resolve(e.data);
        };
        this._worker.onerror = () => {
          // Module workers unsupported or failed: fall back to main thread for all jobs.
          for (const [, job] of this._workerJobs) job.fallback();
          this._workerJobs.clear();
          this._worker = null;
        };
      }
    }
    const mainThread = () => new Promise((resolve, reject) => {
      setTimeout(() => { try { resolve(renderNature(type)); } catch (err) { reject(err); } }, 0);
    });
    if (!this._worker) return mainThread();
    return new Promise((resolve, reject) => {
      const id = ++this._jobId;
      this._workerJobs.set(id, { resolve, reject, fallback: () => mainThread().then(resolve, reject) });
      this._worker.postMessage({ id, type });
    });
  }

  _loadData(type) {
    if (!SHARED_DATA.has(type)) {
      this._setLoading(type, +1);
      const p = this._workerRender(type).finally(() => this._setLoading(type, -1));
      p.catch(() => SHARED_DATA.delete(type));
      SHARED_DATA.set(type, p);
    }
    return SHARED_DATA.get(type);
  }

  _setLoading(type, delta) {
    const n = (this._loading.get(type) || 0) + delta;
    if (n > 0) this._loading.set(type, n); else this._loading.delete(type);
    if (typeof this.onLoading === 'function') this.onLoading([...this._loading.keys()]);
  }

  async _applyBuffered(sess, kind) {
    const type = this.settings[`${kind}Type`];
    if (type === sess.layerTypes[kind]) return;
    sess.layerTypes[kind] = type;
    this._fadeOutLayer(sess.layers[kind], this.ctx.currentTime);
    sess.layers[kind] = null;
    if (type === 'off') return;
    let buf = this._audioBuffers.get(type);
    if (!buf) {
      const data = await this._loadData(type);
      buf = this.ctx.createBuffer(2, data.left.length, data.sampleRate);
      buf.getChannelData(0).set(data.left);
      buf.getChannelData(1).set(data.right);
      this._audioBuffers.set(type, buf);
    }
    // The user may have changed type or stopped while we were rendering.
    if (this.session !== sess || sess.layerTypes[kind] !== type || sess.layers[kind]) return;
    const trim = kind === 'nature' ? NATURE_TRIM[type] : ILLUSION_TRIM[type];
    sess.layers[kind] = this._startLayer(buf, sess[`${kind}Bus`], trim, this.ctx.currentTime);
  }
}
