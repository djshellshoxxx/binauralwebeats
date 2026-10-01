# 00 — Product Overview

## 1. Purpose

**Binaural We Beats** is a browser app that makes binaural beats. It plays a
slightly different pure tone in each ear, for example 195 Hz on the left and
205 Hz on the right. The brain hears a "beat" at the difference between the two
(10 Hz in this example). The app runs entirely in the browser: there is no
server-side logic, no account and no tracking.

## 2. Goals

| ID  | Goal |
|-----|------|
| G1  | Generate accurate, click-free stereo binaural beats in real time using the Web Audio API. |
| G2  | Let the user set the carrier frequency, beat frequency and waveform by hand (**Manual mode**). |
| G3  | Play timed **Programs**: sequences of segments that glide the beat and carrier frequencies over time (e.g. Alpha → Theta → Delta to wind down). |
| G4  | Mix in optional background layers, each with its own volume knob: noise (white / pink / brown) and nature sounds (crashing waves / rain / thunder / rain + thunder). |
| G4b | Offer three beat types: binaural (headphones), monaural and isochronic (both also work on speakers). |
| G5  | Provide a session timer with fade-in/out, pause/resume and an automatic stop. |
| G6  | Show a live visualizer: per-channel waveforms plus a pulse at the beat rate. |
| G7  | Remember the user's settings between visits (local only). |
| G8  | Ship as static files with **no build step** and **no runtime dependencies**, so it can be hosted by nginx, Apache, GitHub Pages or `python3 -m http.server`. |
| G9  | Be safe by default: hard volume ceiling, a mandatory **headphones** notice before first play, a health disclaimer, and an L/R channel test. |
| G10 | Be usable on phones, by keyboard and with a screen reader. |

## 3. Non-goals (v1)

- Recording or exporting audio files.
- User accounts, cloud sync or analytics.
- A program editor. Programs are defined in code (`js/app/presets.js`); adding one is a data change only.
- Audio-file samples: all nature sounds are synthesised, so the app works offline.

## 4. Spec documents

| File | Covers |
|------|--------|
| `01-engine.md`  | The audio engine: graph, maths, scheduling, noise, safety limits. |
| `02-gui.md`     | Layout, controls, ranges, states, accessibility, theming. |
| `03-wiring.md`  | State store, controller, data flow, events, persistence, the session lifecycle state machine. |
| `04-presets.md` | Brainwave bands, quick presets, built-in programs and their data format. |
| `05-quality.md` | Testing, browser support, performance budgets, deployment, CI. |
| `06-roadmap.md` | Other audio techniques that could be added next. |

## 5. Architecture at a glance

```
┌────────────────────────── index.html ───────────────────────────┐
│                                                                 │
│   UI layer (js/ui/*)   ──calls──▶   Controller (js/app/)        │
│        ▲                               │          │             │
│        │ subscribe / render            │ setState │ commands    │
│        │                               ▼          ▼             │
│        └──────────────────────   Store        AudioEngine       │
│                                (js/app/store)  (js/engine/*)    │
│                                     │                           │
│                                     ▼                           │
│                               localStorage (settings only)      │
└─────────────────────────────────────────────────────────────────┘
```

- **The engine** knows nothing about the DOM or the store. It is a Web Audio wrapper with a small imperative API.
- **The store** holds all app state as plain data. It is the single source of truth for the UI.
- **The controller** is the only module that talks to both. It turns user intents into engine commands and store updates, and runs the session clock.
- **The UI** renders from store state and forwards user input to the controller. It never touches the engine directly. The one exception is the visualizer, which reads the engine's `AnalyserNode`s through the controller.

## 6. File layout

```
index.html
css/styles.css
js/main.js                 bootstrap
js/engine/frequency.js     pure maths (split, bands, clamping)
js/engine/noise.js         pure noise sample generators
js/engine/ambience.js      pure procedural nature sounds (waves, rain, thunder)
js/engine/ambience-worker.js  renders nature sounds off the main thread
js/engine/program.js       pure program timeline maths
js/engine/audio-engine.js  Web Audio graph + scheduling
js/app/store.js            tiny pub/sub store
js/app/persistence.js      localStorage load/save (fail-safe)
js/app/presets.js          bands, quick presets, programs
js/app/controller.js       wiring + session state machine
js/ui/dom.js               DOM helpers
js/ui/controls.js          binds controls <-> controller/store
js/ui/knob.js              accessible rotary volume knob
js/ui/system.js            keyboard shortcuts, Media Session, wake lock
js/ui/visualizer.js        canvas renderer
js/ui/format.js            pure formatting helpers
tests/*.test.js            node:test unit tests (pure modules)
docs/specs/*.md            these specs
```
