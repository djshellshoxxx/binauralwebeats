// Controller: the only module that talks to both the store and the engine
// (spec 03 §3, spec 07). UI code calls these intents; it never touches the engine.

import { sanitizeBeat, sanitizeCarrier, MODES, WAVEFORMS, TIMBRES } from '../engine/frequency.js';
import { paramsAt, programDuration, validateProgram } from '../engine/program.js';
import { BREATH_IDS } from '../engine/breath.js';
import { SPATIAL_RATES, LAYER_PULSE_LEVELS } from '../engine/audio-engine.js';
import { NATURE_LABELS, ILLUSION_LABELS } from '../engine/ambience.js';
import { findCarrier, findPreset, findProgram, findSpecial, findStack } from './presets.js';
import {
  PERSISTED_KEYS, saveSettings, SESSION_MINUTES, FADE_IN_OPTIONS, FADE_DOWN_OPTIONS, THEMES, TABS,
  EXPORT_MINUTES, EXPORT_RATES, MAX_CUSTOM_PROGRAMS,
} from './persistence.js';
import { exportFileName, MAX_EXPORT_SECONDS, renderSessionWav } from './exporter.js';

export const FADE_OUT = 3;
const TICK_MS = 200;
const SAVE_DEBOUNCE_MS = 300;

export function createController({
  store, engine, storage = null, timers = globalThis, now = () => Date.now(), exporter = renderSessionWav,
}) {
  let tick = null;
  let stopping = false;
  let saveTimer = null;
  let announceSeq = 0;
  let idleBreathOrigin = now();

  const s = () => store.get();
  const engineSettings = (st) => ({
    mode: st.mode, carrier: st.carrier, beat: st.beat, waveform: st.waveform, timbre: st.timbre,
    toneVolume: st.toneVolume, noiseType: st.noiseType, noiseVolume: st.noiseVolume,
    natureType: st.natureType, natureVolume: st.natureVolume,
    illusionType: st.illusionType, illusionVolume: st.illusionVolume, masterVolume: st.masterVolume,
    voices: st.voices, spatialRate: st.spatialRate, layerPulse: st.layerPulse,
    breathPattern: st.breathPattern, breathCue: st.breathCue,
  });

  function announce(text) {
    store.set({ announcement: { text, n: ++announceSeq } });
  }

  const lookupProgram = (id) => findProgram(id, s().customPrograms);
  const activeProgram = () => lookupProgram(s().activeProgramId);

  function liveFor(st, program, elapsed) {
    if (program) {
      const p = paramsAt(program, elapsed);
      return { carrier: p.carrier, beat: p.beat, segmentIndex: p.segmentIndex,
        segmentLabel: program.segments[p.segmentIndex].label };
    }
    return { carrier: st.carrier, beat: st.beat, segmentIndex: -1, segmentLabel: '' };
  }

  function sessionDuration(st, program) {
    if (program) return programDuration(program);
    return st.sessionMinutes > 0 ? st.sessionMinutes * 60 : Infinity;
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
    const duration = sessionDuration(st, program);
    stopping = false;
    store.set({ status: 'starting', error: null, elapsed: 0, duration, live: liveFor(st, program, 0) });
    try {
      await engine.start(engineSettings(st), { program, fadeIn: st.fadeIn, duration, fadeDownMinutes: st.fadeDownMinutes });
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
    idleBreathOrigin = now();
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
    const p = st.activePresetId && (findPreset(st.activePresetId) || findSpecial(st.activePresetId) || findStack(st.activePresetId));
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

  function canChangeTone() {
    const st = s();
    if (st.activeProgramId && st.status !== 'idle') {
      announce('Stop the program before choosing a preset');
      return false;
    }
    return true;
  }

  function applyPreset(id) {
    const p = findPreset(id);
    if (!p || !canChangeTone()) return;
    store.set({ activeProgramId: null, tab: 'manual' });
    if (s().mode === 'bilateral') setMode('binaural');
    applyTone({ carrier: p.carrier, beat: p.beat, activePresetId: p.id });
    announce(`${p.name}: ${p.beat} Hz`);
  }

  function applySpecial(id) {
    const p = findSpecial(id);
    if (!p || !canChangeTone()) return;
    store.set({ activeProgramId: null, tab: 'manual' });
    setMode(p.mode);
    applyTone({ carrier: p.carrier, beat: p.beat, activePresetId: p.id });
    announce(`${p.name}: ${p.beat} Hz ${p.mode}`);
  }

  function applyStack(id) {
    const stack = findStack(id);
    if (!stack || !canChangeTone()) return;
    store.set({ activeProgramId: null, tab: 'manual' });
    if (s().mode === 'bilateral') setMode('binaural');
    applyTone({ carrier: stack.carrier, beat: stack.beat, activePresetId: stack.id });
    setVoices(stack.voices.map((v) => ({ ...v })));
    announce(`${stack.name} loaded`);
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
    const program = id ? lookupProgram(id) : null;
    store.set({ activeProgramId: program ? program.id : null, tab: program ? 'programs' : s().tab });
    if (program) announce(`${program.name} selected. Press play to begin.`);
  }

  // ------------------------------------------------------------ custom programs

  function saveCustomProgram(draft) {
    const st = s();
    const isNew = !draft.id || !draft.id.startsWith('custom-');
    const program = {
      id: isNew ? `custom-${now()}` : draft.id,
      name: String(draft.name || '').trim().slice(0, 60),
      description: String(draft.description || '').trim().slice(0, 240),
      segments: (draft.segments || []).map((seg) => ({
        label: String(seg.label || '').trim().slice(0, 60) || 'Segment',
        duration: Number(seg.duration),
        beat: [Number(seg.beat[0]), Number(seg.beat[1])],
        carrier: [Number(seg.carrier[0]), Number(seg.carrier[1])],
      })),
    };
    const errors = validateProgram(program);
    if (errors.length) return { ok: false, errors };
    const list = st.customPrograms.filter((p) => p.id !== program.id);
    if (isNew && list.length >= MAX_CUSTOM_PROGRAMS) return { ok: false, errors: [`You can save up to ${MAX_CUSTOM_PROGRAMS} programs.`] };
    const idx = st.customPrograms.findIndex((p) => p.id === program.id);
    const next = [...st.customPrograms];
    if (idx >= 0) next[idx] = program; else next.push(program);
    store.set({ customPrograms: next });
    announce(`Saved ${program.name}`);
    return { ok: true, program, errors: [] };
  }

  function deleteCustomProgram(id) {
    const st = s();
    if (st.status !== 'idle' && st.activeProgramId === id) {
      announce('Stop playback before deleting this program');
      return false;
    }
    const next = st.customPrograms.filter((p) => p.id !== id);
    if (next.length === st.customPrograms.length) return false;
    store.set({ customPrograms: next, activeProgramId: st.activeProgramId === id ? null : st.activeProgramId });
    announce('Program deleted');
    return true;
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

  function setTimbre(timbre) {
    if (!TIMBRES.includes(timbre)) return;
    store.set({ timbre });
    engine.setTimbre(timbre);
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
    if (type !== undefined && NATURE_LABELS[type] && type !== 'off') announce(NATURE_LABELS[type]);
    return engine.setNature({ type, volume: patch.natureVolume });
  }

  function setIllusion(type, volume) {
    const patch = {};
    if (type !== undefined) patch.illusionType = type;
    if (volume !== undefined) patch.illusionVolume = vol(volume);
    store.set(patch);
    if (type !== undefined && ILLUSION_LABELS[type] && type !== 'off') announce(ILLUSION_LABELS[type]);
    return engine.setIllusion({ type, volume: patch.illusionVolume });
  }

  function setVoices(voices) {
    store.set({ voices });
    engine.setVoices(voices);
  }

  function setVoice(index, patch) {
    const voices = s().voices.map((v, i) => {
      if (i !== index) return v;
      const next = { ...v, ...patch };
      if (patch.carrier !== undefined) next.carrier = sanitizeCarrier(patch.carrier);
      if (patch.beat !== undefined) next.beat = sanitizeBeat(patch.beat);
      if (patch.volume !== undefined) next.volume = vol(patch.volume);
      return next;
    });
    setVoices(voices);
  }

  function setSpatial(rate) {
    const n = Number(rate);
    if (!SPATIAL_RATES.includes(n)) return;
    store.set({ spatialRate: n });
    engine.setSpatial(n);
  }

  function setLayerPulse(depth) {
    const n = Number(depth);
    if (!LAYER_PULSE_LEVELS.includes(n)) return;
    store.set({ layerPulse: n });
    engine.setLayerPulse(n);
  }

  function setBreathPattern(pattern) {
    if (!BREATH_IDS.includes(pattern)) return;
    idleBreathOrigin = now();
    store.set({ breathPattern: pattern });
    engine.setBreath({ pattern });
  }

  function setBreathCue(on) {
    store.set({ breathCue: !!on });
    engine.setBreath({ cue: !!on });
  }

  // Seconds into the current breathing cycle clock (visual pacer).
  function getBreathTime() {
    const st = s();
    if (st.status === 'running' || st.status === 'paused') {
      return Math.max(0, engine.elapsed - (st.breathCue ? engine.breathOrigin : 0));
    }
    return (now() - idleBreathOrigin) / 1000;
  }

  // ------------------------------------------------------------ session options

  function setSessionMinutes(m) {
    const n = Number(m);
    if (!SESSION_MINUTES.includes(n)) return;
    const st = s();
    const patch = { sessionMinutes: n };
    if (st.status !== 'idle' && !activeProgram()) {
      patch.duration = n > 0 ? n * 60 : Infinity;
      engine.setSchedule({ duration: patch.duration });
    }
    store.set(patch);
  }

  function setFadeIn(sec) {
    const n = Number(sec);
    if (FADE_IN_OPTIONS.includes(n)) store.set({ fadeIn: n });
  }

  function setFadeDown(minutes) {
    const n = Number(minutes);
    if (!FADE_DOWN_OPTIONS.includes(n)) return;
    store.set({ fadeDownMinutes: n });
    engine.setSchedule({ fadeDownMinutes: n });
  }

  // ------------------------------------------------------------ export

  function setExportMinutes(m) {
    const v = m === 'program' ? m : Number(m);
    if (EXPORT_MINUTES.includes(v)) store.set({ exportMinutes: v });
  }

  function setExportRate(r) {
    const n = Number(r);
    if (EXPORT_RATES.includes(n)) store.set({ exportRate: n });
  }

  function exportSeconds(st = s()) {
    const program = activeProgram();
    if (st.exportMinutes === 'program') return program ? Math.min(MAX_EXPORT_SECONDS, programDuration(program)) : 10 * 60;
    return st.exportMinutes * 60;
  }

  async function exportAudio() {
    const st = s();
    if (st.exportStatus.state === 'rendering') return null;
    const program = activeProgram();
    const seconds = exportSeconds(st);
    const name = program ? program.name : (findPreset(st.activePresetId)?.name || `${st.beat} Hz ${st.mode}`);
    store.set({ exportStatus: { state: 'rendering', progress: 0, message: 'Rendering…' } });
    try {
      const wav = await exporter({
        settings: engineSettings(st), program, seconds, sampleRate: st.exportRate,
        fadeIn: st.fadeIn, fadeDownMinutes: st.fadeDownMinutes,
        onProgress: (p) => store.set({ exportStatus: { state: 'rendering', progress: p, message: `Rendering… ${Math.round(p * 100)}%` } }),
      });
      const fileName = exportFileName(name, seconds);
      store.set({ exportStatus: { state: 'done', progress: 1, message: `Saved ${fileName}` } });
      announce('Export finished');
      return { wav, fileName };
    } catch (err) {
      store.set({ exportStatus: { state: 'error', progress: 0, message: (err && err.message) || 'Export failed.' } });
      return null;
    }
  }

  // ------------------------------------------------------------ misc

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

  engine.onLoading = (types) => store.set({ loadingTypes: types.join(',') });

  return {
    start, pause, resume, stop, togglePlay,
    setCarrier, setBeat, applyPreset, applySpecial, applyStack, applyCarrierPreset, selectProgram,
    saveCustomProgram, deleteCustomProgram, findProgram: lookupProgram,
    setMode, setWaveform, setTimbre, setToneVolume, setMasterVolume, setNoise, setNature, setIllusion,
    setVoice, setVoices, setSpatial, setLayerPulse, setBreathPattern, setBreathCue, getBreathTime,
    setSessionMinutes, setFadeIn, setFadeDown, setExportMinutes, setExportRate, exportSeconds, exportAudio,
    setTheme, setTab, setBandFilter, acknowledge, openWelcome, closeWelcome, clearError, testChannels, onVisible,
    getAnalysers: () => engine.analysers,
    _tick: onTick, // exposed for tests
  };
}

export function runtimeState(settings) {
  return {
    status: 'idle', elapsed: 0, duration: settings.sessionMinutes > 0 ? settings.sessionMinutes * 60 : Infinity,
    live: { carrier: settings.carrier, beat: settings.beat, segmentIndex: -1, segmentLabel: '' },
    loadingTypes: '', error: null, welcomeOpen: false, testSide: null, announcement: null,
    exportStatus: { state: 'idle', progress: 0, message: '' },
  };
}
