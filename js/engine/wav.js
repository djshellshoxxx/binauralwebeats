// 16-bit PCM WAV encoder (spec 07 §13). Pure.

export function wavSize(seconds, sampleRate, channels = 2) {
  return 44 + Math.round(seconds * sampleRate) * channels * 2;
}

// channels: array of Float32Array (same length). `rand` drives TPDF dither.
export function encodeWav(channels, sampleRate, rand = Math.random) {
  const numCh = channels.length;
  const frames = channels[0].length;
  const dataBytes = frames * numCh * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const str = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };

  str(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM format
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const dither = (rand() - rand()) / 32768;
      const v = Math.max(-1, Math.min(1, channels[ch][i] + dither));
      view.setInt16(offset, v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), true);
      offset += 2;
    }
  }
  return buffer;
}
