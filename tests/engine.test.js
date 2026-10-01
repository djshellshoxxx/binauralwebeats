import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine, MAX_MASTER_GAIN } from '../js/engine/audio-engine.js';
import { FakeAudioContext } from './helpers/fake-audio.js';

function makeEngine() {
  const ctx = new FakeAudioContext();
  const engine = new AudioEngine({ contextFactory: () => ctx, workerFactory: () => null });
  return { ctx, engine };
}

const program = {
  id: 'p', name: 'P',
  segments: [
    { label: 'a', duration: 10, beat: [10, 6], carrier: [200, 180] },
    { label: 'b', duration: 20, beat: [6, 4], carrier: [180, 150] },
  ],
};

test('setters are safe while idle and no context is created', () => {
  const { engine } = makeEngine();
  engine.setTone({ carrier: 300, beat: 5 });
  engine.setMode('monaural');
  engine.setNoise({ type: 'pink', volume: 0.5 });
  engine.setMasterVolume(2);
  assert.equal(engine.ctx, null);
  assert.equal(engine.settings.carrier, 300);
  assert.equal(engine.settings.mode, 'monaural');
  assert.equal(engine.settings.masterVolume, 1);
  assert.equal(engine.elapsed, 0);
});

test('binaural start: L/R split, hard-panned routing, master cap', async () => {
  const { ctx, engine } = makeEngine();
  await engine.start({ carrier: 200, beat: 10, masterVolume: 1 }, { fadeIn: 0 });
  const s = engine.session;
  assert.equal(engine.state, 'running');
  assert.equal(s.oscL.frequency.value, 195);
  assert.equal(s.oscR.frequency.value, 205);
  assert.equal(s.lfo.frequency.value, 10);
  assert.deepEqual([s.gLL, s.gLR, s.gRL, s.gRR].map((g) => g.gain.value), [1, 0, 0, 1]);
  assert.equal(s.lfoDepth.gain.value, 0);
  assert.ok(engine.master.gain.value <= MAX_MASTER_GAIN);
  // left osc feeds merger input 0 only via gLL; right feeds input 1 via gRR
  assert.deepEqual(s.gLL.connections[0].input, 0);
  assert.deepEqual(s.gRR.connections[0].input, 1);
  assert.ok(ctx.byKind('compressor').length === 1, 'limiter present');
});

test('isochronic mode: same carrier both ears, full AM depth', async () => {
  const { engine } = makeEngine();
  await engine.start({ mode: 'isochronic', carrier: 300, beat: 40 }, { fadeIn: 0 });
  const s = engine.session;
  assert.equal(s.oscL.frequency.value, 300);
  assert.equal(s.oscR.frequency.value, 300);
  assert.equal(s.lfoDepth.gain.value, 0.5);
  assert.equal(s.am.gain.value, 0.5);
  assert.ok(s.lfo.periodicWave, 'pulse wave set');
});

test('switching to monaural while running glides routing to 0.5 everywhere', async () => {
  const { engine } = makeEngine();
  await engine.start({}, { fadeIn: 0 });
  engine.setMode('monaural');
  const s = engine.session;
  assert.deepEqual([s.gLL, s.gLR, s.gRL, s.gRR].map((g) => g.gain.value), [0.5, 0.5, 0.5, 0.5]);
  assert.ok(s.gLR.gain.calls.some((c) => c[0] === 'target'), 'uses a glide, not a jump');
});

test('manual tone change glides with setTargetAtTime', async () => {
  const { engine } = makeEngine();
  await engine.start({ carrier: 200, beat: 10 }, { fadeIn: 0 });
  engine.setTone({ carrier: 250, beat: 4 });
  const s = engine.session;
  assert.equal(s.oscL.frequency.value, 248);
  assert.equal(s.oscR.frequency.value, 252);
  assert.ok(s.oscL.frequency.calls.some((c) => c[0] === 'target'));
});

test('program scheduling: exact linear ramps per segment; setTone ignored', async () => {
  const { ctx, engine } = makeEngine();
  ctx.currentTime = 100;
  await engine.start({}, { program, fadeIn: 0 });
  const calls = engine.session.oscL.frequency.calls;
  const ramps = calls.filter((c) => c[0] === 'linear');
  assert.deepEqual(ramps.map((c) => [c[1], c[2]]), [[177, 110], [148, 130]]); // 180-3, 150-2
  const lfoRamps = engine.session.lfo.frequency.calls.filter((c) => c[0] === 'linear');
  assert.deepEqual(lfoRamps.map((c) => c[1]), [6, 4]);
  engine.setTone({ carrier: 500, beat: 20 });
  assert.equal(engine.settings.carrier, 200); // unchanged, program owns the tone
});

test('elapsed follows the audio clock and freezes while paused', async () => {
  const { ctx, engine } = makeEngine();
  ctx.currentTime = 5;
  await engine.start({}, { fadeIn: 0 });
  ctx.currentTime = 12.5;
  assert.equal(engine.elapsed, 7.5);
  await engine.pause(0.001);
  assert.equal(engine.state, 'paused');
  assert.equal(ctx.state, 'suspended');
  await engine.resume(0.001);
  assert.equal(engine.state, 'running');
  assert.equal(ctx.state, 'running');
});

test('stop fades out and stops all sources', async () => {
  const { engine } = makeEngine();
  await engine.start({ noiseType: 'white' }, { fadeIn: 0 });
  const s = engine.session;
  assert.ok(s.noise, 'noise layer started');
  await engine.stop(0.001);
  assert.equal(engine.state, 'idle');
  assert.equal(engine.session, null);
  assert.notEqual(s.oscL.stopped, null);
  assert.notEqual(s.noise.src.stopped, null);
  assert.equal(s.fade.gain.value, 0);
});

test('noise layer crossfades when the type changes', async () => {
  const { engine } = makeEngine();
  await engine.start({ noiseType: 'pink' }, { fadeIn: 0 });
  const first = engine.session.noise;
  engine.setNoise({ type: 'brown' });
  const second = engine.session.noise;
  assert.notEqual(first, second);
  assert.equal(first.gain.gain.value, 0);
  assert.notEqual(first.src.stopped, null);
  engine.setNoise({ type: 'off' });
  assert.equal(engine.session.noise, null);
  await engine.stop(0.001);
});

test('nature layer renders (main-thread fallback) and starts looping', async () => {
  const { engine } = makeEngine();
  const loading = [];
  engine.onNatureLoading = (v) => loading.push(v);
  await engine.start({}, { fadeIn: 0 });
  await engine.setNature({ type: 'rain', volume: 0.5 });
  const nat = engine.session.nature;
  assert.ok(nat, 'nature started');
  assert.equal(nat.src.loop, true);
  assert.equal(nat.src.buffer.numberOfChannels, 2);
  assert.deepEqual(loading, [true, false]);
  assert.equal(engine.session.natureBus.gain.value, 0.5);
  await engine.stop(0.001);
});

test('testChannels plays left then right only when idle', async () => {
  const { ctx, engine } = makeEngine();
  const plan = await engine.testChannels();
  assert.ok(plan.rightAt > 0);
  const merger = ctx.byKind('merger').at(-1);
  assert.equal(merger.channels, 2);
  await engine.start({}, { fadeIn: 0 });
  assert.equal(await engine.testChannels(), null);
  await engine.stop(0.001);
});
