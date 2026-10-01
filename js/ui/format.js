// Pure formatting / mapping helpers for the UI.

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '∞';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatHz(hz, digits = 2) {
  return Number.isFinite(hz) ? hz.toFixed(digits) : '–';
}

// Trims trailing zeros: 10 -> "10", 7.83 -> "7.83", 0.5 -> "0.5".
export function formatHzShort(hz) {
  return Number.isFinite(hz) ? String(Math.round(hz * 100) / 100) : '–';
}

export function formatPercent(v) {
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
}

export function formatMinutes(seconds) {
  if (!Number.isFinite(seconds)) return '∞';
  return `${Math.round(seconds / 60)} min`;
}

// Logarithmic slider mapping: position 0..steps <-> value min..max.
export function sliderToValue(pos, min, max, steps = 1000) {
  const p = Math.min(1, Math.max(0, pos / steps));
  return min * Math.pow(max / min, p);
}

export function valueToSlider(value, min, max, steps = 1000) {
  const v = Math.min(max, Math.max(min, value));
  return Math.round((Math.log(v / min) / Math.log(max / min)) * steps);
}

// Round to the precision used in the number inputs.
export const round2 = (v) => Math.round(v * 100) / 100;
