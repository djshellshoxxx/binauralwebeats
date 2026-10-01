// Module worker: renders nature buffers off the main thread.
import { renderNature } from './ambience.js';

self.onmessage = (e) => {
  const { id, type } = e.data;
  try {
    const { left, right, sampleRate } = renderNature(type);
    self.postMessage({ id, type, left, right, sampleRate }, [left.buffer, right.buffer]);
  } catch (err) {
    self.postMessage({ id, type, error: String(err && err.message || err) });
  }
};
