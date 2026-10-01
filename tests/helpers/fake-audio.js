// Minimal fake Web Audio implementation that records calls for engine tests.

export class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.calls = [];
  }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.calls.push(['linear', v, t]); this.value = v; return this; }
  setTargetAtTime(v, t, tau) { this.calls.push(['target', v, t, tau]); this.value = v; return this; }
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); return this; }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.connections = [];
    ctx.nodes.push(this);
  }
  connect(dest, output = 0, input = 0) { this.connections.push({ dest, output, input }); return dest; }
  disconnect() { this.connections = []; }
}

class FakeOscillator extends FakeNode {
  constructor(ctx) {
    super(ctx, 'oscillator');
    this.type = 'sine';
    this.frequency = new FakeParam(440);
    this.detune = new FakeParam(0);
    this.started = null;
    this.stopped = null;
    this.periodicWave = null;
  }
  setPeriodicWave(w) { this.periodicWave = w; this.type = 'custom'; }
  start(t = 0) { this.started = t; }
  stop(t = 0) { this.stopped = t; }
}

class FakeGain extends FakeNode {
  constructor(ctx) { super(ctx, 'gain'); this.gain = new FakeParam(1); }
}

class FakeBufferSource extends FakeNode {
  constructor(ctx) { super(ctx, 'buffersource'); this.buffer = null; this.loop = false; this.started = null; this.stopped = null; }
  start(t = 0, offset = 0) { this.started = t; this.offset = offset; }
  stop(t = 0) { this.stopped = t; }
}

export class FakeAudioContext {
  constructor({ sampleRate = 8000 } = {}) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.state = 'running';
    this.nodes = [];
    this.destination = new FakeNode(this, 'destination');
  }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  createOscillator() { return new FakeOscillator(this); }
  createGain() { return new FakeGain(this); }
  createBufferSource() { return new FakeBufferSource(this); }
  createChannelMerger(n) { const m = new FakeNode(this, 'merger'); m.channels = n; return m; }
  createChannelSplitter(n) { const m = new FakeNode(this, 'splitter'); m.channels = n; return m; }
  createAnalyser() { const a = new FakeNode(this, 'analyser'); a.fftSize = 2048; return a; }
  createDynamicsCompressor() {
    const c = new FakeNode(this, 'compressor');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) c[k] = new FakeParam(0);
    return c;
  }
  createPeriodicWave(real, imag) { return { real, imag }; }
  createStereoPanner() { const p = new FakeNode(this, 'panner'); p.pan = new FakeParam(0); return p; }
  createBiquadFilter() {
    const f = new FakeNode(this, 'biquad');
    f.type = 'lowpass';
    f.frequency = new FakeParam(350);
    f.Q = new FakeParam(1);
    return f;
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
      getChannelData: (ch) => data[ch],
    };
  }
  byKind(kind) { return this.nodes.filter((n) => n.kind === kind); }
}
