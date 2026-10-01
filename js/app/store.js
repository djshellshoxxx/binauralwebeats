// Tiny pub/sub store (spec 03 §1).

export function createStore(initial) {
  let state = Object.freeze({ ...initial });
  const subs = new Set();

  return {
    get: () => state,
    set(patch) {
      let changed = false;
      for (const k of Object.keys(patch)) {
        if (!Object.is(state[k], patch[k])) { changed = true; break; }
      }
      if (!changed) return false;
      const prev = state;
      state = Object.freeze({ ...state, ...patch });
      for (const fn of [...subs]) {
        try { fn(state, prev); } catch (err) { console.error('store subscriber failed', err); }
      }
      return true;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
