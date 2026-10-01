// Fail-safe localStorage persistence of user settings (spec 03 §2).

import { LIMITS, MODES, WAVEFORMS } from '../engine/frequency.js';
import { NOISE_TYPES } from '../engine/noise.js';
import { NATURE_TYPES } from '../engine/ambience.js';

export const STORAGE_KEY = 'binauralwebeats.settings.v1';

export const SESSION_MINUTES = Object.freeze([0, 5, 10, 15, 20, 30, 45, 60, 90]);
export const FADE_IN_OPTIONS = Object.freeze([0, 3, 5, 10, 20, 30]);
export const THEMES = Object.freeze(['auto', 'dark', 'light']);
export const TABS = Object.freeze(['manual', 'programs']);

export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'binaural', carrier: 200, beat: 10, waveform: 'sine',
  toneVolume: 0.8, noiseType: 'off', noiseVolume: 0.3,
  natureType: 'off', natureVolume: 0.3, masterVolume: 0.4,
  sessionMinutes: 30, fadeIn: 5, theme: 'auto', acknowledged: false,
  activePresetId: 'alpha-10', activeProgramId: null, tab: 'manual', bandFilter: 'all',
});

const oneOf = (list) => (v) => list.includes(v);
const num = (min, max) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const unit = num(0, 1);
const idOrNull = (v) => v === null || (typeof v === 'string' && v.length < 64);

const VALIDATORS = {
  mode: oneOf(MODES),
  carrier: num(LIMITS.carrier.min, LIMITS.carrier.max),
  beat: num(LIMITS.beat.min, LIMITS.beat.max),
  waveform: oneOf(WAVEFORMS),
  toneVolume: unit,
  noiseType: oneOf(NOISE_TYPES),
  noiseVolume: unit,
  natureType: oneOf(NATURE_TYPES),
  natureVolume: unit,
  masterVolume: unit,
  sessionMinutes: oneOf(SESSION_MINUTES),
  fadeIn: oneOf(FADE_IN_OPTIONS),
  theme: oneOf(THEMES),
  acknowledged: (v) => typeof v === 'boolean',
  activePresetId: idOrNull,
  activeProgramId: idOrNull,
  tab: oneOf(TABS),
  bandFilter: (v) => typeof v === 'string' && v.length < 16,
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
      if (key in data && VALIDATORS[key](data[key])) out[key] = data[key];
    }
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
