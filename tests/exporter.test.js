import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateBytes, exportFileName, renderSessionWav } from '../js/app/exporter.js';
import { FakeAudioContext } from './helpers/fake-audio.js';

class FakeOffline extends FakeAudioContext {
  constructor(channels, length, sampleRate) {
    super({ sampleRate });
    this.length = length;
    this.state = 'suspended';
    this.suspends = [];
  }
  suspend(t) { this.suspends.push(t); return new Promise(() => {}); }
  async resume() { throw new Error('offline resume must not be called before rendering'); }
  async startRendering() {
    const buf = this.createBuffer(2, this.length, this.sampleRate);
    buf.getChannelData(0).fill(0.25);
    buf.getChannelData(1).fill(-0.25);
    return buf;
  }
}

test('renders through the engine into a WAV of the right size', async () => {
  const progress = [];
  const wav = await renderSessionWav({
    settings: { natureType: 'off' }, seconds: 2, sampleRate: 8000, fadeIn: 0,
    onProgress: (p) => progress.push(p), OfflineCtor: FakeOffline, workerFactory: () => null,
  });
  assert.equal(wav.byteLength, estimateBytes(2, 8000));
  assert.equal(progress.at(-1), 1);
  const v = new DataView(wav);
  assert.equal(v.getUint32(24, true), 8000);
});

test('progress suspends are quantised and increasing', async () => {
  let ctxRef;
  class Spy extends FakeOffline { constructor(...a) { super(...a); ctxRef = this; } }
  await renderSessionWav({ settings: {}, seconds: 60, sampleRate: 22050, onProgress: () => {}, OfflineCtor: Spy, workerFactory: () => null });
  assert.equal(ctxRef.suspends.length, 19);
  for (const t of ctxRef.suspends) assert.ok(Math.abs((t * 22050) / 128 - Math.round((t * 22050) / 128)) < 1e-6);
});

test('file name and size estimate', () => {
  assert.equal(exportFileName('Deep Sleep Descent', 2700), 'binauralwebeats-deep-sleep-descent-45min.wav');
  assert.equal(exportFileName('', 60), 'binauralwebeats-session-1min.wav');
  assert.equal(estimateBytes(60, 22050), 44 + 60 * 22050 * 4);
});

test('missing OfflineAudioContext gives a clear error', async () => {
  await assert.rejects(renderSessionWav({ settings: {}, seconds: 5, OfflineCtor: null }), /offline/);
});
