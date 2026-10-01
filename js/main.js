// Bootstrap (spec 03 §6, spec 07).

import { AudioEngine } from './engine/audio-engine.js';
import { createStore } from './app/store.js';
import { DEFAULT_SETTINGS, loadSettings } from './app/persistence.js';
import { createController, runtimeState } from './app/controller.js';
import { bindUI } from './ui/controls.js';
import { createEditor } from './ui/editor.js';
import { bindSystem } from './ui/system.js';
import { createVisualizer } from './ui/visualizer.js';
import { setupPWA } from './ui/pwa.js';

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function boot() {
  const storage = safeStorage();
  const settings = { ...DEFAULT_SETTINGS, ...loadSettings(storage) };
  const store = createStore({ ...settings, ...runtimeState(settings) });
  const engine = new AudioEngine();
  const controller = createController({ store, engine, storage });

  const editor = createEditor({ store, controller });
  bindUI({ store, controller, editor });
  bindSystem({ store, controller });
  createVisualizer(document.getElementById('viz'), {
    store,
    getAnalysers: () => controller.getAnalysers(),
    getBreathTime: () => controller.getBreathTime(),
    breathLabel: document.getElementById('breath-label'),
  });
  setupPWA({ installButton: document.getElementById('install') });

  if (!(globalThis.AudioContext || globalThis.webkitAudioContext)) {
    document.getElementById('play').disabled = true;
    store.set({ error: 'Your browser does not support the Web Audio API, so beats cannot play.' });
  }

  if (!store.get().acknowledged) store.set({ welcomeOpen: true });

  // Handy for debugging in the console.
  globalThis.binauralwebeats = { store, controller, engine };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
