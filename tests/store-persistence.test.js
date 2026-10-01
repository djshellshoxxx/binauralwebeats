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
