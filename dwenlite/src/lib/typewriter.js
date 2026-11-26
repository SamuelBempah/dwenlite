// Types text out smoothly. Streamed text arrives in bursts; this reveals it at an even pace and
// speeds up when it falls far behind, so the answer starts at once and never lags.
export function createTypewriter(onUpdate) {
  let target = '';
  let shown = 0;
  let raf = null;
  let finished = false;
  let cancelled = false;
  let resolveDone = null;

  const tick = () => {
    raf = null;
    if (cancelled) return;
    if (shown < target.length) {
      const behind = target.length - shown;
      // a calm pace (up to 12 letters per frame), faster only when a huge answer arrives at once
      const step = Math.max(1, Math.min(Math.ceil(behind / 30), behind > 2500 ? 60 : 12));
      shown = Math.min(target.length, shown + step);
      onUpdate(target.slice(0, shown), true);
    }
    if (shown < target.length || !finished) {
      raf = requestAnimationFrame(tick);
    } else {
      onUpdate(target, false);
      if (resolveDone) resolveDone();
    }
  };
  const kick = () => { if (!raf && !cancelled) raf = requestAnimationFrame(tick); };

  return {
    set(text) { target = text; kick(); },
    // resolves once everything has been typed
    finish() {
      finished = true;
      kick();
      return new Promise((r) => { resolveDone = r; if (shown >= target.length && !raf) tick(); });
    },
    cancel() { cancelled = true; if (raf) cancelAnimationFrame(raf); },
  };
}

// While streaming, hide the trailing "FOLLOWUPS: ..." line (and a partly arrived one).
export function stripFollowups(text) {
  const full = text.search(/\n?\s*FOLLOWUPS:/i);
  if (full >= 0) return text.slice(0, full).trimEnd();
  const partial = text.match(/\n\s*F(?:O(?:L(?:L(?:O(?:W(?:U(?:P(?:S)?)?)?)?)?)?)?)?$/i);
  return partial ? text.slice(0, partial.index).trimEnd() : text;
}
