# 02 — GUI Spec

Single page (`index.html`) with one stylesheet (`css/styles.css`). There is no
framework. The UI is built from semantic HTML in `index.html`, plus lists
generated from `presets.js`.

## 1. Visual design

- **Theme:** dark by default ("night sky"), with a light theme via
  `prefers-color-scheme` and a manual toggle (stored in settings). All colours
  are CSS custom properties on `:root`.
- **Type:** the system UI font stack. Numbers use `font-variant-numeric: tabular-nums` so readouts don't jitter.
- **Band colours:** each brainwave band has a token (`--band-delta` etc.). The current band colours the play button glow, the visualizer pulse and the band chip.
- **Motion:** the visualizer animation respects `prefers-reduced-motion`. When it is set, the pulse is replaced with a static ring whose opacity changes at most 2×/s.

## 2. Layout (top to bottom; one column on phones, two columns ≥ 900 px)

```
┌──────────────────────────────────────────────────────────────┐
│ Header: logo/title · theme toggle · "?" help                 │
├──────────────────────────────────────────────────────────────┤
│ 🎧 HEADPHONES REQUIRED banner (always visible, binaural mode) │
├───────────────────────────────┬──────────────────────────────┤
│ HERO                          │ CONTROLS (tabs)              │
│  visualizer canvas            │  [Manual] [Programs]         │
│  band chip  "Alpha · 10.00 Hz"│  Manual: mode, carrier, beat,│
│  L 195.00 Hz · R 205.00 Hz    │  waveform, session length,   │
│  ▶ big play/pause  ■ stop     │  fade-in                     │
│  timer 12:34 / 30:00          │  Programs: cards + timeline  │
│  [Test L/R]                   │                              │
├───────────────────────────────┴──────────────────────────────┤
│ PRESET CATALOGUE: filter chips by band; preset cards          │
├──────────────────────────────────────────────────────────────┤
│ MIXER: knobs → Tone · Noise (type select) · Nature (type) · Master │
├──────────────────────────────────────────────────────────────┤
│ CARRIER TONES (traditional) · About / disclaimer · footer      │
└──────────────────────────────────────────────────────────────┘
```

## 3. Controls

| Control | Element | Range / options | Default | Behaviour |
|---------|---------|-----------------|---------|-----------|
| Play / Pause | `<button id="play">` | — | — | idle→start, running→pause, paused→resume. Label and `aria-pressed` reflect the state. |
| Stop | `<button id="stop">` | — | — | Fades out and resets the timer. Disabled when idle. |
| Test L/R | `<button id="test-lr">` | — | — | Says "Left…" / "Right…" in the status line while the test tone plays. Disabled unless idle. |
| Mode | segmented radio group | Binaural / Monaural / Isochronic | Binaural | Each option has a one-line description underneath. |
| Carrier | range + number input | 60–1000 Hz, 0.01 | 200 | The two inputs stay in sync. The range is logarithmic (slider position maps exponentially). |
| Beat | range + number input | 0.5–45 Hz, 0.01 | 10 | Logarithmic range. Shows the band chip next to it. |
| Waveform | `<select>` | sine, triangle, square, sawtooth | sine | Shows a hint that sine is recommended. |
| Session length | `<select>` | ∞, 5, 10, 15, 20, 30, 45, 60, 90 min | 30 | Manual mode only. Auto-stops (with fade-out) at the end. |
| Fade-in | `<select>` | 0, 3, 5, 10, 20, 30 s | 5 | |
| Tone volume | knob | 0–100 % | 80 | |
| Noise type | `<select>` | Off, White, Pink, Brown | Off | |
| Noise volume | knob | 0–100 % | 30 | Dimmed (but still usable) when the type is Off. |
| Nature type | `<select>` | Off, Crashing Waves, Rain, Thunder, Rain + Thunder | Off | Shows "Generating…" while the buffer renders for the first time. |
| Nature volume | knob | 0–100 % | 30 | |
| Master volume | knob | 0–100 % | 40 | |
| Theme | button | dark / light / auto | auto | |

Background layers can be chosen at any time, but they only sound while a
session is running. Pressing Stop silences everything, so you never hear
rain after you press Stop. Choosing a nature sound while idle pre-renders it,
so it starts instantly on Play.

Decision log (made during the build):
- When a program is selected, the manual carrier/beat inputs are locked and
  show the program's start (or live) values. Presets can still be clicked
  while idle; this switches back to Manual.
- Space toggles play from anywhere except text inputs, selects, buttons and
  knobs, which keep their native Space behaviour.

### 3.1 Knob component (`js/ui/knob.js`)

- Markup: `<div class="knob" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow aria-valuetext="40 %" aria-label>`, containing an SVG arc (track + value arc + pointer) and a numeric readout below.
- The sweep is 270° (from −135° to +135°).
- Input:
  - Vertical drag (pointer events with capture): 200 px = full range. Hold Shift for fine control (×0.2).
  - Mouse wheel: ±2 per notch (`preventDefault` only while focused or hovered).
  - Keys: ↑/→ +1, ↓/← −1, PgUp/PgDn ±10, Home/End 0/100.
  - Double-click resets to the default.
- It emits an `input` CustomEvent with `detail.value` on every change.

## 4. Programs tab

- One card per program: name, length, description, and a mini band-coloured timeline (one coloured block per segment, width ∝ duration, colour = band at the segment's mid-beat).
- Selecting a card makes it the **active program** (highlighted). Play then starts that program.
- While a program plays:
  - The timeline shows a progress marker.
  - The current segment label shows under the timer ("Settle → Theta 6 Hz").
  - The manual carrier and beat inputs are disabled and show the live values.
- A "Back to manual" button clears the active program. It is disabled while playing.

## 5. Preset catalogue

- Filter chips: All · Epsilon · Delta · Theta · Alpha · SMR · Beta · Gamma.
- Cards: name, `beat Hz` in large type, a band badge, the description and an optional ⚠ caution line. Clicking a card switches to Manual (and clears any program), sets the beat and carrier, and, if playing, glides to them live.
- A band legend above the cards explains each band (name, range and what it is associated with), taken from `BANDS`.
- The disclaimer line from `04-presets.md` (P-W1) sits under the catalogue.
- The carrier-tone list (Solfeggio etc.) is a separate, smaller list with the "traditional associations" label.

## 6. Safety & first run

- **First-run modal** (`<dialog id="welcome">`). It is shown until acknowledged; the acknowledgement is saved:
  1. **"🎧 Use headphones."** Binaural beats require stereo headphones or earbuds. Each ear must hear a different tone; speakers blend them and the effect disappears.
  2. Start at a low volume and raise it gradually.
  3. Do not use while driving, operating machinery, or doing anything that needs full attention.
  4. Don't use if you have epilepsy or a seizure disorder, a heart condition or a pacemaker, or if you are pregnant, without consulting a doctor. Stop if you feel discomfort, dizziness or anxiety.
  5. Not a medical device; effects vary from person to person.
  - Button: **"I'm wearing headphones — continue"**. Play is disabled until this has been clicked.
- **Persistent banner:** "🎧 Headphones required. Binaural beats only work when each ear hears its own tone." It is shown in binaural mode. In monaural/isochronic modes the banner changes to "🎧 Headphones recommended."
- The `?` help button re-opens the modal.

## 7. States

| App state | Play button | Stop | Inputs | Timer |
|-----------|-------------|------|--------|-------|
| idle | ▶ "Play" | disabled | all enabled | `00:00 / len` |
| starting | spinner | disabled | — | — |
| running | ❚❚ "Pause" | enabled | mode/waveform/mixer live; tone inputs live in manual only | counting |
| paused | ▶ "Resume" | enabled | as running | frozen, blinking |
| error | ▶ "Play" + error toast | disabled | enabled | — |

Errors (for example "Web Audio not supported" or a context that fails to
start) show in a `role="alert"` toast.

## 8. Accessibility

- Every control has a visible `<label>` or `aria-label`.
- Status changes (playing, paused, preset applied, segment change) are announced through a visually hidden `aria-live="polite"` region.
- Keyboard shortcuts (ignored while typing in an input): **Space** = play/pause, **Esc** = stop, **↑/↓** on a focused knob. They are listed in the help modal.
- Focus styles are always visible. Hit targets are ≥ 44 px on touch.
- Contrast is ≥ 4.5:1 for text in both themes.

## 9. Visualizer (`js/ui/visualizer.js`)

The canvas fills its box and is scaled for `devicePixelRatio`.

- **Pulse orb:** a centred radial gradient in the band colour. Its radius and brightness follow `0.5 + 0.5·cos(2π·beat·elapsed)`, so the user *sees* the beat rate.
- **Waveforms:** the left channel is drawn in the top half (cool colour) and the right channel in the bottom half (warm colour), from the analysers, as thin lines.
- When idle it draws a slow, dim breathing orb (or a static one under reduced motion).
- It is driven by `requestAnimationFrame` and pauses when `document.hidden`.

## 10. Media Session & wake lock

- Sets `navigator.mediaSession.metadata` (title = preset/program name) and the play/pause/stop action handlers, so lock-screen controls work.
- Requests a screen wake lock while running, if supported. It is released on pause/stop. Failures are ignored.
