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
    setTimbre(v) { calls.push(['setTimbre', v]); },
    async setIllusion(v) { calls.push(['setIllusion', v]); },
    setVoices(v) { calls.push(['setVoices', v]); },
    setSpatial(v) { calls.push(['setSpatial', v]); },
    setLayerPulse(v) { calls.push(['setLayerPulse', v]); },
    setBreath(v) { calls.push(['setBreath', v]); },
    setSchedule(v) { calls.push(['setSchedule', v]); },
    breathOrigin: 0,
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

test('start passes duration and fade-down to the engine', async () => {
  const { engine, controller } = setup({ sessionMinutes: 20, fadeDownMinutes: 10 });
  await controller.start();
  const [, , opts] = engine.calls.find((c) => c[0] === 'start');
  assert.equal(opts.duration, 1200);
  assert.equal(opts.fadeDownMinutes, 10);
  controller.setFadeDown(15);
  assert.deepEqual(engine.calls.at(-1), ['setSchedule', { fadeDownMinutes: 15 }]);
  controller.setSessionMinutes(45);
  assert.deepEqual(engine.calls.find((c) => c[0] === 'setSchedule' && c[1].duration), ['setSchedule', { duration: 2700 }]);
});

test('bilateral special preset switches mode; band preset switches back', () => {
  const { store, controller } = setup();
  controller.applySpecial('bilateral-1');
  assert.equal(store.get().mode, 'bilateral');
  assert.equal(store.get().beat, 1);
  controller.applyPreset('alpha-10');
  assert.equal(store.get().mode, 'binaural');
});

test('voice stack loads main tone and both voices', () => {
  const { store, engine, controller } = setup();
  controller.applyStack('stack-focus');
  const st = store.get();
  assert.equal(st.beat, 14);
  assert.equal(st.voices[0].on, true);
  assert.equal(st.voices[0].beat, 40);
  assert.ok(engine.calls.some((c) => c[0] === 'setVoices'));
  controller.setVoice(1, { on: false, beat: 999 });
  assert.equal(store.get().voices[1].on, false);
  assert.equal(store.get().voices[1].beat, 45);
});

test('effects and breath intents validate input', () => {
  const { store, controller } = setup();
  controller.setSpatial(8);
  controller.setSpatial(7);
  controller.setLayerPulse(0.6);
  controller.setBreathPattern('box');
  controller.setBreathPattern('nope');
  controller.setBreathCue(true);
  controller.setTimbre('pad');
  controller.setIllusion('shepard-up', 0.2);
  const st = store.get();
  assert.equal(st.spatialRate, 8);
  assert.equal(st.layerPulse, 0.6);
  assert.equal(st.breathPattern, 'box');
  assert.equal(st.breathCue, true);
  assert.equal(st.timbre, 'pad');
  assert.equal(st.illusionType, 'shepard-up');
  assert.equal(st.illusionVolume, 0.2);
});

test('custom programs: save (new + edit), select, delete', () => {
  const { store, controller } = setup();
  const draft = { name: 'My Wind Down', description: 'test', segments: [
    { label: 'A', duration: 60, beat: [10, 6], carrier: [200, 180] },
    { label: 'B', duration: 120, beat: [6, 3], carrier: [180, 150] },
  ] };
  const bad = controller.saveCustomProgram({ ...draft, segments: [{ label: 'x', duration: 0, beat: [1, 1], carrier: [200, 200] }] });
  assert.equal(bad.ok, false);
  const res = controller.saveCustomProgram(draft);
  assert.equal(res.ok, true);
  assert.ok(res.program.id.startsWith('custom-'));
  assert.equal(store.get().customPrograms.length, 1);
  controller.selectProgram(res.program.id);
  assert.equal(store.get().activeProgramId, res.program.id);
  const edited = controller.saveCustomProgram({ ...res.program, name: 'Renamed' });
  assert.equal(edited.ok, true);
  assert.equal(store.get().customPrograms.length, 1);
  assert.equal(store.get().customPrograms[0].name, 'Renamed');
  assert.equal(controller.deleteCustomProgram(res.program.id), true);
  assert.equal(store.get().customPrograms.length, 0);
  assert.equal(store.get().activeProgramId, null);
});

test('export uses the injected renderer and reports status', async () => {
  const settings = { ...DEFAULT_SETTINGS, acknowledged: true, exportMinutes: 5, exportRate: 22050 };
  const store = createStore({ ...settings, ...runtimeState(settings) });
  let args = null;
  const exporter = async (a) => { args = a; a.onProgress(0.5); return new ArrayBuffer(8); };
  const controller = createController({ store, engine: fakeEngine(), timers, exporter });
  const res = await controller.exportAudio();
  assert.equal(args.seconds, 300);
  assert.equal(args.sampleRate, 22050);
  assert.ok(res.fileName.endsWith('-5min.wav'));
  assert.equal(store.get().exportStatus.state, 'done');
  controller.selectProgram('power-nap');
  controller.setExportMinutes('program');
  assert.equal(controller.exportSeconds(), 1200);
});

test('export failure is reported, not thrown', async () => {
  const settings = { ...DEFAULT_SETTINGS, acknowledged: true };
  const store = createStore({ ...settings, ...runtimeState(settings) });
  const controller = createController({ store, engine: fakeEngine(), timers, exporter: async () => { throw new Error('no offline'); } });
  assert.equal(await controller.exportAudio(), null);
  assert.equal(store.get().exportStatus.state, 'error');
  assert.equal(store.get().exportStatus.message, 'no offline');
});
