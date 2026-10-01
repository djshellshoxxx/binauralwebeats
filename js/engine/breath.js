// Breathing pacer patterns and maths (spec 07 §9). Pure.

export const BREATH_PATTERNS = Object.freeze({
  resonance: {
    id: 'resonance', name: 'Resonance 5.5/min',
    description: 'Even 5.5-second in and out breaths. "Coherent" breathing used to raise heart-rate variability and calm the nervous system.',
    steps: [{ phase: 'in', seconds: 5.45 }, { phase: 'out', seconds: 5.45 }],
  },
  calm: {
    id: 'calm', name: 'Calm 4-6',
    description: 'In for 4, out for 6. A longer exhale gently slows you down; good for winding down.',
    steps: [{ phase: 'in', seconds: 4 }, { phase: 'out', seconds: 6 }],
  },
  box: {
    id: 'box', name: 'Box 4-4-4-4',
    description: 'In, hold, out, hold for 4 each. Used by athletes and the military for focus and stress control.',
    steps: [{ phase: 'in', seconds: 4 }, { phase: 'hold-in', seconds: 4 }, { phase: 'out', seconds: 4 }, { phase: 'hold-out', seconds: 4 }],
  },
  478: {
    id: '478', name: '4-7-8',
    description: 'In for 4, hold for 7, out for 8. A popular technique for falling asleep.',
    steps: [{ phase: 'in', seconds: 4 }, { phase: 'hold-in', seconds: 7 }, { phase: 'out', seconds: 8 }],
  },
});

export const BREATH_IDS = Object.freeze(['off', ...Object.keys(BREATH_PATTERNS)]);

export const PHASE_LABELS = Object.freeze({
  in: 'Breathe in', 'hold-in': 'Hold', out: 'Breathe out', 'hold-out': 'Hold',
});

export function cycleLength(pattern) {
  return pattern.steps.reduce((sum, s) => sum + s.seconds, 0);
}

const ease = (p) => 0.5 - 0.5 * Math.cos(Math.PI * p);

// Lung fullness at the start of a step (before it runs).
function levelBefore(steps, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (steps[i].phase === 'in') return 1;
    if (steps[i].phase === 'out') return 0;
  }
  return 0; // cycle starts empty
}

export function breathAt(pattern, t) {
  const total = cycleLength(pattern);
  const time = Math.max(0, t);
  const cycle = Math.floor(time / total);
  let local = time - cycle * total;
  for (let i = 0; i < pattern.steps.length; i++) {
    const step = pattern.steps[i];
    if (local < step.seconds || i === pattern.steps.length - 1) {
      const progress = Math.min(1, local / step.seconds);
      let level;
      if (step.phase === 'in') level = ease(progress);
      else if (step.phase === 'out') level = 1 - ease(progress);
      else level = levelBefore(pattern.steps, i);
      const remaining = Math.max(0, step.seconds - local);
      return { phase: step.phase, label: PHASE_LABELS[step.phase], progress, level, cycle, remaining, stepIndex: i };
    }
    local -= step.seconds;
  }
  throw new Error('empty pattern');
}

// Automation events [{ time, level }] from `t0` covering `horizon` seconds; the
// level is linearly ramped between events (raised-cosine approximated by 4 sub-steps).
export function breathEvents(pattern, t0, horizon) {
  const events = [];
  const total = cycleLength(pattern);
  const cycles = Math.ceil(horizon / total) + 1;
  let t = t0;
  let level = 0;
  events.push({ time: t, level });
  for (let c = 0; c < cycles; c++) {
    for (const step of pattern.steps) {
      if (step.phase === 'in' || step.phase === 'out') {
        const from = level;
        const to = step.phase === 'in' ? 1 : 0;
        for (let k = 1; k <= 4; k++) {
          const p = k / 4;
          events.push({ time: t + step.seconds * p, level: from + (to - from) * ease(p) });
        }
        level = to;
      } else {
        events.push({ time: t + step.seconds, level });
      }
      t += step.seconds;
      if (t - t0 > horizon) return events;
    }
  }
  return events;
}
