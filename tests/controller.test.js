import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/app/store.js';
import { DEFAULT_SETTINGS } from '../js/app/persistence.js';
import { createController, runtimeState } from '../js/app/controller.js';

function fakeEngine() {
  const calls = [];
  const engine = {
    state: 'idle', elapsed: 0, analysers: null, onNatureLoading: null, calls,
    async start(settings, opts) { calls.push(['start', settings, opts]); this.state = 'running'; },
    async pause() { calls.push(['pause']); this.state = 'paused'; },
    async resume() { calls.push(['resume']); this.state = 'running'; },
    async stop() { calls.push(['stop']); this.state = 'idle'; },
    setTone(v) { calls.push(['setTone', v]); },
    setMode(v) { calls.push(['setMode', v]); },
    setWaveform(v) { calls.push(['setWaveform', v]); },
    setToneVolume(v) { calls.push(['setToneVolume', v]); },
    setMasterVolume(v) { calls.push(['setMasterVolume', v]); },
    setNoise(v) { calls.push(['setNoise', v]); },
    async setNature(v) { calls.push(['setNature', v]); },
    async testChannels() { calls.push(['test']); return { rightAt: 0, duration: 0 }; },
    ensureRunning() { calls.push(['ensureRunning']); },
  };
  return engine;
}

const timers = {
  setInterval: () => 1, clearInterval: () => {},
  setTimeout: (fn) => setTimeout(fn, 0), clearTimeout: (id) => clearTimeout(id),
};

function setup(overrides = {}) {
  const settings = { ...DEFAULT_SETTINGS, acknowledged: true, ...overrides };
  const store = createStore({ ...settings, ...runtimeState(settings) });
  const engine = fakeEngine();
  const controller = createController({ store, engine, timers });
  return { store, engine, controller };
}

test('start requires the headphone/safety acknowledgement', async () => {
  const { store, engine, controller } = setup({ acknowledged: false });
  await controller.togglePlay();
  assert.equal(store.get().status, 'idle');
  assert.equal(store.get().welcomeOpen, true);
  assert.equal(engine.calls.length, 0);
  controller.acknowledge();
  await controller.togglePlay();
  assert.equal(store.get().status, 'running');
});

test('play → pause → resume → stop', async () => {
  const { store, engine, controller } = setup();
  await controller.togglePlay();
  assert.equal(store.get().status, 'running');
  assert.equal(store.get().duration, 30 * 60);
  await controller.togglePlay();
  assert.equal(store.get().status, 'paused');
  await controller.togglePlay();
  assert.equal(store.get().status, 'running');
  await controller.stop();
  assert.equal(store.get().status, 'idle');
  assert.deepEqual(engine.calls.map((c) => c[0]), ['start', 'pause', 'resume', 'stop']);
});

test('engine failure surfaces an error and returns to idle', async () => {
  const { store, engine, controller } = setup();
  engine.start = async () => { throw new Error('nope'); };
  await controller.start();
  assert.equal(store.get().status, 'idle');
  assert.equal(store.get().error, 'nope');
});

test('auto-stop at the end of the session', async () => {
  const { store, engine, controller } = setup({ sessionMinutes: 5 });
  await controller.start();
  engine.elapsed = 5 * 60 - 2; // within the fade-out window
  controller._tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(store.get().status, 'idle');
  assert.ok(engine.calls.some((c) => c[0] === 'stop'));
});

test('presets set beat + carrier, clear program, and glide the engine', () => {
  const { store, engine, controller } = setup({ activeProgramId: 'sleep' });
  controller.applyPreset('theta-783');
  const st = store.get();
  assert.equal(st.beat, 7.83);
  assert.equal(st.carrier, 200);
  assert.equal(st.activePresetId, 'theta-783');
  assert.equal(st.activeProgramId, null);
  assert.deepEqual(engine.calls.at(-1), ['setTone', { carrier: 200, beat: 7.83 }]);
  controller.setBeat(8.5);
  assert.equal(store.get().activePresetId, null);
});

test('program start passes the program and its duration', async () => {
  const { store, engine, controller } = setup();
  controller.selectProgram('power-nap');
  await controller.start();
  const [, , opts] = engine.calls.find((c) => c[0] === 'start');
  assert.equal(opts.program.id, 'power-nap');
  assert.equal(store.get().duration, 20 * 60);
  engine.elapsed = 500; // 8m20s: third segment (3 + 4 min before it)
  controller._tick();
  assert.equal(store.get().live.segmentIndex, 2);
  controller.selectProgram('sleep'); // ignored while playing
  assert.equal(store.get().activeProgramId, 'power-nap');
  controller.setBeat(30); // ignored: the program owns the tone
  assert.equal(store.get().beat, DEFAULT_SETTINGS.beat);
});

test('mixer intents update store and engine', () => {
  const { store, engine, controller } = setup();
  controller.setNoise('pink');
  controller.setNoise(undefined, 0.7);
  controller.setNature('rainthunder', 0.4);
  controller.setMasterVolume(1.5);
  const st = store.get();
  assert.equal(st.noiseType, 'pink');
  assert.equal(st.noiseVolume, 0.7);
  assert.equal(st.natureType, 'rainthunder');
  assert.equal(st.natureVolume, 0.4);
  assert.equal(st.masterVolume, 1);
  assert.ok(engine.calls.some((c) => c[0] === 'setNature' && c[1].type === 'rainthunder'));
});

test('settings are persisted (debounced)', async () => {
  const settings = { ...DEFAULT_SETTINGS, acknowledged: true };
  const store = createStore({ ...settings, ...runtimeState(settings) });
  const saved = [];
  const storage = { getItem: () => null, setItem: (k, v) => saved.push(JSON.parse(v)) };
  const controller = createController({ store, engine: fakeEngine(), storage, timers });
  controller.setMode('isochronic');
  controller.setWaveform('triangle');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].mode, 'isochronic');
  assert.equal(saved[0].waveform, 'triangle');
});

test('L/R test cycles left → right → idle', async () => {
  const { store, controller } = setup();
  const sides = [];
  store.subscribe((s, p) => { if (s.testSide !== p.testSide) sides.push(s.testSide); });
  await controller.testChannels();
  assert.deepEqual(sides, ['left', 'right', null]);
  assert.equal(store.get().status, 'idle');
});
