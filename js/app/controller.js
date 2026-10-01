// Controller: the only module that talks to both the store and the engine
// (spec 03 §3). UI code calls these intents; it never touches the engine.

import { sanitizeBeat, sanitizeCarrier, MODES, WAVEFORMS } from '../engine/frequency.js';
import { paramsAt, programDuration } from '../engine/program.js';
import { findCarrier, findPreset, findProgram } from './presets.js';
import { PERSISTED_KEYS, saveSettings, SESSION_MINUTES, FADE_IN_OPTIONS, THEMES, TABS } from './persistence.js';

export const FADE_OUT = 3;
const TICK_MS = 200;
const SAVE_DEBOUNCE_MS = 300;

export function createController({ store, engine, storage = null, timers = globalThis }) {
  let tick = null;
  let stopping = false;
  let saveTimer = null;
  let announceSeq = 0;

  const s = () => store.get();
  const engineSettings = (st) => ({
    mode: st.mode, carrier: st.carrier, beat: st.beat, waveform: st.waveform,
    toneVolume: st.toneVolume, noiseType: st.noiseType, noiseVolume: st.noiseVolume,
    natureType: st.natureType, natureVolume: st.natureVolume, masterVolume: st.masterVolume,
  });

  function announce(text) {
    store.set({ announcement: { text, n: ++announceSeq } });
  }

  function activeProgram() {
    const id = s().activeProgramId;
    return id ? findProgram(id) : null;
  }

  function liveFor(st, program, elapsed) {
    if (program) {
      const p = paramsAt(program, elapsed);
      return { carrier: p.carrier, beat: p.beat, segmentIndex: p.segmentIndex,
        segmentLabel: program.segments[p.segmentIndex].label };
    }
    return { carrier: st.carrier, beat: st.beat, segmentIndex: -1, segmentLabel: '' };
  }

  // ------------------------------------------------------------ clock

  function onTick() {
    const st = s();
    if (st.status !== 'running') return;
    const elapsed = engine.elapsed;
    const program = activeProgram();
    const patch = { elapsed };
    if (program) {
      const live = liveFor(st, program, elapsed);
      if (live.segmentIndex !== st.live.segmentIndex) announce(live.segmentLabel);
      patch.live = live;
    }
    store.set(patch);
    if (!stopping && Number.isFinite(st.duration) && elapsed >= st.duration - Math.min(FADE_OUT, st.duration)) {
      announce('Session complete');
      stop();
    }
  }

  function startTick() {
    stopTick();
    tick = timers.setInterval(onTick, TICK_MS);
  }

  function stopTick() {
    if (tick !== null) timers.clearInterval(tick);
    tick = null;
  }

  // ------------------------------------------------------------ lifecycle

  async function start() {
    const st = s();
    if (st.status !== 'idle') return;
    if (!st.acknowledged) {
      store.set({ welcomeOpen: true });
      return;
    }
    const program = activeProgram();
    const duration = program ? programDuration(program) : (st.sessionMinutes > 0 ? st.sessionMinutes * 60 : Infinity);
    stopping = false;
    store.set({ status: 'starting', error: null, elapsed: 0, duration, live: liveFor(st, program, 0) });
    try {
      await engine.start(engineSettings(st), { program, fadeIn: st.fadeIn });
    } catch (err) {
      store.set({ status: 'idle', error: (err && err.message) || 'Audio could not start.' });
      return;
    }
    if (s().status !== 'starting') { await engine.stop(0.1); return; } // stopped while starting
    store.set({ status: 'running' });
    announce(program ? `Playing ${program.name}` : 'Playing');
    startTick();
  }

  async function pause() {
    if (s().status !== 'running') return;
    stopTick();
    store.set({ status: 'paused', elapsed: engine.elapsed });
    announce('Paused');
    await engine.pause();
  }

  async function resume() {
    if (s().status !== 'paused') return;
    store.set({ status: 'running' });
    announce('Resumed');
    await engine.resume();
    startTick();
  }

  async function stop() {
    const st = s();
    if (st.status === 'idle' || st.status === 'testing') return;
    stopping = true;
    stopTick();
    store.set({ status: 'idle', elapsed: 0, live: liveFor(st, null, 0) });
    await engine.stop(FADE_OUT);
    stopping = false;
  }

  function togglePlay() {
    const status = s().status;
    if (status === 'idle') return start();
    if (status === 'running') return pause();
    if (status === 'paused') return resume();
    return Promise.resolve();
  }

  // ------------------------------------------------------------ tone

  function applyTone(patch) {
    const st = s();
    const next = { ...patch };
    const carrier = next.carrier ?? st.carrier;
    const beat = next.beat ?? st.beat;
    if (!activeProgram()) next.live = { ...st.live, carrier, beat };
    store.set(next);
    engine.setTone({ carrier, beat });
  }

  function presetStillMatches(st, carrier, beat) {
    const p = st.activePresetId && findPreset(st.activePresetId);
    return p && p.carrier === carrier && p.beat === beat ? p.id : null;
  }

  function setCarrier(hz) {
    if (activeProgram()) return; // the selected program owns the tone
    const carrier = sanitizeCarrier(hz);
    applyTone({ carrier, activePresetId: presetStillMatches(s(), carrier, s().beat) });
  }

  function setBeat(hz) {
    if (activeProgram()) return; // the selected program owns the tone
    const beat = sanitizeBeat(hz);
    applyTone({ beat, activePresetId: presetStillMatches(s(), s().carrier, beat) });
  }

  function applyPreset(id) {
    const p = findPreset(id);
    if (!p) return;
    const st = s();
    if (st.activeProgramId && st.status !== 'idle') {
      announce('Stop the program before choosing a preset');
      return;
    }
    store.set({ activeProgramId: null, tab: 'manual' });
    applyTone({ carrier: p.carrier, beat: p.beat, activePresetId: p.id });
    announce(`${p.name}: ${p.beat} Hz`);
  }

  function applyCarrierPreset(id) {
    const c = findCarrier(id);
    if (!c) return;
    setCarrier(c.hz);
    announce(`Carrier ${c.hz} Hz`);
  }

  function selectProgram(id) {
    if (s().status !== 'idle') {
      announce('Stop playback before changing program');
      return;
    }
    const program = id ? findProgram(id) : null;
    store.set({ activeProgramId: program ? program.id : null, tab: program ? 'programs' : s().tab });
    if (program) announce(`${program.name} selected. Press play to begin.`);
  }

  // ------------------------------------------------------------ sound

  function setMode(mode) {
    if (!MODES.includes(mode)) return;
    store.set({ mode });
    engine.setMode(mode);
  }

  function setWaveform(waveform) {
    if (!WAVEFORMS.includes(waveform)) return;
    store.set({ waveform });
    engine.setWaveform(waveform);
  }

  const vol = (v) => Math.min(1, Math.max(0, Number(v) || 0));

  function setToneVolume(v) { store.set({ toneVolume: vol(v) }); engine.setToneVolume(vol(v)); }
  function setMasterVolume(v) { store.set({ masterVolume: vol(v) }); engine.setMasterVolume(vol(v)); }

  function setNoise(type, volume) {
    const patch = {};
    if (type !== undefined) patch.noiseType = type;
    if (volume !== undefined) patch.noiseVolume = vol(volume);
    store.set(patch);
    engine.setNoise({ type, volume: patch.noiseVolume });
  }

  function setNature(type, volume) {
    const patch = {};
    if (type !== undefined) patch.natureType = type;
    if (volume !== undefined) patch.natureVolume = vol(volume);
    store.set(patch);
    return engine.setNature({ type, volume: patch.natureVolume });
  }

  // ------------------------------------------------------------ misc

  function setSessionMinutes(m) {
    const n = Number(m);
    if (!SESSION_MINUTES.includes(n)) return;
    const st = s();
    const patch = { sessionMinutes: n };
    if (st.status !== 'idle' && !activeProgram()) patch.duration = n > 0 ? n * 60 : Infinity;
    store.set(patch);
  }

  function setFadeIn(sec) {
    const n = Number(sec);
    if (FADE_IN_OPTIONS.includes(n)) store.set({ fadeIn: n });
  }

  function setTheme(theme) { if (THEMES.includes(theme)) store.set({ theme }); }
  function setTab(tab) { if (TABS.includes(tab)) store.set({ tab }); }
  function setBandFilter(bandFilter) { store.set({ bandFilter }); }
  function acknowledge() { store.set({ acknowledged: true, welcomeOpen: false }); }
  function openWelcome() { store.set({ welcomeOpen: true }); }
  function closeWelcome() { store.set({ welcomeOpen: false }); }
  function clearError() { store.set({ error: null }); }

  async function testChannels() {
    if (s().status !== 'idle') return;
    store.set({ status: 'testing', testSide: 'left' });
    announce('Left ear');
    let plan;
    try {
      plan = await engine.testChannels();
    } catch (err) {
      store.set({ status: 'idle', testSide: null, error: (err && err.message) || 'Audio could not start.' });
      return;
    }
    plan = plan || { rightAt: 0.8, duration: 1.5 };
    await new Promise((r) => timers.setTimeout(r, plan.rightAt * 1000));
    store.set({ testSide: 'right' });
    announce('Right ear');
    await new Promise((r) => timers.setTimeout(r, (plan.duration - plan.rightAt) * 1000));
    store.set({ status: 'idle', testSide: null });
  }

  function onVisible() {
    if (s().status === 'running') engine.ensureRunning();
  }

  // Persist settings (debounced) whenever a persisted key changes.
  store.subscribe((st, prev) => {
    if (!storage) return;
    if (!PERSISTED_KEYS.some((k) => !Object.is(st[k], prev[k]))) return;
    if (saveTimer !== null) timers.clearTimeout(saveTimer);
    saveTimer = timers.setTimeout(() => { saveTimer = null; saveSettings(storage, s()); }, SAVE_DEBOUNCE_MS);
  });

  engine.onNatureLoading = (loading) => store.set({ natureLoading: loading });

  return {
    start, pause, resume, stop, togglePlay,
    setCarrier, setBeat, applyPreset, applyCarrierPreset, selectProgram,
    setMode, setWaveform, setToneVolume, setMasterVolume, setNoise, setNature,
    setSessionMinutes, setFadeIn, setTheme, setTab, setBandFilter,
    acknowledge, openWelcome, closeWelcome, clearError, testChannels, onVisible,
    getAnalysers: () => engine.analysers,
    _tick: onTick, // exposed for tests
  };
}

export function runtimeState(settings) {
  return {
    status: 'idle', elapsed: 0, duration: settings.sessionMinutes > 0 ? settings.sessionMinutes * 60 : Infinity,
    live: { carrier: settings.carrier, beat: settings.beat, segmentIndex: -1, segmentLabel: '' },
    natureLoading: false, error: null, welcomeOpen: false, testSide: null, announcement: null,
  };
}
