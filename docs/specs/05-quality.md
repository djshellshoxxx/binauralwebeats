# 05 — Quality, Testing & Deployment Spec

## 1. Browser support

The latest two versions of Chrome, Edge, Firefox and Safari (macOS and iOS),
plus Chrome on Android. The app needs ES modules, Web Audio,
`<dialog>` and CSS custom properties. Optional features (Media Session, Wake
Lock) are feature-detected.

## 2. Automated tests (`npm test` → `node --test`)

There are no dependencies. The tests cover the pure modules and the engine
against a fake `AudioContext`.

| Test file | Covers |
|-----------|--------|
| `frequency.test.js` | split maths, `oscFrequencies` per mode, clamping/sanitising, E-F1 lowest tone ≥ 20 Hz, `bandFor` boundaries |
| `program.test.js` | duration, `paramsAt` interpolation and clamping, segment boundaries, `validateProgram` errors |
| `presets.test.js` | every program validates; every preset is within limits and its `band` matches `bandFor(beat)`; unique ids |
| `noise.test.js` | outputs bounded within [−1,1] (E-N1), non-silent, deterministic with a seeded RNG |
| `ambience.test.js` | each nature type renders within bounds, stereo, the right length, non-silent, and within the time budget (E-N2); thunder has distinct loud events |
| `store.test.js` | merge, change detection, unsubscribe, error isolation |
| `persistence.test.js` | round-trip, invalid values dropped, a throwing storage is tolerated |
| `controller.test.js` | the state machine with a fake engine: start requires acknowledgement; play/pause/resume/stop transitions; preset application; auto-stop at the end of a session |
| `engine.test.js` | the engine with a fake context: graph creation, routing gains per mode, program scheduling calls, the volume cap |
| `format.test.js` | time / Hz / percentage formatting, log slider mapping round-trip |

## 3. Manual / browser checks

- A headless Chromium smoke test (run by the developer, not committed as a dependency) loads the page, acknowledges the modal, clicks Play and asserts that the status becomes `running` with no console errors.
- Listening check with headphones: the beat is audible; the L/R test plays in the correct ears; no clicks when dragging sliders, switching modes or pausing.

## 4. Performance budgets

- First load: < 100 KB total transfer (no images, no fonts, no libraries).
- Audio CPU: < 3 % on a mid-range laptop while running two layers.
- The nature buffer renders in < 1.5 s in the browser (runs once per type).

## 5. Deployment

The app is static files. It must be served over HTTP(S): ES modules don't load
from `file://`.

- Local: `python3 -m http.server 8080`, then open `http://localhost:8080`.
- nginx: copy the repo into the web root (`/var/www/binauralwebeats`). The default `mime.types` already serves `.js` as JavaScript.
- GitHub Pages: enable Pages from the default branch. A workflow is provided (`.github/workflows/pages.yml`).

## 6. CI

`.github/workflows/ci.yml` runs `npm test` on Node 20 and 22 for every push and pull request.
