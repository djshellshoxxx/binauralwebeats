// Preset catalogue, carrier tones and programs (spec 04). Data only.

export { BANDS } from '../engine/frequency.js';

export const DISCLAIMER =
  'Effects vary from person to person and the scientific evidence is mixed. Binaural beats are not a medical treatment.';

export const HEADPHONE_NOTE =
  'Headphones required. Binaural beats only work when each ear hears its own tone. Speakers blend the two tones and the effect disappears.';

export const MODE_INFO = Object.freeze({
  binaural: {
    name: 'Binaural',
    blurb: 'A different tone in each ear; your brain creates the beat. Headphones required.',
    headphones: 'required',
  },
  monaural: {
    name: 'Monaural',
    blurb: 'Both tones mixed in both ears, so the beat is a real loudness wobble. Works on speakers.',
    headphones: 'recommended',
  },
  isochronic: {
    name: 'Isochronic',
    blurb: 'One tone pulsed on and off at the beat rate. The strongest, most obvious pulse. Works on speakers.',
    headphones: 'recommended',
  },
});

export const BEAT_PRESETS = Object.freeze([
  { id: 'epsilon-05', name: 'Epsilon Stillness', beat: 0.5, carrier: 100, band: 'epsilon',
    description: 'Extremely slow pulse for very deep meditation and stillness. Best for experienced meditators; not for daytime use.' },
  { id: 'delta-1', name: 'Deep Sleep', beat: 1, carrier: 100, band: 'delta',
    description: 'The slowest delta. Intended to support deep, dreamless sleep. Use in bed with the lights off.' },
  { id: 'delta-2', name: 'Restorative Rest', beat: 2, carrier: 120, band: 'delta',
    description: 'Deep relaxation and physical recovery. Traditionally associated with healing rest and pain relief.' },
  { id: 'delta-3', name: 'Sleep Onset', beat: 3, carrier: 150, band: 'delta',
    description: 'Helps the mind drift from drowsiness into sleep. Good for the first 20–30 minutes in bed.' },
  { id: 'theta-4', name: 'Twilight', beat: 4, carrier: 150, band: 'theta',
    description: 'The border between waking and sleep. Associated with vivid imagery, lucid-dream practice and the hypnagogic state.' },
  { id: 'theta-5', name: 'Deep Meditation', beat: 5, carrier: 180, band: 'theta',
    description: 'Deep, inward meditation and reduced mental chatter.' },
  { id: 'theta-6', name: 'Creative Flow', beat: 6, carrier: 200, band: 'theta',
    description: 'Associated with creativity, free association, intuition and memory recall.' },
  { id: 'theta-783', name: 'Schumann Resonance', beat: 7.83, carrier: 200, band: 'theta',
    description: 'Matches the Earth’s electromagnetic "heartbeat". Traditionally used for grounding, balance and calm.' },
  { id: 'alpha-8', name: 'Calm Body', beat: 8, carrier: 200, band: 'alpha',
    description: 'Gentle relaxation, letting go of tension, light meditation.' },
  { id: 'alpha-10', name: 'Relaxed Focus', beat: 10, carrier: 200, band: 'alpha',
    description: 'The classic alpha: calm, present and stress-relieving while still awake and clear. A good default.' },
  { id: 'alpha-12', name: 'Bright Calm', beat: 11.5, carrier: 220, band: 'alpha',
    description: 'Upper alpha: relaxed but alert. Useful for light study, reading or creative work without drowsiness.' },
  { id: 'smr-14', name: 'Calm Concentration', beat: 14, carrier: 220, band: 'smr',
    description: 'Sensorimotor rhythm: quiet body, focused mind. Associated with sustained attention and less fidgeting.' },
  { id: 'beta-16', name: 'Study Mode', beat: 16, carrier: 240, band: 'beta',
    description: 'Low-to-mid beta for focused reading, writing and learning.' },
  { id: 'beta-20', name: 'Active Thinking', beat: 20, carrier: 250, band: 'beta',
    description: 'Alertness, analytical thinking and problem solving.' },
  { id: 'beta-25', name: 'High Alert', beat: 25, carrier: 250, band: 'beta',
    description: 'Energising and stimulating; may help against drowsiness.',
    caution: 'Can feel tense or anxious. Use in short sessions.' },
  { id: 'gamma-35', name: 'Peak Performance', beat: 35, carrier: 300, band: 'gamma',
    description: 'High-level cognition, information processing and quick thinking.' },
  { id: 'gamma-40', name: '40 Hz Gamma', beat: 40, carrier: 300, band: 'gamma',
    description: 'The most-studied gamma frequency. Associated with memory, attention and perceptual "binding".' },
  { id: 'gamma-45', name: 'Insight', beat: 45, carrier: 300, band: 'gamma',
    description: 'The top of the range. Associated with heightened awareness and moments of insight.',
    caution: 'Short sessions recommended.' },
].map(Object.freeze));

export const CARRIER_PRESETS = Object.freeze([
  { id: 'c-100', name: 'Deep Low', hz: 100, description: 'Low, soft and warm. The least fatiguing for long sleep sessions.' },
  { id: 'c-136', name: 'OM / Earth Year', hz: 136.1, description: 'Called the "OM" frequency. Used in meditation for grounding.' },
  { id: 'c-200', name: 'Neutral', hz: 200, description: 'A clear, neutral default where binaural beats are perceived well.' },
  { id: 'c-256', name: 'Scientific C', hz: 256, description: 'Middle C at "scientific pitch". Bright and clear.' },
  { id: 'c-396', name: 'Solfeggio 396', hz: 396, description: 'Traditionally linked with releasing fear and guilt.' },
  { id: 'c-417', name: 'Solfeggio 417', hz: 417, description: 'Traditionally linked with facilitating change.' },
  { id: 'c-432', name: 'Verdi A (432)', hz: 432, description: 'A tuned to 432 Hz; described by enthusiasts as warmer and more "natural".' },
  { id: 'c-528', name: 'Solfeggio 528', hz: 528, description: 'The "love" or "miracle" tone, traditionally linked with transformation and repair.' },
  { id: 'c-639', name: 'Solfeggio 639', hz: 639, description: 'Traditionally linked with relationships and connection.' },
  { id: 'c-741', name: 'Solfeggio 741', hz: 741, description: 'Traditionally linked with expression and clarity.' },
  { id: 'c-852', name: 'Solfeggio 852', hz: 852, description: 'Traditionally linked with intuition and spiritual awareness.' },
  { id: 'c-963', name: 'Solfeggio 963', hz: 963, description: 'The "crown" tone, traditionally linked with higher consciousness.' },
].map(Object.freeze));

const seg = (label, minutes, beat, carrier) => ({ label, duration: minutes * 60, beat, carrier });

export const PROGRAMS = Object.freeze([
  { id: 'sleep', name: 'Deep Sleep Descent',
    description: 'Walks you from relaxed alpha through theta into deep delta for falling, and staying, asleep.',
    segments: [
      seg('Unwind · Alpha 10 Hz', 5, [10, 10], [200, 190]),
      seg('Drift · Alpha → Theta', 10, [10, 6], [190, 160]),
      seg('Theta 6 Hz', 5, [6, 6], [160, 150]),
      seg('Descend · Theta → Delta', 10, [6, 3], [150, 130]),
      seg('Deep Delta', 15, [3, 1.5], [130, 120]),
    ] },
  { id: 'power-nap', name: 'Power Nap',
    description: 'A short dip into theta, then a gentle climb back to bright alpha so you wake refreshed, not groggy.',
    segments: [
      seg('Settle · Alpha 10 Hz', 3, [10, 10], [200, 200]),
      seg('Drop · Alpha → Theta', 4, [10, 5], [200, 180]),
      seg('Nap · Theta 5 Hz', 9, [5, 5], [180, 180]),
      seg('Wake · Theta → Alpha 12 Hz', 4, [5, 12], [180, 220]),
    ] },
  { id: 'meditation', name: 'Meditation Journey',
    description: 'Alpha into the Schumann resonance, down to deep theta stillness, and back to calm alpha.',
    segments: [
      seg('Settle · Alpha 10 Hz', 4, [10, 10], [200, 200]),
      seg('Descend · → 7.83 Hz', 6, [10, 7.83], [200, 200]),
      seg('Schumann 7.83 Hz', 6, [7.83, 7.83], [200, 200]),
      seg('Deepen · → Theta 5 Hz', 5, [7.83, 5], [200, 180]),
      seg('Stillness · Theta 5 Hz', 5, [5, 5], [180, 180]),
      seg('Return · → Alpha 8 Hz', 4, [5, 8], [180, 200]),
    ] },
  { id: 'focus', name: 'Deep Focus',
    description: 'Settles you in alpha, climbs through SMR into steady low beta for a long block of concentrated work.',
    segments: [
      seg('Settle · Alpha 10 Hz', 3, [10, 10], [220, 220]),
      seg('Rise · → SMR 14 Hz', 5, [10, 14], [220, 230]),
      seg('SMR 14 Hz', 10, [14, 14], [230, 230]),
      seg('Rise · → Beta 16 Hz', 2, [14, 16], [230, 240]),
      seg('Focus · Beta 16 Hz', 25, [16, 16], [240, 240]),
      seg('Cool-down · → Alpha 10 Hz', 5, [16, 10], [240, 220]),
    ] },
  { id: 'study', name: 'Study Session (Pomodoro)',
    description: 'One 25-minute pomodoro: quick settle, steady study beta, and a gentle last-minute wind-down.',
    segments: [
      seg('Settle · Alpha 11 Hz', 2, [11, 11], [220, 220]),
      seg('Rise · → Beta 16 Hz', 3, [11, 16], [220, 240]),
      seg('Study · Beta 16 Hz', 19, [16, 16], [240, 240]),
      seg('Wind down · → Alpha 10 Hz', 1, [16, 10], [240, 220]),
    ] },
  { id: 'energize', name: 'Morning Energize',
    description: 'From waking alpha up through beta to a short 40 Hz gamma peak, landing in alert focus.',
    segments: [
      seg('Wake · Alpha 10 Hz', 2, [10, 10], [220, 220]),
      seg('Rise · → Beta 18 Hz', 4, [10, 18], [220, 250]),
      seg('Beta 18 Hz', 3, [18, 18], [250, 250]),
      seg('Climb · → Gamma 40 Hz', 1, [18, 40], [250, 300]),
      seg('Gamma peak 40 Hz', 2, [40, 40], [300, 300]),
      seg('Land · → Beta 16 Hz', 3, [40, 16], [300, 240]),
    ] },
  { id: 'anxiety-relief', name: 'Calm Down',
    description: 'Meets a busy mind at SMR and walks it gently down through alpha into soft theta.',
    segments: [
      seg('Meet · SMR 14 Hz', 2, [14, 14], [220, 220]),
      seg('Calm · → Alpha 10 Hz', 5, [14, 10], [220, 200]),
      seg('Alpha · → 8 Hz', 5, [10, 8], [200, 190]),
      seg('Soften · → Theta 6 Hz', 4, [8, 6], [190, 180]),
      seg('Rest · Theta 6 Hz', 4, [6, 6], [180, 180]),
    ] },
  { id: 'creativity', name: 'Creative Flow',
    description: 'Drops into theta and gently oscillates between 6 and 7.5 Hz to keep ideas flowing without sleep.',
    segments: [
      seg('Settle · Alpha 10 Hz', 4, [10, 10], [200, 200]),
      seg('Descend · → Theta 6 Hz', 4, [10, 6], [200, 200]),
      seg('Flow · 6 → 7.5 Hz', 5, [6, 7.5], [200, 200]),
      seg('Flow · 7.5 → 6 Hz', 5, [7.5, 6], [200, 200]),
      seg('Flow · 6 → 7.5 Hz', 5, [6, 7.5], [200, 200]),
      seg('Flow · 7.5 → 6 Hz', 5, [7.5, 6], [200, 200]),
      seg('Return · → Alpha 10 Hz', 2, [6, 10], [200, 200]),
    ] },
  { id: 'lucid', name: 'Lucid Dream Prep',
    description: 'Holds you at the theta "twilight" edge between waking and sleep, used in lucid-dreaming practice.',
    segments: [
      seg('Settle · Alpha 9 Hz', 5, [9, 9], [150, 150]),
      seg('Descend · → Theta 4.5 Hz', 7, [9, 4.5], [150, 150]),
      seg('Twilight · Theta 4.5 Hz', 18, [4.5, 4.5], [150, 150]),
    ] },
  { id: 'gamma-40', name: '40 Hz Gamma Session',
    description: 'A one-minute ramp from alpha, then a steady 40 Hz gamma hold.',
    segments: [
      seg('Ramp · → Gamma 40 Hz', 1, [10, 40], [300, 300]),
      seg('Gamma 40 Hz', 19, [40, 40], [300, 300]),
    ] },
].map(Object.freeze));

export const findPreset = (id) => BEAT_PRESETS.find((p) => p.id === id) || null;
export const findCarrier = (id) => CARRIER_PRESETS.find((p) => p.id === id) || null;
export const findProgram = (id) => PROGRAMS.find((p) => p.id === id) || null;
