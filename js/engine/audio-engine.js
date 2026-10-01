// AudioEngine: Web Audio graph for binaural / monaural / isochronic beats plus
// noise and nature background layers. See docs/specs/01-engine.md.

import { oscFrequencies, sanitizeBeat, sanitizeCarrier, MODES, WAVEFORMS } from './frequency.js';
import { paramsAt } from './program.js';
import { NOISE_FILLERS, NOISE_TRIM, mulberry32 } from './noise.js';
import { NATURE_TRIM, renderNature } from './ambience.js';

export const MAX_MASTER_GAIN = 0.5;
const TONE_TAU = 0.08;
const GAIN_TAU = 0.03;
const MODE_TAU = 0.05;
const LAYER_XFADE = 0.6;
const NOISE_SECONDS = 6;

export const DEFAULT_ENGINE_SETTINGS = Object.freeze({
  mode: 'binaural', carrier: 200, beat: 10, waveform: 'sine', toneVolume: 0.8,
  noiseType: 'off', noiseVolume: 0.3, natureType: 'off', natureVolume: 0.3, masterVolume: 0.4,
});

const ROUTING = {
  binaural: { gLL: 1, gLR: 0, gRL: 0, gRR: 1, depth: 0 },
  monaural: { gLL: 0.5, gLR: 0.5, gRL: 0.5, gRR: 0.5, depth: 0 },
  isochronic: { gLL: 1, gLR: 0, gRL: 0, gRR: 1, depth: 1 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

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

export class AudioEngine {
  constructor({ contextFactory = defaultContextFactory, workerFactory = defaultWorkerFactory } = {}) {
    this._contextFactory = contextFactory;
    this._workerFactory = workerFactory;
    this.settings = { ...DEFAULT_ENGINE_SETTINGS };
    this.ctx = null;
    this.state = 'idle';
    this.session = null;
    this.program = null;
    this._startTime = 0;
    this._noiseBuffers = new Map();
    this._natureData = new Map(); // type -> Promise<{left,right,sampleRate}>
    this._natureBuffers = new Map(); // type -> AudioBuffer
    this._worker = undefined;
    this._workerJobs = new Map();
    this._jobId = 0;
    this._pendingNature = 0;
    this.onNatureLoading = null; // (loading: boolean) => void
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
    this.splitter = ctx.createChannelSplitter(2);
    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    for (const a of [this.analyserL, this.analyserR]) { a.fftSize = 2048; a.smoothingTimeConstant = 0.6; }
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.limiter.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
    this._pulseWave = this._makePulseWave(ctx);
    return ctx;
  }

  // Rounded square wave: odd harmonics 1..7 with Lanczos sigma smoothing.
  _makePulseWave(ctx) {
    const N = 8;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    const M = N + 1;
    for (let n = 1; n < N; n += 2) {
      const x = (Math.PI * n) / M;
      const sigma = Math.sin(x) / x;
      imag[n] = (4 / (Math.PI * n)) * sigma;
    }
    return ctx.createPeriodicWave(real, imag);
  }

  get analysers() {
    return this.ctx ? { left: this.analyserL, right: this.analyserR } : null;
  }

  get elapsed() {
    if (this.state === 'idle' || !this.ctx) return 0;
    return Math.max(0, this.ctx.currentTime - this._startTime);
  }

  // --------------------------------------------------------------- session

  _buildSession() {
    const ctx = this.ctx;
    const s = this.settings;
    const g = () => ctx.createGain();
    const sess = {
      oscL: ctx.createOscillator(), oscR: ctx.createOscillator(), lfo: ctx.createOscillator(),
      gLL: g(), gLR: g(), gRL: g(), gRR: g(), merger: ctx.createChannelMerger(2),
      am: g(), lfoDepth: g(), tone: g(),
      noiseBus: g(), natureBus: g(), fade: g(),
      noise: null, nature: null, noiseType: 'off', natureType: 'off',
    };
    sess.oscL.type = sess.oscR.type = s.waveform;
    sess.lfo.setPeriodicWave(this._pulseWave);
    sess.oscL.connect(sess.gLL); sess.oscL.connect(sess.gLR);
    sess.oscR.connect(sess.gRL); sess.oscR.connect(sess.gRR);
    sess.gLL.connect(sess.merger, 0, 0); sess.gLR.connect(sess.merger, 0, 1);
    sess.gRL.connect(sess.merger, 0, 0); sess.gRR.connect(sess.merger, 0, 1);
    sess.merger.connect(sess.am);
    sess.lfo.connect(sess.lfoDepth);
    sess.lfoDepth.connect(sess.am.gain);
    sess.am.connect(sess.tone);
    sess.tone.connect(sess.fade);
    sess.noiseBus.connect(sess.fade);
    sess.natureBus.connect(sess.fade);
    sess.fade.connect(this.master);

    const r = ROUTING[s.mode];
    for (const k of ['gLL', 'gLR', 'gRL', 'gRR']) sess[k].gain.value = r[k];
    sess.am.gain.value = 1 - r.depth / 2;
    sess.lfoDepth.gain.value = r.depth / 2;
    sess.tone.gain.value = clamp01(s.toneVolume);
    sess.noiseBus.gain.value = clamp01(s.noiseVolume);
    sess.natureBus.gain.value = clamp01(s.natureVolume);
    sess.fade.gain.value = 0;
    return sess;
  }

  _teardown(sess, when) {
    for (const n of [sess.oscL, sess.oscR, sess.lfo, sess.noise?.src, sess.nature?.src]) {
      if (!n) continue;
      try { n.stop(when); } catch { /* already stopped */ }
    }
    const delay = Math.max(0, (when - this.ctx.currentTime) * 1000) + 50;
    setTimeout(() => {
      for (const n of Object.values(sess)) {
        if (n && typeof n.disconnect === 'function') { try { n.disconnect(); } catch { /* ignore */ } }
      }
      for (const layer of [sess.noise, sess.nature]) {
        if (layer) { try { layer.src.disconnect(); layer.gain.disconnect(); } catch { /* ignore */ } }
      }
    }, delay);
  }

  _setFrequencies(sess, now, tau) {
    const { mode, carrier, beat } = this.settings;
    const f = oscFrequencies(mode, carrier, beat);
    if (tau) {
      glide(sess.oscL.frequency, f.left, now, tau);
      glide(sess.oscR.frequency, f.right, now, tau);
      glide(sess.lfo.frequency, beat, now, tau);
    } else {
      sess.oscL.frequency.setValueAtTime(f.left, now);
      sess.oscR.frequency.setValueAtTime(f.right, now);
      sess.lfo.frequency.setValueAtTime(beat, now);
    }
  }

  // Spec E-P1: exact linear ramps per segment from `offset` seconds into the program.
  _scheduleProgram(sess, program, offset) {
    const now = this.ctx.currentTime;
    const base = now - offset;
    const mode = this.settings.mode;
    const params = [sess.oscL.frequency, sess.oscR.frequency, sess.lfo.frequency];
    const valuesFor = (carrier, beat) => {
      const f = oscFrequencies(mode, carrier, beat);
      return [f.left, f.right, beat];
    };
    for (const p of params) p.cancelScheduledValues(now);
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
        params.forEach((p, i) => {
          p.setValueAtTime(from[i], at);
          p.linearRampToValueAtTime(to[i], base + end);
        });
      }
      start = end;
    }
    const cur = paramsAt(program, offset);
    this.settings.carrier = cur.carrier;
    this.settings.beat = cur.beat;
  }

  // ------------------------------------------------------------ lifecycle

  async start(settings = {}, { program = null, programOffset = 0, fadeIn = 5 } = {}) {
    this.applySettings(settings);
    const ctx = this._ensureContext();
    if (ctx.state === 'suspended' && ctx.resume) await ctx.resume();
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
    sess.oscL.start(now);
    sess.oscR.start(now);
    sess.lfo.start(now);
    this._startTime = now - programOffset;
    this.state = 'running';

    this._applyNoise(sess, now);
    this._applyNature(sess);
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
    if (this.ctx.state !== 'running' && this.ctx.resume) await this.ctx.resume();
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
      if (this.ctx.resume) await this.ctx.resume();
      this._teardown(sess, this.ctx.currentTime);
      return;
    }
    const now = this.ctx.currentTime;
    ramp(sess.fade.gain, 0, now, fadeSec);
    this._teardown(sess, now + fadeSec + 0.05);
    await sleep(fadeSec * 1000);
  }

  // Browsers may suspend audio on their own (e.g. iOS backgrounding).
  async ensureRunning() {
    if (this.state === 'running' && this.ctx && this.ctx.state !== 'running' && this.ctx.resume) {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  // 0.6 s tone in the left ear, then 0.6 s in the right ear.
  async testChannels() {
    if (this.state !== 'idle') return null;
    const ctx = this._ensureContext();
    if (ctx.state === 'suspended' && ctx.resume) await ctx.resume();
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
    const plan = { leftAt: 0, rightAt: 0.8, duration: 1.5 };
    setTimeout(() => { for (const n of [osc, gl, gr, merger]) { try { n.disconnect(); } catch { /* ignore */ } } }, 1600);
    return plan;
  }

  // -------------------------------------------------------------- setters

  applySettings(partial) {
    const s = this.settings;
    if (partial.mode !== undefined && MODES.includes(partial.mode)) s.mode = partial.mode;
    if (partial.waveform !== undefined && WAVEFORMS.includes(partial.waveform)) s.waveform = partial.waveform;
    if (partial.carrier !== undefined) s.carrier = sanitizeCarrier(partial.carrier);
    if (partial.beat !== undefined) s.beat = sanitizeBeat(partial.beat);
    for (const k of ['toneVolume', 'noiseVolume', 'natureVolume', 'masterVolume']) {
      if (partial[k] !== undefined) s[k] = clamp01(partial[k]);
    }
    if (partial.noiseType !== undefined && (partial.noiseType === 'off' || NOISE_FILLERS[partial.noiseType])) s.noiseType = partial.noiseType;
    if (partial.natureType !== undefined && (partial.natureType === 'off' || NATURE_TRIM[partial.natureType])) s.natureType = partial.natureType;
  }

  setTone({ carrier, beat }) {
    if (this.program) return; // E-P4
    this.applySettings({ carrier, beat });
    if (this.state === 'idle' || !this.session) return;
    this._setFrequencies(this.session, this.ctx.currentTime, TONE_TAU);
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
    if (this.program) this._scheduleProgram(sess, this.program, this.elapsed);
    else this._setFrequencies(sess, now, MODE_TAU);
  }

  setWaveform(type) {
    if (!WAVEFORMS.includes(type)) return;
    this.settings.waveform = type;
    if (this.session) this.session.oscL.type = this.session.oscR.type = type;
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

  // Returns a promise that resolves once the nature buffer is ready (or immediately).
  setNature({ type, volume } = {}) {
    this.applySettings({ natureType: type, natureVolume: volume });
    if (this.session && volume !== undefined) {
      glide(this.session.natureBus.gain, this.settings.natureVolume, this.ctx.currentTime, GAIN_TAU);
    }
    if (type === undefined) return Promise.resolve();
    if (this.session) return this._applyNature(this.session);
    // Idle: pre-render so it's instant when playback starts.
    return this.settings.natureType === 'off' ? Promise.resolve() : this._loadNatureData(this.settings.natureType).catch(() => {});
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
    if (type === sess.noiseType) return;
    this._fadeOutLayer(sess.noise, now);
    sess.noise = null;
    sess.noiseType = type;
    if (type === 'off') return;
    const buf = this._noiseBuffer(type);
    sess.noise = this._startLayer(buf, sess.noiseBus, NOISE_TRIM[type], now);
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

  _loadNatureData(type) {
    if (!this._natureData.has(type)) {
      this._setNatureLoading(+1);
      const p = this._workerRender(type).finally(() => this._setNatureLoading(-1));
      p.catch(() => this._natureData.delete(type));
      this._natureData.set(type, p);
    }
    return this._natureData.get(type);
  }

  _setNatureLoading(delta) {
    const before = this._pendingNature > 0;
    this._pendingNature += delta;
    const after = this._pendingNature > 0;
    if (before !== after && typeof this.onNatureLoading === 'function') this.onNatureLoading(after);
  }

  async _applyNature(sess) {
    const type = this.settings.natureType;
    if (type === sess.natureType) return;
    sess.natureType = type;
    this._fadeOutLayer(sess.nature, this.ctx.currentTime);
    sess.nature = null;
    if (type === 'off') return;
    let buf = this._natureBuffers.get(type);
    if (!buf) {
      const data = await this._loadNatureData(type);
      buf = this.ctx.createBuffer(2, data.left.length, data.sampleRate);
      buf.getChannelData(0).set(data.left);
      buf.getChannelData(1).set(data.right);
      this._natureBuffers.set(type, buf);
    }
    // The user may have changed type or stopped while we were rendering.
    if (this.session !== sess || sess.natureType !== type || sess.nature) return;
    sess.nature = this._startLayer(buf, sess.natureBus, NATURE_TRIM[type], this.ctx.currentTime);
  }
}
