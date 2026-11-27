import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe, Monitor, Eye, Square, Send, OctagonX, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeCall } from '../../lib/homeClient';
import { sleep } from '../../lib/homeTimer';
import { plainText } from '../../lib/homePlain';
import DwenLogo from './DwenLogo';
import PhoneLink from './PhoneLink';
import BrowserView from './BrowserView';
import { Sheet, Spinner, Tap, motion, spring } from './motion';

const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// The phone as a remote control: what is running right now, a way to stop it or steer it, and a look at the computer's screen.
export default function RemotePanel({ devices, onClose, onStopAll }) {
  const [runs, setRuns] = useState(null);
  const [say, setSay] = useState({});
  const [browse, setBrowse] = useState(null);
  const [peek, setPeek] = useState(null); // { name, image } | { name, loading }
  const [, tick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const load = () => homeCall('run_active').then((r) => { if (alive.current) setRuns(r.runs); }).catch(() => {});
    load(); const t = setInterval(() => { load(); tick((x) => x + 1); }, 2500);
    return () => { alive.current = false; clearInterval(t); };
  }, []);

  const stop = async (r) => { try { await homeCall('run_stop', { id: r.id }); toast('Stopping...'); } catch (e) { toast.error(e.message); } };
  const send = async (r) => { const text = (say[r.id] || '').trim(); if (!text) return; try { await homeCall('run_say', { id: r.id, text }); setSay((p) => ({ ...p, [r.id]: '' })); toast.success('Sent. It will see this at its next step.'); } catch (e) { toast.error(e.message); } };
  const stopAll = async () => { if (!window.confirm('Stop everything that is running on all your computers?')) return; try { const r = await homeCall('run_stop_all'); toast.success(r.stopped ? 'Stopped.' : 'Nothing was running.'); onStopAll && onStopAll(); } catch (e) { toast.error(e.message); } };
  const liveRef = useRef(null);
  useEffect(() => () => { liveRef.current = null; }, []);
  const closePeek = () => { liveRef.current = null; setPeek(null); };
  // A live view: a fresh picture of the screen every couple of seconds until closed (or five minutes).
  const look = async (d) => {
    const me = {}; liveRef.current = me; const until = Date.now() + 5 * 60000;
    setPeek({ name: d.name, loading: true });
    while (liveRef.current === me && Date.now() < until) {
      try {
        const { id } = await homeCall('job_create', { deviceId: d.id, type: 'screenshot', args: { look: 'Peek', novision: true }, summary: 'Looking at the screen' });
        let got = null;
        for (let i = 0; i < 25 && liveRef.current === me; i++) {
          await sleep(900);
          const j = await homeCall('job_get', { id });
          if (j.status === 'done') { got = j; break; }
          if (j.status === 'error' || j.status === 'cancelled') { if (liveRef.current === me) setPeek({ name: d.name, error: 'Could not take a picture of the screen.' }); liveRef.current = null; return; }
        }
        if (liveRef.current !== me) return;
        if (!got) { setPeek({ name: d.name, error: 'The computer did not answer. Is it on and connected?' }); liveRef.current = null; return; }
        setPeek({ name: d.name, image: got.image, live: true });
      } catch (e) { if (liveRef.current === me) setPeek({ name: d.name, error: e.message }); liveRef.current = null; return; }
      await sleep(1200);
    }
    if (liveRef.current === me) { liveRef.current = null; setPeek((p) => (p && p.image ? { ...p, live: false } : p)); }
  };

  return (
    <Sheet onClose={onClose} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 text-white shadow-2xl sm:rounded-3xl">
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-bold"><DwenLogo size={26} /> Remote</h2><button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-400" /></button></div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Working now</p>
        {!runs && <p className="animate-pulse text-sm text-slate-400">Checking...</p>}
        {runs && runs.length === 0 && <p className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-4 text-center text-sm text-slate-400">Nothing is running. Ask for something in the chat and you can follow it from here.</p>}
        <div className="space-y-2">
          {(runs || []).map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="rounded-2xl border border-violet-500/30 bg-slate-900/70 p-3 text-sm">
              <div className="flex items-center gap-2.5">
                <DwenLogo size={30} working />
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{plainText(r.name)}</p><p className="truncate text-xs text-slate-400">{plainText(r.note) || (r.status === 'queued' ? 'Waiting to start...' : 'Working on it...')} · {clock(Date.now() - r.startedAt)}</p></div>
                <Tap onClick={() => stop(r)} aria-label="Stop this task" className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold hover:bg-red-500"><Square size={12} fill="currentColor" /> Stop</Tap>
              </div>
              <form className="mt-2.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(r); }}>
                <input value={say[r.id] || ''} onChange={(e) => setSay((p) => ({ ...p, [r.id]: e.target.value }))} placeholder="Tell it something new..." className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500" />
                <Tap type="submit" disabled={!(say[r.id] || '').trim()} aria-label="Send to the task" className="rounded-xl bg-violet-600 px-3 hover:bg-violet-500 disabled:opacity-40"><Send size={15} /></Tap>
              </form>
            </motion.div>
          ))}
        </div>

        <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Your computers</p>
        <div className="space-y-2">
          {devices.length === 0 && <p className="text-sm text-slate-400">No computer connected yet.</p>}
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm">
              <Monitor size={20} className="shrink-0 text-violet-300" />
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{d.name}</p><p className="flex items-center gap-1 text-xs">{d.online ? <><Wifi size={11} className="text-emerald-400" /><span className="text-emerald-400">connected{d.locked ? ' · screen locked' : ''}</span></> : <><WifiOff size={11} className="text-slate-500" /><span className="text-slate-500">not connected</span></>}</p></div>
              <Tap onClick={() => setBrowse({ id: d.id, name: d.name })} disabled={!d.online} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40"><Globe size={14} /> Browser</Tap>
              <Tap onClick={() => look(d)} disabled={!d.online} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40"><Eye size={14} /> See screen</Tap>
            </div>
          ))}
        </div>

        <PhoneLink devices={devices} />

        <Tap onClick={stopAll} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/20"><OctagonX size={18} /> Stop everything</Tap>
        <p className="mt-2 text-center text-xs text-slate-500">Tasks keep running on our servers even if you close the app. You will get a notification when they finish.</p>
      </div>

      {browse && <BrowserView device={browse} onClose={() => setBrowse(null)} />}
      {peek && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3" onClick={() => setPeek(null)}>
          <div className="max-h-full w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between text-sm text-white"><span className="flex items-center gap-2">{peek.name}{peek.live && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wide"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE</span>}</span><button onClick={closePeek} aria-label="Close picture"><X size={22} /></button></div>
            {peek.loading && <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-16 text-slate-300"><Spinner size={18} /> Looking at the screen...</div>}
            {peek.error && <p className="rounded-xl bg-slate-900 p-6 text-center text-sm text-slate-300">{peek.error}</p>}
            {peek.image && <img src={`data:image/jpeg;base64,${peek.image}`} alt={`Screen of ${peek.name}`} className="max-h-[80dvh] w-full rounded-xl border border-white/10 object-contain" />}
          </div>
        </div>,
        document.body
      )}
    </Sheet>
  );
}
