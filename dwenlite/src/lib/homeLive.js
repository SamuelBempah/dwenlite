import { homeCall } from './homeClient';
import { sleep } from './homeTimer';

const PORTS = [47821, 47822, 47823, 47824, 47825];

// A live picture of the computer's browser or screen.
// On the same computer (or the same home network) the page connects straight to the helper: smooth and instant.
// Anywhere else it is relayed through the cloud, which works from anywhere but is slower.
function direct({ deviceId, kind, onFrame, onError, key }) {
  let alive = true; let base = ''; const ac = new AbortController();
  const handle = {
    mode: 'direct',
    stop: () => { alive = false; ac.abort(); },
    input: (op) => (base ? fetch(`${base}/input?key=${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify(op), headers: { 'Content-Type': 'text/plain' } }).catch(() => {}) : Promise.resolve()),
  };
  const ready = new Promise((resolve) => {
    (async () => {
      const t0 = Date.now(); let got = false;
      // find the helper's port, then keep asking until it accepts the key (it learns the key within a second or two)
      while (alive && !got && Date.now() - t0 < 12000) {
        if (!base) for (const p of PORTS) { try { const r = await fetch(`http://127.0.0.1:${p}/hello`, { signal: AbortSignal.timeout(900) }); const j = await r.json(); if (j && j.app === 'dwenlite' && j.device === deviceId) { base = `http://127.0.0.1:${p}`; break; } } catch { /* not this one */ } }
        if (!base) { await sleep(500); continue; }
        try {
          const r = await fetch(`${base}/live?kind=${kind}&key=${encodeURIComponent(key)}`, { signal: ac.signal });
          if (r.status === 401) { await sleep(400); continue; }
          if (!r.ok) throw new Error(`status ${r.status}`);
          got = true; resolve(true);
          const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
          while (alive) {
            const { value, done } = await rd.read(); if (done) break;
            buf += dec.decode(value, { stream: true }); let i; let last = null;
            while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); if (ev.startsWith('data:')) { try { last = JSON.parse(ev.slice(5)); } catch { /* skip */ } } }
            if (last) onFrame(last); // if several arrived together, only the newest is drawn
          }
          if (alive) onError && onError('The connection to the computer ended.');
          return;
        } catch { if (!alive) return; if (got) { onError && onError('The connection to the computer ended.'); return; } await sleep(500); }
      }
      if (!got) resolve(false);
    })();
  });
  handle.ready = ready;
  return handle;
}

function relay({ deviceId, kind, onFrame, onWaiting, onError }) {
  let alive = true; let after = 0; let empty = 0; const started = Date.now();
  (async () => {
    try { await homeCall('live_start', { deviceId, kind }); } catch (e) { onError && onError(e.message); return; }
    let fails = 0;
    while (alive) {
      try {
        const r = await homeCall('live_frame', { deviceId, kind, after });
        if (!alive) return; fails = 0;
        if (r.none) { empty++; onWaiting && onWaiting(Date.now() - started, empty); } else { after = r.seq; empty = 0; onFrame(r); }
      } catch (e) {
        if (e.status === 404) { onError && onError('That computer is not available.'); return; }
        if (++fails > 5) { onError && onError('Lost the connection to the computer.'); return; }
        await sleep(800);
      }
    }
  })();
  return { mode: 'relay', stop: () => { alive = false; }, input: (op) => homeCall('live_input', { deviceId, op }).catch(() => {}) };
}

export function watchLive(opts) {
  let stopped = false; let inner = null; let size = null; const pending = [];
  const apply = (h) => { inner = h; if (size) h.input({ op: 'resize', ...size }); while (pending.length) h.input(pending.shift()); };
  (async () => {
    let key = '';
    try { const r = await homeCall('live_start', { deviceId: opts.deviceId, kind: opts.kind, local: true }); key = r.key || ''; } catch (e) { if (!stopped) opts.onError && opts.onError(e.message); return; }
    if (stopped) return;
    if (key && typeof fetch === 'function') {
      const d = direct({ ...opts, key });
      inner = d; // so input is not lost while connecting
      if (await d.ready) { if (stopped) { d.stop(); return; } apply(d); return; }
      d.stop();
    }
    if (stopped) return;
    apply(relay(opts));
  })();
  return {
    get mode() { return inner ? inner.mode : 'connecting'; },
    stop: () => { stopped = true; inner && inner.stop(); },
    input: (op) => { if (op && op.op === 'resize') size = { w: op.w, h: op.h }; if (inner && (inner.mode === 'relay' || inner.mode === 'direct')) return inner.input(op); pending.push(op); return Promise.resolve(); },
  };
}
