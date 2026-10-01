# 03 — Wiring Spec (State, Controller, Data Flow)

## 1. Store (`js/app/store.js`)

```js
const store = createStore(initialState);
store.get()                       // current state (frozen shallow copy)
store.set(patch)                  // shallow merge; notifies if anything changed
store.subscribe(fn)               // fn(state, prev); returns unsubscribe
```

- **W-S1:** `set` compares changed keys with `Object.is`, and notifies only if at least one changed.
- **W-S2:** Subscribers run synchronously, in subscription order. An error in one subscriber is caught and logged, and does not stop the others.

### 1.1 State shape

```js
{
  // settings (persisted)
  mode: 'binaural', carrier: 200, beat: 10, waveform: 'sine',
  toneVolume: 0.8, noiseType: 'off', noiseVolume: 0.3,
  natureType: 'off', natureVolume: 0.3, masterVolume: 0.4,
  sessionMinutes: 30, fadeIn: 5, theme: 'auto', acknowledged: false,
  activePresetId: 'alpha-10', activeProgramId: null, tab: 'manual', bandFilter: 'all',

  // runtime (never persisted)
  status: 'idle',            // 'idle' | 'starting' | 'running' | 'paused' | 'testing'
  elapsed: 0,                // seconds
  duration: 1800,            // seconds; Infinity for ∞
  live: { carrier, beat, segmentIndex, segmentLabel },
  natureLoading: false,
  error: null,
}
```

## 2. Persistence (`js/app/persistence.js`)

- Key: `binauralwebeats.settings.v1`.
- `loadSettings(storage)` → partial settings. Unknown keys are dropped. Each known key is validated (type, enum membership, numeric range). Invalid values fall back to the defaults. Any exception (private mode, quota, JSON error) → `{}`.
- `saveSettings(storage, state)` writes only the `PERSISTED_KEYS`. It is debounced by 300 ms in the controller. Exceptions are swallowed.

## 3. Controller (`js/app/controller.js`)

`createController({ store, engine, storage, now? })` returns the intent API. It
is the **only** module that touches both the store and the engine.

| Intent | Effect |
|--------|--------|
| `togglePlay()` | idle → `start()`, running → `pause()`, paused → `resume()` |
| `start()` | Requires `acknowledged`; otherwise sets an error and asks the UI to open the welcome dialog. status `starting` → `engine.start(settings, { program, fadeIn })` → `running`. Computes `duration` (the program length or `sessionMinutes·60`, ∞ when 0). |
| `pause()` / `resume()` | Engine call, then the status changes. |
| `stop()` | Fades out, then `status:'idle'`, `elapsed:0`. |
| `setCarrier(hz)` / `setBeat(hz)` | Sanitise → store → `engine.setTone` (manual only). Clears `activePresetId` if the value no longer matches it. |
| `applyPreset(id)` | Sets the beat + carrier, `activePresetId`, `activeProgramId:null`, `tab:'manual'`. |
| `applyCarrierPreset(id)` | Sets the carrier only. |
| `selectProgram(id \| null)` | Ignored while running. Sets `activeProgramId` and `tab`. |
| `setMode / setWaveform / setToneVolume / setMasterVolume` | Store + engine. |
| `setNoise(type?, volume?)` / `setNature(type?, volume?)` | Store + engine. For nature, `natureLoading` is true until the render resolves. |
| `setSessionMinutes / setFadeIn / setTheme / setTab / setBandFilter` | Store only. |
| `acknowledge()` | `acknowledged: true`. |
| `testChannels()` | idle only. status `testing` → engine → `idle`. |
| `getAnalysers()` | Passes the engine's analysers through to the visualizer. |

### 3.1 Session clock

- **W-C1:** While `running`, a 200 ms `setInterval` tick reads `engine.elapsed` (the audio clock, which is the source of truth) and sets `elapsed`. In program mode it also sets `live` from `paramsAt(program, elapsed)`.
- **W-C2:** When `elapsed ≥ duration − fadeOut` (fadeOut 3 s, or the remaining time if shorter), the controller calls `stop()` once. A guard flag prevents double stops.
- **W-C3:** The tick is cleared on pause/stop and restarted on resume.

### 3.2 Persistence hook

A store subscriber saves settings (debounced) whenever a persisted key changes.

### 3.3 Visibility

On `visibilitychange` to visible while `running`, the controller calls
`engine.ensureRunning()`, which resumes a context that the browser suspended
on its own.

## 4. UI wiring (`js/ui/controls.js`)

- **W-U1:** `bindUI({ store, controller, root })` attaches all DOM listeners, which call controller intents only.
- **W-U2:** It has one `render(state, prev)` subscriber, which updates the DOM only for keys that changed (cheap diffing by key). Inputs that the user is dragging are not overwritten during the drag.
- **W-U3:** Lists (preset cards, program cards, band legend, carrier list) are built once at startup from `presets.js`. Selection state is toggled by class.

## 5. Data flow examples

**Drag the beat slider while playing in manual mode**

```
input event → controller.setBeat(12.3)
  → sanitizeBeat → store.set({beat:12.3, live:{…}, activePresetId:null})
  → engine.setTone({carrier, beat:12.3})       (glide τ=0.08 s)
  → render(): number box, band chip, L/R readout
  → persistence subscriber: debounce save
```

**A program reaches its end**

```
tick → engine.elapsed = 1797.1 ≥ 1800 − 3
  → controller.stop() → engine.stop(3) (fade) → store.set({status:'idle', elapsed:0})
  → render(): ▶ Play, Stop disabled, announcement "Session complete"
```

## 6. Bootstrap (`js/main.js`)

1. Create the store from `{...DEFAULTS, ...loadSettings(localStorage)}`.
2. Create the engine and the controller.
3. `bindUI`, then start the visualizer.
4. Apply the theme. If `!acknowledged`, `showModal()` the welcome dialog.
5. Register the keyboard shortcuts, Media Session handlers and visibility handler.
6. If the Web Audio API is missing, disable Play and show the error toast.
