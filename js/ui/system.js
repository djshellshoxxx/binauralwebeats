// Browser integrations: keyboard shortcuts, Media Session, wake lock, visibility.

import { findPreset, findProgram } from '../app/presets.js';
import { formatHzShort } from './format.js';

function isTyping(target) {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  if (tag === 'INPUT') return !['range', 'radio', 'checkbox', 'button'].includes(target.type);
  return false;
}

export function bindSystem({ store, controller }) {
  // Keyboard: Space = play/pause, Esc = stop.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (store.get().welcomeOpen) return;
    const t = e.target;
    if (e.code === 'Space' || e.key === ' ') {
      // Let buttons, knobs and inputs handle their own Space.
      if (isTyping(t) || (t instanceof Element && (t.tagName === 'BUTTON' || t.tagName === 'SUMMARY' || t.getAttribute('role') === 'slider'))) return;
      e.preventDefault();
      controller.togglePlay();
    } else if (e.key === 'Escape') {
      if (isTyping(t)) return;
      controller.stop();
    }
  });

  // Visibility: resume a context the browser suspended behind our back.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      controller.onVisible();
      if (store.get().status === 'running') acquireWakeLock();
    }
  });

  // Media Session (lock-screen / hardware media keys).
  const ms = navigator.mediaSession;
  if (ms) {
    const safe = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* unsupported action */ } };
    safe('play', () => controller.togglePlay());
    safe('pause', () => controller.togglePlay());
    safe('stop', () => controller.stop());
  }

  // Wake lock while running.
  let lock = null;
  async function acquireWakeLock() {
    if (lock || !navigator.wakeLock) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch { lock = null; }
  }
  function releaseWakeLock() {
    if (lock) { lock.release().catch(() => {}); lock = null; }
  }

  store.subscribe((st, prev) => {
    if (st.status !== prev.status) {
      if (st.status === 'running') acquireWakeLock();
      else if (st.status === 'idle' || st.status === 'paused') releaseWakeLock();
      if (ms) ms.playbackState = st.status === 'running' ? 'playing' : st.status === 'paused' ? 'paused' : 'none';
    }
    if (ms && typeof MediaMetadata === 'function' && (st.status !== prev.status || st.activeProgramId !== prev.activeProgramId || st.activePresetId !== prev.activePresetId)) {
      const program = st.activeProgramId && findProgram(st.activeProgramId);
      const preset = st.activePresetId && findPreset(st.activePresetId);
      const title = program ? program.name : preset ? preset.name : `${formatHzShort(st.beat)} Hz beat`;
      try { ms.metadata = new MediaMetadata({ title, artist: 'Binaural We Beats' }); } catch { /* ignore */ }
    }
  });
}
