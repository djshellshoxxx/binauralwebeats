# 04 — Bands, Presets & Programs Spec

All data lives in `js/app/presets.js` as plain exported arrays and objects. The
UI is generated from this data, so adding a preset is a data-only change.

> **Wording rule (P-W1):** Descriptions say what each frequency is
> *traditionally associated with* or *intended* to do. They never promise
> medical outcomes. Research on binaural beats is mixed. The app shows this
> note next to the catalogue: *"Effects vary from person to person and the
> scientific evidence is mixed. Binaural beats are not a medical treatment."*

## 1. Brainwave bands

`BANDS` is ordered from low to high. `bandFor(beat)` returns the band whose
range contains `beat`. Ranges are half-open `[min, max)`, except the top band,
whose upper bound is inclusive.

| id | Name | Range (Hz) | Colour token | Intended / associated with |
|----|------|-----------|--------------|----------------------------|
| `epsilon` | Epsilon | 0.5 – 1 | `--band-epsilon` | The slowest rhythms. Associated with very deep meditative and "suspended" states reported by experienced meditators. |
| `delta` | Delta | 1 – 4 | `--band-delta` | Deep, dreamless sleep, physical rest and recovery. Used for falling asleep and for deep relaxation. |
| `theta` | Theta | 4 – 8 | `--band-theta` | Light sleep, dreaming, deep meditation, the drowsy "hypnagogic" state, creativity and intuition. |
| `alpha` | Alpha | 8 – 12 | `--band-alpha` | Relaxed wakefulness: calm, present, stress relief, light meditation, "eyes closed and at ease". |
| `smr` | SMR (low beta) | 12 – 15 | `--band-smr` | Sensorimotor rhythm: calm but alert focus with a still body. Often used for studying and reading. |
| `beta` | Beta | 15 – 30 | `--band-beta` | Active thinking, concentration, problem solving and alertness. High beta can feel tense or anxious. |
| `gamma` | Gamma | 30 – 45 | `--band-gamma` | High-level information processing, peak focus, memory and "binding" of perception. 40 Hz is widely researched. |

## 2. Beat-frequency catalogue (quick presets)

`BEAT_PRESETS` is a list of `{ id, name, beat, carrier, band, description, caution? }`.
Selecting one sets the beat **and** the suggested carrier in Manual mode.

| id | Name | Beat Hz | Carrier Hz | Band | Description (intended effect) |
|----|------|--------:|-----------:|------|-------------------------------|
| `epsilon-05` | Epsilon Stillness | 0.5 | 100 | epsilon | Extremely slow pulse for very deep meditation and stillness. Best for experienced meditators; not for daytime use. |
| `delta-1` | Deep Sleep | 1.0 | 100 | delta | The slowest delta. Intended to support deep, dreamless sleep. Use in bed, lights off. |
| `delta-2` | Restorative Rest | 2.0 | 120 | delta | Deep relaxation and physical recovery. Traditionally associated with healing rest and pain relief. |
| `delta-3` | Sleep Onset | 3.0 | 150 | delta | Helps the mind drift from drowsiness into sleep. Good for the first 20–30 minutes in bed. |
| `theta-4` | Twilight | 4.0 | 150 | theta | The border between waking and sleep. Associated with vivid imagery, lucid dreaming practice and the hypnagogic state. |
| `theta-5` | Deep Meditation | 5.0 | 180 | theta | Deep, inward meditation and reduced mental chatter. |
| `theta-6` | Creative Flow | 6.0 | 200 | theta | Associated with creativity, free association, intuition and memory recall. |
| `theta-783` | Schumann Resonance | 7.83 | 200 | theta | Matches the Earth's electromagnetic "heartbeat". Traditionally used for grounding, balance and a sense of calm. |
| `alpha-8` | Calm Body | 8.0 | 200 | alpha | Gentle relaxation, letting go of tension, light meditation. |
| `alpha-10` | Relaxed Focus | 10.0 | 200 | alpha | The classic alpha. Calm, present and stress-relieving while still awake and clear. A good default. |
| `alpha-12` | Bright Calm | 11.5 | 220 | alpha | Upper alpha: relaxed but alert. Useful for light study, reading or creative work without drowsiness. |
| `smr-14` | Calm Concentration | 14.0 | 220 | smr | Sensorimotor rhythm: quiet body with a focused mind. Associated with sustained attention and reduced fidgeting. |
| `beta-16` | Study Mode | 16.0 | 240 | beta | Low-to-mid beta for focused reading, writing and learning. |
| `beta-20` | Active Thinking | 20.0 | 250 | beta | Alertness, analytical thinking and problem solving. |
| `beta-25` | High Alert | 25.0 | 250 | beta | Energising and stimulating; may help against drowsiness. **Caution:** can feel tense or anxious. Use in short sessions. |
| `gamma-35` | Peak Performance | 35.0 | 300 | gamma | High-level cognition, information processing and quick thinking. |
| `gamma-40` | 40 Hz Gamma | 40.0 | 300 | gamma | The most-studied gamma frequency. Associated with memory, attention and perceptual "binding". |
| `gamma-45` | Insight | 45.0 | 300 | gamma | The top of the range. Associated with heightened awareness and moments of insight. Short sessions recommended. |

## 3. Carrier-tone presets

`CARRIER_PRESETS` is a list of `{ id, name, hz, description }`. Selecting one
changes only the carrier. The UI labels this section *"Traditional / esoteric
associations — no established scientific basis"*.

| id | Name | Hz | Description |
|----|------|---:|-------------|
| `c-100` | Deep Low | 100 | Low, soft and warm. The least fatiguing for long sleep sessions. |
| `c-136` | OM / Earth Year | 136.1 | Called the "OM" frequency (the Earth's year as a tone). Used in meditation for grounding. |
| `c-200` | Neutral | 200 | A clear, neutral default where binaural beats are perceived well. |
| `c-256` | Scientific C | 256 | Middle C at "scientific pitch". Bright and clear. |
| `c-396` | Solfeggio 396 | 396 | Solfeggio tone traditionally linked with releasing fear and guilt. |
| `c-417` | Solfeggio 417 | 417 | Solfeggio tone traditionally linked with facilitating change. |
| `c-432` | Verdi A (432) | 432 | A tuned to 432 Hz; described by enthusiasts as warmer and more "natural". |
| `c-528` | Solfeggio 528 | 528 | The "love" or "miracle" tone, traditionally linked with transformation and repair. |
| `c-639` | Solfeggio 639 | 639 | Traditionally linked with relationships and connection. |
| `c-741` | Solfeggio 741 | 741 | Traditionally linked with expression and clarity. |
| `c-852` | Solfeggio 852 | 852 | Traditionally linked with intuition and spiritual awareness. |
| `c-963` | Solfeggio 963 | 963 | The "crown" tone, traditionally linked with higher consciousness. |

Note: binaural beats are perceived best with carriers below about 1000 Hz.
The carrier limit (1000 Hz) enforces this.

## 4. Programs

`PROGRAMS` is a list of `{ id, name, description, segments }` (format in
`01-engine.md §5`). Every program must pass `validateProgram`, and a unit test
checks this.

| id | Name | Length | Shape |
|----|------|--------|-------|
| `sleep` | Deep Sleep Descent | 45 min | Alpha 10 → Theta 6 → Delta 3 → Delta 1.5, carrier gliding 200 → 120 Hz. |
| `power-nap` | Power Nap | 20 min | Alpha 10 → Theta 5 (12 min) → back up to Alpha 12 to wake gently. |
| `meditation` | Meditation Journey | 30 min | Alpha 10 → Theta 7.83 → Theta 5 hold → Alpha 8 return. |
| `focus` | Deep Focus | 50 min | Alpha 10 settle → SMR 14 → Beta 16 hold → Alpha 10 cool-down. |
| `study` | Study Session (Pomodoro) | 25 min | Alpha 11 → Beta 16 → hold → Alpha 10 last minute. |
| `energize` | Morning Energize | 15 min | Alpha 10 → Beta 18 → Gamma 40 short peak → Beta 16. |
| `anxiety-relief` | Calm Down | 20 min | Beta 14 → Alpha 10 → Alpha 8 → Theta 6. Starts close to an alert mind and walks it down. |
| `creativity` | Creative Flow | 30 min | Alpha 10 → Theta 6 hold, alternating 6 ↔ 7.5. |
| `lucid` | Lucid Dream Prep | 30 min | Alpha 9 → Theta 4.5 hold, carrier 150 Hz. |
| `gamma-40` | 40 Hz Gamma Session | 20 min | 1 min ramp from Alpha 10, then hold 40 Hz. |

## 5. Headphone requirement (P-H1)

Binaural beats **only work with headphones** (or earbuds). Each ear must hear
only its own tone, and speakers mix the two in the air. This is surfaced:

1. In the **first-run modal** (see `02-gui.md §6`). It must be acknowledged before anything can play.
2. In a **permanent banner** near the play button: "🎧 Headphones required. Binaural beats do not work through speakers."
3. In every preset tooltip footer, and in the README.
4. A **"Test L/R"** button plays a short tone in the left ear, then the right ear, so the user can check that their headphones are on the correct way round.
