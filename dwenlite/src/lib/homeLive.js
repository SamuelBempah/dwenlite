import { homeCall } from './homeClient';
import { sleep } from './homeTimer';

// A live picture of the computer's browser or screen. The computer sends pictures as fast as it can; this keeps asking for the newest one.
export function watchLive({ deviceId, kind, onFrame, onWaiting, onError }) {
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
  return { stop: () => { alive = false; }, input: (op) => homeCall('live_input', { deviceId, op }).catch(() => {}) };
}
