// Binds DOM controls to controller intents and renders store state (spec 03 §4, spec 07).

import { BANDS, bandFor, LIMITS } from '../engine/frequency.js';
import { paramsAt, programDuration } from '../engine/program.js';
import { NATURE_LABELS, NATURE_TYPES, ILLUSION_LABELS, ILLUSION_TYPES } from '../engine/ambience.js';
import { BREATH_PATTERNS } from '../engine/breath.js';
import {
  BEAT_PRESETS, BILATERAL_PRESETS, CARRIER_PRESETS, PROGRAMS, VOICE_STACKS, DISCLAIMER, MODE_INFO,
} from '../app/presets.js';
import { DEFAULT_SETTINGS } from '../app/persistence.js';
import { estimateBytes } from '../app/exporter.js';
import { createKnob } from './knob.js';
import { h } from './dom.js';
import {
  formatHz, formatHzShort, formatMinutes, formatTime, round2, sliderToValue, valueToSlider,
} from './format.js';

const bandById = Object.fromEntries(BANDS.map((b) => [b.id, b]));

function formatBytes(n) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

function download(arrayBuffer, fileName) {
  const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: fileName, style: 'display:none' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function programTimeline(program) {
  const timeline = h('span', { class: 'timeline', 'aria-hidden': 'true' });
  for (const s of program.segments) {
    const mid = (s.beat[0] + s.beat[1]) / 2;
    timeline.append(h('span', { style: `flex:${s.duration} 0 0;background:${bandFor(mid).color}`, title: s.label }));
  }
  const marker = h('span', { class: 'marker' });
  timeline.append(marker);
  return { timeline, marker };
}

export function bindUI({ store, controller, editor, root = document }) {
  const $ = (id) => root.getElementById(id);
  const els = {
    play: $('play'), stop: $('stop'), testLR: $('test-lr'), timer: $('timer'), playLabel: $('play-label'),
    progress: $('progress-bar'), segment: $('segment-label'), testIndicator: $('test-indicator'),
    bandChip: $('band-chip'), beatReadout: $('beat-readout'), freqL: $('freq-l'), freqR: $('freq-r'),
    tabManual: $('tab-manual'), tabPrograms: $('tab-programs'),
    panelManual: $('panel-manual'), panelPrograms: $('panel-programs'),
    modeGroup: $('mode-group'), modeBlurb: $('mode-blurb'),
    beatRange: $('beat-range'), beatNum: $('beat-num'), beatBand: $('beat-band'), beatBandText: $('beat-band-text'),
    carrierRange: $('carrier-range'), carrierNum: $('carrier-num'),
    timbre: $('timbre'), timbreHint: $('timbre-hint'), waveform: $('waveform'), session: $('session'),
    fadein: $('fadein'), fadedown: $('fadedown'),
    voiceRows: $('voice-rows'), stackList: $('stack-list'),
    carrierList: $('carrier-list'), programList: $('program-list'), customList: $('custom-program-list'),
    customTitle: $('custom-title'), programClear: $('program-clear'), programNew: $('program-new'),
    noiseType: $('noise-type'), natureType: $('nature-type'), natureStatus: $('nature-status'),
    illusionType: $('illusion-type'), illusionStatus: $('illusion-status'),
    spatial: $('spatial'), layerPulse: $('layer-pulse'),
    breathPattern: $('breath-pattern'), breathCue: $('breath-cue'), breathDesc: $('breath-desc'),
    exportMinutes: $('export-minutes'), exportRate: $('export-rate'), exportSize: $('export-size'),
    exportGo: $('export-go'), exportBar: $('export-bar'), exportStatus: $('export-status'),
    bandLegend: $('band-legend'), bandFilter: $('band-filter'), presetGrid: $('preset-grid'),
    specialGrid: $('special-grid'), stackGrid: $('stack-grid'),
    disclaimer: $('disclaimer'), banner: $('hp-banner'), hpTitle: $('hp-title'), hpText: $('hp-text'),
    welcome: $('welcome'), welcomeOk: $('welcome-ok'), help: $('help'), theme: $('theme-toggle'),
    toast: $('toast'), toastText: $('toast-text'), toastClose: $('toast-close'), live: $('live'),
  };

  // ------------------------------------------------------------ static lists

  els.disclaimer.textContent = DISCLAIMER;

  for (const t of NATURE_TYPES) els.natureType.append(h('option', { value: t }, NATURE_LABELS[t]));
  for (const t of ILLUSION_TYPES) els.illusionType.append(h('option', { value: t }, ILLUSION_LABELS[t]));
  els.breathPattern.append(h('option', { value: 'off' }, 'Off'));
  for (const p of Object.values(BREATH_PATTERNS)) els.breathPattern.append(h('option', { value: p.id }, p.name));

  for (const b of BANDS) {
    els.bandLegend.append(h('li', { style: `--c:${b.color}` },
      h('span', { class: 'band-name' }, b.name),
      h('span', { class: 'band-range' }, `${formatHzShort(b.min)}–${formatHzShort(b.max)} Hz`),
      h('p', {}, b.summary)));
  }

  const filterButtons = [['all', 'All', null], ...BANDS.map((b) => [b.id, b.name, b.color])].map(([id, name, color]) => {
    const btn = h('button', { type: 'button', 'data-band': id, 'aria-pressed': 'false', style: color ? `--c:${color}` : null,
      onclick: () => controller.setBandFilter(id) }, name);
    els.bandFilter.append(btn);
    return btn;
  });

  const presetCard = (p, { color, tag, footer, onclick }) => h('button', {
    type: 'button', class: 'preset-card', 'aria-pressed': 'false', style: `--c:${color}`, onclick,
  },
  h('span', { class: 'preset-top' },
    h('span', { class: 'preset-hz' }, `${formatHzShort(p.beat)} Hz`),
    h('span', { class: 'preset-band' }, tag)),
  h('span', { class: 'preset-name' }, p.name),
  h('span', { class: 'preset-desc' }, p.description),
  p.caution ? h('span', { class: 'preset-caution' }, `⚠ ${p.caution}`) : null,
  h('span', { class: 'preset-carrier' }, footer));

  const presetCards = BEAT_PRESETS.map((p) => {
    const band = bandById[p.band];
    const btn = presetCard(p, { color: band.color, tag: band.name,
      footer: `Carrier ${formatHzShort(p.carrier)} Hz · 🎧 headphones for binaural`, onclick: () => controller.applyPreset(p.id) });
    const li = h('li', { 'data-band': p.band }, btn);
    els.presetGrid.append(li);
    return { li, btn, preset: p };
  });

  const specialCards = BILATERAL_PRESETS.map((p) => {
    const btn = presetCard(p, { color: '#22d3ee', tag: 'Bilateral',
      footer: `Carrier ${formatHzShort(p.carrier)} Hz · 🎧 headphones required`, onclick: () => controller.applySpecial(p.id) });
    els.specialGrid.append(h('li', {}, btn));
    return { btn, preset: p };
  });

  const stackCards = VOICE_STACKS.map((p) => {
    const voices = p.voices.map((v) => `${formatHzShort(v.beat)} Hz`).join(' + ');
    const btn = presetCard(p, { color: bandFor(p.beat).color, tag: 'Stack',
      footer: `Layers: ${voices} · 🎧 headphones`, onclick: () => controller.applyStack(p.id) });
    els.stackGrid.append(h('li', {}, btn));
    return { btn, preset: p };
  });

  for (const p of VOICE_STACKS) {
    els.stackList.append(h('li', {}, h('button', { type: 'button', class: 'pill-btn', onclick: () => controller.applyStack(p.id) },
      `${p.name} (${formatHzShort(p.beat)} + ${p.voices.map((v) => formatHzShort(v.beat)).join(' + ')} Hz)`)));
  }

  const carrierButtons = CARRIER_PRESETS.map((c) => {
    const btn = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => controller.applyCarrierPreset(c.id) },
      h('span', { class: 'hz' }, `${formatHzShort(c.hz)} Hz`),
      h('span', { class: 'name' }, c.name),
      h('span', { class: 'desc' }, c.description));
    els.carrierList.append(h('li', {}, btn));
    return { btn, c };
  });

  // Voice rows (spec 07 §4).
  const voiceRows = [0, 1].map((i) => {
    const on = h('input', { type: 'checkbox', 'aria-label': `Enable voice ${i + 1}`, onchange: (e) => controller.setVoice(i, { on: e.target.checked }) });
    const beat = h('input', { type: 'number', min: LIMITS.beat.min, max: LIMITS.beat.max, step: '0.01', inputmode: 'decimal',
      'aria-label': `Voice ${i + 1} beat Hz`, onchange: (e) => e.target.value !== '' && controller.setVoice(i, { beat: parseFloat(e.target.value) }) });
    const carrier = h('input', { type: 'number', min: LIMITS.carrier.min, max: LIMITS.carrier.max, step: '0.01', inputmode: 'decimal',
      'aria-label': `Voice ${i + 1} carrier Hz`, onchange: (e) => e.target.value !== '' && controller.setVoice(i, { carrier: parseFloat(e.target.value) }) });
    const volume = h('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': `Voice ${i + 1} volume`,
      oninput: (e) => controller.setVoice(i, { volume: +e.target.value / 100 }) });
    const band = h('span', { class: 'chip small' });
    const row = h('div', { class: 'voice-row' },
      h('label', { class: 'check' }, on, ` Voice ${i + 1}`),
      h('span', { class: 'num-wrap' }, beat, h('span', { class: 'unit' }, 'Hz beat')),
      h('span', { class: 'num-wrap' }, carrier, h('span', { class: 'unit' }, 'Hz carrier')),
      band,
      h('label', { class: 'vol' }, h('span', { class: 'unit' }, 'Vol'), volume));
    els.voiceRows.append(row);
    return { on, beat, carrier, volume, band, row };
  });

  // Program lists (built-in once; custom rebuilt when they change).
  let programCards = [];
  function programItem(p, custom) {
    const total = programDuration(p);
    const { timeline, marker } = programTimeline(p);
    const btn = h('button', { type: 'button', class: 'program-card', 'aria-pressed': 'false',
      onclick: () => controller.selectProgram(store.get().activeProgramId === p.id ? null : p.id) },
      h('span', { class: 'program-head' }, h('span', {}, p.name), h('span', { class: 'program-len' }, formatMinutes(total))),
      p.description ? h('span', { class: 'program-desc' }, p.description) : null,
      timeline);
    const actions = h('div', { class: 'program-tools' },
      custom
        ? [h('button', { type: 'button', class: 'text-btn', onclick: () => editor.open(p) }, 'Edit'),
          h('button', { type: 'button', class: 'text-btn danger', onclick: () => {
            if (globalThis.confirm ? globalThis.confirm(`Delete "${p.name}"?`) : true) controller.deleteCustomProgram(p.id);
          } }, 'Delete')]
        : h('button', { type: 'button', class: 'text-btn', onclick: () => editor.open({ ...p, id: null, name: `${p.name} (copy)` }) }, 'Duplicate & edit'));
    const li = h('li', {}, btn, actions);
    programCards.push({ btn, marker, program: p, total });
    return li;
  }
  for (const p of PROGRAMS) els.programList.append(programItem(p, false));
  const builtInCards = programCards;
  function renderCustomPrograms(list) {
    programCards = [...builtInCards];
    els.customList.replaceChildren(...list.map((p) => programItem(p, true)));
    els.customTitle.hidden = list.length === 0;
  }

  // ------------------------------------------------------------ knobs

  const st0 = store.get();
  const knob = (id, label, key, fn) => createKnob($(id), { label, value: st0[key], defaultValue: DEFAULT_SETTINGS[key], onInput: fn });
  const knobs = {
    tone: knob('knob-tone', 'Beats volume', 'toneVolume', (v) => controller.setToneVolume(v)),
    noise: knob('knob-noise', 'Noise volume', 'noiseVolume', (v) => controller.setNoise(undefined, v)),
    nature: knob('knob-nature', 'Nature volume', 'natureVolume', (v) => controller.setNature(undefined, v)),
    illusion: knob('knob-illusion', 'Illusion volume', 'illusionVolume', (v) => controller.setIllusion(undefined, v)),
    master: knob('knob-master', 'Master volume', 'masterVolume', (v) => controller.setMasterVolume(v)),
  };

  // ------------------------------------------------------------ listeners

  els.play.addEventListener('click', () => controller.togglePlay());
  els.stop.addEventListener('click', () => controller.stop());
  els.testLR.addEventListener('click', () => controller.testChannels());

  els.tabManual.addEventListener('click', () => controller.setTab('manual'));
  els.tabPrograms.addEventListener('click', () => controller.setTab('programs'));
  els.tabManual.parentElement.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = store.get().tab === 'manual' ? 'programs' : 'manual';
    controller.setTab(next);
    (next === 'manual' ? els.tabManual : els.tabPrograms).focus();
  });

  els.modeGroup.addEventListener('change', (e) => controller.setMode(e.target.value));

  const dragging = new Set();
  const trackDrag = (el) => {
    el.addEventListener('pointerdown', () => dragging.add(el));
    const end = () => dragging.delete(el);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('change', end);
  };
  trackDrag(els.beatRange);
  trackDrag(els.carrierRange);

  els.beatRange.addEventListener('input', () => {
    controller.setBeat(round2(sliderToValue(+els.beatRange.value, LIMITS.beat.min, LIMITS.beat.max)));
  });
  els.carrierRange.addEventListener('input', () => {
    controller.setCarrier(round2(sliderToValue(+els.carrierRange.value, LIMITS.carrier.min, LIMITS.carrier.max)));
  });
  const commitNumber = (el, fn) => {
    el.addEventListener('change', () => { if (el.value !== '') fn(parseFloat(el.value)); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  };
  commitNumber(els.beatNum, controller.setBeat);
  commitNumber(els.carrierNum, controller.setCarrier);

  const onChange = (el, fn) => el.addEventListener('change', () => fn(el.value));
  onChange(els.timbre, controller.setTimbre);
  onChange(els.waveform, controller.setWaveform);
  onChange(els.session, (v) => controller.setSessionMinutes(+v));
  onChange(els.fadein, (v) => controller.setFadeIn(+v));
  onChange(els.fadedown, (v) => controller.setFadeDown(+v));
  onChange(els.noiseType, (v) => controller.setNoise(v));
  onChange(els.natureType, (v) => controller.setNature(v));
  onChange(els.illusionType, (v) => controller.setIllusion(v));
  onChange(els.spatial, (v) => controller.setSpatial(+v));
  onChange(els.layerPulse, (v) => controller.setLayerPulse(+v));
  onChange(els.breathPattern, controller.setBreathPattern);
  els.breathCue.addEventListener('change', () => controller.setBreathCue(els.breathCue.checked));
  onChange(els.exportMinutes, controller.setExportMinutes);
  onChange(els.exportRate, (v) => controller.setExportRate(+v));

  els.exportGo.addEventListener('click', async () => {
    const res = await controller.exportAudio();
    if (res) download(res.wav, res.fileName);
  });

  els.programClear.addEventListener('click', () => { controller.selectProgram(null); controller.setTab('manual'); });
  els.programNew.addEventListener('click', () => editor.open(null));

  els.help.addEventListener('click', () => controller.openWelcome());
  els.welcomeOk.addEventListener('click', () => controller.acknowledge());
  els.welcome.addEventListener('close', () => controller.closeWelcome());
  els.welcome.addEventListener('cancel', (e) => {
    // First run: the safety notice must be acknowledged with the button.
    if (!store.get().acknowledged) e.preventDefault();
  });

  const THEME_CYCLE = { auto: 'dark', dark: 'light', light: 'auto' };
  const THEME_ICON = { auto: '◐', dark: '☾', light: '☀' };
  els.theme.addEventListener('click', () => controller.setTheme(THEME_CYCLE[store.get().theme] || 'auto'));
  els.toastClose.addEventListener('click', () => controller.clearError());

  // ------------------------------------------------------------ render

  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  const changed = (st, prev, ...keys) => !prev || keys.some((k) => !Object.is(st[k], prev[k]));

  function render(st, prev) {
    const programActive = !!st.activeProgramId;
    const playing = st.status === 'running' || st.status === 'paused' || st.status === 'starting';
    // A selected program owns the tone settings (inputs locked, its values shown).
    const lockTone = programActive;

    if (changed(st, prev, 'customPrograms')) renderCustomPrograms(st.customPrograms);

    if (changed(st, prev, 'status', 'acknowledged', 'activeProgramId', 'customPrograms')) {
      els.play.dataset.state = st.status;
      const label = { idle: 'Play', starting: 'Starting', running: 'Pause', paused: 'Resume', testing: 'Play' }[st.status];
      els.play.setAttribute('aria-label', label);
      els.play.setAttribute('aria-pressed', String(st.status === 'running'));
      els.play.disabled = st.status === 'starting' || st.status === 'testing';
      els.stop.disabled = !playing;
      els.testLR.disabled = st.status !== 'idle';
      els.timer.classList.toggle('blink', st.status === 'paused');
      const program = controller.findProgram(st.activeProgramId);
      setText(els.playLabel, {
        idle: program ? `Ready · ${program.name}` : 'Ready',
        starting: 'Starting…', running: program ? program.name : 'Playing', paused: 'Paused', testing: 'Testing headphones…',
      }[st.status]);
      for (const c of programCards) {
        c.btn.disabled = playing && c.program.id !== st.activeProgramId;
        c.btn.setAttribute('aria-pressed', String(c.program.id === st.activeProgramId));
      }
      els.programClear.disabled = playing;
      els.programNew.disabled = false;
      document.body.dataset.status = st.status;
    }

    if (changed(st, prev, 'elapsed', 'duration', 'status', 'customPrograms')) {
      setText(els.timer, `${formatTime(st.elapsed)} / ${formatTime(st.duration)}`);
      const pct = Number.isFinite(st.duration) && st.duration > 0 ? Math.min(100, (st.elapsed / st.duration) * 100) : 0;
      els.progress.style.width = `${pct}%`;
      for (const c of programCards) {
        const isPlaying = playing && c.program.id === st.activeProgramId;
        c.btn.classList.toggle('playing', isPlaying);
        if (isPlaying) c.marker.style.left = `${Math.min(100, (st.elapsed / c.total) * 100)}%`;
      }
    }

    if (changed(st, prev, 'live', 'carrier', 'beat', 'mode', 'activeProgramId', 'status', 'customPrograms')) {
      let { carrier, beat } = st;
      let segmentLabel = '';
      const program = controller.findProgram(st.activeProgramId);
      if (program) {
        const p = playing ? st.live : { ...paramsAt(program, 0), segmentLabel: program.segments[0].label };
        ({ carrier, beat, segmentLabel } = p);
        if (!playing) segmentLabel = `Starts with: ${segmentLabel}`;
      }
      const band = bandFor(beat);
      document.documentElement.style.setProperty('--band', band.color);
      setText(els.bandChip, st.mode === 'bilateral' ? 'Bilateral' : band.name);
      setText(els.beatReadout, `${formatHz(beat)} Hz`);
      const same = st.mode === 'isochronic' || st.mode === 'bilateral';
      setText(els.freqL, formatHz(same ? carrier : carrier - beat / 2));
      setText(els.freqR, formatHz(same ? carrier : carrier + beat / 2));
      setText(els.beatBand, band.name);
      els.beatBand.style.setProperty('--band', band.color);
      setText(els.beatBandText, st.mode === 'bilateral'
        ? `Alternating left ↔ right ${formatHzShort(beat)} times per second. 0.5–2 Hz is the usual range.`
        : `${band.name} (${formatHzShort(band.min)}–${formatHzShort(band.max)} Hz): ${band.summary}`);
      if (!dragging.has(els.beatRange)) els.beatRange.value = valueToSlider(beat, LIMITS.beat.min, LIMITS.beat.max);
      if (!dragging.has(els.carrierRange)) els.carrierRange.value = valueToSlider(carrier, LIMITS.carrier.min, LIMITS.carrier.max);
      if (root.activeElement !== els.beatNum) els.beatNum.value = round2(beat);
      if (root.activeElement !== els.carrierNum) els.carrierNum.value = round2(carrier);
      setText(els.segment, segmentLabel);
      for (const { btn, c } of carrierButtons) btn.setAttribute('aria-pressed', String(Math.abs(c.hz - st.carrier) < 0.005));
    }

    if (changed(st, prev, 'activeProgramId', 'status')) {
      for (const el of [els.beatRange, els.beatNum, els.carrierRange, els.carrierNum]) el.disabled = lockTone;
      for (const { btn } of carrierButtons) btn.disabled = lockTone;
      for (const { btn } of [...presetCards, ...specialCards, ...stackCards]) btn.disabled = programActive && playing;
      els.session.disabled = programActive;
    }

    if (changed(st, prev, 'activePresetId')) {
      for (const { btn, preset } of [...presetCards, ...specialCards, ...stackCards]) {
        btn.setAttribute('aria-pressed', String(preset.id === st.activePresetId));
      }
    }

    if (changed(st, prev, 'bandFilter')) {
      for (const btn of filterButtons) btn.setAttribute('aria-pressed', String(btn.dataset.band === st.bandFilter));
      for (const { li, preset } of presetCards) li.hidden = st.bandFilter !== 'all' && preset.band !== st.bandFilter;
    }

    if (changed(st, prev, 'tab')) {
      const manual = st.tab === 'manual';
      els.tabManual.setAttribute('aria-selected', String(manual));
      els.tabPrograms.setAttribute('aria-selected', String(!manual));
      els.tabManual.tabIndex = manual ? 0 : -1;
      els.tabPrograms.tabIndex = manual ? -1 : 0;
      els.panelManual.hidden = !manual;
      els.panelPrograms.hidden = manual;
    }

    if (changed(st, prev, 'mode')) {
      for (const input of els.modeGroup.querySelectorAll('input')) input.checked = input.value === st.mode;
      const info = MODE_INFO[st.mode];
      setText(els.modeBlurb, info.blurb);
      const required = info.headphones === 'required';
      els.banner.classList.toggle('soft', !required);
      setText(els.hpTitle, required ? 'Headphones required.' : 'Headphones recommended.');
      setText(els.hpText, required
        ? (st.mode === 'bilateral'
          ? 'Bilateral stimulation alternates between your ears, so each ear must have its own speaker.'
          : 'Binaural beats only work when each ear hears its own tone. Speakers blend the two tones and the effect disappears.')
        : `${info.name} beats also work on speakers, but headphones give the clearest effect.`);
    }

    if (changed(st, prev, 'timbre', 'waveform')) {
      els.timbre.value = st.timbre;
      els.waveform.value = st.waveform;
      els.waveform.disabled = st.timbre === 'pad';
      setText(els.timbreHint, st.timbre === 'pad'
        ? 'Warm pad: three softly detuned, filtered voices per ear. More musical and less fatiguing than a pure tone.'
        : '');
    }
    if (changed(st, prev, 'sessionMinutes')) els.session.value = String(st.sessionMinutes);
    if (changed(st, prev, 'fadeIn')) els.fadein.value = String(st.fadeIn);
    if (changed(st, prev, 'fadeDownMinutes', 'sessionMinutes', 'activeProgramId')) {
      els.fadedown.value = String(st.fadeDownMinutes);
      els.fadedown.title = !programActive && st.sessionMinutes === 0 ? 'Needs a session length' : '';
    }

    if (changed(st, prev, 'voices')) {
      st.voices.forEach((v, i) => {
        const r = voiceRows[i];
        r.on.checked = v.on;
        if (root.activeElement !== r.beat) r.beat.value = round2(v.beat);
        if (root.activeElement !== r.carrier) r.carrier.value = round2(v.carrier);
        r.volume.value = Math.round(v.volume * 100);
        const band = bandFor(v.beat);
        setText(r.band, band.name);
        r.band.style.setProperty('--band', band.color);
        r.row.classList.toggle('off', !v.on);
      });
      if (st.voices.some((v) => v.on)) $('voices-details').open = true;
    }

    if (changed(st, prev, 'toneVolume')) knobs.tone.setValue(st.toneVolume);
    if (changed(st, prev, 'masterVolume')) knobs.master.setValue(st.masterVolume);
    if (changed(st, prev, 'noiseVolume', 'noiseType')) {
      knobs.noise.setValue(st.noiseVolume);
      knobs.noise.setDim(st.noiseType === 'off');
      els.noiseType.value = st.noiseType;
    }
    if (changed(st, prev, 'natureVolume', 'natureType', 'loadingTypes')) {
      knobs.nature.setValue(st.natureVolume);
      knobs.nature.setDim(st.natureType === 'off');
      els.natureType.value = st.natureType;
      setText(els.natureStatus, st.loadingTypes.split(',').includes(st.natureType) ? 'Generating sound…' : '');
    }
    if (changed(st, prev, 'illusionVolume', 'illusionType', 'loadingTypes')) {
      knobs.illusion.setValue(st.illusionVolume);
      knobs.illusion.setDim(st.illusionType === 'off');
      els.illusionType.value = st.illusionType;
      setText(els.illusionStatus, st.loadingTypes.split(',').includes(st.illusionType) ? 'Generating sound…' : '');
    }
    if (changed(st, prev, 'spatialRate')) els.spatial.value = String(st.spatialRate);
    if (changed(st, prev, 'layerPulse')) els.layerPulse.value = String(st.layerPulse);

    if (changed(st, prev, 'breathPattern', 'breathCue')) {
      els.breathPattern.value = st.breathPattern;
      els.breathCue.checked = st.breathCue;
      els.breathCue.disabled = st.breathPattern === 'off';
      const p = BREATH_PATTERNS[st.breathPattern];
      setText(els.breathDesc, p ? p.description : 'Choose a pattern to show the pacer on the visualizer.');
    }

    if (changed(st, prev, 'exportMinutes', 'exportRate', 'exportStatus', 'activeProgramId', 'status')) {
      els.exportMinutes.value = String(st.exportMinutes);
      els.exportRate.value = String(st.exportRate);
      const secs = controller.exportSeconds(st);
      setText(els.exportSize, `${formatTime(secs)} · about ${formatBytes(estimateBytes(secs, st.exportRate))}`
        + (st.exportMinutes === 'program' && !programActive ? ' · select a program first (10 min used)' : ''));
      const ex = st.exportStatus;
      els.exportGo.disabled = ex.state === 'rendering';
      setText(els.exportGo, ex.state === 'rendering' ? 'Rendering…' : 'Render & download WAV');
      els.exportBar.style.width = `${Math.round(ex.progress * 100)}%`;
      setText(els.exportStatus, ex.message);
      els.exportStatus.classList.toggle('error-text', ex.state === 'error');
    }

    if (changed(st, prev, 'testSide')) {
      els.testIndicator.hidden = !st.testSide;
      els.testIndicator.dataset.side = st.testSide || '';
      setText(els.testIndicator, st.testSide === 'left' ? '◀ Left ear' : st.testSide === 'right' ? 'Right ear ▶' : '');
    }

    if (changed(st, prev, 'welcomeOpen')) {
      if (st.welcomeOpen && !els.welcome.open) {
        if (typeof els.welcome.showModal === 'function') els.welcome.showModal();
        else els.welcome.setAttribute('open', '');
      } else if (!st.welcomeOpen && els.welcome.open) {
        els.welcome.close();
      }
    }

    if (changed(st, prev, 'theme')) {
      if (st.theme === 'auto') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = st.theme;
      els.theme.textContent = THEME_ICON[st.theme];
      els.theme.setAttribute('aria-label', `Theme: ${st.theme}. Click to change.`);
    }

    if (changed(st, prev, 'error')) {
      els.toast.hidden = !st.error;
      setText(els.toastText, st.error || '');
    }

    if (changed(st, prev, 'announcement') && st.announcement) {
      setText(els.live, st.announcement.text);
    }
  }

  store.subscribe(render);
  render(store.get(), null);
  return { render };
}
