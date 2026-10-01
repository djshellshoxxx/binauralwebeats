// Binds DOM controls to controller intents and renders store state (spec 03 §4).

import { BANDS, bandFor, LIMITS } from '../engine/frequency.js';
import { paramsAt, programDuration } from '../engine/program.js';
import { BEAT_PRESETS, CARRIER_PRESETS, PROGRAMS, DISCLAIMER, MODE_INFO, findProgram } from '../app/presets.js';
import { DEFAULT_SETTINGS } from '../app/persistence.js';
import { createKnob } from './knob.js';
import {
  formatHz, formatHzShort, formatMinutes, formatTime, round2, sliderToValue, valueToSlider,
} from './format.js';

const bandById = Object.fromEntries(BANDS.map((b) => [b.id, b]));

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

export function bindUI({ store, controller, root = document }) {
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
    waveform: $('waveform'), session: $('session'), fadein: $('fadein'),
    carrierList: $('carrier-list'), programList: $('program-list'), programClear: $('program-clear'),
    noiseType: $('noise-type'), natureType: $('nature-type'), natureStatus: $('nature-status'),
    bandLegend: $('band-legend'), bandFilter: $('band-filter'), presetGrid: $('preset-grid'),
    disclaimer: $('disclaimer'), banner: $('hp-banner'), hpTitle: $('hp-title'), hpText: $('hp-text'),
    welcome: $('welcome'), welcomeOk: $('welcome-ok'), help: $('help'), theme: $('theme-toggle'),
    toast: $('toast'), toastText: $('toast-text'), toastClose: $('toast-close'), live: $('live'),
  };

  // ------------------------------------------------------------ static lists

  els.disclaimer.textContent = DISCLAIMER;

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

  const presetCards = BEAT_PRESETS.map((p) => {
    const band = bandById[p.band];
    const btn = h('button', { type: 'button', class: 'preset-card', 'aria-pressed': 'false', style: `--c:${band.color}`,
      onclick: () => controller.applyPreset(p.id) },
      h('span', { class: 'preset-top' },
        h('span', { class: 'preset-hz' }, `${formatHzShort(p.beat)} Hz`),
        h('span', { class: 'preset-band' }, band.name)),
      h('span', { class: 'preset-name' }, p.name),
      h('span', { class: 'preset-desc' }, p.description),
      p.caution ? h('span', { class: 'preset-caution' }, `⚠ ${p.caution}`) : null,
      h('span', { class: 'preset-carrier' }, `Carrier ${formatHzShort(p.carrier)} Hz · 🎧 headphones for binaural`));
    const li = h('li', { 'data-band': p.band }, btn);
    els.presetGrid.append(li);
    return { li, btn, preset: p };
  });

  const carrierButtons = CARRIER_PRESETS.map((c) => {
    const btn = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => controller.applyCarrierPreset(c.id) },
      h('span', { class: 'hz' }, `${formatHzShort(c.hz)} Hz`),
      h('span', { class: 'name' }, c.name),
      h('span', { class: 'desc' }, c.description));
    els.carrierList.append(h('li', {}, btn));
    return { btn, c };
  });

  const programCards = PROGRAMS.map((p) => {
    const total = programDuration(p);
    const timeline = h('span', { class: 'timeline', 'aria-hidden': 'true' });
    for (const s of p.segments) {
      const mid = (s.beat[0] + s.beat[1]) / 2;
      timeline.append(h('span', { style: `flex:${s.duration} 0 0;background:${bandFor(mid).color}`, title: s.label }));
    }
    const marker = h('span', { class: 'marker' });
    timeline.append(marker);
    const btn = h('button', { type: 'button', class: 'program-card', 'aria-pressed': 'false',
      onclick: () => controller.selectProgram(store.get().activeProgramId === p.id ? null : p.id) },
      h('span', { class: 'program-head' }, h('span', {}, p.name), h('span', { class: 'program-len' }, formatMinutes(total))),
      h('span', { class: 'program-desc' }, p.description),
      timeline);
    els.programList.append(h('li', {}, btn));
    return { btn, marker, program: p, total };
  });

  // ------------------------------------------------------------ knobs

  const st0 = store.get();
  const knobs = {
    tone: createKnob($('knob-tone'), { label: 'Beats volume', value: st0.toneVolume, defaultValue: DEFAULT_SETTINGS.toneVolume,
      onInput: (v) => controller.setToneVolume(v) }),
    noise: createKnob($('knob-noise'), { label: 'Noise volume', value: st0.noiseVolume, defaultValue: DEFAULT_SETTINGS.noiseVolume,
      onInput: (v) => controller.setNoise(undefined, v) }),
    nature: createKnob($('knob-nature'), { label: 'Nature volume', value: st0.natureVolume, defaultValue: DEFAULT_SETTINGS.natureVolume,
      onInput: (v) => controller.setNature(undefined, v) }),
    master: createKnob($('knob-master'), { label: 'Master volume', value: st0.masterVolume, defaultValue: DEFAULT_SETTINGS.masterVolume,
      onInput: (v) => controller.setMasterVolume(v) }),
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

  els.waveform.addEventListener('change', () => controller.setWaveform(els.waveform.value));
  els.session.addEventListener('change', () => controller.setSessionMinutes(+els.session.value));
  els.fadein.addEventListener('change', () => controller.setFadeIn(+els.fadein.value));
  els.programClear.addEventListener('click', () => { controller.selectProgram(null); controller.setTab('manual'); });

  els.noiseType.addEventListener('change', () => controller.setNoise(els.noiseType.value));
  els.natureType.addEventListener('change', () => controller.setNature(els.natureType.value));

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

    if (changed(st, prev, 'status', 'acknowledged', 'activeProgramId')) {
      els.play.dataset.state = st.status;
      const label = { idle: 'Play', starting: 'Starting', running: 'Pause', paused: 'Resume', testing: 'Play' }[st.status];
      els.play.setAttribute('aria-label', label);
      els.play.setAttribute('aria-pressed', String(st.status === 'running'));
      els.play.disabled = st.status === 'starting' || st.status === 'testing';
      els.stop.disabled = !playing;
      els.testLR.disabled = st.status !== 'idle';
      els.timer.classList.toggle('blink', st.status === 'paused');
      const program = programActive ? findProgram(st.activeProgramId) : null;
      setText(els.playLabel, {
        idle: program ? `Ready · ${program.name}` : 'Ready',
        starting: 'Starting…', running: program ? program.name : 'Playing', paused: 'Paused', testing: 'Testing headphones…',
      }[st.status]);
      for (const c of programCards) c.btn.disabled = playing && c.program.id !== st.activeProgramId;
      els.programClear.disabled = playing;
      document.body.dataset.status = st.status;
    }

    if (changed(st, prev, 'elapsed', 'duration', 'status')) {
      setText(els.timer, `${formatTime(st.elapsed)} / ${formatTime(st.duration)}`);
      const pct = Number.isFinite(st.duration) && st.duration > 0 ? Math.min(100, (st.elapsed / st.duration) * 100) : 0;
      els.progress.style.width = `${pct}%`;
      for (const c of programCards) {
        const isPlaying = playing && c.program.id === st.activeProgramId;
        c.btn.classList.toggle('playing', isPlaying);
        if (isPlaying) c.marker.style.left = `${Math.min(100, (st.elapsed / c.total) * 100)}%`;
      }
    }

    if (changed(st, prev, 'live', 'carrier', 'beat', 'mode', 'activeProgramId', 'status')) {
      // In a running program show live values; otherwise the settings.
      let { carrier, beat } = st;
      let segmentLabel = '';
      if (programActive) {
        const program = findProgram(st.activeProgramId);
        const p = playing ? st.live : { ...paramsAt(program, 0), segmentLabel: program.segments[0].label };
        ({ carrier, beat, segmentLabel } = p);
        if (!playing) segmentLabel = `Starts with: ${segmentLabel}`;
      }
      const band = bandFor(beat);
      document.documentElement.style.setProperty('--band', band.color);
      setText(els.bandChip, band.name);
      setText(els.beatReadout, `${formatHz(beat)} Hz`);
      const iso = st.mode === 'isochronic';
      setText(els.freqL, formatHz(iso ? carrier : carrier - beat / 2));
      setText(els.freqR, formatHz(iso ? carrier : carrier + beat / 2));
      setText(els.beatBand, band.name);
      els.beatBand.style.setProperty('--band', band.color);
      setText(els.beatBandText, `${band.name} (${formatHzShort(band.min)}–${formatHzShort(band.max)} Hz): ${band.summary}`);
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
      for (const { btn } of presetCards) btn.disabled = programActive && playing;
      for (const c of programCards) c.btn.setAttribute('aria-pressed', String(c.program.id === st.activeProgramId));
    }

    if (changed(st, prev, 'activePresetId')) {
      for (const { btn, preset } of presetCards) btn.setAttribute('aria-pressed', String(preset.id === st.activePresetId));
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
        ? 'Binaural beats only work when each ear hears its own tone. Speakers blend the two tones and the effect disappears.'
        : `${info.name} beats also work on speakers, but headphones give the clearest effect.`);
    }

    if (changed(st, prev, 'waveform')) els.waveform.value = st.waveform;
    if (changed(st, prev, 'sessionMinutes')) els.session.value = String(st.sessionMinutes);
    if (changed(st, prev, 'fadeIn')) els.fadein.value = String(st.fadeIn);
    if (changed(st, prev, 'activeProgramId', 'status')) els.session.disabled = programActive;

    if (changed(st, prev, 'toneVolume')) knobs.tone.setValue(st.toneVolume);
    if (changed(st, prev, 'masterVolume')) knobs.master.setValue(st.masterVolume);
    if (changed(st, prev, 'noiseVolume', 'noiseType')) {
      knobs.noise.setValue(st.noiseVolume);
      knobs.noise.setDim(st.noiseType === 'off');
      els.noiseType.value = st.noiseType;
    }
    if (changed(st, prev, 'natureVolume', 'natureType', 'natureLoading')) {
      knobs.nature.setValue(st.natureVolume);
      knobs.nature.setDim(st.natureType === 'off');
      els.natureType.value = st.natureType;
      setText(els.natureStatus, st.natureLoading ? 'Generating sound…' : '');
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
