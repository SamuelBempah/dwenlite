// Timers that keep ticking when another program is full-screen or this tab is hidden.
// Browsers slow normal timers in hidden/covered tabs to once a second or even once a minute; a worker's timer is not slowed.
let worker = null; let seq = 0; const waiting = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    const src = 'self.onmessage=function(e){var d=e.data;setTimeout(function(){self.postMessage(d.id)},d.ms)}';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e) => { const r = waiting.get(e.data); if (r) { waiting.delete(e.data); r(); } };
    worker.onerror = () => { worker = false; waiting.forEach((r) => r()); waiting.clear(); };
  } catch { worker = false; }
  return worker;
}
export function sleep(ms) {
  const w = getWorker();
  if (!w) return new Promise((r) => setTimeout(r, ms));
  return new Promise((resolve) => { const id = ++seq; waiting.set(id, resolve); w.postMessage({ id, ms }); });
}

// While a task runs: tell the browser this page is doing real work (so it is not frozen) and keep the screen from sleeping.
export function keepWorking() {
  let release = null; let wake = null; let stopped = false;
  try { if (navigator.locks) navigator.locks.request('dwenlite-working', () => new Promise((r) => { release = r; if (stopped) r(); })).catch(() => {}); } catch { /* optional */ }
  const getWake = async () => { try { if (navigator.wakeLock && !stopped && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch { /* optional */ } };
  getWake();
  const onVis = () => { if (document.visibilityState === 'visible') getWake(); };
  document.addEventListener('visibilitychange', onVis);
  return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); try { release && release(); } catch { /* ignore */ } try { wake && wake.release(); } catch { /* ignore */ } };
}
