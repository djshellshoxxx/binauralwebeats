// Program editor dialog (spec 07 §11).

import { bandFor, LIMITS } from '../engine/frequency.js';
import { validateProgram } from '../engine/program.js';
import { h } from './dom.js';
import { formatTime } from './format.js';

const DEFAULT_DRAFT = () => ({
  id: null, name: 'My program', description: '',
  segments: [
    { label: 'Settle', minutes: 5, beat: [10, 10], carrier: [200, 200] },
    { label: 'Descend', minutes: 10, beat: [10, 6], carrier: [200, 180] },
  ],
});

const toDraft = (p) => ({
  id: p.id, name: p.name, description: p.description || '',
  segments: p.segments.map((s) => ({ label: s.label, minutes: Math.round((s.duration / 60) * 100) / 100, beat: [...s.beat], carrier: [...s.carrier] })),
});

const toProgram = (d) => ({
  id: d.id || 'draft', name: d.name.trim(), description: d.description,
  segments: d.segments.map((s) => ({ label: s.label, duration: Math.round(Number(s.minutes) * 60), beat: s.beat.map(Number), carrier: s.carrier.map(Number) })),
});

export function createEditor({ store, controller, root = document }) {
  const $ = (id) => root.getElementById(id);
  const dialog = $('editor');
  const form = $('editor-form');
  const title = $('editor-title');
  const name = $('ed-name');
  const desc = $('ed-desc');
  const tbody = $('ed-segments');
  const total = $('ed-total');
  const timeline = $('ed-timeline');
  const errorsEl = $('ed-errors');
  let draft = DEFAULT_DRAFT();

  const num = (value, { min, max, step, label }, onchange) => h('input', {
    type: 'number', value, min, max, step, inputmode: 'decimal', 'aria-label': label, class: 'small-num',
    onchange: (e) => { onchange(e.target.value); refresh(); },
  });

  function renderRows() {
    tbody.replaceChildren(...draft.segments.map((s, i) => {
      const n = i + 1;
      const pair = (key, lim, unitLabel) => h('span', { class: 'pair' },
        num(s[key][0], { ...lim, label: `Segment ${n} ${unitLabel} from` }, (v) => { s[key][0] = v; }),
        h('span', { class: 'muted' }, '→'),
        num(s[key][1], { ...lim, label: `Segment ${n} ${unitLabel} to` }, (v) => { s[key][1] = v; }));
      return h('tr', {},
        h('td', { class: 'muted' }, String(n)),
        h('td', {}, h('input', { type: 'text', value: s.label, maxlength: 60, 'aria-label': `Segment ${n} label`, class: 'seg-label',
          onchange: (e) => { s.label = e.target.value; refresh(); } })),
        h('td', {}, num(s.minutes, { min: 0.5, max: 240, step: 0.5, label: `Segment ${n} minutes` }, (v) => { s.minutes = v; })),
        h('td', {}, pair('beat', { min: LIMITS.beat.min, max: LIMITS.beat.max, step: 0.01 }, 'beat')),
        h('td', {}, pair('carrier', { min: LIMITS.carrier.min, max: LIMITS.carrier.max, step: 0.01 }, 'carrier')),
        h('td', { class: 'row-tools' },
          h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Move segment ${n} up`, disabled: i === 0,
            onclick: () => { [draft.segments[i - 1], draft.segments[i]] = [draft.segments[i], draft.segments[i - 1]]; renderRows(); } }, '↑'),
          h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Move segment ${n} down`, disabled: i === draft.segments.length - 1,
            onclick: () => { [draft.segments[i + 1], draft.segments[i]] = [draft.segments[i], draft.segments[i + 1]]; renderRows(); } }, '↓'),
          h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Remove segment ${n}`, disabled: draft.segments.length === 1,
            onclick: () => { draft.segments.splice(i, 1); renderRows(); } }, '✕')));
    }));
    refresh();
  }

  function refresh() {
    draft.name = name.value;
    draft.description = desc.value;
    const program = toProgram(draft);
    const secs = program.segments.reduce((a, s) => a + (s.duration > 0 ? s.duration : 0), 0);
    total.textContent = `Total ${formatTime(secs)}`;
    timeline.replaceChildren(...program.segments.map((s) => h('span', {
      style: `flex:${Math.max(1, s.duration)} 0 0;background:${bandFor((s.beat[0] + s.beat[1]) / 2 || 10).color}`, title: s.label,
    })));
    const errors = validateProgram(program).map((e) => (e === 'missing name' ? 'Give the program a name.' : e))
      .filter((e) => e !== 'missing id');
    errorsEl.replaceChildren(...errors.map((e) => h('li', {}, e)));
    return errors;
  }

  function open(program) {
    draft = program ? toDraft(program) : DEFAULT_DRAFT();
    title.textContent = draft.id ? 'Edit program' : 'New program';
    name.value = draft.name;
    desc.value = draft.description;
    renderRows();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    name.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  $('ed-add').addEventListener('click', () => {
    const last = draft.segments.at(-1);
    draft.segments.push({ label: `Segment ${draft.segments.length + 1}`, minutes: 5,
      beat: [Number(last.beat[1]), Number(last.beat[1])], carrier: [Number(last.carrier[1]), Number(last.carrier[1])] });
    renderRows();
  });
  $('ed-cancel').addEventListener('click', close);
  name.addEventListener('input', refresh);
  desc.addEventListener('input', refresh);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (refresh().length) return;
    const res = controller.saveCustomProgram(toProgram({ ...draft, id: draft.id }));
    if (!res.ok) {
      errorsEl.replaceChildren(...res.errors.map((er) => h('li', {}, er)));
      return;
    }
    close();
    if (store.get().status === 'idle') controller.selectProgram(res.program.id);
  });

  return { open, close };
}
