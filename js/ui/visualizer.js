// Canvas visualizer (spec 02 §9, spec 07 §9): beat-rate pulse orb (or breathing
// pacer) + per-channel waveforms.

import { bandFor } from '../engine/frequency.js';
import { BREATH_PATTERNS, breathAt } from '../engine/breath.js';

export function createVisualizer(canvas, { store, getAnalysers, getBreathTime = () => 0, breathLabel = null }) {
  let lastLabel = '';
  const ctx = canvas.getContext('2d');
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let bufL = null;
  let bufR = null;
  let raf = 0;
  let w = 0;
  let h = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(canvas).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawWave(analyser, buf, y0, amp, color) {
    analyser.getFloatTimeDomainData(buf);
    ctx.beginPath();
    const n = buf.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = y0 - buf[i] * amp;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const st = store.get();
    const t = ts / 1000;
    ctx.clearRect(0, 0, w, h);
    const color = bandFor(st.live.beat).color;
    const active = st.status === 'running' || st.status === 'paused';

    // Breathing pacer replaces the beat pulse when a pattern is selected.
    const pattern = BREATH_PATTERNS[st.breathPattern];
    let label = '';
    let pulse;
    if (pattern) {
      const b = breathAt(pattern, getBreathTime());
      pulse = b.level;
      label = `${b.label} · ${Math.max(1, Math.ceil(b.remaining))}`;
    } else if (st.status === 'running') {
      const beat = st.live.beat;
      // Reduced motion: a gentle step at most twice per second instead of a fast pulse.
      pulse = reduceMotion ? (Math.floor(t * 2) % 2 ? 0.65 : 0.35) : 0.5 + 0.5 * Math.cos(2 * Math.PI * beat * t);
    } else {
      pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.8);
    }
    if (breathLabel && label !== lastLabel) {
      breathLabel.textContent = label;
      breathLabel.hidden = !label;
      lastLabel = label;
    }
    const base = Math.min(w, h) * 0.22;
    const swing = pattern ? 0.9 : 0.25 * (active ? 1 : 0.4);
    const r = base * ((pattern ? 0.55 : 0.85) + swing * pulse);
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, r * 1.8);
    const alpha = active || pattern ? 0.3 + 0.45 * pulse : 0.18 + 0.1 * pulse;
    g.addColorStop(0, hexA(color, alpha));
    g.addColorStop(0.5, hexA(color, alpha * 0.4));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = hexA(color, active ? 0.25 + 0.35 * pulse : 0.15);
    ctx.fill();

    // Waveforms: left on top, right below.
    const an = active ? getAnalysers() : null;
    if (an) {
      if (!bufL || bufL.length !== an.left.fftSize) {
        bufL = new Float32Array(an.left.fftSize);
        bufR = new Float32Array(an.right.fftSize);
      }
      drawWave(an.left, bufL, h * 0.14, h * 0.11, cssVar('--left', '#38bdf8'));
      drawWave(an.right, bufR, h * 0.42, h * 0.11, cssVar('--right', '#fb923c'));
    }
  }

  function start() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  resize();
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
  else addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
  return { start, stop };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
