// Offline render of a session to a WAV file (spec 07 §13).

import { AudioEngine } from '../engine/audio-engine.js';
import { encodeWav, wavSize } from '../engine/wav.js';

export const MAX_EXPORT_SECONDS = 30 * 60;

export function estimateBytes(seconds, sampleRate) {
  return wavSize(seconds, sampleRate, 2);
}

export function exportFileName(name, seconds) {
  const slug = String(name || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
  return `binauralwebeats-${slug}-${Math.round(seconds / 60)}min.wav`;
}

// Returns an ArrayBuffer containing a 16-bit stereo WAV.
export async function renderSessionWav({
  settings, program = null, seconds, sampleRate = 22050, fadeIn = 5, fadeDownMinutes = 0,
  onProgress = null, OfflineCtor = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext,
  workerFactory,
}) {
  if (!OfflineCtor) throw new Error('This browser cannot render audio offline.');
  const secs = Math.min(MAX_EXPORT_SECONDS, Math.max(1, seconds));
  const frames = Math.round(secs * sampleRate);
  const ctx = new OfflineCtor(2, frames, sampleRate);
  const opts = { contextFactory: () => ctx, offline: true };
  if (workerFactory !== undefined) opts.workerFactory = workerFactory;
  const engine = new AudioEngine(opts);
  await engine.start(settings, { program, fadeIn, duration: secs, fadeDownMinutes });
  await engine.whenLayersReady();
  engine.scheduleEndFade(secs, Math.min(3, secs / 4));

  // Progress: suspend at every 5 % (times quantised to the 128-frame render quantum).
  if (onProgress && typeof ctx.suspend === 'function') {
    const quantum = 128 / sampleRate;
    for (let k = 1; k < 20; k++) {
      const t = Math.floor((secs * k) / 20 / quantum) * quantum;
      if (t <= 0) continue;
      ctx.suspend(t).then(() => { onProgress(k / 20); ctx.resume(); }, () => {});
    }
  }
  const rendered = await ctx.startRendering();
  if (onProgress) onProgress(1);
  return encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], sampleRate);
}
