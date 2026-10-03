// Shareable session links. Only sound/session configuration is exported;
// local preferences and private custom-program data stay on this device.

import { loadSettings } from './persistence.js';

export const SHARE_VERSION = 1;
export const SHARE_PARAM = 'session';

export const SHARE_KEYS = Object.freeze([
  'mode', 'carrier', 'beat', 'waveform', 'timbre',
  'toneVolume', 'noiseType', 'noiseVolume',
  'natureType', 'natureVolume', 'illusionType', 'illusionVolume',
  'masterVolume', 'voices', 'spatialRate', 'layerPulse',
  'breathPattern', 'breathCue', 'sessionMinutes', 'fadeIn',
  'fadeDownMinutes', 'activePresetId', 'activeProgramId', 'tab',
]);

function pickShareable(state) {
  const out = {};
  for (const key of SHARE_KEYS) {
    if (key in state) out[key] = state[key];
  }
  return out;
}

function sanitizeShareable(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const storage = { getItem: () => JSON.stringify(input) };
  const valid = loadSettings(storage);
  return pickShareable(valid);
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(encoded) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('invalid encoding');
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSharedSettings(state) {
  const payload = {
    v: SHARE_VERSION,
    settings: sanitizeShareable(pickShareable(state || {})),
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeSharedSettings(encoded) {
  try {
    const payload = JSON.parse(fromBase64Url(encoded));
    if (!payload || payload.v !== SHARE_VERSION || !payload.settings) return {};
    return sanitizeShareable(payload.settings);
  } catch {
    return {};
  }
}

export function buildShareUrl(inputUrl, state) {
  const url = new URL(inputUrl);
  url.searchParams.set(SHARE_PARAM, encodeSharedSettings(state));
  url.hash = '';
  return url.toString();
}

export function readSharedSettings(inputUrl) {
  try {
    const url = new URL(inputUrl);
    const encoded = url.searchParams.get(SHARE_PARAM);
    return encoded ? decodeSharedSettings(encoded) : {};
  } catch {
    return {};
  }
}
