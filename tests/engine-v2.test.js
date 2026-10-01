import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../js/engine/audio-engine.js';
import { FakeAudioContext } from './helpers/fake-audio.js';

function makeEngine(opts = {}) {
  const ctx = new FakeAudioContext();
  const engine = new AudioEngine({ contextFactory: () => ctx, workerFactory: () => null, ...opts });
  return { ctx, engine };
}

test('bilateral: carrier in both ears, opposite-phase LFO on each ear', async () => {
  const { engine } = makeEngine();
  await engine.start({ mode: 'bilateral', carrier: 220, beat: 1 }, { fadeIn: 0 });
  const s = engine.session;
  assert.equal(s.L.oscs[0].frequency.value, 220);
  assert.equal(s.R.oscs[0].frequency.value, 220);
  assert.equal(s.gLL.gain.value, 0.5);
  assert.equal(s.gRR.gain.value, 0.5);
  assert.equal(s.gLR.gain.value, 0);
  assert.equal(s.bilatL.gain.value, 0.5);
  assert.equal(s.bilatR.gain.value, -0.5);
  assert.ok(s.bilatL.connections.some((c) => c.dest === s.gLL.gain));
  assert.ok(s.bilatR.connections.some((c) => c.dest === s.gRR.gain));
  engine.setMode('binaural');
  assert.equal(s.bilatL.gain.value, 0);
  assert.equal(s.gLL.gain.value, 1);
  await engine.stop(0.001);
});

test('pad timbre: detuned voices audible, sawtooth, low-passed', async () => {
  const { engine } = makeEngine();
  await engine.start({ timbre: 'pad', carrier: 200 }, { fadeIn: 0 });
  const s = engine.session;
  assert.deepEqual(s.L.gains.map((g) => g.gain.value), [0.5, 0.35, 0.35]);
  assert.deepEqual(s.L.oscs.map((o) => o.detune.value), [0, 3, -3]);
  assert.ok(s.L.oscs.every((o) => o.type === 'sawtooth'));
  assert.equal(s.L.filter.frequency.value, 800);
  engine.setTimbre('pure');
  assert.deepEqual(s.L.gains.map((g) => g.gain.value), [1, 0, 0]);
  assert.equal(s.L.oscs[0].type, 'sine');
  await engine.stop(0.001);
});

test('extra voices: created as binaural pairs, glided, faded out', async () => {
  const { ctx, engine } = makeEngine();
  await engine.start({ voices: [{ on: true, carrier: 400, beat: 40, volume: 1 }, { on: false }] }, { fadeIn: 0 });
  const v = engine.session.voices[0];
  assert.ok(v);
  assert.equal(v.oscL.frequency.value, 380);
  assert.equal(v.oscR.frequency.value, 420);
  assert.equal(v.gain.gain.value, 0.6);
  assert.equal(engine.session.voices[1], null);
  engine.setVoices([{ on: true, carrier: 300, beat: 10, volume: 0.5 }, { on: true, carrier: 100, beat: 2, volume: 0.5 }]);
  assert.equal(engine.session.voices[0], v, 'same voice glides');
  assert.equal(v.oscL.frequency.value, 295);
  assert.ok(engine.session.voices[1]);
  ctx.currentTime = 1;
  engine.setVoices([{ on: false }, { on: true, carrier: 100, beat: 2, volume: 0.5 }]);
  assert.equal(engine.session.voices[0], null);
  assert.equal(v.gain.gain.value, 0);
  assert.notEqual(v.oscL.stopped, null);
  await engine.stop(0.001);
});

test('sleep fade-down holds at 1 then ramps to 0 at the end', async () => {
  const { ctx, engine } = makeEngine();
  ctx.currentTime = 10;
  await engine.start({}, { fadeIn: 0, duration: 1800, fadeDownMinutes: 10 });
  const calls = engine.session.fadeDown.gain.calls;
  const hold = calls.find((c) => c[0] === 'set' && c[1] === 1 && c[2] > 10);
  assert.equal(hold[2], 10 + 1200);
  const last = calls.at(-1);
  assert.deepEqual([last[0], last[1], last[2]], ['linear', 0, 10 + 1800]);
  // Reschedule mid-session: already inside the window -> ramp from now.
  ctx.currentTime = 10 + 1500;
  engine.setSchedule({ fadeDownMinutes: 10 });
  const after = engine.session.fadeDown.gain.calls.at(-1);
  assert.deepEqual([after[0], after[1], after[2]], ['linear', 0, 10 + 1800]);
  // Disabled -> back to 1.
  engine.setSchedule({ fadeDownMinutes: 0 });
  assert.equal(engine.session.fadeDown.gain.calls.at(-1)[1], 1);
  await engine.stop(0.001);
});

test('spatial sweep and layer pulse', async () => {
  const { engine } = makeEngine();
  await engine.start({ spatialRate: 4, layerPulse: 0.6 }, { fadeIn: 0 });
  const s = engine.session;
  assert.ok(Math.abs(s.spatialLfo.frequency.value - 4 / 60) < 1e-9);
  assert.equal(s.spatialDepth.gain.value, 0.9);
  assert.ok(s.spatialDepth.connections.some((c) => c.dest === s.spatial.pan));
  assert.equal(s.layerPulse.gain.value, 0.7);
  assert.equal(s.pulseDepth.gain.value, 0.3);
  engine.setSpatial(0);
  engine.setLayerPulse(0);
  assert.equal(s.spatialDepth.gain.value, 0);
  assert.equal(s.pulseDepth.gain.value, 0);
  assert.equal(s.layerPulse.gain.value, 1);
  engine.setSpatial(5); // invalid rate ignored
  assert.equal(engine.settings.spatialRate, 0);
  await engine.stop(0.001);
});

test('breath audio cue schedules automation on layers and tone', async () => {
  const { engine } = makeEngine();
  await engine.start({ breathPattern: 'calm', breathCue: true }, { fadeIn: 0, duration: 120 });
  const ramps = engine.session.breathLayers.gain.calls.filter((c) => c[0] === 'linear');
  assert.ok(ramps.length > 40, `${ramps.length} ramps`);
  const vals = ramps.map((c) => c[1]);
  assert.ok(Math.min(...vals) >= 0.55 - 1e-9 && Math.max(...vals) <= 1 + 1e-9);
  assert.ok(Math.max(...ramps.map((c) => c[2])) >= 120);
  engine.setBreath({ cue: false });
  assert.equal(engine.session.breathLayers.gain.calls.at(-1)[1], 1);
  await engine.stop(0.001);
});

test('illusion layer plays a looping Shepard buffer', async () => {
  const { engine } = makeEngine();
  await engine.start({ illusionType: 'shepard-down', illusionVolume: 0.4 }, { fadeIn: 0 });
  await engine.whenLayersReady();
  const layer = engine.session.layers.illusion;
  assert.ok(layer);
  assert.equal(layer.src.loop, true);
  assert.equal(engine.session.illusionBus.gain.value, 0.4);
  await engine.setIllusion({ type: 'off' });
  assert.equal(engine.session.layers.illusion, null);
  await engine.stop(0.001);
});

test('offline engine never calls resume and supports an end fade', async () => {
  const ctx = new FakeAudioContext();
  ctx.state = 'suspended';
  let resumed = false;
  ctx.resume = async () => { resumed = true; };
  const engine = new AudioEngine({ contextFactory: () => ctx, workerFactory: () => null, offline: true });
  await engine.start({}, { fadeIn: 1, duration: 60 });
  engine.scheduleEndFade(60, 3);
  assert.equal(resumed, false);
  assert.equal(engine.analysers, null);
  const last = engine.session.fade.gain.calls.at(-1);
  assert.deepEqual([last[0], last[1], last[2]], ['linear', 0, 60]);
});
