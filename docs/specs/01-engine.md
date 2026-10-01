# 01 — Audio Engine Spec

Module: `js/engine/audio-engine.js` (class `AudioEngine`). It uses the pure
helper modules `frequency.js`, `noise.js`, `ambience.js` and `program.js`.

## 1. Beat modes

The engine can produce three kinds of brainwave-entrainment tone. All three
use the same **carrier** and **beat** parameters.

| Mode | id | What each ear hears | Needs headphones? |
|------|----|---------------------|-------------------|
| Binaural beats | `binaural` | Left: `carrier − beat/2`. Right: `carrier + beat/2`. The beat exists only inside the brain. | **Yes. Required.** |
| Monaural beats | `monaural` | Both tones mixed into both ears. The beat is a real, physical loudness wobble. | No (headphones recommended) |
| Isochronic tones | `isochronic` | One tone at `carrier`, pulsed on/off `beat` times per second. The strongest and most obvious pulse. | No (headphones recommended) |

Binaural is the default and the app's main focus.

## 2. Signal graph

```
 oscL ─┬─ gLL ──▶ merger in 0 ─┐
       └─ gLR ──▶ merger in 1  │
 oscR ─┬─ gRL ──▶ merger in 0  ├─▶ amGain ──▶ toneGain ─┐
       └─ gRR ──▶ merger in 1 ─┘     ▲                  │  (toneGain → fade)
                                     │                  │
 lfo (PeriodicWave, f = beat) ─▶ lfoDepth ──(AudioParam: amGain.gain)
                                                        │
 noiseSrc (stereo loop)  ─▶ noiseTrim  ─▶ noiseBus   ───┤
 natureSrc (stereo loop) ─▶ natureTrim ─▶ natureBus  ───┴─▶ fade (per session) ─▶ master ─▶ limiter ─▶ destination
                                                                              │
                                                       splitter(2) ◀──────────┘
                                                        ├─▶ analyserL
                                                        └─▶ analyserR
```

Routing matrix per mode (the gains `gLL gLR gRL gRR`) and amplitude modulation:

| Mode | gLL | gLR | gRL | gRR | oscL Hz | oscR Hz | AM depth |
|------|-----|-----|-----|-----|---------|---------|----------|
| binaural   | 1   | 0   | 0   | 1   | c − b/2 | c + b/2 | 0 |
| monaural   | 0.5 | 0.5 | 0.5 | 0.5 | c − b/2 | c + b/2 | 0 |
| isochronic | 1   | 0   | 0   | 1   | c       | c       | 1 |

AM: `amGain.gain = 1 − depth/2` (base value) plus `lfo × depth/2` (through
`lfoDepth`). When depth is 1, the gain swings between 0 and 1 at the beat rate.
The LFO uses a `PeriodicWave` built from the odd harmonics 1, 3, 5, 7 with
sigma (Lanczos) smoothing. This gives a rounded square pulse: a crisp on/off
without clicks.

Rules:

- **E-G1:** Binaural routing uses a `ChannelMerger`, not a `StereoPannerNode`. Each tone stays 100 % in its own ear.
- **E-G2:** Noise and nature buffers are stereo, with decorrelated channels, so they sound wide.
- **E-G3:** `limiter` is a `DynamicsCompressorNode` (threshold −3 dB, knee 0, ratio 20, attack 3 ms, release 100 ms). It is a safety net against clipping.
- **E-G4:** The analysers (fftSize 2048) tap the output after the limiter, so the visualizer shows what the user hears.
- **E-G5:** Changing the mode while playing glides the routing gains and the AM depth over 0.15 s, and re-targets the oscillator frequencies. This avoids clicks.

## 3. Frequency maths (`frequency.js`, pure)

- `splitFrequencies(carrier, beat)` → `{ left: carrier − beat/2, right: carrier + beat/2 }`.
- `oscFrequencies(mode, carrier, beat)` → `{ left, right }` per the routing table above.
- Limits (`LIMITS`):

| Parameter | Min | Max | Default | Step |
|-----------|-----|-----|---------|------|
| Carrier (Hz) | 60 | 1000 | 200 | 0.01 |
| Beat (Hz)    | 0.5 | 45 | 10 | 0.01 |

- `sanitizeCarrier` / `sanitizeBeat` turn a non-finite value into the default and clamp a finite one into range.
- **E-F1:** No tone goes below 20 Hz. The lowest possible tone is 60 − 22.5 = 37.5 Hz. A test enforces this.
- `bandFor(beat)` → brainwave band (see `04-presets.md`).

## 4. Engine API

```js
const engine = new AudioEngine({ contextFactory? });

await engine.start(settings, { program?, programOffset?, fadeIn })
await engine.pause(fadeSec = 0.4)
await engine.resume(fadeSec = 0.4)
await engine.stop(fadeSec = 3)

engine.setTone({ carrier, beat })        // manual mode: smooth glide
engine.setMode(mode)                     // 'binaural' | 'monaural' | 'isochronic'
engine.setWaveform(type)                 // 'sine' | 'triangle' | 'square' | 'sawtooth'
engine.setToneVolume(v)                  // 0..1
engine.setNoise({ type, volume })        // 'off' | 'white' | 'pink' | 'brown'
engine.setNature({ type, volume })       // 'off' | 'waves' | 'rain' | 'thunder' | 'rainthunder'
engine.setMasterVolume(v)                // 0..1 (× MAX_MASTER_GAIN)
await engine.testChannels()              // 0.6 s tone left, then right

engine.elapsed     // audio-clock seconds since start (frozen while paused)
engine.state       // 'idle' | 'running' | 'paused'
engine.analysers   // { left, right } | null
```

`settings` = `{ mode, carrier, beat, waveform, toneVolume, noiseType,
noiseVolume, natureType, natureVolume, masterVolume }`.

- **E-A1:** The `AudioContext` is created lazily in `start()` / `testChannels()`. These are always called from a user gesture.
- **E-A2:** `contextFactory` lets tests inject a fake. It defaults to `new (window.AudioContext || window.webkitAudioContext)()`.
- **E-A3:** Setters never throw when idle. Values are stored and applied at the next `start()`. `setNature` while idle pre-renders the buffer (no sound) so playback starts instantly.
- **E-A4:** Every session builds its own sub-graph (oscillators, routing gains, layer buses and a `fade` gain) feeding the shared `master → limiter`. Stopping fades only that session's `fade` gain, so a quick restart never collides with a fade-out still in progress.
- **E-A5:** Nature buffers are rendered in a module Web Worker (`ambience-worker.js`). If workers are unavailable, rendering falls back to the main thread.

## 5. Click-free parameter changes

- **E-S1:** Gain changes use `setTargetAtTime(v, now, 0.03)`. Fades use linear ramps.
- **E-S2:** Manual frequency changes use `setTargetAtTime(v, now, 0.08)`, so sliders glide.
- **E-S3:** Before a ramp: `cancelScheduledValues(now)`, then `setValueAtTime(param.value, now)`.
- **E-S4:** Fade-in defaults to 5 s (range 0–30). Fade-out on stop: 3 s. Pause/resume: 0.4 s.

## 6. Program scheduling (`program.js`, pure + engine)

A program is `{ id, name, description, segments }`. A segment is:

```js
{ label: 'Settle', duration: 300, beat: [10, 8], carrier: [200, 180] }
```

Pure helpers: `programDuration`, `segmentStarts`, `paramsAt(program, t)` →
`{ beat, carrier, segmentIndex, segmentProgress, done }`, and
`validateProgram(program)` → `string[]`.

- **E-P1:** `scheduleProgram(program, offset)`: for each segment that ends after `offset`, set the start value (or the current value from `paramsAt(offset)`) at the segment start / `now`, then `linearRampToValueAtTime` to the end value at the segment end. This is done on `oscL.frequency`, `oscR.frequency` (via `oscFrequencies(mode, …)`) and `lfo.frequency` (= beat). The frequencies are linear in carrier and beat, so the linear ramps are exact.
- **E-P2:** Pausing calls `ctx.suspend()`, which freezes `currentTime`, so the schedule stays aligned with no rescheduling.
- **E-P3:** A mode change during a program reschedules from the current `elapsed`.
- **E-P4:** `setTone` is ignored while a program runs.

## 7. Background layers

There are two independent layers, each with its own volume (knob in the GUI):

### 7.1 Noise layer (`noise.js`, pure)

- `fillWhite(out, rand)`, `fillPink(out, rand)` (Paul Kellet refined filter), `fillBrown(out, rand)` (leaky integrator). Each is normalised to a peak of ≤ 0.95. `rand` is injectable so tests are deterministic.
- Buffer: 6 s, stereo, at the context sample rate, `loop = true`. Cached per type.
- Per-type trims (to even out loudness): white 0.25, pink 0.45, brown 0.8. The buffers loop seamlessly (a 100 ms tail is crossfaded into the head).

### 7.2 Nature layer (`ambience.js`, pure DSP)

All sounds are **synthesised procedurally**: there are no sample files, so the
app works offline and has no licensing issues. Each renderer returns
`{ left: Float32Array, right: Float32Array }` at `AMBIENCE_RATE = 22050 Hz`
(the browser resamples). Renderers take a seeded RNG (`mulberry32(seed)`).

| type | Length | Recipe |
|------|--------|--------|
| `waves` | 64 s | Brown + pink noise mix through a one-pole low-pass whose cutoff (250 → 2500 Hz) follows a swell envelope. Swells: 8 per buffer, irregular lengths (6–10 s), rising like `sin^2` with a frothy high-passed "wash" on the crash. Left and right are offset by ~0.4 s for width. The envelope is periodic across the buffer, so the loop is seamless. |
| `rain` | 32 s | Steady pink noise through a band-pass (~800 Hz – 6 kHz, one-pole HP + LP) for the "hiss", plus about 900 droplets/s: short (2–12 ms) exponentially decaying noise blips at random amplitudes, panned at random. |
| `thunder` | 75 s | A faint background rumble (brown, low-passed at 120 Hz), plus 3 thunder events. Each event: a crackle (high-passed noise burst, 0.1–0.4 s), then a rolling rumble (brown noise, low-pass 80–300 Hz, 4–10 s exponential decay, amplitude-modulated by 3–6 slow random "rolls"). The events never overlap the loop point. |
| `rainthunder` | 75 s | `rain` (rendered at 75 s) × 0.45 + `thunder` × 0.75, rescaled only if the peak exceeds 0.95. |

Nature trims: waves 0.7, rain 1.0, thunder 1.0, rain + thunder 1.0. Every nature buffer renders 1 s past its length, and that tail is equal-power crossfaded into the head so the loop has no click.

- **E-N1:** All noise and nature output stays within [−1, 1]. Tested.
- **E-N2:** Rendering happens once per type, on first use, and is cached. Rendering must take < 1.5 s on a mid-range laptop. A test asserts < 3 s in Node.
- **E-N3:** Changing the type crossfades over 0.6 s. The old source is stopped after the fade.

## 8. Safety limits

- **E-V1:** `MAX_MASTER_GAIN = 0.5`. UI 100 % → gain 0.5.
- **E-V2:** Default master volume 40 %. Default noise and nature volume 30 %. Both background layers default to `off`.
- **E-V3:** The limiter is always in the path.

## 9. Lifecycle

```
idle ──start()──▶ running ──pause()──▶ paused
  ▲                 │  ▲                  │
  │                 │  └────resume()──────┘
  └────stop()───────┴──────────stop()─────┘
```

- `stop()` stops and disconnects the oscillators, the LFO and the layer sources (they are single-use). Gains, the merger, the limiter and the analysers are built once per context and reused.
- `testChannels()` works only when idle. It reuses the output chain with a temporary oscillator.
