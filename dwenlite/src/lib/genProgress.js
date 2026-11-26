import { useMemo, useRef, useState } from 'react';

// State for the generation progress card. Progress only ever moves forward.
export function useGenProgress() {
  const [progress, setProgress] = useState(null);
  const ref = useRef(null);

  const api = useMemo(() => ({
    start(title, steps = ['Reading your material', 'Writing', 'Saving'], weights = [20, 70, 10]) {
      ref.current = { title, steps, weights, step: 0, pct: 0, detail: 'Getting started...', indeterminate: false, startedAt: Date.now() };
      setProgress({ ...ref.current });
    },
    // step: which step is active, frac: 0..1 done inside that step
    set(step, frac = 0, detail, opts = {}) {
      const c = ref.current;
      if (!c) return;
      const base = c.weights.slice(0, step).reduce((a, b) => a + b, 0);
      const pct = Math.max(c.pct, Math.min(99, base + c.weights[step] * Math.min(1, Math.max(0, frac))));
      ref.current = { ...c, step, pct, detail: detail ?? c.detail, indeterminate: !!opts.indeterminate };
      setProgress({ ...ref.current });
    },
    finish() {
      const c = ref.current;
      if (!c) return;
      ref.current = { ...c, step: c.steps.length, pct: 100, detail: 'All done!', indeterminate: false };
      setProgress({ ...ref.current });
      setTimeout(() => { ref.current = null; setProgress(null); }, 1400);
    },
    fail() {
      ref.current = null;
      setProgress(null);
    },
  }), []);

  return [progress, api];
}
