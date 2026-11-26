// Types text out smoothly. Time-based (not "N letters per frame"), so it is just as smooth on a
// 60 Hz screen as on a 120 Hz one. It speeds up on its own when it falls behind the stream and
// slows to a calm pace when it has caught up.
export function createTypewriter(onUpdate) {
  let target = '';
  let shown = 0;          // fractional letters revealed so far
  let last = 0;
  let raf = null;
  let finished = false;
  let cancelled = false;
  let resolveDone = null;

  const tick = (now) => {
    raf = null;
    if (cancelled) return;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    if (shown < target.length) {
      const behind = target.length - shown;
      const cps = Math.min(4000, Math.max(70, behind * 5)); // letters per second, grows with the backlog
      shown = Math.min(target.length, shown + (cps * dt) / 1000);
      onUpdate(target.slice(0, Math.floor(shown)), true);
    }
    if (shown < target.length || !finished) {
      raf = requestAnimationFrame(tick);
    } else {
      onUpdate(target, false);
      if (resolveDone) resolveDone();
    }
  };
  const kick = () => { if (!raf && !cancelled) { last = 0; raf = requestAnimationFrame(tick); } };

  return {
    set(text) { target = text; kick(); },
    // resolves once everything has been typed
    finish() {
      finished = true;
      kick();
      return new Promise((r) => { resolveDone = r; });
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
