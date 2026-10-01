# 06 — Roadmap: other audio techniques

> **Status: all 12 items below are built (v2).** See `07-v2-features.md` for
> the spec they were built to. The one change from the sketches: export is WAV
> only (MP3 would need a third-party encoder, against the no-dependencies rule).

This is a list of other sound-based "brainwave" or relaxation techniques that
fit this app's engine. v1 already ships **binaural beats**, **monaural beats**,
**isochronic tones**, **noise colours** (white / pink / brown) and **nature
soundscapes** (waves / rain / thunder). Each idea below has a sketch of how it
would plug into the existing architecture.

| # | Technique | What it is | How it would fit | Effort |
|---|-----------|------------|------------------|--------|
| 1 | **Spatial "8D" sweep** | The tone (or noise) slowly orbits around the head. This is popular for relaxation and works best on headphones. | A `PannerNode` (HRTF) or a `StereoPannerNode` driven by a slow LFO on the noise/nature bus. A new mixer toggle and a "rotation speed" knob. | S |
| 2 | **Pulsed / amplitude-modulated noise** | Pink or brown noise pulsed at the beat rate, a gentler cousin of isochronic tones. | Reuse the isochronic LFO → a gain on `noiseBus`. A new mode option, "Pulse the noise too". | S |
| 3 | **Bilateral (EMDR-style) alternation** | A sound alternates left ↔ right at about 0.5–2 Hz. It is used in some relaxation and focus practices. | An `oscL`/`oscR` gain LFO with a 180° phase offset. This is effectively a fourth beat mode. | S |
| 4 | **Shepard / Risset rising tone** | An "endlessly" rising or falling pitch illusion. It is sometimes used for tension, focus or sleep (falling). | Ten octave-spaced oscillators with a bell-shaped gain envelope, swept slowly. A new optional layer. | M |
| 5 | **Solfeggio / drone pads** | Rich, chorused pads on a chosen carrier instead of a pure sine. They are more musical and less fatiguing. | Three detuned oscillators plus a low-pass filter per ear, keeping the L/R offset. A "Timbre: pure / pad" selector. | M |
| 6 | **Breathing pacer** | A visual (and optionally audio) guide for slow breathing, e.g. 6 breaths/min (resonance breathing) or box breathing. | The visualizer orb grows and shrinks on the breath cycle instead of the beat. A gentle swell on the noise bus. | S |
| 7 | **Hemispheric "Hemi-Sync"-style layering** | Several binaural pairs at once on different carriers (e.g. 4 Hz on 100 Hz + 10 Hz on 200 Hz). | Allow two or three tone "voices" per session, each with its own carrier/beat. The program format gains a `voices` array. | M |
| 8 | **Sleep fade-down** | The volume lowers gradually over the last N minutes so you don't notice it stopping. | Schedule a long linear ramp on `fade` before the end. A session option. | XS |
| 9 | **More nature beds** | Wind, forest/birds, fire crackle, stream, cat purr (~25 Hz). | More renderers in `ambience.js`, using the same pattern. | S each |
| 10 | **Program editor** | Build and save your own programs. | A UI for segments, stored in localStorage, validated with `validateProgram`. | M |
| 11 | **Offline / installable (PWA)** | Install to the home screen; works with no connection. | A manifest + a service worker that caches the static files. | S |
| 12 | **Export to audio file** | Render a session to WAV/MP3 to play anywhere. | `OfflineAudioContext` with the same graph, then WAV encoding. | M |


