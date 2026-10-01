// Accessible rotary knob (spec 02 §3.1). Value is 0..1 externally, 0..100 steps internally.

const SWEEP = 270;
const START = -135;
const R = 38;
const NS = 'http://www.w3.org/2000/svg';

function polar(angleDeg, r = R) {
  const a = (angleDeg * Math.PI) / 180;
  return [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
}

function arcPath(fromDeg, toDeg) {
  if (toDeg - fromDeg < 0.01) return '';
  const [x1, y1] = polar(fromDeg);
  const [x2, y2] = polar(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function svgEl(name, attrs) {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function createKnob(container, { label, value = 0.5, defaultValue = value, onInput } = {}) {
  let steps = Math.round(value * 100);
  const el = document.createElement('div');
  el.className = 'knob';
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');

  const svg = svgEl('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
  const track = svgEl('path', { class: 'track', d: arcPath(START, START + SWEEP), fill: 'none', 'stroke-width': '8', 'stroke-linecap': 'round' });
  const arc = svgEl('path', { class: 'value-arc', fill: 'none', 'stroke-width': '8', 'stroke-linecap': 'round' });
  const face = svgEl('circle', { class: 'face', cx: '50', cy: '50', r: '27', 'stroke-width': '1' });
  const pointer = svgEl('line', { class: 'pointer', 'stroke-width': '4', 'stroke-linecap': 'round' });
  svg.append(track, arc, face, pointer);
  const readout = document.createElement('div');
  readout.className = 'readout';
  el.append(svg, readout);
  container.append(el);

  function render() {
    const angle = START + (SWEEP * steps) / 100;
    arc.setAttribute('d', arcPath(START, angle));
    const [x1, y1] = polar(angle, 10);
    const [x2, y2] = polar(angle, 22);
    pointer.setAttribute('x1', x1.toFixed(2));
    pointer.setAttribute('y1', y1.toFixed(2));
    pointer.setAttribute('x2', x2.toFixed(2));
    pointer.setAttribute('y2', y2.toFixed(2));
    readout.textContent = `${steps}%`;
    el.setAttribute('aria-valuenow', String(steps));
    el.setAttribute('aria-valuetext', `${steps} percent`);
  }

  function set(next, emit) {
    const clamped = Math.min(100, Math.max(0, Math.round(next)));
    if (clamped === steps) return;
    steps = clamped;
    render();
    if (emit && onInput) onInput(steps / 100);
  }

  // Pointer drag: vertical movement, 200 px = full range, Shift = fine.
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, start: steps, acc: 0 };
    el.focus();
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const factor = e.shiftKey ? 0.1 : 0.5;
    set(drag.start + (drag.y - e.clientY) * factor, true);
  });
  const endDrag = () => { drag = null; };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    set(steps + (e.deltaY < 0 ? 2 : -2), true);
  }, { passive: false });

  el.addEventListener('keydown', (e) => {
    const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    if (e.key in map) { set(steps + map[e.key], true); e.preventDefault(); }
    else if (e.key === 'Home') { set(0, true); e.preventDefault(); }
    else if (e.key === 'End') { set(100, true); e.preventDefault(); }
  });

  el.addEventListener('dblclick', () => set(defaultValue * 100, true));

  render();

  return {
    el,
    setValue(v) { if (!drag) set(v * 100, false); },
    setDim(dim) { el.classList.toggle('dim', !!dim); },
  };
}
