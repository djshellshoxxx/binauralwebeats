import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/app/store.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, STORAGE_KEY } from '../js/app/persistence.js';

test('store merges, detects changes and unsubscribes', () => {
  const store = createStore({ a: 1, b: 2 });
  const seen = [];
  const off = store.subscribe((s, prev) => seen.push([prev.a, s.a]));
  assert.equal(store.set({ a: 1 }), false);
  assert.equal(store.set({ a: 3 }), true);
  assert.deepEqual(store.get(), { a: 3, b: 2 });
  off();
  store.set({ a: 4 });
  assert.deepEqual(seen, [[1, 3]]);
  assert.ok(Object.isFrozen(store.get()));
});

test('a failing subscriber does not block the others', () => {
  const store = createStore({ a: 1 });
  let ran = false;
  const orig = console.error;
  console.error = () => {};
  store.subscribe(() => { throw new Error('boom'); });
  store.subscribe(() => { ran = true; });
  store.set({ a: 2 });
  console.error = orig;
  assert.equal(ran, true);
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('settings round-trip and runtime keys are not persisted', () => {
  const storage = memoryStorage();
  const state = { ...DEFAULT_SETTINGS, beat: 7.83, natureType: 'rain', status: 'running', elapsed: 99 };
  assert.equal(saveSettings(storage, state), true);
  const raw = JSON.parse(storage.m.get(STORAGE_KEY));
  assert.equal(raw.status, undefined);
  const loaded = loadSettings(storage);
  assert.equal(loaded.beat, 7.83);
  assert.equal(loaded.natureType, 'rain');
});

test('invalid values are dropped, garbage is tolerated', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ beat: 9999, mode: 'nope', masterVolume: 0.2, evil: 1 }));
  assert.deepEqual(loadSettings(storage), { masterVolume: 0.2 });
  storage.setItem(STORAGE_KEY, '{not json');
  assert.deepEqual(loadSettings(storage), {});
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadSettings(throwing), {});
  assert.equal(saveSettings(throwing, DEFAULT_SETTINGS), false);
  assert.deepEqual(loadSettings(null), {});
});

test('v2 keys validate; invalid custom programs are dropped', () => {
  const storage = memoryStorage();
  const good = { id: 'custom-1', name: 'Mine', segments: [{ label: 'a', duration: 60, beat: [10, 5], carrier: [200, 200] }] };
  const bad = { id: 'custom-2', name: 'Broken', segments: [{ label: 'a', duration: -1, beat: [10, 5], carrier: [200, 200] }] };
  storage.setItem(STORAGE_KEY, JSON.stringify({
    mode: 'bilateral', timbre: 'pad', spatialRate: 4, layerPulse: 0.3, illusionType: 'shepard-up',
    breathPattern: '478', breathCue: true, fadeDownMinutes: 10, exportMinutes: 'program', exportRate: 44100,
    voices: [{ on: true, carrier: 400, beat: 40, volume: 0.5 }, { on: false, carrier: 100, beat: 2, volume: 0.5 }],
    customPrograms: [good, bad, { id: 'sleep', name: 'imposter', segments: good.segments }],
    activeProgramId: 'custom-2',
  }));
  const s = loadSettings(storage);
  assert.equal(s.mode, 'bilateral');
  assert.equal(s.timbre, 'pad');
  assert.equal(s.spatialRate, 4);
  assert.equal(s.breathPattern, '478');
  assert.equal(s.exportMinutes, 'program');
  assert.equal(s.voices[0].on, true);
  assert.deepEqual(s.customPrograms.map((p) => p.id), ['custom-1']);
  assert.equal(s.activeProgramId, null, 'selection of a dropped program is cleared');
  storage.setItem(STORAGE_KEY, JSON.stringify({ spatialRate: 5, voices: [{ on: 'yes' }], timbre: 'fuzzy' }));
  assert.deepEqual(loadSettings(storage), {});
});
