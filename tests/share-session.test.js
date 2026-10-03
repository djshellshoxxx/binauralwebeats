import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShareUrl,
  decodeSharedSettings,
  encodeSharedSettings,
  readSharedSettings,
} from '../js/app/share-session.js';

const state = {
  mode: 'binaural',
  carrier: 220,
  beat: 7.83,
  waveform: 'sine',
  timbre: 'pad',
  toneVolume: 0.72,
  noiseType: 'pink',
  noiseVolume: 0.18,
  natureType: 'rain',
  natureVolume: 0.24,
  illusionType: 'off',
  illusionVolume: 0.3,
  masterVolume: 0.36,
  voices: [
    { on: true, carrier: 180, beat: 4, volume: 0.25 },
    { on: false, carrier: 260, beat: 14, volume: 0.2 },
  ],
  spatialRate: 0.1,
  layerPulse: 0.25,
  breathPattern: 'resonance',
  breathCue: true,
  sessionMinutes: 45,
  fadeIn: 10,
  fadeDownMinutes: 15,
  activePresetId: null,
  activeProgramId: 'deep-sleep',
  tab: 'programs',
  // These are intentionally local-only and must not leak into a share URL.
  acknowledged: true,
  theme: 'light',
  customPrograms: [{ id: 'custom-private' }],
  exportMinutes: 30,
  exportRate: 44100,
};

test('shared settings round-trip only the supported session fields', () => {
  const encoded = encodeSharedSettings(state);
  const decoded = decodeSharedSettings(encoded);

  assert.equal(decoded.mode, 'binaural');
  assert.equal(decoded.carrier, 220);
  assert.equal(decoded.beat, 7.83);
  assert.equal(decoded.natureType, 'rain');
  assert.equal(decoded.activeProgramId, 'deep-sleep');
  assert.equal(decoded.tab, 'programs');
  assert.deepEqual(decoded.voices, state.voices);
  assert.equal('theme' in decoded, false);
  assert.equal('acknowledged' in decoded, false);
  assert.equal('customPrograms' in decoded, false);
  assert.equal('exportMinutes' in decoded, false);
});

test('invalid or tampered shared data is ignored safely', () => {
  assert.deepEqual(decodeSharedSettings('not-valid-base64'), {});

  const encoded = encodeSharedSettings({ ...state, carrier: 220 });
  const decodedText = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const payload = JSON.parse(decodedText);
  payload.settings.carrier = 50000;
  const tampered = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const decoded = decodeSharedSettings(tampered);
  assert.equal('carrier' in decoded, false);
  assert.equal(decoded.beat, 7.83);
});

test('buildShareUrl replaces any previous session parameter and keeps the page path', () => {
  const url = buildShareUrl('https://example.test/binauralwebeats/?foo=1&session=old#donate', state);
  const parsed = new URL(url);

  assert.equal(parsed.pathname, '/binauralwebeats/');
  assert.equal(parsed.searchParams.get('foo'), '1');
  assert.notEqual(parsed.searchParams.get('session'), 'old');
  assert.equal(parsed.hash, '');
  assert.equal(readSharedSettings(url).beat, 7.83);
});

test('readSharedSettings returns an empty object when no session is present', () => {
  assert.deepEqual(readSharedSettings('https://example.test/binauralwebeats/'), {});
});
