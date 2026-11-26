// Spaced repetition (a simplified SM-2). Runs entirely in the browser: no AI cost.
// grade: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy

export function isDue(card, now = Date.now()) {
  return !card?.srs?.due || new Date(card.srs.due).getTime() <= now;
}

export function nextSrs(srs = {}, grade, now = Date.now()) {
  let { ease = 2.5, interval = 0, reps = 0 } = srs;
  let dueMs;
  if (grade === 0) {
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    dueMs = now + 10 * 60 * 1000; // see it again in 10 minutes
  } else {
    reps += 1;
    const factor = grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1;
    interval = reps === 1 ? (grade === 3 ? 2 : 1)
      : reps === 2 ? (grade === 3 ? 5 : 3)
      : Math.max(1, Math.round(Math.max(1, interval) * ease * factor));
    ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
    dueMs = now + interval * 86400000;
  }
  return { ease, interval, reps, due: new Date(dueMs).toISOString() };
}

export function intervalLabel(srs, grade) {
  if (grade === 0) return '10m';
  const { interval } = nextSrs(srs, grade);
  return interval >= 30 ? `${Math.round(interval / 30)}mo` : `${interval}d`;
}
