// Bootstrap (spec 03 §6, spec 07).

import { AudioEngine } from './engine/audio-engine.js';
import { createStore } from './app/store.js';
import { DEFAULT_SETTINGS, loadSettings } from './app/persistence.js';
import { buildShareUrl, readSharedSettings } from './app/share-session.js';
import { createController, runtimeState } from './app/controller.js';
import { bindUI } from './ui/controls.js';
import { createEditor } from './ui/editor.js';
import { bindSystem } from './ui/system.js';
import { createVisualizer } from './ui/visualizer.js';
import { setupPWA } from './ui/pwa.js';
import { bindDonate } from './ui/donate.js';

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function setShareButtonStatus(button, label) {
  const original = button.dataset.defaultLabel || '↗ Share session';
  button.textContent = label;
  clearTimeout(button._statusTimer);
  button._statusTimer = setTimeout(() => { button.textContent = original; }, 1800);
}

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  return copied;
}

function bindShareSession(store) {
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;

  const button = document.createElement('button');
  button.id = 'share-session';
  button.className = 'pill-btn';
  button.type = 'button';
  button.dataset.defaultLabel = '↗ Share session';
  button.textContent = button.dataset.defaultLabel;
  button.title = 'Share a link that restores the current sound and session settings';
  actions.insertBefore(button, actions.firstChild);

  button.addEventListener('click', async () => {
    const url = buildShareUrl(globalThis.location.href, store.get());
    try {
      if (globalThis.navigator?.share) {
        await globalThis.navigator.share({
          title: 'Binaural We Beats session',
          text: 'Open this Binaural We Beats session preset.',
          url,
        });
        setShareButtonStatus(button, '✓ Shared');
        return;
      }
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(url);
      } else if (!fallbackCopy(url)) {
        throw new Error('copy unavailable');
      }
      setShareButtonStatus(button, '✓ Link copied');
    } catch (err) {
      if (err?.name !== 'AbortError') setShareButtonStatus(button, 'Copy failed');
    }
  });
}

function boot() {
  const storage = safeStorage();
  const localSettings = loadSettings(storage);
  const sharedSettings = readSharedSettings(globalThis.location.href);
  const settings = { ...DEFAULT_SETTINGS, ...localSettings, ...sharedSettings };
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
  bindDonate();
  bindShareSession(store);

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
