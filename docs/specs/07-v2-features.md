# 07 — v2 Feature Spec (all roadmap items)

This spec adds every item from `06-roadmap.md`. Where it changes earlier specs
it overrides them. IDs in brackets refer to the roadmap numbers.

## 1. Engine graph (v2)

```
           ┌─ voice osc ×3 (main + 2 detuned) ─▶ voiceMix ─▶ timbreFilter ─┐
 LEFT  ────┤                                                               ├─▶ gLL / gLR ─┐
 RIGHT ────┘   (same per right side)                                       └─▶ gRL / gRR ─┤
                                                                                          ▼
                    lfo (beat, pulse wave) ─▶ lfoDepth ─▶ am.gain           merger ─▶ am ─▶ tone ─┐
                                          ├─▶ bilatL ─▶ gLL.gain  (+d/2)                          │
                                          └─▶ bilatR ─▶ gRR.gain  (−d/2)                          │
 extra voices ×2 (binaural pairs) ─▶ voiceGain_i ───────────────────────────────────────▶ tone ───┤
                                                                                                  ▼
 noise ─▶ noiseBus ─┐                                                                  breathTone │
 nature ─▶ natureBus├─▶ layerPulse(am by lfo) ─▶ spatial (StereoPanner, LFO) ─▶ breathLayers ─────┤
 illusion ─▶ illusionBus┘                                                                          ▼
                                                              fade ─▶ fadeDown ─▶ master ─▶ limiter ─▶ out
```

All new nodes belong to the per-session sub-graph (spec 01, E-A4).

## 2. Bilateral alternation [3] — new beat mode `bilateral`

- Both ears get the carrier frequency. The left and right volumes alternate at the **beat rate** (recommended 0.5–2 Hz), using the same rounded pulse LFO as isochronic mode.
- Routing: `gLL` and `gRR` have a base gain of 0.5. `lfo → bilatL (gain +0.5) → gLL.gain` and `lfo → bilatR (gain −0.5) → gRR.gain`. The result is that L is up while R is down. `gLR = gRL = 0`, AM depth 0.
- Headphones: **required**. The mode has its own presets: `bilateral-05` (0.5 Hz, slow), `bilateral-1` (1 Hz, classic EMDR pace), `bilateral-2` (2 Hz, brisk).
- `oscFrequencies('bilateral', c, b)` → `{ left: c, right: c }`.

## 3. Timbre: pure / pad [5]

- Setting `timbre: 'pure' | 'pad'`.
- Each side has 3 oscillators sharing one frequency schedule: the main one (detune 0) and two others (detune ±3 cents). Their gains are `pure: [1, 0, 0]` and `pad: [0.5, 0.35, 0.35]`.
- Pad uses sawtooth waves for all three oscillators through a low-pass `BiquadFilter` (cutoff `min(4·carrier, 2400)` Hz, Q 0.7). Pure uses the selected waveform with the filter wide open (20 kHz).
- ±3 cents (≈ 0.35 Hz at 200 Hz) gives a slow shimmer without adding a competing beat.
- Switching timbre while playing glides the gains and the cutoff (τ 0.1 s).

## 4. Multi-voice layering ("Hemi-Sync-style") [7]

- Setting `voices: [{ on, carrier, beat, volume }, { … }]` with exactly 2 entries. Defaults: off, 400 Hz/40 Hz/0.5 and 100 Hz/2 Hz/0.5.
- Each enabled voice is a binaural pair (hard L/R), sine wave, into the tone bus at `volume × 0.6`. Voices stay constant during programs.
- Changing a voice's frequency glides it; enabling or disabling fades over 0.3 s.
- Stack presets (`VOICE_STACKS`) set the main beat plus both voices in one tap:

| id | Name | Main | Voice 1 | Voice 2 | Intended |
|----|------|------|---------|---------|----------|
| `stack-focus` | Focus Stack | 14 Hz @ 220 | 40 Hz @ 400 | 10 Hz @ 150 | Alert focus with calm underneath |
| `stack-sleep` | Sleep Stack | 3 Hz @ 130 | 1.5 Hz @ 100 | 6 Hz @ 180 | Layered delta/theta for sleep |
| `stack-meditate` | Meditation Stack | 7.83 Hz @ 200 | 4.5 Hz @ 150 | 10 Hz @ 260 | Theta depth with alpha clarity |
| `stack-creative` | Creative Stack | 6 Hz @ 200 | 10 Hz @ 300 | 40 Hz @ 440 | Theta ideas, alpha ease, gamma spark |

## 5. Sleep fade-down [8]

- Setting `fadeDownMinutes ∈ {0, 5, 10, 15, 20, 30}` (default 0). It only applies to finite sessions and programs.
- The engine schedules `fadeDown.gain` to stay at 1 until `duration − N·60` and then ramp linearly to 0 at `duration`. The schedule is on the audio clock, so pausing keeps it aligned. Changing the setting or the session length mid-session reschedules it from the current `elapsed`.
- If N ≥ duration, the fade starts immediately.

## 6. Spatial "8D" sweep [1]

- Setting `spatialRate ∈ {0, 2, 4, 8, 16}` cycles per minute (0 = off).
- It applies to the **background layers only**. Moving the beat tones would break the one-tone-per-ear separation that binaural beats rely on. The UI says so.
- Implementation: `StereoPannerNode` on the layer bus. Its `pan` is driven by a sine LFO at `rate/60` Hz through a depth gain of 0.9. Rate 0 → depth 0.

## 7. Pulsed background [2]

- Setting `layerPulse ∈ {0, 0.3, 0.6, 1}` (Off / Subtle / Medium / Strong).
- The layer bus gets AM from the session LFO (the beat rate, the same pulse shape as isochronic): base `1 − d/2`, LFO amount `d/2`. It follows programs automatically because it shares the LFO.

## 8. Shepard–Risset illusion layer [4]

- A third background layer, **Illusion**, with its own knob: `off | shepard-up | shepard-down`.
- Pure renderer `renderShepard(direction, { seconds = 24, partials = 9, f0 = 30 })` at 22050 Hz. Partial `i` has frequency `f0·2^(i + s·t/P)` (s = ±1) and a raised-cosine gain over log-frequency (peak around 250 Hz).
- Each partial's starting phase is chosen so it continues smoothly into the next partial at the loop point: `φ_{i+1} = φ_i + 2π·f0·2^i·P/ln 2`. This makes the loop **sample-continuous** with no crossfade needed. Tests check the seam.
- Trim 0.5. Description: "An endlessly rising (focus, anticipation) or falling (sleep, letting go) tone illusion."

## 9. Breathing pacer [6]

- Pure module `js/engine/breath.js`:

| id | Name | Steps (seconds) | Use |
|----|------|-----------------|-----|
| `resonance` | Resonance 5.5/min | in 5.45 · out 5.45 | Heart-rate-variability "coherent" breathing |
| `calm` | Calm 4-6 | in 4 · out 6 | A longer exhale for relaxation |
| `box` | Box 4-4-4-4 | in 4 · hold 4 · out 4 · hold 4 | Focus and stress control (used by the military and athletes) |
| `478` | 4-7-8 | in 4 · hold 7 · out 8 | Falling asleep |

- `breathAt(pattern, t)` → `{ phase: 'in'|'hold-in'|'out'|'hold-out', label, progress, level, cycle }`. `level` is lung fullness from 0 to 1, eased with a raised cosine during in/out.
- **Visual:** while a pattern is selected, the visualizer orb follows `level` instead of the beat, and an overlay shows "Breathe in · 3". The pacer runs while idle too, on its own clock. While a session runs it uses the audio clock.
- **Audio cue (optional checkbox):** the engine schedules automation on `breathLayers` (0.55 → 1) and `breathTone` (0.85 → 1) that follows the pattern, so you can breathe with your eyes closed. It is scheduled on the audio clock (2 h ahead for unlimited sessions), so it is also included in exports.

## 10. More nature beds [9]

Added to the Nature layer (all procedural, seamless loops, bounded, tested):

| type | Length | Recipe |
|------|--------|--------|
| `wind` | 48 s | Brown + pink noise through a state-variable band-pass. The centre (250–1200 Hz) and amplitude follow periodic "gust" envelopes (sums of sines whose periods divide the loop length), plus a faint high-Q whistle. |
| `stream` | 30 s | A band-passed noise bed plus about 140 bubbles/s. Each bubble is a sine chirp rising 300→1500 Hz over 4–30 ms with exponential decay, randomly panned. |
| `fire` | 40 s | A low-passed brown-noise "roar" with slow flicker, about 12 crackles/s (0.3–2 ms clicks, Poisson with bursts), and occasional pops (low-passed decaying noise, 10–40 ms). |
| `forest` | 60 s | A soft leaf-rustle bed (filtered pink noise with slow swell) plus bird calls every 0.8–4 s. Each call is 2–7 notes of 40–220 ms: a sine with a frequency glide (2–6 kHz), vibrato and a decay envelope, at a random pan and distance. |
| `purr` | 16 s | Cat purr: pulses at ~25 Hz (inhale 22 Hz, exhale 26 Hz, a 4 s breath cycle). Each pulse is a short low-passed noise burst; the breath envelope is periodic across the loop. |

## 11. Program editor [10]

- A `<dialog id="editor">` contains a name, a description and a segment table (label, minutes, beat from→to, carrier from→to), with buttons to add, remove, move up and move down. There is a live total length and inline validation from `validateProgram`.
- Entry points: **"+ New program"**, **"Duplicate"** on a built-in card, **"Edit"** and **"Delete"** on a custom card.
- Custom programs are stored in the settings (`customPrograms`, max 50, each validated on load; invalid ones are dropped) with ids `custom-<timestamp>`. They appear in the Programs tab under "My programs".
- `findProgram(id, customPrograms)` resolves both built-in and custom programs.

## 12. Installable / offline (PWA) [11]

- `manifest.webmanifest` (name, short_name "We Beats", relative `start_url`/`scope` "./", theme colours, standalone display, 192/512 PNG icons plus a maskable icon).
- `sw.js`: **network-first** for everything, falling back to the cache when offline. The cache is updated on every successful fetch, and the full app shell is pre-cached on install. Because the network is tried first, an update is never hidden behind a stale cache. The cache name is versioned, and old caches are deleted on activate.
- It is registered from `main.js` with a relative URL, so it works under the `/binauralwebeats/` Pages sub-path.
- An **Install** button appears only when `beforeinstallprompt` fires.

## 13. Export to WAV [12]

- **Export** card options: length (1, 5, 10, 15, 20, 30 min, or "Program length" when a program is selected and ≤ 30 min) and quality (22.05 kHz "small" by default, or 44.1 kHz).
- It renders with an `OfflineAudioContext` through the **same `AudioEngine`** (`offline: true` skips `resume()`). It awaits the nature/illusion buffers, schedules a 3 s end fade, then `startRendering()`.
- Progress: `ctx.suspend(t)` at every 5 % updates a progress bar, then resumes.
- `encodeWav([left, right], sampleRate)` (pure, 16-bit PCM, with TPDF dither) → `Blob` → a download named `binauralwebeats-<name>-<min>min.wav`.
- Size estimate shown before export: `minutes × 60 × rate × 4` bytes (≈ 5.3 MB/min at 22.05 kHz).
- The breathing audio cue, voices, pad, spatial, pulse, fade-down and all layers are included (they are all scheduled on the audio clock).

## 14. Settings additions (persisted, validated)

`timbre`, `voices`, `fadeDownMinutes`, `spatialRate`, `layerPulse`, `illusionType`,
`illusionVolume`, `breathPattern` (`off|resonance|calm|box|478`), `breathCue`
(bool), `customPrograms`, `exportMinutes`, `exportRate`. `mode` adds
`bilateral`. `natureType` adds `wind|stream|fire|forest|purr`.

## 15. Tests

New and extended tests cover: bilateral routing; pad gains; voices; fade-down
schedule; spatial depth; layer pulse; the Shepard seam continuity and bounds;
new nature renderers; `breathAt` maths and the engine breath schedule; the WAV
header and samples; program registry and editor validation; persistence of the
new keys; and presets in range.
