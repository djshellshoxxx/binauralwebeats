// Fail-safe localStorage persistence of user settings (spec 03 §2, spec 07 §14).

import { LIMITS, MODES, WAVEFORMS, TIMBRES } from '../engine/frequency.js';
import { NOISE_TYPES } from '../engine/noise.js';
import { NATURE_TYPES, ILLUSION_TYPES } from '../engine/ambience.js';
import { BREATH_IDS } from '../engine/breath.js';
import { validateProgram } from '../engine/program.js';
import { DEFAULT_VOICES, SPATIAL_RATES, LAYER_PULSE_LEVELS } from '../engine/audio-engine.js';

export const STORAGE_KEY = 'binauralwebeats.settings.v1';

export const SESSION_MINUTES = Object.freeze([0, 5, 10, 15, 20, 30, 45, 60, 90]);
export const FADE_IN_OPTIONS = Object.freeze([0, 3, 5, 10, 20, 30]);
export const FADE_DOWN_OPTIONS = Object.freeze([0, 5, 10, 15, 20, 30]);
export const EXPORT_MINUTES = Object.freeze([1, 5, 10, 15, 20, 30, 'program']);
export const EXPORT_RATES = Object.freeze([22050, 44100]);
export const THEMES = Object.freeze(['auto', 'dark', 'light']);
export const TABS = Object.freeze(['manual', 'programs']);
export const MAX_CUSTOM_PROGRAMS = 50;

export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'binaural', carrier: 200, beat: 10, waveform: 'sine', timbre: 'pure',
  toneVolume: 0.8, noiseType: 'off', noiseVolume: 0.3,
  natureType: 'off', natureVolume: 0.3, illusionType: 'off', illusionVolume: 0.3, masterVolume: 0.4,
  voices: DEFAULT_VOICES, spatialRate: 0, layerPulse: 0, breathPattern: 'off', breathCue: false,
  sessionMinutes: 30, fadeIn: 5, fadeDownMinutes: 0, theme: 'auto', acknowledged: false,
  activePresetId: 'alpha-10', activeProgramId: null, tab: 'manual', bandFilter: 'all',
  customPrograms: [], exportMinutes: 10, exportRate: 22050,
});

const oneOf = (list) => (v) => list.includes(v);
const num = (min, max) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const unit = num(0, 1);
const bool = (v) => typeof v === 'boolean';
const idOrNull = (v) => v === null || (typeof v === 'string' && v.length < 64);

const validVoice = (v) => v && typeof v === 'object' && bool(v.on)
  && num(LIMITS.carrier.min, LIMITS.carrier.max)(v.carrier)
  && num(LIMITS.beat.min, LIMITS.beat.max)(v.beat) && unit(v.volume);

export const isValidCustomProgram = (p) => !!p && typeof p.id === 'string' && p.id.startsWith('custom-')
  && validateProgram(p).length === 0;

const VALIDATORS = {
  mode: oneOf(MODES),
  carrier: num(LIMITS.carrier.min, LIMITS.carrier.max),
  beat: num(LIMITS.beat.min, LIMITS.beat.max),
  waveform: oneOf(WAVEFORMS),
  timbre: oneOf(TIMBRES),
  toneVolume: unit,
  noiseType: oneOf(NOISE_TYPES),
  noiseVolume: unit,
  natureType: oneOf(NATURE_TYPES),
  natureVolume: unit,
  illusionType: oneOf(ILLUSION_TYPES),
  illusionVolume: unit,
  masterVolume: unit,
  voices: (v) => Array.isArray(v) && v.length === 2 && v.every(validVoice),
  spatialRate: oneOf(SPATIAL_RATES),
  layerPulse: oneOf(LAYER_PULSE_LEVELS),
  breathPattern: oneOf(BREATH_IDS),
  breathCue: bool,
  sessionMinutes: oneOf(SESSION_MINUTES),
  fadeIn: oneOf(FADE_IN_OPTIONS),
  fadeDownMinutes: oneOf(FADE_DOWN_OPTIONS),
  theme: oneOf(THEMES),
  acknowledged: bool,
  activePresetId: idOrNull,
  activeProgramId: idOrNull,
  tab: oneOf(TABS),
  bandFilter: (v) => typeof v === 'string' && v.length < 16,
  customPrograms: Array.isArray,
  exportMinutes: oneOf(EXPORT_MINUTES),
  exportRate: oneOf(EXPORT_RATES),
};

// Keys whose valid value needs cleaning rather than a yes/no check.
const SANITIZERS = {
  customPrograms: (list) => list.filter(isValidCustomProgram).slice(0, MAX_CUSTOM_PROGRAMS),
};

export const PERSISTED_KEYS = Object.freeze(Object.keys(VALIDATORS));

export function loadSettings(storage) {
  try {
    const raw = storage && storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return {};
    const out = {};
    for (const key of PERSISTED_KEYS) {
      if (key in data && VALIDATORS[key](data[key])) out[key] = SANITIZERS[key] ? SANITIZERS[key](data[key]) : data[key];
    }
    // A selected custom program that no longer exists is dropped.
    if (out.activeProgramId && out.activeProgramId.startsWith('custom-')
      && !(out.customPrograms || []).some((p) => p.id === out.activeProgramId)) out.activeProgramId = null;
    return out;
  } catch {
    return {};
  }
}

export function saveSettings(storage, state) {
  try {
    const out = {};
    for (const key of PERSISTED_KEYS) out[key] = state[key];
    storage.setItem(STORAGE_KEY, JSON.stringify(out));
    return true;
  } catch {
    return false;
  }
}
